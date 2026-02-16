import { SlashCommandBuilder } from 'discord.js';
import { createNoShowReport, getOpenNoShowReport, getUserPairing } from '../services/database.js';
import { isGuildConfigured, getGuildSettings } from '../services/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('report')
      .setDescription('Report a no-show partner (moderator review)')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user who didn\'t show up')
          .setRequired(true)
      )
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guild.id;
  const reportingUserId = commandInteraction.user.id;
  const reportedDiscordUser = commandInteraction.options.getUser('user');
  const reportedUserId = reportedDiscordUser.id;
  
  try {
    const guildIsConfigured = await isGuildConfigured(guildId);
    if (!guildIsConfigured) {
      return await commandInteraction.reply({
        content: '❌ Coffee Chat Barista hasn\'t been set up yet. Ask an admin to run `/coffee setup`.',
        ephemeral: true
      });
    }
    
    if (reportingUserId === reportedUserId) {
      return await commandInteraction.reply({
        content: '❌ You cannot report yourself.',
        ephemeral: true
      });
    }
    
    const reporterCurrentPairing = await getUserPairing(guildId, reportingUserId);
    
    if (!reporterCurrentPairing) {
      return await commandInteraction.reply({
        content: '❌ You don\'t have a match this week, so you cannot report anyone.',
        ephemeral: true
      });
    }
    
    const allUsersInReporterPairing = [reporterCurrentPairing.user_a, reporterCurrentPairing.user_b];
    if (reporterCurrentPairing.user_c) allUsersInReporterPairing.push(reporterCurrentPairing.user_c);
    
    if (!allUsersInReporterPairing.includes(reportedUserId)) {
      return await commandInteraction.reply({
        content: `❌ <@${reportedUserId}> is not your match this week. You can only report your assigned partner.`,
        ephemeral: true
      });
    }

    const existingOpenReport = await getOpenNoShowReport(
      guildId,
      reporterCurrentPairing.id,
      reportingUserId,
      reportedUserId
    );
    if (existingOpenReport) {
      return await commandInteraction.reply({
        content: `⚠️ You already have a pending report for this match (Report #${existingOpenReport.id}). A moderator will review it.`,
        ephemeral: true
      });
    }

    const createdReport = await createNoShowReport(
      guildId,
      reporterCurrentPairing.id,
      reportingUserId,
      reportedUserId
    );
    
    await commandInteraction.reply({
      content:
        `✅ **Report submitted (ID #${createdReport.id}).** ` +
        'A moderator will review this and take action if needed. Thanks for letting us know.',
      ephemeral: true
    });
    
    const guildSettings = await getGuildSettings(guildId);
    
    try {
      const announcementsChannel = await commandInteraction.client.channels.fetch(guildSettings.announcements_channel_id);
      await announcementsChannel.send(
        `⚠️ **No-Show Report Filed**\n\n` +
        `Report ID: **#${createdReport.id}**\n` +
        `<@${reportingUserId}> reports that <@${reportedUserId}> did not show up for their coffee chat.\n\n` +
        `**Moderators:** Use \`/coffee admin punish\` with user <@${reportedUserId}> and report_id ${createdReport.id}, ` +
        `or dismiss with \`/coffee admin dismiss-report report_id:${createdReport.id}\`.`
      );
    } catch (channelError) {
      console.error(`Could not post report to announcements channel for guild ${guildId}:`, channelError);
    }
    
    console.log(
      `User ${reportingUserId} reported ${reportedUserId} for no-show in guild ${guildId} (report ${createdReport.id})`
    );
    
  } catch (reportCommandError) {
    console.error('Error in /coffee report:', reportCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while submitting your report. Please try again later.',
      ephemeral: true
    });
  }
}

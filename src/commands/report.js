import { SlashCommandBuilder } from 'discord.js';
import { formatDate } from '../utils/timezones.js';
import { getUserPairing, applyPenalty } from '../services/database.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('report')
      .setDescription('Report a no-show partner')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user who didn\'t show up')
          .setRequired(true)
      )
  );

export async function execute(commandInteraction) {
  const reportingUserId = commandInteraction.user.id;
  const reportedDiscordUser = commandInteraction.options.getUser('user');
  const reportedUserId = reportedDiscordUser.id;
  
  try {
    if (reportingUserId === reportedUserId) {
      return await commandInteraction.reply({
        content: '❌ You cannot report yourself.'
      });
    }
    
    const reporterCurrentPairing = await getUserPairing(reportingUserId);
    
    if (!reporterCurrentPairing) {
      return await commandInteraction.reply({
        content: `❌ <@${reportingUserId}> doesn't have a match this week, so cannot report anyone.`
      });
    }
    
    const allUsersInReporterPairing = [reporterCurrentPairing.user_a, reporterCurrentPairing.user_b];
    if (reporterCurrentPairing.user_c) allUsersInReporterPairing.push(reporterCurrentPairing.user_c);
    
    if (!allUsersInReporterPairing.includes(reportedUserId)) {
      return await commandInteraction.reply({
        content: `❌ <@${reportedUserId}> is not <@${reportingUserId}>'s match this week. You can only report your assigned partner.`
      });
    }
    
    const penaltyExpiryDate = await applyPenalty(reportedUserId);
    
    await commandInteraction.reply({
      content: `⚠️ **No-Show Report**\n\n<@${reportedUserId}> has been reported by <@${reportingUserId}> for not showing up.\n\nThey are now penalized and cannot sign up until **${formatDate(penaltyExpiryDate)}**.`
    });
    
    console.log(`User ${reportingUserId} reported ${reportedUserId} for no-show. Penalty applied until ${penaltyExpiryDate.toISOString()}`);
    
  } catch (reportCommandError) {
    console.error('Error in /coffee report:', reportCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while submitting your report. Please try again later.'
    });
  }
}


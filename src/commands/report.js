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
        content: '❌ You cannot report yourself.',
        ephemeral: true
      });
    }
    
    const reporterCurrentPairing = await getUserPairing(reportingUserId);
    
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
        content: `❌ ${reportedDiscordUser.username} is not your match this week. You can only report your assigned partner.`,
        ephemeral: true
      });
    }
    
    const penaltyExpiryDate = await applyPenalty(reportedUserId);
    
    await commandInteraction.reply({
      content: `✅ **Report submitted**\n\n` +
               `${reportedDiscordUser.username} has been penalized for a no-show.\n` +
               `They will be unable to sign up until **${formatDate(penaltyExpiryDate)}** (2 weeks).\n\n` +
               `We're sorry this happened. We'll see you at next week's coffee chat!`,
      ephemeral: true
    });
    
    console.log(`User ${reportingUserId} reported ${reportedUserId} for no-show. Penalty applied until ${penaltyExpiryDate.toISOString()}`);
    
  } catch (reportCommandError) {
    console.error('Error in /coffee report:', reportCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while submitting your report. Please try again later.',
      ephemeral: true
    });
  }
}


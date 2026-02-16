import { SlashCommandBuilder } from 'discord.js';
import { isSignupWindowOpen, getSignupWindowDescription } from '../utils/timezones.js';
import { removeSignup, isSignedUp } from '../services/database.js';
import { getGuildSettings } from '../services/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('leave')
      .setDescription('Withdraw from this week\'s coffee chat signups')
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) {
    return await commandInteraction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  }

  const userId = commandInteraction.user.id;
  
  try {
    const guildSettings = await getGuildSettings(guildId);
    const guildIsConfigured = Boolean(
      guildSettings?.announcements_channel_id &&
      guildSettings?.pairings_channel_id
    );
    if (!guildIsConfigured) {
      return await commandInteraction.reply({
        content: '❌ Coffee Chat Barista hasn\'t been set up yet. Ask an admin to run `/coffee setup`.',
        ephemeral: true
      });
    }
    
    if (!isSignupWindowOpen(guildSettings)) {
      return await commandInteraction.reply({
        content:
          `❌ Withdrawals are only allowed during the signup window (${getSignupWindowDescription(guildSettings)}).\n\n` +
          `Matches have already been created. Please coordinate directly with your partner.`,
        ephemeral: true
      });
    }
    
    const userIsCurrentlySignedUp = await isSignedUp(guildId, userId);
    if (!userIsCurrentlySignedUp) {
      return await commandInteraction.reply({
        content: '❌ You\'re not signed up for this week\'s coffee chat.',
        ephemeral: true
      });
    }
    
    await removeSignup(guildId, userId);
    
    await commandInteraction.reply({
      content: '👋 You\'ve withdrawn from this week\'s coffee chat signups.',
      ephemeral: true
    });
    
  } catch (leaveCommandError) {
    console.error('Error in /coffee leave:', leaveCommandError);
    const errorPayload = {
      content: '❌ An error occurred while removing your signup. Please try again later.',
      ephemeral: true
    };

    if (commandInteraction.replied || commandInteraction.deferred) {
      await commandInteraction.followUp(errorPayload);
    } else {
      await commandInteraction.reply(errorPayload);
    }
  }
}

import { SlashCommandBuilder } from 'discord.js';
import { TIMEZONE_REGIONS } from '../config.js';
import { isSignupWindowOpen, formatDate, getSignupWindowDescription } from '../utils/timezones.js';
import { 
  upsertProfile, 
  isPenalized, 
  getProfile, 
  addSignup, 
  isSignedUp,
  getSignupCount
} from '../services/database.js';
import { getGuildSettings } from '../services/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .setDMPermission(false)
  .addSubcommand(subcommand =>
    subcommand
      .setName('join')
      .setDescription('Sign up for this week\'s coffee chat')
      .addStringOption(option =>
        option
          .setName('timezone')
          .setDescription('Your timezone region')
          .setRequired(true)
          .addChoices(
            { name: 'Americas (North & South America)', value: TIMEZONE_REGIONS.AMERICAS },
            { name: 'EMEA (Europe, Middle East, Africa)', value: TIMEZONE_REGIONS.EMEA },
            { name: 'APAC (Asia Pacific)', value: TIMEZONE_REGIONS.APAC }
          )
      )
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) {
    return await commandInteraction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  }

  const selectedTimezoneRegion = commandInteraction.options.getString('timezone');
  const userId = commandInteraction.user.id;
  const username = commandInteraction.user.username;
  
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
        content: `❌ Signups are currently closed. They open every ${getSignupWindowDescription(guildSettings)}.`,
        ephemeral: true
      });
    }
    
    const userIsCurrentlyPenalized = await isPenalized(guildId, userId);
    if (userIsCurrentlyPenalized) {
      const userProfile = await getProfile(guildId, userId);
      const penaltyExpiryDate = new Date(userProfile.penalty_expires_at);
      
      return await commandInteraction.reply({
        content: `❌ You are currently penalized for a no-show and cannot sign up.\n\nPenalty expires on **${formatDate(penaltyExpiryDate)}**.`,
        ephemeral: true
      });
    }
    
    const userAlreadySignedUp = await isSignedUp(guildId, userId);
    if (userAlreadySignedUp) {
      return await commandInteraction.reply({
        content: '❌ You\'re already signed up for this week\'s coffee chat!',
        ephemeral: true
      });
    }
    
    await upsertProfile(guildId, userId, username, selectedTimezoneRegion);
    await addSignup(guildId, userId);
    
    const currentSignupCount = await getSignupCount(guildId);
    
    await commandInteraction.reply({
      content: `☕ You're signed up for this week's coffee chat! (${selectedTimezoneRegion} timezone)\n\nYou're signup **#${currentSignupCount}** this week.`,
      ephemeral: true
    });
    
  } catch (joinCommandError) {
    console.error('Error in /coffee join:', joinCommandError);
    const errorPayload = {
      content: '❌ An error occurred while signing you up. Please try again later.',
      ephemeral: true
    };

    if (commandInteraction.replied || commandInteraction.deferred) {
      await commandInteraction.followUp(errorPayload);
    } else {
      await commandInteraction.reply(errorPayload);
    }
  }
}

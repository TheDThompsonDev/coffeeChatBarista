import { SlashCommandBuilder } from 'discord.js';
import { TIMEZONE_REGIONS } from '../config.js';
import { isSignupWindowOpen, formatDate } from '../utils/timezones.js';
import { 
  upsertProfile, 
  isPenalized, 
  getProfile, 
  addSignup, 
  isSignedUp 
} from '../services/database.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
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
  const selectedTimezoneRegion = commandInteraction.options.getString('timezone');
  const userId = commandInteraction.user.id;
  
  try {
    if (!isSignupWindowOpen()) {
      return await commandInteraction.reply({
        content: '❌ Signups are currently closed. They open every Monday from 8:00 AM to 12:00 PM CT.',
        ephemeral: true
      });
    }
    
    const userIsCurrentlyPenalized = await isPenalized(userId);
    if (userIsCurrentlyPenalized) {
      const userProfile = await getProfile(userId);
      const penaltyExpiryDate = new Date(userProfile.penalty_expires_at);
      
      return await commandInteraction.reply({
        content: `❌ You are currently penalized for a no-show and cannot sign up.\n\n` +
                 `Your penalty expires on **${formatDate(penaltyExpiryDate)}**.`,
        ephemeral: true
      });
    }
    
    const userAlreadySignedUp = await isSignedUp(userId);
    if (userAlreadySignedUp) {
      return await commandInteraction.reply({
        content: '❌ You\'re already signed up for this week\'s coffee chat!',
        ephemeral: true
      });
    }
    
    await upsertProfile(userId, selectedTimezoneRegion);
    await addSignup(userId);
    
    await commandInteraction.reply({
      content: `✅ You're signed up for this week's coffee chat! (${selectedTimezoneRegion} timezone)\n\n` +
               `Signups close today at 12:00 PM CT. Matches will be posted in the pairings channel.\n\n` +
               `Need to cancel? Use \`/coffee leave\` before signups close.`,
      ephemeral: true
    });
    
  } catch (joinCommandError) {
    console.error('Error in /coffee join:', joinCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while signing you up. Please try again later.',
      ephemeral: true
    });
  }
}


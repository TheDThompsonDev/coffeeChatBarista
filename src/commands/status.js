import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { formatDate } from '../utils/timezones.js';
import { 
  getProfile, 
  isSignedUp, 
  getUserPairing,
  isPenalized 
} from '../services/database.js';

const COFFEE_BROWN_COLOR = '#6F4E37';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check your coffee chat status')
  );

export async function execute(commandInteraction) {
  const userId = commandInteraction.user.id;
  
  try {
    const userProfile = await getProfile(userId);
    const userIsSignedUp = await isSignedUp(userId);
    const userCurrentPairing = await getUserPairing(userId);
    const userIsCurrentlyPenalized = await isPenalized(userId);
    
    const statusEmbed = new EmbedBuilder()
      .setColor(COFFEE_BROWN_COLOR)
      .setTitle('☕ Your Coffee Chat Status')
      .setTimestamp();
    
    let statusDescription = '';
    
    if (userIsSignedUp) {
      statusDescription += '✅ **Signed up for this week**\n';
      if (userProfile?.timezone_region) {
        statusDescription += `📍 Timezone: ${userProfile.timezone_region}\n`;
      }
    } else {
      statusDescription += '❌ **Not signed up for this week**\n';
    }
    
    statusDescription += '\n';
    
    if (userCurrentPairing) {
      const allUsersInPairing = [userCurrentPairing.user_a, userCurrentPairing.user_b];
      if (userCurrentPairing.user_c) allUsersInPairing.push(userCurrentPairing.user_c);
      
      const partnerMentions = allUsersInPairing
        .filter(pairingUserId => pairingUserId !== userId)
        .map(pairingUserId => `<@${pairingUserId}>`)
        .join(', ');
      
      statusDescription += `**Current Match:**\n`;
      statusDescription += `👥 ${partnerMentions}\n`;
      statusDescription += `🎤 ${userCurrentPairing.assigned_vc}\n`;
      
      if (userCurrentPairing.user_c) {
        statusDescription += `ℹ️ This is a trio (3 people)\n`;
      }
    } else {
      statusDescription += '**Current Match:** None\n';
    }
    
    statusDescription += '\n';
    
    if (userIsCurrentlyPenalized && userProfile?.penalty_expires_at) {
      const penaltyExpiryDate = new Date(userProfile.penalty_expires_at);
      statusDescription += `⚠️ **Penalized until ${formatDate(penaltyExpiryDate)}**\n`;
      statusDescription += `You cannot sign up until your penalty expires.\n`;
    } else {
      statusDescription += '✅ **No active penalties**\n';
    }
    
    statusEmbed.setDescription(statusDescription);
    
    await commandInteraction.reply({
      embeds: [statusEmbed],
      ephemeral: true
    });
    
  } catch (statusCommandError) {
    console.error('Error in /coffee status:', statusCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while fetching your status. Please try again later.',
      ephemeral: true
    });
  }
}


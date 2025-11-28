import { SlashCommandBuilder } from 'discord.js';
import { isSignupWindowOpen } from '../utils/timezones.js';
import { removeSignup, isSignedUp } from '../services/database.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('leave')
      .setDescription('Withdraw from this week\'s coffee chat signups')
  );

export async function execute(commandInteraction) {
  const userId = commandInteraction.user.id;
  
  try {
    if (!isSignupWindowOpen()) {
      return await commandInteraction.reply({
        content: '❌ Withdrawals are only allowed during the signup window (Monday 8:00 AM - 12:00 PM CT).\n\nMatches have already been created. Please coordinate directly with your partner.'
      });
    }
    
    const userIsCurrentlySignedUp = await isSignedUp(userId);
    if (!userIsCurrentlySignedUp) {
      return await commandInteraction.reply({
        content: `❌ <@${userId}> is not signed up for this week's coffee chat.`
      });
    }
    
    await removeSignup(userId);
    
    await commandInteraction.reply({
      content: `👋 <@${userId}> has withdrawn from this week's coffee chat signups.`
    });
    
  } catch (leaveCommandError) {
    console.error('Error in /coffee leave:', leaveCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while removing your signup. Please try again later.'
    });
  }
}


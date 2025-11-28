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
        content: '❌ You can only withdraw during the signup window (Monday 8:00 AM - 12:00 PM CT).\n\n' +
                 'Matches have already been created. If you need to cancel after matching, please coordinate directly with your partner.',
        ephemeral: true
      });
    }
    
    const userIsCurrentlySignedUp = await isSignedUp(userId);
    if (!userIsCurrentlySignedUp) {
      return await commandInteraction.reply({
        content: '❌ You\'re not signed up for this week\'s coffee chat.',
        ephemeral: true
      });
    }
    
    await removeSignup(userId);
    
    await commandInteraction.reply({
      content: '✅ You\'ve been removed from this week\'s coffee chat signups.\n\n' +
               'You can sign up again with `/coffee join` before 12:00 PM CT today.',
      ephemeral: true
    });
    
  } catch (leaveCommandError) {
    console.error('Error in /coffee leave:', leaveCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while removing your signup. Please try again later.',
      ephemeral: true
    });
  }
}


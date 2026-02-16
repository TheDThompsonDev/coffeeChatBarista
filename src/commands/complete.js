import { SlashCommandBuilder } from 'discord.js';
import { getUserPairing, markPairingComplete } from '../services/database.js';
import { isGuildConfigured } from '../services/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('complete')
      .setDescription('Log your coffee chat as done')
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guild.id;
  const userId = commandInteraction.user.id;
  
  try {
    const guildIsConfigured = await isGuildConfigured(guildId);
    if (!guildIsConfigured) {
      return await commandInteraction.reply({
        content: '❌ Coffee Chat Barista hasn\'t been set up yet. Ask an admin to run `/coffee setup`.',
        ephemeral: true
      });
    }
    
    const userCurrentPairing = await getUserPairing(guildId, userId);
    
    if (!userCurrentPairing) {
      return await commandInteraction.reply({
        content: '❌ You don\'t have a match this week. Sign up next week with `/coffee join`!',
        ephemeral: true
      });
    }
    
    if (userCurrentPairing.completed_at) {
      return await commandInteraction.reply({
        content: '✅ Your coffee chat is already logged as complete! Thanks for connecting.',
        ephemeral: true
      });
    }
    
    await markPairingComplete(guildId, userCurrentPairing.id, 'manual');
    
    await commandInteraction.reply({
      content: '☕ **Coffee chat logged!** Thanks for connecting with your partner. See you next week!',
      ephemeral: true
    });
    
    const allUsersInPairing = [userCurrentPairing.user_a, userCurrentPairing.user_b];
    if (userCurrentPairing.user_c) allUsersInPairing.push(userCurrentPairing.user_c);
    
    const partnersToNotify = allUsersInPairing.filter(pairedUserId => pairedUserId !== userId);
    
    for (const partnerId of partnersToNotify) {
      try {
        const partnerMember = await commandInteraction.guild.members.fetch(partnerId);
        await partnerMember.send(
          `☕ **Coffee chat logged!** <@${userId}> confirmed that your coffee chat is complete. Great job connecting!`
        );
      } catch (dmError) {
        console.log(`Could not DM partner ${partnerId} about completion`);
      }
    }
    
  } catch (completeCommandError) {
    console.error('Error in /coffee complete:', completeCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred. Please try again later.',
      ephemeral: true
    });
  }
}

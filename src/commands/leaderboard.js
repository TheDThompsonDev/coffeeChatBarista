import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard } from '../services/database.js';
import { isGuildConfigured } from '../services/guildSettings.js';

const COFFEE_BROWN_COLOR = '#6F4E37';
const LEADERBOARD_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('See the top completed coffee chat participants')
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) {
    return await commandInteraction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  }
  
  try {
    const guildIsConfigured = await isGuildConfigured(guildId);
    if (!guildIsConfigured) {
      return await commandInteraction.reply({
        content: '❌ Coffee Chat Barista hasn\'t been set up yet. Ask an admin to run `/coffee setup`.'
      });
    }
    
    const leaderboardData = await getLeaderboard(guildId, LEADERBOARD_SIZE);
    
    if (leaderboardData.length === 0) {
      return await commandInteraction.reply({
        content: '☕ No completed coffee chats have been recorded yet. Be the first to connect!'
      });
    }
    
    const leaderboardLines = leaderboardData.map((entry, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const chatWord = entry.chat_count === 1 ? 'chat' : 'chats';
      return `${medal} <@${entry.user_id}> — **${entry.chat_count}** ${chatWord}`;
    });
    
    const leaderboardEmbed = new EmbedBuilder()
      .setColor(COFFEE_BROWN_COLOR)
      .setTitle('☕ Completed Coffee Chat Leaderboard')
      .setDescription(leaderboardLines.join('\n'))
      .setFooter({ text: 'Keep chatting to climb the ranks!' })
      .setTimestamp();
    
    await commandInteraction.reply({
      embeds: [leaderboardEmbed]
    });
    
  } catch (leaderboardCommandError) {
    console.error('Error in /coffee leaderboard:', leaderboardCommandError);
    const errorPayload = {
      content: '❌ An error occurred while fetching the leaderboard. Please try again later.',
      ephemeral: true
    };

    if (commandInteraction.replied || commandInteraction.deferred) {
      await commandInteraction.followUp(errorPayload);
    } else {
      await commandInteraction.reply(errorPayload);
    }
  }
}


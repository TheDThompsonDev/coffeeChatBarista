import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard } from '../services/database.js';

const COFFEE_BROWN_COLOR = '#6F4E37';
const LEADERBOARD_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('See the top coffee chat participants')
  );

export async function execute(commandInteraction) {
  try {
    const leaderboardData = await getLeaderboard(LEADERBOARD_SIZE);
    
    if (leaderboardData.length === 0) {
      return await commandInteraction.reply({
        content: '☕ No coffee chats have been recorded yet. Be the first to sign up!'
      });
    }
    
    const leaderboardLines = leaderboardData.map((entry, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const chatWord = entry.chat_count === 1 ? 'chat' : 'chats';
      return `${medal} <@${entry.user_id}> — **${entry.chat_count}** ${chatWord}`;
    });
    
    const leaderboardEmbed = new EmbedBuilder()
      .setColor(COFFEE_BROWN_COLOR)
      .setTitle('☕ Coffee Chat Leaderboard')
      .setDescription(leaderboardLines.join('\n'))
      .setFooter({ text: 'Keep chatting to climb the ranks!' })
      .setTimestamp();
    
    await commandInteraction.reply({
      embeds: [leaderboardEmbed]
    });
    
  } catch (leaderboardCommandError) {
    console.error('Error in /coffee leaderboard:', leaderboardCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while fetching the leaderboard. Please try again later.'
    });
  }
}


import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSignupWindowDescription } from '../utils/timezones.js';

const COFFEE_BROWN_COLOR = '#6F4E37';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('help')
      .setDescription('Learn how Coffee Chat Barista works')
  );

export async function execute(commandInteraction) {
  const signupWindow = getSignupWindowDescription();
  
  const helpEmbed = new EmbedBuilder()
    .setColor(COFFEE_BROWN_COLOR)
    .setTitle('☕ Coffee Chat Barista - How It Works')
    .setDescription(
      'Coffee Chat Barista pairs community members for weekly 1-on-1 coffee chats to build connections.\n\n' +
      '**Weekly Cycle:**\n' +
      `1. Signups open every **${signupWindow}**\n` +
      '2. Matches are created after signups close\n' +
      '3. You\'ll receive a DM with your partner and assigned voice channel\n' +
      '4. Meet your partner anytime during the week\n' +
      '5. Your chat is auto-logged when you use a Discord VC together, or you can run `/coffee complete`\n' +
      '6. If your partner doesn\'t show, use `/coffee report @user` (moderators review reports before penalties)\n\n' +
      '**Commands:**\n' +
      '`/coffee join <timezone>` — Sign up for this week\n' +
      '`/coffee leave` — Withdraw before signups close\n' +
      '`/coffee status` — Check your match and status\n' +
      '`/coffee complete` — Manually log your chat as done\n' +
      '`/coffee leaderboard` — See top participants\n' +
      '`/coffee report @user` — Report a no-show for moderator review\n' +
      '`/coffee help` — This message\n\n' +
      '**Timezone Options:**\n' +
      '• **AMERICAS** — North & South America\n' +
      '• **EMEA** — Europe, Middle East, Africa\n' +
      '• **APAC** — Asia Pacific\n\n' +
      '*You\'ll be matched with someone in your timezone when possible. No-shows may result in a temporary ban from signups.*'
    )
    .setFooter({ text: 'Let\'s build connections, one coffee chat at a time! ☕' })
    .setTimestamp();
  
  await commandInteraction.reply({
    embeds: [helpEmbed],
    ephemeral: true
  });
}

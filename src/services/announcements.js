import { EmbedBuilder } from 'discord.js';
import { discord } from '../config.js';

const COFFEE_BROWN_COLOR = '#6F4E37';
const ERROR_RED_COLOR = '#FF6B6B';

export async function postSignupAnnouncement(discordClient) {
  const announcementsChannel = await discordClient.channels.fetch(discord.channels.announcements);
  
  const signupAnnouncementEmbed = new EmbedBuilder()
    .setColor(COFFEE_BROWN_COLOR)
    .setTitle('☕ Coffee Chat Signups Open!')
    .setDescription(
      'Time for this week\'s coffee chats! Sign up now to be matched with a fellow community member.\n\n' +
      '**How it works:**\n' +
      '• Use `/coffee join <timezone>` to sign up\n' +
      '• Choose your timezone: AMERICAS, EMEA, or APAC\n' +
      '• Signups close today at **12:00 PM CT**\n' +
      '• Matches will be posted in <#' + discord.channels.pairings + '>\n\n' +
      '**Remember:**\n' +
      '• If you sign up, please show up!\n' +
      '• No-shows can be reported and result in a 2-week ban\n' +
      '• You can withdraw with `/coffee leave` before signups close'
    )
    .setFooter({ text: 'Let\'s build connections, one coffee chat at a time! ☕' })
    .setTimestamp();
  
  await announcementsChannel.send({
    content: `<@&${discord.roles.coffeeChatters}>`,
    embeds: [signupAnnouncementEmbed]
  });
  console.log('Posted signup announcement');
}

export async function postPairings(discordClient, weeklyPairings) {
  const pairingsChannel = await discordClient.channels.fetch(discord.channels.pairings);
  
  if (weeklyPairings.length === 0) {
    const noSignupsEmbed = new EmbedBuilder()
      .setColor(ERROR_RED_COLOR)
      .setTitle('☕ Coffee Chats This Week')
      .setDescription('Not enough signups this week. Better luck next Monday!')
      .setTimestamp();
    
    await pairingsChannel.send({ embeds: [noSignupsEmbed] });
    console.log('Posted no-signups message');
    return;
  }
  
  const pairingWord = weeklyPairings.length === 1 ? 'pairing' : 'pairings';
  const pairingsAnnouncementEmbed = new EmbedBuilder()
    .setColor(COFFEE_BROWN_COLOR)
    .setTitle('☕ Coffee Chat Matches - This Week')
    .setDescription(
      `**${weeklyPairings.length} ${pairingWord}** created!\n\n` +
      'Check below for your match. Coordinate a time this week to meet in your assigned voice channel.\n\n' +
      '**Tips:**\n' +
      '• Use your assigned VC\n' +
      '• Be respectful and show up on time\n' +
      '• If your partner doesn\'t show, use `/coffee report @user`'
    )
    .setFooter({ text: 'Have a great conversation! ☕' })
    .setTimestamp();
  
  await pairingsChannel.send({ embeds: [pairingsAnnouncementEmbed] });
  
  const PAIRINGS_PER_MESSAGE = 5;
  
  for (let batchStartIndex = 0; batchStartIndex < weeklyPairings.length; batchStartIndex += PAIRINGS_PER_MESSAGE) {
    const pairingBatch = weeklyPairings.slice(batchStartIndex, batchStartIndex + PAIRINGS_PER_MESSAGE);
    const batchMessageLines = [];
    
    for (const pairing of pairingBatch) {
      const allUsersInPairing = [pairing.user_a, pairing.user_b];
      if (pairing.user_c) allUsersInPairing.push(pairing.user_c);
      
      const userMentions = allUsersInPairing.map(userId => `<@${userId}>`).join(' + ');
      const trioLabel = pairing.user_c ? ' (Trio)' : '';
      const coordinationWarning = pairing.needsCoordination ? ' ⚠️' : '';
      
      batchMessageLines.push(`☕ ${userMentions}${trioLabel} → **${pairing.assigned_vc}**${coordinationWarning}`);
    }
    
    await pairingsChannel.send(batchMessageLines.join('\n'));
  }
  
  const totalMessagesPosted = Math.ceil(weeklyPairings.length / PAIRINGS_PER_MESSAGE);
  console.log(`Posted ${weeklyPairings.length} pairings in ${totalMessagesPosted} messages`);
}

export async function postNotEnoughSignups(discordClient) {
  const pairingsChannel = await discordClient.channels.fetch(discord.channels.pairings);
  
  const notEnoughSignupsEmbed = new EmbedBuilder()
    .setColor(ERROR_RED_COLOR)
    .setTitle('☕ Coffee Chats This Week')
    .setDescription(
      'Not enough signups this week (need at least 2 people).\n\n' +
      'Spread the word and let\'s get more sign-ups next Monday!'
    )
    .setTimestamp();
  
  await pairingsChannel.send({ embeds: [notEnoughSignupsEmbed] });
  console.log('Posted not-enough-signups message');
}


import { EmbedBuilder } from 'discord.js';
import { SIGNUP_WINDOW } from '../config.js';
import { getGuildSettings } from './guildSettings.js';

const COFFEE_BROWN_COLOR = '#6F4E37';
const ERROR_RED_COLOR = '#FF6B6B';

function formatHourForDisplay(hour24) {
  const hour12 = hour24 > 12 ? hour24 - 12 : hour24;
  const amPm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:00 ${amPm}`;
}

export async function postSignupAnnouncement(discordClient, guildId) {
  const guildSettings = await getGuildSettings(guildId);
  if (!guildSettings?.announcements_channel_id || !guildSettings?.pairings_channel_id) {
    console.warn(`[${guildId}] Missing guild settings for signup announcement. Skipping.`);
    return;
  }

  const announcementsChannel = await discordClient.channels.fetch(guildSettings.announcements_channel_id).catch(() => null);
  
  if (!announcementsChannel) {
    console.warn(`[${guildId}] Announcements channel ${guildSettings.announcements_channel_id} not found or inaccessible. Skipping.`);
    return;
  }
  
  const signupCloseTime = formatHourForDisplay(SIGNUP_WINDOW.endHour);
  
  const signupAnnouncementEmbed = new EmbedBuilder()
    .setColor(COFFEE_BROWN_COLOR)
    .setTitle('☕ Coffee Chat Signups Open!')
    .setDescription(
      'Time for this week\'s coffee chats! Sign up now to be matched with a fellow community member.\n\n' +
      '**How it works:**\n' +
      '• Use `/coffee join <timezone>` to sign up\n' +
      '• Choose your timezone: AMERICAS, EMEA, or APAC\n' +
      `• Signups close today at **${signupCloseTime} CT**\n` +
      '• Matches will be posted in <#' + guildSettings.pairings_channel_id + '>\n\n' +
      '**Remember:**\n' +
      '• If you sign up, please show up!\n' +
      '• No-shows can be reported and result in a 2-week ban\n' +
      '• You can withdraw with `/coffee leave` before signups close'
    )
    .setFooter({ text: 'Let\'s build connections, one coffee chat at a time! ☕' })
    .setTimestamp();
  
  await announcementsChannel.send({
    content: `<@&${guildSettings.ping_role_id}>`,
    embeds: [signupAnnouncementEmbed]
  });
  console.log(`Posted signup announcement for guild ${guildId}`);
}

export async function postPairings(discordClient, guildId, weeklyPairings) {
  const guildSettings = await getGuildSettings(guildId);
  if (!guildSettings?.pairings_channel_id) {
    console.warn(`[${guildId}] Missing pairings channel in guild settings. Skipping.`);
    return;
  }

  const pairingsChannel = await discordClient.channels.fetch(guildSettings.pairings_channel_id).catch(() => null);
  
  if (!pairingsChannel) {
    console.warn(`[${guildId}] Pairings channel ${guildSettings.pairings_channel_id} not found or inaccessible. Skipping.`);
    return;
  }
  
  if (weeklyPairings.length === 0) {
    const noSignupsEmbed = new EmbedBuilder()
      .setColor(ERROR_RED_COLOR)
      .setTitle('☕ Coffee Chats This Week')
      .setDescription('Not enough signups this week. Better luck next week!')
      .setTimestamp();
    
    await pairingsChannel.send({ embeds: [noSignupsEmbed] });
    console.log(`Posted no-signups message for guild ${guildId}`);
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
      const assignedVoiceChannelDisplay = pairing.assigned_vc_channel_id
        ? `<#${pairing.assigned_vc_channel_id}>`
        : `**${pairing.assigned_vc}**`;
      
      batchMessageLines.push(`☕ ${userMentions}${trioLabel} → ${assignedVoiceChannelDisplay}${coordinationWarning}`);
    }
    
    await pairingsChannel.send(batchMessageLines.join('\n'));
  }
  
  const totalMessagesPosted = Math.ceil(weeklyPairings.length / PAIRINGS_PER_MESSAGE);
  console.log(`Posted ${weeklyPairings.length} pairings in ${totalMessagesPosted} messages for guild ${guildId}`);
}

export async function sendPairingDMs(discordClient, guildId, weeklyPairings) {
  const discordGuild = await discordClient.guilds.fetch(guildId);
  let dmsSent = 0;
  let dmsFailed = 0;
  
  for (const pairing of weeklyPairings) {
    const allUsersInPairing = [pairing.user_a, pairing.user_b];
    if (pairing.user_c) allUsersInPairing.push(pairing.user_c);
    
    for (const userId of allUsersInPairing) {
      const partners = allUsersInPairing
        .filter(id => id !== userId)
        .map(id => `<@${id}>`)
        .join(' and ');
      const assignedVoiceChannelDisplay = pairing.assigned_vc_channel_id
        ? `<#${pairing.assigned_vc_channel_id}>`
        : `**${pairing.assigned_vc}**`;
      
      const trioNote = pairing.user_c ? ' (trio)' : '';
      
      try {
        const member = await discordGuild.members.fetch(userId);
        await member.send(
          `☕ **You've been paired for this week's coffee chat!**${trioNote}\n\n` +
          `👥 Your partner: ${partners}\n` +
          `🎤 Assigned VC: ${assignedVoiceChannelDisplay}\n\n` +
          `Coordinate a time to meet this week. Your chat will be auto-logged if you use your assigned VC together, ` +
          `or you can run \`/coffee complete\` when you're done.\n\n` +
          `Have a great conversation!`
        );
        dmsSent++;
      } catch (dmError) {
        dmsFailed++;
        console.log(`Could not DM user ${userId} in guild ${guildId} about pairing`);
      }
    }
  }
  
  console.log(`[${guildId}] Sent ${dmsSent} pairing DMs (${dmsFailed} failed)`);
}

export async function sendReminderDMs(discordClient, guildId, incompletePairings) {
  const discordGuild = await discordClient.guilds.fetch(guildId);
  let dmsSent = 0;
  
  for (const pairing of incompletePairings) {
    const allUsersInPairing = [pairing.user_a, pairing.user_b];
    if (pairing.user_c) allUsersInPairing.push(pairing.user_c);
    
    for (const userId of allUsersInPairing) {
      const partners = allUsersInPairing
        .filter(id => id !== userId)
        .map(id => `<@${id}>`)
        .join(' and ');
      const assignedVoiceChannelDisplay = pairing.assigned_vc_channel_id
        ? `<#${pairing.assigned_vc_channel_id}>`
        : `**${pairing.assigned_vc}**`;
      
      try {
        const member = await discordGuild.members.fetch(userId);
        await member.send(
          `☕ **Friendly reminder!** You haven't had your coffee chat with ${partners} yet this week.\n\n` +
          `Try to connect before the week ends! Hop into ${assignedVoiceChannelDisplay} or coordinate a time that works.\n\n` +
          `Once you've met in your assigned VC, it'll be auto-logged, or you can run \`/coffee complete\`.`
        );
        dmsSent++;
      } catch (dmError) {
        console.log(`Could not send reminder DM to user ${userId} in guild ${guildId}`);
      }
    }
  }
  
  console.log(`[${guildId}] Sent ${dmsSent} reminder DMs for ${incompletePairings.length} incomplete pairings`);
}

export async function postNotEnoughSignups(discordClient, guildId) {
  const guildSettings = await getGuildSettings(guildId);
  if (!guildSettings?.pairings_channel_id) {
    console.warn(`[${guildId}] Missing pairings channel in guild settings. Skipping.`);
    return;
  }

  const pairingsChannel = await discordClient.channels.fetch(guildSettings.pairings_channel_id).catch(() => null);
  
  if (!pairingsChannel) {
    console.warn(`[${guildId}] Pairings channel ${guildSettings.pairings_channel_id} not found or inaccessible. Skipping.`);
    return;
  }
  
  const notEnoughSignupsEmbed = new EmbedBuilder()
    .setColor(ERROR_RED_COLOR)
    .setTitle('☕ Coffee Chats This Week')
    .setDescription(
      'Not enough signups this week (need at least 2 people).\n\n' +
      'Spread the word and let\'s get more sign-ups next week!'
    )
    .setTimestamp();
  
  await pairingsChannel.send({ embeds: [notEnoughSignupsEmbed] });
  console.log(`Posted not-enough-signups message for guild ${guildId}`);
}


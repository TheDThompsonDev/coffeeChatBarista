import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isModerator } from '../utils/permissions.js';
import { TIMEZONE_REGIONS } from '../config.js';
import { 
  clearAllSignups, 
  clearAllPairings,
  clearCurrentWeekHistory,
  expirePendingReports,
  getCompletedPairingsCount,
  getPendingReportsCount,
  removePenalty, 
  applyPenalty,
  getPendingReportById,
  getLatestPendingReportForUser,
  resolveNoShowReport,
  createManualPairing,
  getProfile,
  upsertProfile,
  addSignup,
  isSignedUp,
  getSignupsWithProfiles
} from '../services/database.js';
import { postSignupAnnouncement } from '../services/announcements.js';
import { getGuildSettings, isGuildConfigured } from '../services/guildSettings.js';
import { runMatchingForGuild } from '../scheduler/jobs.js';

const COFFEE_BROWN_COLOR = '#6F4E37';

async function resolveInteractionGuild(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) return null;
  return commandInteraction.guild ?? await commandInteraction.client.guilds.fetch(guildId).catch(() => null);
}

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommandGroup(group =>
    group
      .setName('admin')
      .setDescription('Admin commands for moderators')
      .addSubcommand(subcommand =>
        subcommand
          .setName('announce')
          .setDescription('Manually send the signup announcement')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('say')
          .setDescription('Have the bot post a custom message in announcements')
          .addStringOption(option =>
            option
              .setName('message')
              .setDescription('The message to post')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Clear all current week signups (use with caution)')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('View current week signups')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('match')
          .setDescription('Manually trigger the matching process')
          .addBooleanOption(option =>
            option
              .setName('force')
              .setDescription('Force rematch even if completions/reports already exist this week')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('punish')
          .setDescription('Apply a no-show penalty to a user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('The user to penalize')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('report_id')
              .setDescription('Optional pending report ID to resolve')
              .setRequired(false)
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('dismiss-report')
          .setDescription('Dismiss a pending no-show report')
          .addIntegerOption(option =>
            option
              .setName('report_id')
              .setDescription('Pending report ID to dismiss')
              .setRequired(true)
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('unpunish')
          .setDescription('Remove a penalty from a user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('The user to unpunish')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('force-pair')
          .setDescription('Manually create a pairing')
          .addUserOption(option =>
            option
              .setName('user1')
              .setDescription('First user')
              .setRequired(true)
          )
          .addUserOption(option =>
            option
              .setName('user2')
              .setDescription('Second user')
              .setRequired(true)
          )
          .addUserOption(option =>
            option
              .setName('user3')
              .setDescription('Third user (optional, for trio)')
              .setRequired(false)
          )
          .addIntegerOption(option =>
            option
              .setName('vc')
              .setDescription('VC number (1-10)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(10)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('add-signup')
          .setDescription('Manually add a user to the signup pool')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('The user to add to signups')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('timezone')
              .setDescription('Their timezone region')
              .setRequired(true)
              .addChoices(
                { name: 'Americas (North & South America)', value: TIMEZONE_REGIONS.AMERICAS },
                { name: 'EMEA (Europe, Middle East, Africa)', value: TIMEZONE_REGIONS.EMEA },
                { name: 'APAC (Asia Pacific)', value: TIMEZONE_REGIONS.APAC }
              )
          )
      )
  );

export async function execute(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) {
    return await commandInteraction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  }

  const interactionGuild = await resolveInteractionGuild(commandInteraction);
  if (!interactionGuild) {
    return await commandInteraction.reply({
      content: '❌ I could not access this server context. Please try again in a server channel.',
      ephemeral: true
    });
  }
  
  const guildIsConfigured = await isGuildConfigured(guildId);
  if (!guildIsConfigured) {
    return await commandInteraction.reply({
      content: '❌ Coffee Chat Barista hasn\'t been set up yet. Ask an admin to run `/coffee setup`.',
      ephemeral: true
    });
  }
  
  const commandingGuildMember = await interactionGuild.members.fetch(commandInteraction.user.id);
  const userIsModerator = await isModerator(commandingGuildMember);
  if (!userIsModerator) {
    return await commandInteraction.reply({
      content: '❌ You do not have permission to use admin commands.',
      ephemeral: true
    });
  }
  
  const selectedSubcommand = commandInteraction.options.getSubcommand();
  
  try {
    if (selectedSubcommand === 'announce') {
      await handleAnnounce(commandInteraction);
    } else if (selectedSubcommand === 'say') {
      await handleSay(commandInteraction);
    } else if (selectedSubcommand === 'reset') {
      await handleResetSignups(commandInteraction);
    } else if (selectedSubcommand === 'list') {
      await handleListSignups(commandInteraction);
    } else if (selectedSubcommand === 'match') {
      await handleManualMatch(commandInteraction);
    } else if (selectedSubcommand === 'punish') {
      await handlePunishUser(commandInteraction);
    } else if (selectedSubcommand === 'dismiss-report') {
      await handleDismissReport(commandInteraction);
    } else if (selectedSubcommand === 'unpunish') {
      await handleUnpunishUser(commandInteraction);
    } else if (selectedSubcommand === 'force-pair') {
      await handleForceManualPairing(commandInteraction);
    } else if (selectedSubcommand === 'add-signup') {
      await handleAddSignup(commandInteraction);
    }
  } catch (adminCommandError) {
    console.error(`Error in /coffee admin ${selectedSubcommand}:`, adminCommandError);
    
    if (commandInteraction.replied || commandInteraction.deferred) {
      await commandInteraction.followUp({
        content: '❌ An error occurred while executing the admin command.',
        ephemeral: true
      });
    } else {
      await commandInteraction.reply({
        content: '❌ An error occurred while executing the admin command.',
        ephemeral: true
      });
    }
  }
}

async function handleAnnounce(commandInteraction) {
  await commandInteraction.reply({
    content: '📢 Sending signup announcement...',
    ephemeral: true
  });
  
  const guildId = commandInteraction.guildId;
  const guildSettings = await getGuildSettings(guildId);

  if (!guildSettings?.announcements_channel_id) {
    return await commandInteraction.editReply({
      content:
        '❌ Signup announcement failed: no announcements channel is configured. ' +
        'Run `/coffee setup` again to reconfigure channels and roles.'
    });
  }

  const announcementsChannel = await commandInteraction.client.channels
    .fetch(guildSettings.announcements_channel_id)
    .catch(() => null);

  if (!announcementsChannel) {
    return await commandInteraction.editReply({
      content:
        `❌ Signup announcement failed: I cannot access <#${guildSettings.announcements_channel_id}>. ` +
        'The channel may have been deleted or my permissions may be missing.'
    });
  }

  await postSignupAnnouncement(commandInteraction.client, guildId);

  await commandInteraction.editReply({
    content: `✅ Signup announcement sent to <#${guildSettings.announcements_channel_id}>.`
  });
  
  console.log(`Admin ${commandInteraction.user.id} manually triggered signup announcement for guild ${guildId}`);
}

async function handleSay(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const guildSettings = await getGuildSettings(guildId);
  const customMessage = commandInteraction.options.getString('message');

  if (!guildSettings?.announcements_channel_id) {
    return await commandInteraction.reply({
      content:
        '❌ Cannot post message: no announcements channel is configured. ' +
        'Run `/coffee setup` to configure channels.',
      ephemeral: true
    });
  }

  const announcementsChannel = await commandInteraction.client.channels
    .fetch(guildSettings.announcements_channel_id)
    .catch(() => null);

  if (!announcementsChannel) {
    return await commandInteraction.reply({
      content:
        `❌ Cannot post message: I cannot access <#${guildSettings.announcements_channel_id}>. ` +
        'The channel may have been deleted or my permissions may be missing.',
      ephemeral: true
    });
  }
  
  await announcementsChannel.send(customMessage);
  
  await commandInteraction.reply({
    content: `✅ Message posted to <#${guildSettings.announcements_channel_id}>`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} posted custom message in guild ${guildId}`);
}

async function handleResetSignups(commandInteraction) {
  const guildId = commandInteraction.guildId;
  await clearAllSignups(guildId);
  
  await commandInteraction.reply({
    content: `🔄 **All signups cleared** by <@${commandInteraction.user.id}>\n\nThe current week's signups have been reset.`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} cleared all signups for guild ${guildId}`);
}

async function handleListSignups(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const signups = await getSignupsWithProfiles(guildId);
  
  if (signups.length === 0) {
    return await commandInteraction.reply({
      content: '📋 No signups yet for this week.',
      ephemeral: true
    });
  }
  
  const byTimezone = {};
  for (const signup of signups) {
    const tz = signup.timezone_region || 'Unknown';
    if (!byTimezone[tz]) byTimezone[tz] = [];
    byTimezone[tz].push(signup.user_id);
  }
  
  let description = `**${signups.length} signup(s) this week:**\n\n`;
  
  for (const [timezone, users] of Object.entries(byTimezone)) {
    description += `**${timezone}** (${users.length})\n`;
    description += users.map(userId => `• <@${userId}>`).join('\n');
    description += '\n\n';
  }
  
  const listEmbed = new EmbedBuilder()
    .setColor(COFFEE_BROWN_COLOR)
    .setTitle('📋 Current Week Signups')
    .setDescription(description)
    .setTimestamp();
  
  await commandInteraction.reply({
    embeds: [listEmbed],
    ephemeral: true
  });
}

async function handleManualMatch(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const forceRematch = commandInteraction.options.getBoolean('force') || false;
  const completedPairingsCount = await getCompletedPairingsCount(guildId);
  const pendingReportsCount = await getPendingReportsCount(guildId);

  if ((completedPairingsCount > 0 || pendingReportsCount > 0) && !forceRematch) {
    return await commandInteraction.reply({
      content:
        `⚠️ Rematch blocked to protect existing weekly records.\n\n` +
        `Completed chats this week: **${completedPairingsCount}**\n` +
        `Pending reports this week: **${pendingReportsCount}**\n\n` +
        `If you really need to rebuild pairings, run \`/coffee admin match force:true\`. ` +
        `This will clear current-week completion history and pending reports before rematching.`,
      ephemeral: true
    });
  }
  
  await commandInteraction.deferReply({ ephemeral: true });
  
  // Re-running matching should replace this week's state cleanly.
  await clearCurrentWeekHistory(guildId);
  await expirePendingReports(guildId);
  await clearAllPairings(guildId);
  
  await runMatchingForGuild(commandInteraction.client, guildId);
  
  const forcedLabel = forceRematch ? ' (forced rebuild)' : '';
  await commandInteraction.editReply({
    content: `✅ **Matching complete${forcedLabel}!** Pairings have been created and posted. DMs have been sent to participants.`
  });
  
  console.log(`Admin ${commandInteraction.user.id} manually triggered matching for guild ${guildId}`);
}

async function handlePunishUser(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const selectedUser = commandInteraction.options.getUser('user');
  const optionalReportId = commandInteraction.options.getInteger('report_id');

  const pendingReport = optionalReportId
    ? await getPendingReportById(guildId, optionalReportId)
    : await getLatestPendingReportForUser(guildId, selectedUser.id);

  if (!pendingReport) {
    const reportErrorDetail = optionalReportId
      ? `No pending report found with ID **${optionalReportId}**.`
      : `No pending reports found for <@${selectedUser.id}>.`;
    return await commandInteraction.reply({
      content: `❌ ${reportErrorDetail} Ask members to file \`/coffee report @user\` first.`,
      ephemeral: true
    });
  }

  if (pendingReport.reported_user_id !== selectedUser.id) {
    return await commandInteraction.reply({
      content: `❌ Report **#${pendingReport.id}** is for <@${pendingReport.reported_user_id}>, not <@${selectedUser.id}>.`,
      ephemeral: true
    });
  }

  const penaltyExpiryDate = await applyPenalty(guildId, selectedUser.id, selectedUser.username);
  await resolveNoShowReport(
    guildId,
    pendingReport.id,
    'resolved_penalized',
    commandInteraction.user.id,
    `Penalty applied to ${selectedUser.id}.`
  );
  
  const formattedDate = penaltyExpiryDate.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  await commandInteraction.reply({
    content:
      `⚠️ **Penalty applied** by <@${commandInteraction.user.id}>\n\n` +
      `<@${selectedUser.id}> has been penalized for a no-show and cannot sign up until **${formattedDate}**.\n` +
      `Resolved report: **#${pendingReport.id}**`,
    ephemeral: true
  });
  
  console.log(
    `Admin ${commandInteraction.user.id} punished ${selectedUser.id} in guild ${guildId} (report ${pendingReport.id})`
  );
}

async function handleDismissReport(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const reportId = commandInteraction.options.getInteger('report_id');

  const pendingReport = await getPendingReportById(guildId, reportId);
  if (!pendingReport) {
    return await commandInteraction.reply({
      content: `❌ No pending report found with ID **${reportId}**.`,
      ephemeral: true
    });
  }

  await resolveNoShowReport(
    guildId,
    reportId,
    'resolved_dismissed',
    commandInteraction.user.id,
    'Dismissed by moderator.'
  );

  await commandInteraction.reply({
    content:
      `✅ Dismissed report **#${reportId}**.\n\n` +
      `Reporter: <@${pendingReport.reporter_user_id}>\n` +
      `Reported user: <@${pendingReport.reported_user_id}>`,
    ephemeral: true
  });

  console.log(`Admin ${commandInteraction.user.id} dismissed report ${reportId} in guild ${guildId}`);
}

async function handleUnpunishUser(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const selectedUser = commandInteraction.options.getUser('user');
  
  const selectedUserProfile = await getProfile(guildId, selectedUser.id);
  if (!selectedUserProfile || !selectedUserProfile.penalty_expires_at) {
    return await commandInteraction.reply({
      content: `❌ <@${selectedUser.id}> does not have an active penalty.`,
      ephemeral: true
    });
  }
  
  await removePenalty(guildId, selectedUser.id);
  
  await commandInteraction.reply({
    content: `✅ **Penalty removed** by <@${commandInteraction.user.id}>\n\n<@${selectedUser.id}>'s penalty has been cleared. They can now sign up for coffee chats.`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} removed penalty from ${selectedUser.id} in guild ${guildId}`);
}

function resolveAssignedVoiceChannelId(discordGuild, assignedVoiceChannelName) {
  const matchingVoiceChannels = discordGuild.channels.cache.filter(
    channel => channel?.isVoiceBased?.() && channel.name === assignedVoiceChannelName
  );

  if (matchingVoiceChannels.size === 1) {
    return matchingVoiceChannels.first().id;
  }

  if (matchingVoiceChannels.size > 1) {
    console.warn(
      `[${discordGuild.id}] Multiple voice channels named "${assignedVoiceChannelName}" found. Manual pairing saved without VC channel ID.`
    );
    return null;
  }

  console.warn(
    `[${discordGuild.id}] Voice channel "${assignedVoiceChannelName}" not found. Manual pairing saved without VC channel ID.`
  );
  return null;
}

async function handleForceManualPairing(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const firstUser = commandInteraction.options.getUser('user1');
  const secondUser = commandInteraction.options.getUser('user2');
  const optionalThirdUser = commandInteraction.options.getUser('user3');
  const assignedVoiceChannelNumber = commandInteraction.options.getInteger('vc') || 1;
  
  const userIsPairingWithThemselves = firstUser.id === secondUser.id || 
    (optionalThirdUser && (firstUser.id === optionalThirdUser.id || secondUser.id === optionalThirdUser.id));
  
  if (userIsPairingWithThemselves) {
    return await commandInteraction.reply({
      content: '❌ You cannot pair a user with themselves. Please select different users.',
      ephemeral: true
    });
  }

  const assignedVoiceChannelName = `Coffee Chat VC ${assignedVoiceChannelNumber}`;
  const interactionGuild = await resolveInteractionGuild(commandInteraction);
  if (!interactionGuild) {
    return await commandInteraction.reply({
      content: '❌ I could not load this server. Try again from a server text channel.',
      ephemeral: true
    });
  }

  await interactionGuild.channels.fetch();
  const assignedVoiceChannelId = resolveAssignedVoiceChannelId(interactionGuild, assignedVoiceChannelName);

  await createManualPairing(
    guildId,
    firstUser.id,
    secondUser.id,
    optionalThirdUser?.id || null,
    assignedVoiceChannelNumber,
    assignedVoiceChannelId
  );
  
  const allUsersInPairing = [firstUser, secondUser];
  if (optionalThirdUser) allUsersInPairing.push(optionalThirdUser);
  
  const userMentions = allUsersInPairing.map(user => `<@${user.id}>`).join(' + ');
  const trioLabel = optionalThirdUser ? ' (Trio)' : '';
  const voiceChannelDisplay = assignedVoiceChannelId
    ? `<#${assignedVoiceChannelId}>`
    : assignedVoiceChannelName;
  
  await commandInteraction.reply({
    content: `☕ **Manual pairing created** by <@${commandInteraction.user.id}>${trioLabel}\n\n👥 ${userMentions}\n🎤 ${voiceChannelDisplay}`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} created manual pairing in guild ${guildId}`);
}

async function handleAddSignup(commandInteraction) {
  const guildId = commandInteraction.guildId;
  const targetUser = commandInteraction.options.getUser('user');
  const selectedTimezone = commandInteraction.options.getString('timezone');
  
  const userAlreadySignedUp = await isSignedUp(guildId, targetUser.id);
  if (userAlreadySignedUp) {
    return await commandInteraction.reply({
      content: `❌ <@${targetUser.id}> is already signed up for this week's coffee chat.`,
      ephemeral: true
    });
  }
  
  await upsertProfile(guildId, targetUser.id, targetUser.username, selectedTimezone);
  await addSignup(guildId, targetUser.id);
  
  await commandInteraction.reply({
    content: `✅ **Signup added** by <@${commandInteraction.user.id}>\n\n<@${targetUser.id}> has been added to this week's signups (${selectedTimezone} timezone).`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} added ${targetUser.id} to signups in guild ${guildId}`);
}

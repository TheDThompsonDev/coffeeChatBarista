import cron from 'node-cron';
import { CRON_SCHEDULES } from '../config.js';
import { postSignupAnnouncement, postPairings, postNotEnoughSignups, sendPairingDMs, sendReminderDMs } from '../services/announcements.js';
import { 
  getSignupsWithProfiles, 
  clearAllSignups, 
  clearAllPairings,
  savePairings,
  getAllPairings,
  getIncompletePairings,
  expirePendingReports
} from '../services/database.js';
import { runMatching, filterPenalized, filterLeftUsers } from '../services/matching.js';
import { getAllConfiguredGuilds, markScheduledJobRun } from '../services/guildSettings.js';
import { getCentralTimeNow, getCurrentWeekStart, getResolvedSignupWindow } from '../utils/timezones.js';

const CENTRAL_TIMEZONE = 'America/Chicago';
const MINIMUM_SIGNUPS_FOR_MATCHING = 2;
const SCHEDULE_POLL_CRON = '* * * * *';
const REMINDER_OFFSET_DAYS = 2;
const REMINDER_HOUR_CT = 10;
const inMemoryScheduleJobRuns = new Set();

function getWeekOfDateString(date) {
  return date.toISOString().split('T')[0];
}

function createScheduleJobRunKey(guildId, jobType, weekOfDateString) {
  return `${guildId}:${jobType}:${weekOfDateString}`;
}

async function markScheduledJobRunSafely(guildId, jobType, weekOfDateString) {
  const inMemoryRunKey = createScheduleJobRunKey(guildId, jobType, weekOfDateString);
  inMemoryScheduleJobRuns.add(inMemoryRunKey);

  try {
    await markScheduledJobRun(guildId, jobType, weekOfDateString);
  } catch (markError) {
    console.warn(
      `[${guildId}] Could not persist ${jobType} schedule marker for week ${weekOfDateString}. ` +
      `Falling back to in-memory dedupe until restart.`
    );
    console.warn(markError);
  }
}

export function initializeJobs(discordClient) {
  console.log('Initializing cron jobs...');
  
  cron.schedule(SCHEDULE_POLL_CRON, async () => {
    try {
      await runDynamicScheduleForAllGuilds(discordClient);
    } catch (dynamicSchedulerError) {
      console.error('Error in dynamic schedule job:', dynamicSchedulerError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  cron.schedule(CRON_SCHEDULES.weeklyReset, async () => {
    console.log('Running job: Weekly reset for all guilds');
    try {
      await runWeeklyResetForAllGuilds();
    } catch (resetError) {
      console.error('Error in weekly reset job:', resetError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  console.log('Cron jobs initialized:');
  console.log(`- Dynamic schedule poll: ${SCHEDULE_POLL_CRON} CT`);
  console.log(`- Weekly reset: ${CRON_SCHEDULES.weeklyReset} CT`);
}

async function runDynamicScheduleForAllGuilds(discordClient) {
  const centralNow = getCentralTimeNow();
  const currentDayOfWeek = centralNow.getDay();
  const currentHourOfDay = centralNow.getHours();
  const currentWeekOfDate = getWeekOfDateString(getCurrentWeekStart());
  const configuredGuilds = await getAllConfiguredGuilds();

  if (configuredGuilds.length === 0) {
    return;
  }

  for (const guildSettings of configuredGuilds) {
    const guildId = guildSettings.guild_id;
    if (!guildSettings.announcements_channel_id || !guildSettings.pairings_channel_id) {
      continue;
    }

    const signupWindow = getResolvedSignupWindow(guildSettings);
    const signupInMemoryRunKey = createScheduleJobRunKey(guildId, 'signup_announcement', currentWeekOfDate);
    const matchingInMemoryRunKey = createScheduleJobRunKey(guildId, 'matching', currentWeekOfDate);
    const reminderInMemoryRunKey = createScheduleJobRunKey(guildId, 'reminder', currentWeekOfDate);

    try {
      const shouldRunSignupAnnouncement =
        currentDayOfWeek === signupWindow.dayOfWeek &&
        currentHourOfDay === signupWindow.startHour &&
        guildSettings.last_signup_announcement_week !== currentWeekOfDate &&
        !inMemoryScheduleJobRuns.has(signupInMemoryRunKey);

      if (shouldRunSignupAnnouncement) {
        await postSignupAnnouncement(discordClient, guildId);
        await markScheduledJobRunSafely(guildId, 'signup_announcement', currentWeekOfDate);
        console.log(`[${guildId}] Signup announcement complete for week ${currentWeekOfDate}`);
      }

      const shouldRunMatching =
        currentDayOfWeek === signupWindow.dayOfWeek &&
        currentHourOfDay === signupWindow.endHour &&
        guildSettings.last_matching_week !== currentWeekOfDate &&
        !inMemoryScheduleJobRuns.has(matchingInMemoryRunKey);

      if (shouldRunMatching) {
        const existingPairings = await getAllPairings(guildId);
        if (existingPairings.length > 0) {
          console.log(`[${guildId}] Skipping scheduled matching because pairings already exist for this week`);
          await markScheduledJobRunSafely(guildId, 'matching', currentWeekOfDate);
          continue;
        }

        await runMatchingForGuild(discordClient, guildId);
        await markScheduledJobRunSafely(guildId, 'matching', currentWeekOfDate);
        console.log(`[${guildId}] Matching complete for week ${currentWeekOfDate}`);
      }

      const reminderDayOfWeek = (signupWindow.dayOfWeek + REMINDER_OFFSET_DAYS) % 7;
      const shouldRunReminder =
        currentDayOfWeek === reminderDayOfWeek &&
        currentHourOfDay === REMINDER_HOUR_CT &&
        guildSettings.last_reminder_week !== currentWeekOfDate &&
        !inMemoryScheduleJobRuns.has(reminderInMemoryRunKey);

      if (shouldRunReminder) {
        const incompletePairings = await getIncompletePairings(guildId);

        if (incompletePairings.length > 0) {
          await sendReminderDMs(discordClient, guildId, incompletePairings);
        } else {
          console.log(`[${guildId}] All pairings complete, no reminders needed`);
        }

        await markScheduledJobRunSafely(guildId, 'reminder', currentWeekOfDate);
        console.log(`[${guildId}] Reminder processing complete for week ${currentWeekOfDate}`);
      }
    } catch (guildError) {
      console.error(`Error in dynamic schedule job for guild ${guildId}:`, guildError);
    }
  }
}

export async function runMatchingForGuild(discordClient, guildId) {
  console.log(`Starting matching process for guild ${guildId}...`);
  
  let eligibleSignups = await getSignupsWithProfiles(guildId);
  console.log(`[${guildId}] Initial signups: ${eligibleSignups.length}`);
  
  eligibleSignups = filterPenalized(eligibleSignups);
  console.log(`[${guildId}] After filtering penalized: ${eligibleSignups.length}`);
  
  const discordGuild = await discordClient.guilds.fetch(guildId);
  eligibleSignups = await filterLeftUsers(eligibleSignups, discordGuild);
  console.log(`[${guildId}] After filtering left users: ${eligibleSignups.length}`);
  
  if (eligibleSignups.length < MINIMUM_SIGNUPS_FOR_MATCHING) {
    console.log(`[${guildId}] Not enough signups for matching`);
    await postNotEnoughSignups(discordClient, guildId);
    return;
  }
  
  const createdPairings = await runMatching(guildId, eligibleSignups, discordClient);
  console.log(`[${guildId}] Created ${createdPairings.length} pairings`);

  await discordGuild.channels.fetch();
  attachVoiceChannelIds(createdPairings, discordGuild);
  
  await savePairings(guildId, createdPairings);
  
  await postPairings(discordClient, guildId, createdPairings);
  
  await sendPairingDMs(discordClient, guildId, createdPairings);
  
  console.log(`[${guildId}] Matching process complete`);
}

function attachVoiceChannelIds(pairings, discordGuild) {
  const voiceChannelIdByName = new Map();
  const duplicateVoiceChannelNames = new Set();

  for (const channel of discordGuild.channels.cache.values()) {
    if (!channel?.isVoiceBased?.()) continue;
    if (voiceChannelIdByName.has(channel.name)) {
      duplicateVoiceChannelNames.add(channel.name);
      voiceChannelIdByName.set(channel.name, null);
      continue;
    }
    voiceChannelIdByName.set(channel.name, channel.id);
  }

  for (const pairing of pairings) {
    const assignedChannelName = pairing.assigned_vc;
    const assignedChannelId = voiceChannelIdByName.get(assignedChannelName) || null;
    pairing.assigned_vc_channel_id = assignedChannelId;

    if (duplicateVoiceChannelNames.has(assignedChannelName)) {
      console.warn(
        `[${discordGuild.id}] Duplicate VC name "${assignedChannelName}" detected. Auto-complete disabled for this pairing.`
      );
      continue;
    }

    if (!assignedChannelId) {
      console.warn(
        `[${discordGuild.id}] Could not resolve VC "${assignedChannelName}". Users can still complete manually with /coffee complete.`
      );
    }
  }
}

async function runWeeklyResetForAllGuilds() {
  const configuredGuilds = await getAllConfiguredGuilds();
  console.log(`Running weekly reset for ${configuredGuilds.length} guilds`);
  
  for (const guildSettings of configuredGuilds) {
    try {
      await expirePendingReports(guildSettings.guild_id);
      await clearAllSignups(guildSettings.guild_id);
      await clearAllPairings(guildSettings.guild_id);
      console.log(`[${guildSettings.guild_id}] Weekly reset complete`);
    } catch (guildError) {
      console.error(`Error resetting guild ${guildSettings.guild_id}:`, guildError);
    }
  }
  
  console.log('Weekly reset complete for all guilds');
}


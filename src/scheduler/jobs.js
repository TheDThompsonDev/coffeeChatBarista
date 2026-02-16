import cron from 'node-cron';
import { CRON_SCHEDULES } from '../config.js';
import { postSignupAnnouncement, postPairings, postNotEnoughSignups, sendPairingDMs, sendReminderDMs } from '../services/announcements.js';
import { 
  getSignupsWithProfiles, 
  clearAllSignups, 
  clearAllPairings,
  savePairings,
  getIncompletePairings,
  expirePendingReports
} from '../services/database.js';
import { runMatching, filterPenalized, filterLeftUsers } from '../services/matching.js';
import { getAllConfiguredGuilds } from '../services/guildSettings.js';

const CENTRAL_TIMEZONE = 'America/Chicago';
const MINIMUM_SIGNUPS_FOR_MATCHING = 2;

export function initializeJobs(discordClient) {
  console.log('Initializing cron jobs...');
  
  cron.schedule(CRON_SCHEDULES.signupAnnouncement, async () => {
    console.log('Running job: Signup announcement for all guilds');
    try {
      await runSignupAnnouncementForAllGuilds(discordClient);
    } catch (signupAnnouncementError) {
      console.error('Error in signup announcement job:', signupAnnouncementError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  cron.schedule(CRON_SCHEDULES.matching, async () => {
    console.log('Running job: Matching for all guilds');
    try {
      await runMatchingForAllGuilds(discordClient);
    } catch (matchingError) {
      console.error('Error in matching job:', matchingError);
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
  
  cron.schedule(CRON_SCHEDULES.reminder, async () => {
    console.log('Running job: Reminder for incomplete pairings');
    try {
      await runReminderForAllGuilds(discordClient);
    } catch (reminderError) {
      console.error('Error in reminder job:', reminderError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  console.log('Cron jobs initialized:');
  console.log(`- Signup announcement: ${CRON_SCHEDULES.signupAnnouncement} CT`);
  console.log(`- Matching: ${CRON_SCHEDULES.matching} CT`);
  console.log(`- Reminder: ${CRON_SCHEDULES.reminder} CT`);
  console.log(`- Weekly reset: ${CRON_SCHEDULES.weeklyReset} CT`);
}

async function runSignupAnnouncementForAllGuilds(discordClient) {
  const configuredGuilds = await getAllConfiguredGuilds();
  console.log(`Running signup announcement for ${configuredGuilds.length} guilds`);
  
  for (const guildSettings of configuredGuilds) {
    try {
      await postSignupAnnouncement(discordClient, guildSettings.guild_id);
    } catch (guildError) {
      console.error(`Error posting announcement for guild ${guildSettings.guild_id}:`, guildError);
    }
  }
}

async function runMatchingForAllGuilds(discordClient) {
  const configuredGuilds = await getAllConfiguredGuilds();
  console.log(`Running matching for ${configuredGuilds.length} guilds`);
  
  for (const guildSettings of configuredGuilds) {
    try {
      await runMatchingForGuild(discordClient, guildSettings.guild_id);
    } catch (guildError) {
      console.error(`Error running matching for guild ${guildSettings.guild_id}:`, guildError);
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

async function runReminderForAllGuilds(discordClient) {
  const configuredGuilds = await getAllConfiguredGuilds();
  console.log(`Running reminder for ${configuredGuilds.length} guilds`);
  
  for (const guildSettings of configuredGuilds) {
    try {
      const incompletePairings = await getIncompletePairings(guildSettings.guild_id);
      
      if (incompletePairings.length > 0) {
        await sendReminderDMs(discordClient, guildSettings.guild_id, incompletePairings);
      } else {
        console.log(`[${guildSettings.guild_id}] All pairings complete, no reminders needed`);
      }
    } catch (guildError) {
      console.error(`Error sending reminders for guild ${guildSettings.guild_id}:`, guildError);
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


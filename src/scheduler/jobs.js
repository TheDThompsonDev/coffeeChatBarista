import cron from 'node-cron';
import { CRON_SCHEDULES, discord } from '../config.js';
import { postSignupAnnouncement, postPairings, postNotEnoughSignups } from '../services/announcements.js';
import { 
  getSignupsWithProfiles, 
  clearAllSignups, 
  clearAllPairings,
  savePairings,
  savePairingsToHistory
} from '../services/database.js';
import { runMatching, filterPenalized, filterLeftUsers } from '../services/matching.js';

const CENTRAL_TIMEZONE = 'America/Chicago';
const MINIMUM_SIGNUPS_FOR_MATCHING = 2;

export function initializeJobs(discordClient) {
  console.log('Initializing cron jobs...');
  
  cron.schedule(CRON_SCHEDULES.signupAnnouncement, async () => {
    console.log('Running job: Signup announcement');
    try {
      await postSignupAnnouncement(discordClient);
    } catch (signupAnnouncementError) {
      console.error('Error in signup announcement job:', signupAnnouncementError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  cron.schedule(CRON_SCHEDULES.matching, async () => {
    console.log('Running job: Matching');
    try {
      await runMatchingJob(discordClient);
    } catch (matchingError) {
      console.error('Error in matching job:', matchingError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  cron.schedule(CRON_SCHEDULES.weeklyReset, async () => {
    console.log('Running job: Weekly reset');
    try {
      await runWeeklyReset();
    } catch (resetError) {
      console.error('Error in weekly reset job:', resetError);
    }
  }, {
    timezone: CENTRAL_TIMEZONE
  });
  
  console.log('Cron jobs initialized:');
  console.log(`- Signup announcement: ${CRON_SCHEDULES.signupAnnouncement} CT`);
  console.log(`- Matching: ${CRON_SCHEDULES.matching} CT`);
  console.log(`- Weekly reset: ${CRON_SCHEDULES.weeklyReset} CT`);
}

async function runMatchingJob(discordClient) {
  console.log('Starting matching process...');
  
  let eligibleSignups = await getSignupsWithProfiles();
  console.log(`Initial signups: ${eligibleSignups.length}`);
  
  eligibleSignups = filterPenalized(eligibleSignups);
  console.log(`After filtering penalized: ${eligibleSignups.length}`);
  
  const discordGuild = await discordClient.guilds.fetch(discord.guildId);
  eligibleSignups = await filterLeftUsers(eligibleSignups, discordGuild);
  console.log(`After filtering left users: ${eligibleSignups.length}`);
  
  if (eligibleSignups.length < MINIMUM_SIGNUPS_FOR_MATCHING) {
    console.log('Not enough signups for matching');
    await postNotEnoughSignups(discordClient);
    return;
  }
  
  const createdPairings = await runMatching(eligibleSignups, discordClient);
  console.log(`Created ${createdPairings.length} pairings`);
  
  await savePairings(createdPairings);
  await savePairingsToHistory(createdPairings);
  
  await postPairings(discordClient, createdPairings);
  
  console.log('Matching process complete');
}

async function runWeeklyReset() {
  console.log('Running weekly reset...');
  
  await clearAllSignups();
  console.log('Cleared all signups');
  
  await clearAllPairings();
  console.log('Cleared all pairings');
  
  console.log('Weekly reset complete');
}


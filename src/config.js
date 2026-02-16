import dotenv from 'dotenv';

dotenv.config();

const requiredEnvironmentVariables = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY'
];

for (const environmentVariableKey of requiredEnvironmentVariables) {
  if (!process.env[environmentVariableKey]) {
    throw new Error(`Missing required environment variable: ${environmentVariableKey}`);
  }
}

export const discord = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID
};

export const supabase = {
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_KEY
};

export const TIMEZONE_REGIONS = {
  AMERICAS: 'AMERICAS',
  EMEA: 'EMEA',
  APAC: 'APAC'
};

export const VC_CONFIG = {
  totalVCs: 10,
  vcNamePrefix: 'coffee-chat-1'
};

export const MATCHING_CONFIG = {
  historyWeeks: 12,
  penaltyWeeks: 2
};

const DEFAULT_SCHEDULE = {
  dayOfWeek: 1, // Monday
  startHour: 8,
  endHour: 15
};

const LAUNCH_WEEK_OVERRIDE = {
  dayOfWeek: 2, // Tuesday
  // Override auto-disables after this timestamp.
  // Override with env var if needed.
  untilIso: process.env.COFFEE_LAUNCH_OVERRIDE_UNTIL || '2026-02-20T00:00:00-06:00'
};

const launchOverrideUntil = new Date(LAUNCH_WEEK_OVERRIDE.untilIso);
const useLaunchWeekSchedule = !Number.isNaN(launchOverrideUntil.valueOf()) && new Date() < launchOverrideUntil;
const activeSchedule = useLaunchWeekSchedule
  ? {
      dayOfWeek: LAUNCH_WEEK_OVERRIDE.dayOfWeek,
      startHour: DEFAULT_SCHEDULE.startHour,
      endHour: DEFAULT_SCHEDULE.endHour
    }
  : DEFAULT_SCHEDULE;

export const CRON_SCHEDULES = {
  signupAnnouncement: `0 ${activeSchedule.startHour} * * ${activeSchedule.dayOfWeek}`,
  matching: `0 ${activeSchedule.endHour} * * ${activeSchedule.dayOfWeek}`,
  weeklyReset: '59 23 * * 0',
  reminder: '0 10 * * 4'
};

export const SIGNUP_WINDOW = {
  dayOfWeek: activeSchedule.dayOfWeek,
  startHour: activeSchedule.startHour,
  endHour: activeSchedule.endHour
};


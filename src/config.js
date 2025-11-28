import dotenv from 'dotenv';

dotenv.config();

const requiredEnvironmentVariables = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'CHANNEL_ANNOUNCEMENTS',
  'CHANNEL_PAIRINGS',
  'ROLE_MODERATOR',
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
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  channels: {
    announcements: process.env.CHANNEL_ANNOUNCEMENTS,
    pairings: process.env.CHANNEL_PAIRINGS
  },
  roles: {
    moderator: process.env.ROLE_MODERATOR
  }
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
  vcNamePrefix: 'Coffee Chat VC'
};

export const MATCHING_CONFIG = {
  historyWeeks: 12,
  penaltyWeeks: 2
};

export const CRON_SCHEDULES = {
  signupAnnouncement: '0 8 * * 1',
  matching: '0 12 * * 1',
  weeklyReset: '59 23 * * 0'
};

export const SIGNUP_WINDOW = {
  dayOfWeek: 1,
  startHour: 8,
  endHour: 12
};


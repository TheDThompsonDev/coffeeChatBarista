import { discord } from '../config.js';

export function isModerator(guildMember) {
  return guildMember.roles.cache.has(discord.roles.moderator);
}


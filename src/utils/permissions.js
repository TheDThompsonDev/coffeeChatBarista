import { getGuildSettings } from '../services/guildSettings.js';

export async function isModerator(guildMember) {
  const guildSettings = await getGuildSettings(guildMember.guild.id);
  
  if (!guildSettings || !guildSettings.moderator_role_id) {
    return false;
  }
  
  return guildMember.roles.cache.has(guildSettings.moderator_role_id);
}


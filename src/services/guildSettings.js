import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '../config.js';

const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.serviceKey);

export async function getGuildSettings(guildId) {
  const { data, error } = await supabaseClient
    .from('guild_settings')
    .select('*')
    .eq('guild_id', guildId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
  return data;
}

export async function upsertGuildSettings(guildId, settings) {
  const { data, error } = await supabaseClient
    .from('guild_settings')
    .upsert({
      guild_id: guildId,
      ...settings
    }, {
      onConflict: 'guild_id'
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getAllConfiguredGuilds() {
  const { data, error } = await supabaseClient
    .from('guild_settings')
    .select('*')
    .not('announcements_channel_id', 'is', null);
  
  if (error) throw error;
  return data || [];
}

export async function deleteGuildSettings(guildId) {
  const { error } = await supabaseClient
    .from('guild_settings')
    .delete()
    .eq('guild_id', guildId);
  
  if (error) throw error;
}

export async function isGuildConfigured(guildId) {
  const settings = await getGuildSettings(guildId);
  return settings && settings.announcements_channel_id && settings.pairings_channel_id;
}



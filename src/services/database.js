import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '../config.js';
import { getCurrentWeekStart, getWeeksAgo, addWeeks } from '../utils/timezones.js';

const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.serviceKey);

const POSTGRES_NOT_FOUND_ERROR_CODE = 'PGRST116';

export async function upsertProfile(userId, timezoneRegion) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .upsert({
      user_id: userId,
      timezone_region: timezoneRegion
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== POSTGRES_NOT_FOUND_ERROR_CODE) {
    throw error;
  }
  
  return data;
}

export async function isPenalized(userId) {
  const userProfile = await getProfile(userId);
  
  if (!userProfile || !userProfile.penalty_expires_at) {
    return false;
  }
  
  const penaltyExpiryDate = new Date(userProfile.penalty_expires_at);
  const currentTime = new Date();
  
  return penaltyExpiryDate > currentTime;
}

export async function applyPenalty(userId) {
  const penaltyExpiresAt = addWeeks(new Date(), 2);
  
  const { error } = await supabaseClient
    .from('profiles')
    .upsert({
      user_id: userId,
      penalty_expires_at: penaltyExpiresAt.toISOString()
    }, {
      onConflict: 'user_id'
    });
  
  if (error) throw error;
  return penaltyExpiresAt;
}

export async function removePenalty(userId) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ penalty_expires_at: null })
    .eq('user_id', userId);
  
  if (error) throw error;
}

export async function addSignup(userId) {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .insert({ user_id: userId })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function removeSignup(userId) {
  const { error } = await supabaseClient
    .from('current_week_signups')
    .delete()
    .eq('user_id', userId);
  
  if (error) throw error;
}

export async function isSignedUp(userId) {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== POSTGRES_NOT_FOUND_ERROR_CODE) {
    throw error;
  }
  
  return !!data;
}

export async function getSignupsWithProfiles() {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .select(`
      user_id,
      profiles!inner (
        timezone_region,
        penalty_expires_at
      )
    `);
  
  if (error) throw error;
  
  return data.map(signupRow => ({
    user_id: signupRow.user_id,
    timezone_region: signupRow.profiles.timezone_region,
    penalty_expires_at: signupRow.profiles.penalty_expires_at
  }));
}

export async function clearAllSignups() {
  const { error } = await supabaseClient
    .from('current_week_signups')
    .delete()
    .neq('user_id', '');
  
  if (error) throw error;
}

export async function savePairings(pairingsToSave) {
  const databaseRecords = pairingsToSave.map(pairing => ({
    user_a: pairing.user_a,
    user_b: pairing.user_b,
    user_c: pairing.user_c || null,
    assigned_vc: pairing.assigned_vc
  }));
  
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .insert(databaseRecords)
    .select();
  
  if (error) throw error;
  return data;
}

export async function getUserPairing(userId) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .or(`user_a.eq.${userId},user_b.eq.${userId},user_c.eq.${userId}`);
  
  if (error) throw error;
  return data.length > 0 ? data[0] : null;
}

export async function getAllPairings() {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .order('id', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function clearAllPairings() {
  const { error } = await supabaseClient
    .from('current_week_pairings')
    .delete()
    .neq('id', 0);
  
  if (error) throw error;
}

export async function createManualPairing(userA, userB, userC = null, vcNumber = 1) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .insert({
      user_a: userA,
      user_b: userB,
      user_c: userC,
      assigned_vc: `Coffee Chat VC ${vcNumber}`
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function savePairingsToHistory(pairingsToSave) {
  const currentWeekStartDate = getCurrentWeekStart();
  
  const historyRecords = pairingsToSave.map(pairing => {
    const allUsersInPairing = [pairing.user_a, pairing.user_b];
    if (pairing.user_c) allUsersInPairing.push(pairing.user_c);
    allUsersInPairing.sort();
    
    return {
      user_a: allUsersInPairing[0],
      user_b: allUsersInPairing[1],
      user_c: allUsersInPairing[2] || null,
      week_of: currentWeekStartDate.toISOString().split('T')[0]
    };
  });
  
  const { data, error } = await supabaseClient
    .from('history')
    .insert(historyRecords)
    .select();
  
  if (error) throw error;
  return data;
}

export async function getHistorySince(startDate) {
  const { data, error } = await supabaseClient
    .from('history')
    .select('*')
    .gte('week_of', startDate.toISOString().split('T')[0])
    .order('week_of', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getRecentHistory(numberOfWeeks) {
  const startDateForHistory = getWeeksAgo(numberOfWeeks);
  return getHistorySince(startDateForHistory);
}

export async function getLeaderboard(limit = 10) {
  const { data: historyData, error } = await supabaseClient
    .from('history')
    .select('user_a, user_b, user_c');
  
  if (error) throw error;
  
  const userChatCounts = new Map();
  
  for (const record of historyData) {
    const usersInRecord = [record.user_a, record.user_b];
    if (record.user_c) usersInRecord.push(record.user_c);
    
    for (const userId of usersInRecord) {
      const currentCount = userChatCounts.get(userId) || 0;
      userChatCounts.set(userId, currentCount + 1);
    }
  }
  
  const sortedLeaderboard = Array.from(userChatCounts.entries())
    .map(([user_id, chat_count]) => ({ user_id, chat_count }))
    .sort((a, b) => b.chat_count - a.chat_count)
    .slice(0, limit);
  
  return sortedLeaderboard;
}


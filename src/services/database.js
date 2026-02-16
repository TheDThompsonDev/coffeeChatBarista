import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '../config.js';
import { getCurrentWeekStart, getWeeksAgo, addWeeks } from '../utils/timezones.js';

const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.serviceKey);

const POSTGRES_NOT_FOUND_ERROR_CODE = 'PGRST116';
const REPORT_STATUS_PENDING = 'pending';

function getWeekOfDateString(date) {
  return date.toISOString().split('T')[0];
}

function createHistoryKey(record) {
  return `${record.user_a}:${record.user_b}:${record.user_c || ''}:${record.week_of}`;
}

function normalizePairingUsers(userA, userB, userC = null) {
  const allUsersInPairing = [userA, userB];
  if (userC) allUsersInPairing.push(userC);
  allUsersInPairing.sort();
  return {
    user_a: allUsersInPairing[0],
    user_b: allUsersInPairing[1],
    user_c: allUsersInPairing[2] || null
  };
}

export async function upsertProfile(guildId, userId, username, timezoneRegion) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .upsert({
      guild_id: guildId,
      user_id: userId,
      username: username,
      timezone_region: timezoneRegion
    }, {
      onConflict: 'guild_id,user_id'
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getProfile(guildId, userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== POSTGRES_NOT_FOUND_ERROR_CODE) {
    throw error;
  }
  
  return data;
}

export async function isPenalized(guildId, userId) {
  const userProfile = await getProfile(guildId, userId);
  
  if (!userProfile || !userProfile.penalty_expires_at) {
    return false;
  }
  
  const penaltyExpiryDate = new Date(userProfile.penalty_expires_at);
  const currentTime = new Date();
  
  return penaltyExpiryDate > currentTime;
}

export async function applyPenalty(guildId, userId, username) {
  const penaltyExpiresAt = addWeeks(new Date(), 2);
  
  const { error } = await supabaseClient
    .from('profiles')
    .upsert({
      guild_id: guildId,
      user_id: userId,
      username: username,
      penalty_expires_at: penaltyExpiresAt.toISOString()
    }, {
      onConflict: 'guild_id,user_id'
    });
  
  if (error) throw error;
  return penaltyExpiresAt;
}

export async function removePenalty(guildId, userId) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ penalty_expires_at: null })
    .eq('guild_id', guildId)
    .eq('user_id', userId);
  
  if (error) throw error;
}

export async function addSignup(guildId, userId) {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .insert({ guild_id: guildId, user_id: userId })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function removeSignup(guildId, userId) {
  const { error } = await supabaseClient
    .from('current_week_signups')
    .delete()
    .eq('guild_id', guildId)
    .eq('user_id', userId);
  
  if (error) throw error;
}

export async function isSignedUp(guildId, userId) {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .select('user_id')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== POSTGRES_NOT_FOUND_ERROR_CODE) {
    throw error;
  }
  
  return !!data;
}

export async function getSignupsWithProfiles(guildId) {
  const { data, error } = await supabaseClient
    .from('current_week_signups')
    .select(`
      user_id,
      guild_id,
      profiles!inner (
        timezone_region,
        penalty_expires_at
      )
    `)
    .eq('guild_id', guildId);
  
  if (error) throw error;
  
  return data.map(signupRow => ({
    user_id: signupRow.user_id,
    timezone_region: signupRow.profiles.timezone_region,
    penalty_expires_at: signupRow.profiles.penalty_expires_at
  }));
}

export async function clearAllSignups(guildId) {
  const { error } = await supabaseClient
    .from('current_week_signups')
    .delete()
    .eq('guild_id', guildId);
  
  if (error) throw error;
}

export async function savePairings(guildId, pairingsToSave) {
  const databaseRecords = pairingsToSave.map(pairing => ({
    guild_id: guildId,
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

export async function getUserPairing(guildId, userId) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .eq('guild_id', guildId)
    .or(`user_a.eq.${userId},user_b.eq.${userId},user_c.eq.${userId}`);
  
  if (error) throw error;
  return data.length > 0 ? data[0] : null;
}

export async function getPairingById(guildId, pairingId) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .eq('guild_id', guildId)
    .eq('id', pairingId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getAllPairings(guildId) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .eq('guild_id', guildId)
    .order('id', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function clearAllPairings(guildId) {
  const { error } = await supabaseClient
    .from('current_week_pairings')
    .delete()
    .eq('guild_id', guildId);
  
  if (error) throw error;
}

export async function createManualPairing(guildId, userA, userB, userC = null, vcNumber = 1) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .insert({
      guild_id: guildId,
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

export async function savePairingsToHistory(guildId, pairingsToSave) {
  if (pairingsToSave.length === 0) return [];

  const weekOf = getWeekOfDateString(getCurrentWeekStart());
  const historyRecords = pairingsToSave.map(pairing => {
    const normalizedUsers = normalizePairingUsers(pairing.user_a, pairing.user_b, pairing.user_c);
    return {
      guild_id: guildId,
      user_a: normalizedUsers.user_a,
      user_b: normalizedUsers.user_b,
      user_c: normalizedUsers.user_c,
      week_of: weekOf
    };
  });

  const { data: existingRecords, error: existingError } = await supabaseClient
    .from('history')
    .select('user_a, user_b, user_c, week_of')
    .eq('guild_id', guildId)
    .eq('week_of', weekOf);

  if (existingError) throw existingError;

  const existingRecordKeys = new Set((existingRecords || []).map(createHistoryKey));
  const recordsToInsert = historyRecords.filter(record => !existingRecordKeys.has(createHistoryKey(record)));

  if (recordsToInsert.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from('history')
    .insert(recordsToInsert)
    .select();

  if (error) throw error;
  return data;
}

export async function clearCurrentWeekHistory(guildId) {
  const weekOf = getWeekOfDateString(getCurrentWeekStart());
  const { error } = await supabaseClient
    .from('history')
    .delete()
    .eq('guild_id', guildId)
    .eq('week_of', weekOf);

  if (error) throw error;
}

export async function getHistorySince(guildId, startDate) {
  const { data, error } = await supabaseClient
    .from('history')
    .select('*')
    .eq('guild_id', guildId)
    .gte('week_of', startDate.toISOString().split('T')[0])
    .order('week_of', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getRecentHistory(guildId, numberOfWeeks) {
  const startDateForHistory = getWeeksAgo(numberOfWeeks);
  return getHistorySince(guildId, startDateForHistory);
}

export async function markPairingComplete(guildId, pairingId, completionMethod) {
  const completedAt = new Date().toISOString();
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .update({
      completed_at: completedAt,
      completion_method: completionMethod
    })
    .eq('guild_id', guildId)
    .eq('id', pairingId)
    .is('completed_at', null)
    .select()
    .maybeSingle();

  if (error) throw error;

  if (data) {
    await savePairingsToHistory(guildId, [data]);
    return data;
  }

  // If another path completed this pairing first, return the existing record.
  return getPairingById(guildId, pairingId);
}

export async function getIncompletePairings(guildId) {
  const { data, error } = await supabaseClient
    .from('current_week_pairings')
    .select('*')
    .eq('guild_id', guildId)
    .is('completed_at', null);
  
  if (error) throw error;
  return data;
}

export async function getSignupCount(guildId) {
  const { count, error } = await supabaseClient
    .from('current_week_signups')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId);
  
  if (error) throw error;
  return count || 0;
}

export async function createNoShowReport(guildId, pairingId, reporterUserId, reportedUserId) {
  const { data, error } = await supabaseClient
    .from('pending_reports')
    .insert({
      guild_id: guildId,
      pairing_id: pairingId,
      reporter_user_id: reporterUserId,
      reported_user_id: reportedUserId,
      status: REPORT_STATUS_PENDING
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOpenNoShowReport(guildId, pairingId, reporterUserId, reportedUserId) {
  const { data, error } = await supabaseClient
    .from('pending_reports')
    .select('*')
    .eq('guild_id', guildId)
    .eq('pairing_id', pairingId)
    .eq('reporter_user_id', reporterUserId)
    .eq('reported_user_id', reportedUserId)
    .eq('status', REPORT_STATUS_PENDING)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPendingReportById(guildId, reportId) {
  const { data, error } = await supabaseClient
    .from('pending_reports')
    .select('*')
    .eq('guild_id', guildId)
    .eq('id', reportId)
    .eq('status', REPORT_STATUS_PENDING)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLatestPendingReportForUser(guildId, reportedUserId) {
  const { data, error } = await supabaseClient
    .from('pending_reports')
    .select('*')
    .eq('guild_id', guildId)
    .eq('reported_user_id', reportedUserId)
    .eq('status', REPORT_STATUS_PENDING)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function resolveNoShowReport(guildId, reportId, status, reviewedByUserId, resolutionNote = null) {
  const { data, error } = await supabaseClient
    .from('pending_reports')
    .update({
      status,
      reviewed_by_user_id: reviewedByUserId,
      reviewed_at: new Date().toISOString(),
      resolution_note: resolutionNote
    })
    .eq('guild_id', guildId)
    .eq('id', reportId)
    .eq('status', REPORT_STATUS_PENDING)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function expirePendingReports(guildId) {
  const { error } = await supabaseClient
    .from('pending_reports')
    .update({
      status: 'expired',
      reviewed_at: new Date().toISOString(),
      resolution_note: 'Automatically expired at weekly reset.'
    })
    .eq('guild_id', guildId)
    .eq('status', REPORT_STATUS_PENDING);

  if (error) throw error;
}

export async function deleteGuildData(guildId) {
  const tableNamesInDeleteOrder = [
    'pending_reports',
    'current_week_signups',
    'current_week_pairings',
    'history',
    'profiles'
  ];

  for (const tableName of tableNamesInDeleteOrder) {
    const { error } = await supabaseClient
      .from(tableName)
      .delete()
      .eq('guild_id', guildId);

    if (error) throw error;
  }
}

export async function getLeaderboard(guildId, limit = 10) {
  const { data: historyData, error } = await supabaseClient
    .from('history')
    .select('user_a, user_b, user_c')
    .eq('guild_id', guildId);
  
  if (error) throw error;
  
  const userChatCounts = new Map();
  
  for (const record of historyData) {
    const usersInRecord = [record.user_a, record.user_b];
    if (record.user_c) usersInRecord.push(record.user_c);
    
    for (const odataUserId of usersInRecord) {
      const currentCount = userChatCounts.get(odataUserId) || 0;
      userChatCounts.set(odataUserId, currentCount + 1);
    }
  }
  
  const sortedLeaderboard = Array.from(userChatCounts.entries())
    .map(([user_id, chat_count]) => ({ user_id, chat_count }))
    .sort((a, b) => b.chat_count - a.chat_count)
    .slice(0, limit);
  
  return sortedLeaderboard;
}


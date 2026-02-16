import { getPairingById, getUserPairing, markPairingComplete } from './database.js';

const COMPLETION_THRESHOLD_MS = 5 * 60 * 1000;
const pendingCompletionTimers = new Map();

function getTimerKey(guildId, pairingId) {
  return `${guildId}:${pairingId}`;
}

function getPairingParticipantIds(pairing) {
  const participantIds = [pairing.user_a, pairing.user_b];
  if (pairing.user_c) participantIds.push(pairing.user_c);
  return participantIds;
}

function getRequiredParticipantCount(pairing) {
  return pairing.user_c ? 2 : 2;
}

function getAssignedVoiceChannel(guild, assignedChannelName) {
  return guild.channels.cache.find(
    channel => channel.isVoiceBased() && channel.name === assignedChannelName
  );
}

function getAssignedChannelPresence(guild, pairing) {
  const assignedVoiceChannel = getAssignedVoiceChannel(guild, pairing.assigned_vc);
  if (!assignedVoiceChannel) {
    return {
      assignedVoiceChannel: null,
      participantsPresent: []
    };
  }

  const participantIds = getPairingParticipantIds(pairing);
  const participantsPresent = participantIds.filter(participantId =>
    assignedVoiceChannel.members.has(participantId)
  );

  return {
    assignedVoiceChannel,
    participantsPresent
  };
}

export function initializeVoiceTracking(discordClient) {
  discordClient.on('voiceStateUpdate', async (_oldVoiceState, newVoiceState) => {
    try {
      await handleVoiceStateChange(newVoiceState);
    } catch (voiceTrackingError) {
      console.error('Error in voice tracking:', voiceTrackingError);
    }
  });

  console.log('Voice tracking initialized for coffee chat auto-detection');
}

async function handleVoiceStateChange(newVoiceState) {
  const guildId = newVoiceState.guild.id;
  const userId = newVoiceState.id;
  const pairing = await getUserPairing(guildId, userId);
  if (!pairing) return;

  await syncPairingCompletionTimer(newVoiceState.guild, pairing);
}

async function syncPairingCompletionTimer(guild, pairing) {
  const timerKey = getTimerKey(guild.id, pairing.id);
  const existingTimer = pendingCompletionTimers.get(timerKey);

  if (pairing.completed_at) {
    if (existingTimer) {
      clearTimeout(existingTimer.timer);
      pendingCompletionTimers.delete(timerKey);
    }
    return;
  }

  const { assignedVoiceChannel, participantsPresent } = getAssignedChannelPresence(guild, pairing);
  const requiredParticipantCount = getRequiredParticipantCount(pairing);

  if (!assignedVoiceChannel || participantsPresent.length < requiredParticipantCount) {
    if (existingTimer) {
      clearTimeout(existingTimer.timer);
      pendingCompletionTimers.delete(timerKey);
      console.log(`[${guild.id}] Cancelled completion timer for pairing ${pairing.id}`);
    }
    return;
  }

  if (existingTimer) {
    if (existingTimer.channelId === assignedVoiceChannel.id) {
      return;
    }
    clearTimeout(existingTimer.timer);
    pendingCompletionTimers.delete(timerKey);
  }

  console.log(
    `[${guild.id}] Starting 5-min completion timer for pairing ${pairing.id} in assigned VC ${assignedVoiceChannel.name}`
  );

  const completionTimer = setTimeout(async () => {
    try {
      const latestPairing = await getPairingById(guild.id, pairing.id);
      if (!latestPairing || latestPairing.completed_at) {
        return;
      }

      const latestPresence = getAssignedChannelPresence(guild, latestPairing);
      const minimumParticipants = getRequiredParticipantCount(latestPairing);
      if (!latestPresence.assignedVoiceChannel || latestPresence.participantsPresent.length < minimumParticipants) {
        console.log(
          `[${guild.id}] Completion timer expired for pairing ${pairing.id}, but participants were no longer in assigned VC`
        );
        return;
      }

      const completionResult = await markPairingComplete(guild.id, pairing.id, 'vc_auto');
      if (!completionResult || completionResult.completion_method !== 'vc_auto') {
        return;
      }

      console.log(`[${guild.id}] Auto-completed pairing ${pairing.id} via assigned VC detection`);

      for (const participantId of getPairingParticipantIds(latestPairing)) {
        try {
          const member = await guild.members.fetch(participantId);
          await member.send(
            '☕ **Coffee chat logged!** Your chat in the assigned coffee VC was detected and recorded automatically.'
          );
        } catch (dmError) {
          console.log(`Could not DM user ${participantId} about VC completion`);
        }
      }
    } catch (completionError) {
      console.error(`Error completing pairing ${pairing.id}:`, completionError);
    } finally {
      pendingCompletionTimers.delete(timerKey);
    }
  }, COMPLETION_THRESHOLD_MS);

  pendingCompletionTimers.set(timerKey, {
    timer: completionTimer,
    channelId: assignedVoiceChannel.id
  });
}

import { getRecentHistory } from './database.js';
import { MATCHING_CONFIG, VC_CONFIG, TIMEZONE_REGIONS } from '../config.js';

function createAlphabeticalPairKey(userA, userB) {
  return userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
}

function buildSetOfHistoricalPairs(historyRecords) {
  const setOfPreviouslyMatchedPairs = new Set();
  
  for (const historyRecord of historyRecords) {
    const usersInRecord = [historyRecord.user_a, historyRecord.user_b];
    if (historyRecord.user_c) usersInRecord.push(historyRecord.user_c);
    
    for (let i = 0; i < usersInRecord.length; i++) {
      for (let j = i + 1; j < usersInRecord.length; j++) {
        setOfPreviouslyMatchedPairs.add(createAlphabeticalPairKey(usersInRecord[i], usersInRecord[j]));
      }
    }
  }
  
  return setOfPreviouslyMatchedPairs;
}

function buildMapOfPairKeyToMostRecentDate(historyRecords) {
  const mapOfPairToDate = new Map();
  
  for (const historyRecord of historyRecords) {
    const usersInRecord = [historyRecord.user_a, historyRecord.user_b];
    if (historyRecord.user_c) usersInRecord.push(historyRecord.user_c);
    
    for (let i = 0; i < usersInRecord.length; i++) {
      for (let j = i + 1; j < usersInRecord.length; j++) {
        const pairKey = createAlphabeticalPairKey(usersInRecord[i], usersInRecord[j]);
        const weekOfDate = new Date(historyRecord.week_of);
        
        if (!mapOfPairToDate.has(pairKey) || weekOfDate > mapOfPairToDate.get(pairKey)) {
          mapOfPairToDate.set(pairKey, weekOfDate);
        }
      }
    }
  }
  
  return mapOfPairToDate;
}

function shuffleArrayInPlace(arrayToShuffle) {
  for (let i = arrayToShuffle.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [arrayToShuffle[i], arrayToShuffle[randomIndex]] = [arrayToShuffle[randomIndex], arrayToShuffle[i]];
  }
  return arrayToShuffle;
}

function findBestMatchPreferringNewPairs(user, candidateUsers, setOfHistoricalPairs, mapOfPairToDate) {
  for (const candidateUser of candidateUsers) {
    const pairKey = createAlphabeticalPairKey(user, candidateUser);
    if (!setOfHistoricalPairs.has(pairKey)) {
      return candidateUser;
    }
  }
  
  let candidateWithOldestPairing = candidateUsers[0];
  let oldestPairingDate = mapOfPairToDate.get(createAlphabeticalPairKey(user, candidateUsers[0]));
  
  for (let i = 1; i < candidateUsers.length; i++) {
    const candidateUser = candidateUsers[i];
    const pairKey = createAlphabeticalPairKey(user, candidateUser);
    const pairingDate = mapOfPairToDate.get(pairKey);
    
    if (!oldestPairingDate || (pairingDate && pairingDate < oldestPairingDate)) {
      oldestPairingDate = pairingDate;
      candidateWithOldestPairing = candidateUser;
    }
  }
  
  return candidateWithOldestPairing;
}

function removeElementFromArray(arrayToModify, elementToRemove) {
  const indexOfElement = arrayToModify.indexOf(elementToRemove);
  if (indexOfElement > -1) {
    arrayToModify.splice(indexOfElement, 1);
  }
}

export async function runMatching(guildId, eligibleSignups, client) {
  const pairingHistory = await getRecentHistory(guildId, MATCHING_CONFIG.historyWeeks);
  const setOfHistoricalPairs = buildSetOfHistoricalPairs(pairingHistory);
  const mapOfPairToDate = buildMapOfPairKeyToMostRecentDate(pairingHistory);
  
  const timezoneBuckets = {
    [TIMEZONE_REGIONS.AMERICAS]: [],
    [TIMEZONE_REGIONS.EMEA]: [],
    [TIMEZONE_REGIONS.APAC]: []
  };
  
  for (const signup of eligibleSignups) {
    if (timezoneBuckets[signup.timezone_region]) {
      timezoneBuckets[signup.timezone_region].push(signup.user_id);
    }
  }
  
  for (const timezoneRegion in timezoneBuckets) {
    shuffleArrayInPlace(timezoneBuckets[timezoneRegion]);
  }
  
  const createdPairs = [];
  const unpairableRemainders = [];
  
  for (const timezoneRegion in timezoneBuckets) {
    const usersInTimezoneBucket = timezoneBuckets[timezoneRegion];
    
    while (usersInTimezoneBucket.length >= 2) {
      const firstUser = usersInTimezoneBucket.pop();
      const bestMatchingUser = findBestMatchPreferringNewPairs(firstUser, usersInTimezoneBucket, setOfHistoricalPairs, mapOfPairToDate);
      removeElementFromArray(usersInTimezoneBucket, bestMatchingUser);
      
      createdPairs.push({
        user_a: firstUser,
        user_b: bestMatchingUser
      });
    }
    
    if (usersInTimezoneBucket.length === 1) {
      unpairableRemainders.push(usersInTimezoneBucket.pop());
    }
  }
  
  while (unpairableRemainders.length >= 2) {
    const firstUser = unpairableRemainders.pop();
    const bestMatchingUser = findBestMatchPreferringNewPairs(firstUser, unpairableRemainders, setOfHistoricalPairs, mapOfPairToDate);
    removeElementFromArray(unpairableRemainders, bestMatchingUser);
    
    createdPairs.push({
      user_a: firstUser,
      user_b: bestMatchingUser
    });
  }
  
  if (unpairableRemainders.length === 1) {
    const randomPairIndex = Math.floor(Math.random() * createdPairs.length);
    createdPairs[randomPairIndex].user_c = unpairableRemainders.pop();
  }
  
  for (let pairIndex = 0; pairIndex < createdPairs.length; pairIndex++) {
    const voiceChannelNumber = (pairIndex % VC_CONFIG.totalVCs) + 1;
    createdPairs[pairIndex].assigned_vc = `${VC_CONFIG.vcNamePrefix}${voiceChannelNumber.toString().padStart(2, '0')}`;
    
    if (pairIndex >= VC_CONFIG.totalVCs) {
      createdPairs[pairIndex].needsCoordination = true;
    }
  }
  
  return createdPairs;
}

export function filterPenalized(signupsToFilter) {
  const currentTime = new Date();
  
  return signupsToFilter.filter(signup => {
    if (!signup.penalty_expires_at) {
      return true;
    }
    
    const penaltyExpiryDate = new Date(signup.penalty_expires_at);
    return penaltyExpiryDate <= currentTime;
  });
}

export async function filterLeftUsers(signupsToFilter, discordGuild) {
  const allGuildMembers = await discordGuild.members.fetch();
  
  return signupsToFilter.filter(signup => {
    const userStillInServer = allGuildMembers.has(signup.user_id);
    if (!userStillInServer) {
      console.log(`User ${signup.user_id} has left the server, removing from signups`);
    }
    return userStillInServer;
  });
}


import { getGuildSettings } from './guildSettings.js';

const COFFEE_ROLE_EMOJI = '☕';

function isCoffeeRoleEmoji(emojiName) {
  return typeof emojiName === 'string' && emojiName.startsWith(COFFEE_ROLE_EMOJI);
}

async function ensureHydratedReaction(messageReaction) {
  if (!messageReaction.partial) {
    return messageReaction;
  }

  try {
    return await messageReaction.fetch();
  } catch (reactionFetchError) {
    return null;
  }
}

async function syncMemberRoleFromReaction(messageReaction, reactingUser, shouldHaveRole) {
  if (!reactingUser || reactingUser.bot) {
    return;
  }

  const hydratedReaction = await ensureHydratedReaction(messageReaction);
  if (!hydratedReaction?.message?.guildId) {
    return;
  }

  if (!isCoffeeRoleEmoji(hydratedReaction.emoji?.name)) {
    return;
  }

  const guildId = hydratedReaction.message.guildId;
  const guildSettings = await getGuildSettings(guildId);

  if (!guildSettings?.ping_role_id || !guildSettings?.reaction_role_message_id) {
    return;
  }

  if (hydratedReaction.message.id !== guildSettings.reaction_role_message_id) {
    return;
  }

  const discordGuild =
    hydratedReaction.message.guild ??
    await hydratedReaction.message.client.guilds.fetch(guildId).catch(() => null);

  if (!discordGuild) {
    return;
  }

  const guildMember = await discordGuild.members.fetch(reactingUser.id).catch(() => null);
  if (!guildMember) {
    return;
  }

  const roleId = guildSettings.ping_role_id;
  const memberHasRole = guildMember.roles.cache.has(roleId);

  if (shouldHaveRole && !memberHasRole) {
    await guildMember.roles.add(roleId, 'Coffee chat role opt-in reaction');
    console.log(`[${guildId}] Added role ${roleId} to user ${reactingUser.id} via ☕ reaction`);
    return;
  }

  if (!shouldHaveRole && memberHasRole) {
    await guildMember.roles.remove(roleId, 'Coffee chat role opt-out reaction');
    console.log(`[${guildId}] Removed role ${roleId} from user ${reactingUser.id} via ☕ reaction removal`);
  }
}

export function initializeReactionRoleTracking(discordClient) {
  discordClient.on('messageReactionAdd', async (messageReaction, reactingUser) => {
    try {
      await syncMemberRoleFromReaction(messageReaction, reactingUser, true);
    } catch (reactionAddError) {
      console.error('Error assigning role from reaction:', reactionAddError);
    }
  });

  discordClient.on('messageReactionRemove', async (messageReaction, reactingUser) => {
    try {
      await syncMemberRoleFromReaction(messageReaction, reactingUser, false);
    } catch (reactionRemoveError) {
      console.error('Error removing role from reaction:', reactionRemoveError);
    }
  });

  console.log('Reaction role tracking initialized');
}

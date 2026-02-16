import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { upsertGuildSettings, getGuildSettings } from '../services/guildSettings.js';
import { getSignupWindowDescription } from '../utils/timezones.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Configure Coffee Chat Barista for your server (Admin only)')
      .addChannelOption(option =>
        option
          .setName('announcements')
          .setDescription('Channel for signup announcements')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
      .addChannelOption(option =>
        option
          .setName('pairings')
          .setDescription('Channel for posting weekly pairings')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
      .addRoleOption(option =>
        option
          .setName('moderator')
          .setDescription('Role that can use admin commands')
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('ping')
          .setDescription('Role to ping for signup announcements')
          .setRequired(true)
      )
  );

function hasAdminPermission(commandInteraction) {
  if (commandInteraction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const rawPermissions = commandInteraction.member?.permissions;
  if (typeof rawPermissions === 'string') {
    const permissionsAsBigInt = BigInt(rawPermissions);
    return (permissionsAsBigInt & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
  }

  return false;
}

const REQUIRED_CHANNEL_POST_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links']
];

function getMissingChannelPermissions(channel, guildMember) {
  const channelPermissions = channel?.permissionsFor?.(guildMember);
  if (!channelPermissions?.has) {
    return [];
  }

  return REQUIRED_CHANNEL_POST_PERMISSIONS
    .filter(([permissionBit]) => !channelPermissions.has(permissionBit))
    .map(([, permissionName]) => permissionName);
}

export async function execute(commandInteraction) {
  try {
    if (!hasAdminPermission(commandInteraction)) {
      return await commandInteraction.reply({
        content: '❌ Only server administrators can run the setup command.',
        ephemeral: true
      });
    }

    const guildId = commandInteraction.guildId;
    if (!guildId) {
      return await commandInteraction.reply({
        content: '❌ This command can only be used in a server.',
        ephemeral: true
      });
    }

    const guildName = commandInteraction.guild?.name || 'Unknown Guild';
    const announcementsChannel = commandInteraction.options.getChannel('announcements');
    const pairingsChannel = commandInteraction.options.getChannel('pairings');
    const moderatorRole = commandInteraction.options.getRole('moderator');
    const pingRole = commandInteraction.options.getRole('ping');

    if (!announcementsChannel || !pairingsChannel || !moderatorRole || !pingRole) {
      return await commandInteraction.reply({
        content:
          '❌ Setup options were missing from the interaction payload. ' +
          'Please wait a minute for slash command sync, then run `/coffee setup` again.',
        ephemeral: true
      });
    }

    const interactionGuild =
      commandInteraction.guild ??
      await commandInteraction.client.guilds.fetch(guildId).catch(() => null);
    const botGuildMember =
      interactionGuild?.members?.me ??
      await interactionGuild?.members.fetchMe().catch(() => null);

    if (botGuildMember) {
      const missingAnnouncementsPermissions = getMissingChannelPermissions(
        announcementsChannel,
        botGuildMember
      );
      const missingPairingsPermissions = getMissingChannelPermissions(pairingsChannel, botGuildMember);

      if (missingAnnouncementsPermissions.length || missingPairingsPermissions.length) {
        const announcementLine = missingAnnouncementsPermissions.length
          ? `📢 <#${announcementsChannel.id}>: ${missingAnnouncementsPermissions.join(', ')}\n`
          : '';
        const pairingLine = missingPairingsPermissions.length
          ? `☕ <#${pairingsChannel.id}>: ${missingPairingsPermissions.join(', ')}\n`
          : '';

        return await commandInteraction.reply({
          content:
            '❌ I cannot post in one or more selected channels.\n\n' +
            'Please grant my role these permissions, then run `/coffee setup` again:\n' +
            announcementLine +
            pairingLine +
            '\nEphemeral command replies can still work even when normal channel posting is blocked.',
          ephemeral: true
        });
      }
    }

    const updatedSettings = await upsertGuildSettings(guildId, {
      guild_name: guildName,
      announcements_channel_id: announcementsChannel.id,
      pairings_channel_id: pairingsChannel.id,
      moderator_role_id: moderatorRole.id,
      ping_role_id: pingRole.id
    });
    const signupWindowDescription = getSignupWindowDescription(updatedSettings);
    
    await commandInteraction.reply({
      content: `✅ **Coffee Chat Barista is now configured!**\n\n` +
               `📢 Announcements: <#${announcementsChannel.id}>\n` +
               `☕ Pairings: <#${pairingsChannel.id}>\n` +
               `🛡️ Moderator Role: <@&${moderatorRole.id}>\n` +
               `🔔 Ping Role: <@&${pingRole.id}>\n\n` +
               `**Next Steps:**\n` +
               `• Members can now use \`/coffee join\` to sign up\n` +
               `• Use \`/coffee admin announce\` to send the signup announcement\n` +
               `• Signups open every ${signupWindowDescription} by default\n` +
               `• Need holiday timing changes? Use \`/coffee admin schedule\``,
      ephemeral: true
    });
    
    console.log(`Guild ${guildId} (${guildName}) completed setup`);
    
  } catch (setupError) {
    console.error('Error in /coffee setup:', setupError);
    const errorPayload = {
      content: '❌ An error occurred during setup. Please try again.',
      ephemeral: true
    };

    if (commandInteraction.replied || commandInteraction.deferred) {
      await commandInteraction.followUp(errorPayload);
    } else {
      await commandInteraction.reply(errorPayload);
    }
  }
}

export async function executeSettings(commandInteraction) {
  const guildId = commandInteraction.guildId;
  if (!guildId) {
    return await commandInteraction.reply({
      content: '❌ This command can only be used in a server.',
      ephemeral: true
    });
  }
  
  try {
    const settings = await getGuildSettings(guildId);
    
    if (!settings) {
      return await commandInteraction.reply({
        content: '❌ This server hasn\'t been set up yet. Run `/coffee setup` first.',
        ephemeral: true
      });
    }
    
    await commandInteraction.reply({
      content: `☕ **Current Coffee Chat Settings**\n\n` +
               `📢 Announcements: <#${settings.announcements_channel_id}>\n` +
               `☕ Pairings: <#${settings.pairings_channel_id}>\n` +
               `🛡️ Moderator Role: <@&${settings.moderator_role_id}>\n` +
               `🔔 Ping Role: <@&${settings.ping_role_id}>\n\n` +
               `To change settings, run \`/coffee setup\` again.`,
      ephemeral: true
    });
    
  } catch (settingsError) {
    console.error('Error in /coffee settings:', settingsError);
    await commandInteraction.reply({
      content: '❌ An error occurred while fetching settings.',
      ephemeral: true
    });
  }
}



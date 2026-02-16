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

export async function execute(commandInteraction) {
  const memberPermissions = commandInteraction.member.permissions;
  if (!memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return await commandInteraction.reply({
      content: '❌ Only server administrators can run the setup command.',
      ephemeral: true
    });
  }
  
  const guildId = commandInteraction.guild.id;
  const guildName = commandInteraction.guild.name;
  const announcementsChannel = commandInteraction.options.getChannel('announcements');
  const pairingsChannel = commandInteraction.options.getChannel('pairings');
  const moderatorRole = commandInteraction.options.getRole('moderator');
  const pingRole = commandInteraction.options.getRole('ping');
  const signupWindowDescription = getSignupWindowDescription();
  
  try {
    await upsertGuildSettings(guildId, {
      guild_name: guildName,
      announcements_channel_id: announcementsChannel.id,
      pairings_channel_id: pairingsChannel.id,
      moderator_role_id: moderatorRole.id,
      ping_role_id: pingRole.id
    });
    
    await commandInteraction.reply({
      content: `✅ **Coffee Chat Barista is now configured!**\n\n` +
               `📢 Announcements: <#${announcementsChannel.id}>\n` +
               `☕ Pairings: <#${pairingsChannel.id}>\n` +
               `🛡️ Moderator Role: <@&${moderatorRole.id}>\n` +
               `🔔 Ping Role: <@&${pingRole.id}>\n\n` +
               `**Next Steps:**\n` +
               `• Members can now use \`/coffee join\` to sign up\n` +
               `• Use \`/coffee admin announce\` to send the signup announcement\n` +
               `• Signups open every ${signupWindowDescription} by default`
    });
    
    console.log(`Guild ${guildId} (${guildName}) completed setup`);
    
  } catch (setupError) {
    console.error('Error in /coffee setup:', setupError);
    await commandInteraction.reply({
      content: '❌ An error occurred during setup. Please try again.',
      ephemeral: true
    });
  }
}

export async function executeSettings(commandInteraction) {
  const guildId = commandInteraction.guild.id;
  
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



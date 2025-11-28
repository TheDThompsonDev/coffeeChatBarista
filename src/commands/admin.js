import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isModerator } from '../utils/permissions.js';
import { 
  clearAllSignups, 
  removePenalty, 
  createManualPairing,
  getProfile
} from '../services/database.js';
import { postSignupAnnouncement } from '../services/announcements.js';
import { discord } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('coffee')
  .setDescription('Coffee chat commands')
  .addSubcommandGroup(group =>
    group
      .setName('admin')
      .setDescription('Admin commands for moderators')
      .addSubcommand(subcommand =>
        subcommand
          .setName('announce')
          .setDescription('Manually send the signup announcement')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('say')
          .setDescription('Have the bot post a custom message in announcements')
          .addStringOption(option =>
            option
              .setName('message')
              .setDescription('The message to post')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Clear all current week signups (use with caution)')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('unpunish')
          .setDescription('Remove a penalty from a user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('The user to unpunish')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('force-pair')
          .setDescription('Manually create a pairing')
          .addUserOption(option =>
            option
              .setName('user1')
              .setDescription('First user')
              .setRequired(true)
          )
          .addUserOption(option =>
            option
              .setName('user2')
              .setDescription('Second user')
              .setRequired(true)
          )
          .addUserOption(option =>
            option
              .setName('user3')
              .setDescription('Third user (optional, for trio)')
              .setRequired(false)
          )
          .addIntegerOption(option =>
            option
              .setName('vc')
              .setDescription('VC number (1-10)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(10)
          )
      )
  );

export async function execute(commandInteraction) {
  const commandingGuildMember = await commandInteraction.guild.members.fetch(commandInteraction.user.id);
  if (!isModerator(commandingGuildMember)) {
    return await commandInteraction.reply({
      content: '❌ You do not have permission to use admin commands.'
    });
  }
  
  const selectedSubcommand = commandInteraction.options.getSubcommand();
  
  try {
    if (selectedSubcommand === 'announce') {
      await handleAnnounce(commandInteraction);
    } else if (selectedSubcommand === 'say') {
      await handleSay(commandInteraction);
    } else if (selectedSubcommand === 'reset') {
      await handleResetSignups(commandInteraction);
    } else if (selectedSubcommand === 'unpunish') {
      await handleUnpunishUser(commandInteraction);
    } else if (selectedSubcommand === 'force-pair') {
      await handleForceManualPairing(commandInteraction);
    }
  } catch (adminCommandError) {
    console.error(`Error in /coffee admin ${selectedSubcommand}:`, adminCommandError);
    await commandInteraction.reply({
      content: '❌ An error occurred while executing the admin command.'
    });
  }
}

async function handleAnnounce(commandInteraction) {
  await commandInteraction.reply({
    content: `📢 Sending signup announcement...`,
    ephemeral: true
  });
  
  await postSignupAnnouncement(commandInteraction.client);
  
  console.log(`Admin ${commandInteraction.user.id} manually triggered signup announcement`);
}

async function handleSay(commandInteraction) {
  const customMessage = commandInteraction.options.getString('message');
  const announcementsChannel = await commandInteraction.client.channels.fetch(discord.channels.announcements);
  
  await announcementsChannel.send(customMessage);
  
  await commandInteraction.reply({
    content: `✅ Message posted to <#${discord.channels.announcements}>`,
    ephemeral: true
  });
  
  console.log(`Admin ${commandInteraction.user.id} posted custom message: ${customMessage}`);
}

async function handleResetSignups(commandInteraction) {
  await clearAllSignups();
  
  await commandInteraction.reply({
    content: `🔄 **All signups cleared** by <@${commandInteraction.user.id}>\n\nThe current week's signups have been reset.`
  });
  
  console.log(`Admin ${commandInteraction.user.id} cleared all signups`);
}

async function handleUnpunishUser(commandInteraction) {
  const selectedUser = commandInteraction.options.getUser('user');
  
  const selectedUserProfile = await getProfile(selectedUser.id);
  if (!selectedUserProfile || !selectedUserProfile.penalty_expires_at) {
    return await commandInteraction.reply({
      content: `❌ <@${selectedUser.id}> does not have an active penalty.`
    });
  }
  
  await removePenalty(selectedUser.id);
  
  await commandInteraction.reply({
    content: `✅ **Penalty removed** by <@${commandInteraction.user.id}>\n\n<@${selectedUser.id}>'s penalty has been cleared. They can now sign up for coffee chats.`
  });
  
  console.log(`Admin ${commandInteraction.user.id} removed penalty from ${selectedUser.id}`);
}

async function handleForceManualPairing(commandInteraction) {
  const firstUser = commandInteraction.options.getUser('user1');
  const secondUser = commandInteraction.options.getUser('user2');
  const optionalThirdUser = commandInteraction.options.getUser('user3');
  const assignedVoiceChannelNumber = commandInteraction.options.getInteger('vc') || 1;
  
  const userIsPairingWithThemselves = firstUser.id === secondUser.id || 
    (optionalThirdUser && (firstUser.id === optionalThirdUser.id || secondUser.id === optionalThirdUser.id));
  
  if (userIsPairingWithThemselves) {
    return await commandInteraction.reply({
      content: '❌ You cannot pair a user with themselves. Please select different users.'
    });
  }
  
  await createManualPairing(firstUser.id, secondUser.id, optionalThirdUser?.id || null, assignedVoiceChannelNumber);
  
  const allUsersInPairing = [firstUser, secondUser];
  if (optionalThirdUser) allUsersInPairing.push(optionalThirdUser);
  
  const userMentions = allUsersInPairing.map(user => `<@${user.id}>`).join(' + ');
  const trioLabel = optionalThirdUser ? ' (Trio)' : '';
  
  await commandInteraction.reply({
    content: `☕ **Manual pairing created** by <@${commandInteraction.user.id}>${trioLabel}\n\n👥 ${userMentions}\n🎤 Coffee Chat VC ${assignedVoiceChannelNumber}`
  });
  
  console.log(`Admin ${commandInteraction.user.id} created manual pairing: ${userMentions}`);
}


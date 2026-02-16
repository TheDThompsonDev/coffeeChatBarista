import { Client, GatewayIntentBits, REST, Routes, Collection, EmbedBuilder } from 'discord.js';
import { discord } from './config.js';
import { initializeJobs } from './scheduler/jobs.js';
import { deleteGuildData } from './services/database.js';
import { upsertGuildSettings, deleteGuildSettings } from './services/guildSettings.js';
import { initializeVoiceTracking } from './services/voiceTracking.js';

import * as joinCommand from './commands/join.js';
import * as leaveCommand from './commands/leave.js';
import * as statusCommand from './commands/status.js';
import * as reportCommand from './commands/report.js';
import * as adminCommand from './commands/admin.js';
import * as leaderboardCommand from './commands/leaderboard.js';
import * as setupCommand from './commands/setup.js';
import * as completeCommand from './commands/complete.js';
import * as helpCommand from './commands/help.js';

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

discordClient.commands = new Collection();

function buildCoffeeCommandWithAllSubcommands() {
  const coffeeSlashCommand = joinCommand.data;
  
  coffeeSlashCommand.addSubcommand(leaveCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(statusCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(completeCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(reportCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(leaderboardCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(helpCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(setupCommand.data.options[0]);
  coffeeSlashCommand.addSubcommandGroup(adminCommand.data.options[0]);
  
  return coffeeSlashCommand;
}

async function registerSlashCommandsGlobally() {
  const allSlashCommands = [buildCoffeeCommandWithAllSubcommands()];
  
  const discordRestApi = new REST({ version: '10' }).setToken(discord.token);
  
  try {
    console.log('Started refreshing global application (/) commands.');
    
    await discordRestApi.put(
      Routes.applicationCommands(discord.clientId),
      { body: allSlashCommands.map(command => command.toJSON()) }
    );
    
    console.log('Successfully reloaded global application (/) commands.');
  } catch (commandRegistrationError) {
    console.error('Error registering commands:', commandRegistrationError);
  }
}

discordClient.on('interactionCreate', async (receivedInteraction) => {
  if (!receivedInteraction.isChatInputCommand()) return;
  
  if (receivedInteraction.commandName !== 'coffee') return;
  
  const selectedSubcommandGroup = receivedInteraction.options.getSubcommandGroup(false);
  const selectedSubcommand = receivedInteraction.options.getSubcommand();
  
  try {
    if (selectedSubcommandGroup === 'admin') {
      await adminCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'join') {
      await joinCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'leave') {
      await leaveCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'status') {
      await statusCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'report') {
      await reportCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'complete') {
      await completeCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'leaderboard') {
      await leaderboardCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'help') {
      await helpCommand.execute(receivedInteraction);
    } else if (selectedSubcommand === 'setup') {
      await setupCommand.execute(receivedInteraction);
    }
  } catch (commandExecutionError) {
    console.error('Error executing command:', commandExecutionError);
    
    const genericErrorMessage = {
      content: '❌ An error occurred while executing this command.'
    };
    
    if (receivedInteraction.replied || receivedInteraction.deferred) {
      await receivedInteraction.followUp(genericErrorMessage);
    } else {
      await receivedInteraction.reply(genericErrorMessage);
    }
  }
});

discordClient.on('guildCreate', async (newGuild) => {
  console.log(`✨ Joined new guild: ${newGuild.name} (${newGuild.id})`);
  
  await upsertGuildSettings(newGuild.id, {
    guild_name: newGuild.name
  });
  
  const welcomeEmbed = new EmbedBuilder()
    .setColor('#6F4E37')
    .setTitle('☕ Thanks for adding Coffee Chat Barista!')
    .setDescription(
      'I help your community build connections through random 1-on-1 coffee chats.\n\n' +
      '**Getting Started:**\n' +
      'Run `/coffee setup` to configure me for your server.\n\n' +
      '**What you\'ll need:**\n' +
      '• An announcements channel\n' +
      '• A pairings channel\n' +
      '• A moderator role\n' +
      '• A role to ping for signups\n\n' +
      'Once configured, your members can use `/coffee join` to sign up for weekly coffee chats!'
    )
    .setFooter({ text: 'Let\'s build connections, one coffee chat at a time! ☕' })
    .setTimestamp();
  
  try {
    const systemChannel = newGuild.systemChannel;
    if (systemChannel) {
      await systemChannel.send({ embeds: [welcomeEmbed] });
    } else {
      const textChannels = newGuild.channels.cache.filter(
        channel => channel.type === 0 && channel.permissionsFor(newGuild.members.me)?.has('SendMessages')
      );
      const firstAvailableChannel = textChannels.first();
      if (firstAvailableChannel) {
        await firstAvailableChannel.send({ embeds: [welcomeEmbed] });
      }
    }
  } catch (welcomeError) {
    console.error(`Could not send welcome message in guild ${newGuild.id}:`, welcomeError);
  }
});

discordClient.on('guildDelete', async (removedGuild) => {
  console.log(`👋 Removed from guild: ${removedGuild.name} (${removedGuild.id})`);
  
  try {
    await deleteGuildData(removedGuild.id);
    await deleteGuildSettings(removedGuild.id);
    console.log(`Cleaned up all data for guild ${removedGuild.id}`);
  } catch (cleanupError) {
    console.error(`Error cleaning up guild ${removedGuild.id}:`, cleanupError);
  }
});

discordClient.once('ready', () => {
  console.log(`✅ Logged in as ${discordClient.user.tag}`);
  console.log(`📊 Serving ${discordClient.guilds.cache.size} guild(s)`);
  
  initializeJobs(discordClient);
  initializeVoiceTracking(discordClient);
  
  console.log('🤖 Coffee Chat Barista is ready!');
});

discordClient.on('error', (discordClientError) => {
  console.error('Discord client error:', discordClientError);
});

process.on('unhandledRejection', (unhandledPromiseRejection) => {
  console.error('Unhandled promise rejection:', unhandledPromiseRejection);
});

async function performGracefulShutdown(shutdownSignal) {
  console.log(`\n${shutdownSignal} received. Shutting down gracefully...`);
  
  try {
    discordClient.destroy();
    console.log('Discord client disconnected');
    process.exit(0);
  } catch (shutdownError) {
    console.error('Error during shutdown:', shutdownError);
    process.exit(1);
  }
}

process.on('SIGINT', () => performGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => performGracefulShutdown('SIGTERM'));

async function startBot() {
  try {
    await registerSlashCommandsGlobally();
    await discordClient.login(discord.token);
  } catch (botStartupError) {
    console.error('Failed to start bot:', botStartupError);
    process.exit(1);
  }
}

startBot();


import { Client, GatewayIntentBits, REST, Routes, Collection } from 'discord.js';
import { discord } from './config.js';
import { initializeJobs } from './scheduler/jobs.js';

import * as joinCommand from './commands/join.js';
import * as leaveCommand from './commands/leave.js';
import * as statusCommand from './commands/status.js';
import * as reportCommand from './commands/report.js';
import * as adminCommand from './commands/admin.js';
import * as leaderboardCommand from './commands/leaderboard.js';

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

discordClient.commands = new Collection();

function buildCoffeeCommandWithAllSubcommands() {
  const coffeeSlashCommand = joinCommand.data;
  
  coffeeSlashCommand.addSubcommand(leaveCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(statusCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(reportCommand.data.options[0]);
  coffeeSlashCommand.addSubcommand(leaderboardCommand.data.options[0]);
  coffeeSlashCommand.addSubcommandGroup(adminCommand.data.options[0]);
  
  return coffeeSlashCommand;
}

async function registerSlashCommandsWithDiscord() {
  const allSlashCommands = [buildCoffeeCommandWithAllSubcommands()];
  
  const discordRestApi = new REST({ version: '10' }).setToken(discord.token);
  
  try {
    console.log('Started refreshing application (/) commands.');
    
    await discordRestApi.put(
      Routes.applicationGuildCommands(discord.clientId, discord.guildId),
      { body: allSlashCommands.map(command => command.toJSON()) }
    );
    
    console.log('Successfully reloaded application (/) commands.');
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
    } else if (selectedSubcommand === 'leaderboard') {
      await leaderboardCommand.execute(receivedInteraction);
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

discordClient.once('ready', () => {
  console.log(`✅ Logged in as ${discordClient.user.tag}`);
  console.log(`📊 Serving ${discordClient.guilds.cache.size} guild(s)`);
  
  initializeJobs(discordClient);
  
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
    await registerSlashCommandsWithDiscord();
    await discordClient.login(discord.token);
  } catch (botStartupError) {
    console.error('Failed to start bot:', botStartupError);
    process.exit(1);
  }
}

startBot();


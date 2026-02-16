# Coffee Chat Barista ☕

A Discord bot for facilitating weekly random 1-on-1 coffee chats in developer communities. Works across multiple Discord servers!

## Features

- **Multi-Server Support** - One bot instance serves unlimited Discord servers
- **Easy Setup** - Server admins run `/coffee setup` to configure (no env vars needed per-server)
- Weekly opt-in system with timezone preferences (AMERICAS, EMEA, APAC)
- Smart matching algorithm that avoids repeat pairings from the last 12 weeks
- Automatic trio creation for odd number of signups
- **Completion Tracking** - Auto-detects coffee chats via voice channels + manual `/coffee complete`
- **DM Notifications** - Participants are DM'd their match and reminded if they haven't met
- No-show reporting with admin review before penalties are applied
- Admin commands for moderation (list signups, trigger matching, manage penalties)
- Leaderboard to track top participants by completed chats
- Automated weekly cycle with cron jobs

## Quick Start (Server Owners)

1. **Add the bot to your server** using the install link
2. **Run `/coffee setup`** and select:
   - Announcements channel
   - Pairings channel  
   - Moderator role
   - Role to ping for signups
3. **Done!** Members can now use `/coffee join` to sign up

## Commands

| Command | Description |
|---------|-------------|
| `/coffee setup` | Configure the bot for your server (Admin only) |
| `/coffee join <timezone>` | Sign up for this week's coffee chat |
| `/coffee leave` | Withdraw from signups |
| `/coffee status` | Check your signup status and current match |
| `/coffee complete` | Log your coffee chat as done (manual fallback) |
| `/coffee leaderboard` | See top coffee chat participants |
| `/coffee help` | See how the bot works and all commands |
| `/coffee report @user` | Report a no-show partner (goes to admin review) |
| `/coffee admin announce` | Manually send signup announcement |
| `/coffee admin say <message>` | Post a custom message from the bot |
| `/coffee admin reset` | Clear all signups |
| `/coffee admin list` | View current week's signups |
| `/coffee admin match [force:true]` | Manually trigger matching (force required if completions/reports already exist) |
| `/coffee admin schedule [day] [start_hour] [end_hour]` | View or update your server's weekly schedule |
| `/coffee admin punish @user` | Apply a no-show penalty after reviewing a report |
| `/coffee admin dismiss-report <report_id>` | Dismiss a pending no-show report |
| `/coffee admin unpunish @user` | Remove a user's penalty |
| `/coffee admin force-pair` | Manually create a pairing |
| `/coffee admin add-signup @user <timezone>` | Add someone to the signup pool |

## Hosting Setup (Bot Operators)

### Environment Variables

Only 4 environment variables needed:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
TZ=America/Chicago
# Optional launch-week override cutoff (after this, schedule reverts to Monday)
COFFEE_LAUNCH_OVERRIDE_UNTIL=2026-02-20T00:00:00-06:00
```

### Database Setup

1. Create a Supabase project
2. Run `database-migration.sql` in the SQL Editor
3. (Optional, test data only) Run `database-clean-slate.sql` to wipe all existing bot data before launch
4. Deploy the bot to Railway, Render, or any Node.js host

### Installation

```bash
npm install
npm start
```

## Weekly Schedule (Central Time)

Each server has its own schedule:

- **Signup announcement + signup window open** at configured `day + start_hour`
- **Matching runs** at configured `day + end_hour`
- **Reminder DMs** run 2 days after signup day at **10:00 AM CT**
- **Weekly reset** runs Sunday **11:59 PM CT** globally

Use `/coffee admin schedule` to view the current schedule, or set `day`, `start_hour`, and/or `end_hour` to change it for holidays and special weeks.

> **Defaults:** New servers still use the default schedule in `src/config.js` until changed with `/coffee admin schedule`.

## Architecture

- **Multi-tenant**: All server-specific settings stored in `guild_settings` table
- **Global commands**: Slash commands registered globally (work in any server)
- **Per-guild data**: Profiles, signups, pairings, and history are isolated per server


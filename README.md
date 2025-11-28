# Coffee Chat Barista

A Discord bot for facilitating weekly random 1-on-1 coffee chats in the "Commit Your Code" developer community.

## Features

- Weekly opt-in system with timezone preferences (AMERICAS, EMEA, APAC)
- Smart matching algorithm that avoids repeat pairings from the last 12 weeks
- Automatic trio creation for odd number of signups
- No-show penalty system (2-week ban)
- Admin commands for moderation
- Automated weekly cycle with cron jobs

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

3. Configure your environment variables (see `.env.example` for required values)

4. Run the database indexes from the plan (section 6) in your Supabase SQL editor

5. Start the bot:
```bash
npm start
```

## Commands

- `/coffee join <timezone>` - Sign up for this week's coffee chat
- `/coffee leave` - Withdraw from this week's signups
- `/coffee status` - Check your signup status, current match, and penalty status
- `/coffee report @user` - Report a no-show partner (applies 2-week penalty)
- `/coffee admin reset` - Clear all signups (moderators only)
- `/coffee admin unpunish @user` - Remove a user's penalty (moderators only)
- `/coffee admin force-pair @user1 @user2 [@user3]` - Manually create a pairing (moderators only)

## Weekly Schedule (Central Time)

- **Monday 8:00 AM**: Signup announcement posted
- **Monday 8:00 AM - 12:00 PM**: Signup window open
- **Monday 12:00 PM**: Signups close, matching runs, pairings announced
- **Sunday 11:59 PM**: Weekly reset (clears signups and pairings)

## Architecture

See `coffee-chat-barista-bot.plan.md` for detailed architecture and implementation notes.


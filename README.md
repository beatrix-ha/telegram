# Beatrix Telegram Bot

A Telegram bot that connects to a Beatrix instance via WebSocket and allows users to interact with Beatrix through Telegram.

## Setup (Docker Compose)

1. Create a Telegram bot using [@BotFather](https://t.me/botfather) and get your API token

2. Create a `docker-compose.yml` file with the following content:

```yaml
services:
  beatrix-telegram:
    image: ghcr.io/beatrix-ha/telegram:latest
    restart: unless-stopped
    environment:
      - TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      - TELEGRAM_USER_WHITELIST=user1,user2
      - BEATRIX_URL=https://your-beatrix-instance
```

## Setup (development)

1. Create a Telegram bot using [@BotFather](https://t.me/botfather) and get your API token
2. Copy `.env.example` to `.env` and fill in your configuration:
   ```
   cp .env.example .env
   ```
3. Edit the `.env` file to include:
   - Your Telegram bot token
   - The WebSocket URL of your Beatrix instance
   - LLM model and driver configuration
   - Conversation timeout settings (default is 5 minutes)

## Running the Bot (development)

To start the bot with Bun:

```bash
bun run dev
```

For debugging:

```bash
bun run dev:debug
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather (required)
- `TELEGRAM_USER_WHITELIST`: Comma-separated list of user names allowed to use the bot. (required)
- `BEATRIX_URL`: Base URL for your Beatrix server (required)
- `CONVERSATION_TIMEOUT_MS`: Duration in milliseconds before starting a new conversation (default: 300000, or 5 minutes)

## How It Works

1. The bot connects to the Beatrix WebSocket server on startup
2. When a user sends a message to the bot, it:
   - Determines if it's part of an existing conversation or a new one
   - Forwards the message to Beatrix via handlePromptRequest
   - Streams the response back to the user on Telegram
3. Conversations are maintained for each user and expire after inactivity

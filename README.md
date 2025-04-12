# Beatrix Telegram Bot

A Telegram bot that connects to a Beatrix instance via WebSocket and allows users to interact with Beatrix through Telegram.

## Features

- Connects to a Beatrix instance using WebSocket
- Processes messages through Beatrix's LLM capabilities
- Maintains conversation context for each user
- Automatically creates new conversations after inactivity
- Handles message length limits for Telegram

## Setup

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

## Running the Bot

To start the bot with Bun:

```bash
bun run dev
```

For debugging:

```bash
bun run dev:debug
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather
- `TELEGRAM_USER_WHITELIST`: Comma-separated list of user IDs allowed to use the bot
- `LLM_DRIVER`: The LLM driver to use (default: anthropic)
- `BEATRIX_WS_URL`: WebSocket URL for the Beatrix server
- `CONVERSATION_TIMEOUT_MS`: Duration in milliseconds before starting a new conversation (default: 300000, or 5 minutes)

### Webhook Configuration (Production Mode)

For production deployment, you can configure the bot to use webhooks instead of long polling:

- `WEBHOOK_DOMAIN`: Public domain for the webhook (e.g., example.com)
- `WEBHOOK_PORT`: Port to listen on (e.g., 8443)
- `WEBHOOK_PATH` (optional): Custom path for the webhook endpoint
- `WEBHOOK_SECRET_TOKEN` (optional): Secret token for webhook security validation

If both `WEBHOOK_DOMAIN` and `WEBHOOK_PORT` are provided, the bot will run in webhook mode. Otherwise, it will use long polling.

## How It Works

1. The bot connects to the Beatrix WebSocket server on startup
2. When a user sends a message to the bot, it:
   - Determines if it's part of an existing conversation or a new one
   - Forwards the message to Beatrix via handlePromptRequest
   - Streams the response back to the user on Telegram
3. Conversations are maintained for each user and expire after inactivity

## Docker Deployment

You can also deploy the bot using Docker:

### Building the Docker Image

```bash
docker build -t beatrix-telegram-bot .
```

The Dockerfile uses the official Bun image (`oven/bun:latest`) for optimal performance with TypeScript.

### Running with Docker

For production with webhooks:

```bash
docker run -d --name beatrix-telegram \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_USER_WHITELIST=user1,user2 \
  -e BEATRIX_WS_URL=wss://your-beatrix-instance.com \
  -e WEBHOOK_DOMAIN=your-domain.com \
  -e WEBHOOK_PORT=8443 \
  -e WEBHOOK_SECRET_TOKEN=your_secret_token \
  -p 8443:8443 \
  beatrix-telegram-bot
```

For development/testing with long polling:

```bash
docker run -d --name beatrix-telegram \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_USER_WHITELIST=user1,user2 \
  -e BEATRIX_WS_URL=wss://your-beatrix-instance.com \
  beatrix-telegram-bot
```

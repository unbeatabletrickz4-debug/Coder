# Vercel Telegram Email Bot (Webhook)

A Telegram bot hosted on Vercel using a webhook + inline keyboard menu.

## Features
- Menu UI (Generate / Inbox stub / Settings / Help)
- Generates random email addresses for allowed domains (configurable)

## Setup

### 1) Create bot
Use @BotFather to get your `BOT_TOKEN`.

### 2) Deploy to Vercel
- Import this repo into Vercel
- Add env vars:
  - BOT_TOKEN=123:ABC...
  - BOT_SECRET=some-random-string (recommended)
  - ALLOWED_DOMAINS=yourdomain.com,example.com

### 3) Set Telegram webhook
After deploy, you will have:
https://YOUR-APP.vercel.app/api/telegram?secret=YOUR_BOT_SECRET

Set webhook:
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://YOUR-APP.vercel.app/api/telegram?secret=YOUR_BOT_SECRET"

### 4) Open bot
Send /start

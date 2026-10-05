# 🪙 Gold TradingView & Telegram Alert Terminal (XAU/USD)

An interactive full-stack **Spot Gold (XAU/USD)** trading terminal with real-time TradingView charting, continuous market price monitoring, and automated **Telegram Bot price alerts**.

---

## 🚀 Quick Start

### 1. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` (optional, can also be configured directly from the Web UI):
```env
PORT=3333
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_telegram_chat_id
PRICE_CHECK_INTERVAL_SECONDS=5
```

### 2. Start the Application
```bash
npm run start:dev
```
Or build and start in production:
```bash
npm run build
npm run start:prod
```

### 3. Open the Web Dashboard
Visit **[http://localhost:3333](http://localhost:3333)** in your browser.

---

## 🤖 Telegram Bot Setup & Commands

### How to Get Your Telegram Bot Token:
1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow the instructions to name your bot and choose a username (e.g. `MyGoldAlertBot`).
3. Copy the API Token and paste it in `.env` or in the **Web Dashboard > Telegram Bot** settings modal.

### Available Telegram Commands:
- `/start` - Welcome message, displays your personal Chat ID, and opens quick action buttons.
- `/price` or `/gold` - Instant live Gold market price card with 24h change, high/low, and spread.
- `/alert <above|below> <price> [note]` - Create a specific price target alert.
  - *Example:* `/alert above 2750 Resistance target`
  - *Example:* `/alert below 2680 Key support`
- `/set <price> [note]` - Quick smart alert (auto-detects above/below based on current spot price).
  - *Example:* `/set 2740 Breakout`
- `/alerts` or `/list` - View all active alerts with interactive inline buttons to delete them.
- `/clear` - Remove all triggered or paused alerts.
- `/chart` - Get the link to your local interactive TradingView web terminal.
- `/help` - Command guide and syntax examples.

---

## ✨ Features

- **TradingView Real-Time Chart Widget**: Full interactive candlestick charting with multi-timeframe switching (1m, 5m, 15m, 1h, 4h, 1D), volume, RSI, and moving averages.
- **24/7 Spot Gold Price Feed**: High-availability multi-feed price aggregator with automatic fallback.
- **Real-Time Threshold Alert Engine**: Evaluates active targets every 2.5 seconds and immediately dispatches alerts to Telegram when crossed.
- **Audio Chimes & Toast Notifications**: Built-in Web Audio API synthesizer chimes when targets are hit on the web dashboard.
- **Persistent Storage**: Alerts and bot configuration are safely saved in `data/` JSON storage.
- **In-Browser Bot Configuration**: Test notifications and update bot tokens dynamically without restarting the server.

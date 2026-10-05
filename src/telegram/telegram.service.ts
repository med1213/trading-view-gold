import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { StorageService } from '../storage/storage.service.js';
import { GoldService } from '../gold/gold.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { Alert } from '../alerts/alert.interface.js';

export interface BotConfig {
  botToken?: string;
  defaultChatId?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private botInfo: any = null;
  private isConnected = false;
  private botConfig: BotConfig = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly goldService: GoldService,
    private readonly alertsService: AlertsService,
  ) {}

  async onModuleInit() {
    this.loadConfig();
    this.alertsService.onTrigger((alert, price) =>
      this.sendAlertNotification(alert, price),
    );
    await this.initBot();
  }

  async onModuleDestroy() {
    if (this.bot) {
      try {
        this.bot.stop('SIGTERM');
      } catch (e) {
        // ignore
      }
    }
  }

  private loadConfig() {
    const saved = this.storageService.readJson<BotConfig>('bot-config.json', {});
    const envToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const envChatId = this.configService.get<string>('TELEGRAM_CHAT_ID');

    this.botConfig = {
      botToken: saved.botToken || envToken || '',
      defaultChatId: saved.defaultChatId || envChatId || '',
    };
  }

  async updateBotConfig(token: string, chatId?: string) {
    this.botConfig.botToken = token.trim();
    if (chatId !== undefined) {
      this.botConfig.defaultChatId = chatId.trim();
    }
    this.storageService.writeJson('bot-config.json', this.botConfig);
    await this.initBot();
    return this.getBotStatus();
  }

  async initBot() {
    if (this.bot) {
      try {
        this.bot.stop('REINIT');
      } catch (e) {
        // ignore
      }
      this.bot = null;
      this.isConnected = false;
      this.botInfo = null;
    }

    const token = this.botConfig.botToken;
    if (!token) {
      this.logger.warn(
        'Telegram Bot Token not configured. You can set it in .env or via Web Dashboard Settings.',
      );
      return;
    }

    try {
      this.bot = new Telegraf(token);
      this.registerHandlers();

      this.botInfo = await this.bot.telegram.getMe();
      this.bot.launch().catch((err) => {
        this.logger.error(`Telegram bot polling error: ${err.message}`);
      });
      this.isConnected = true;
      this.logger.log(`Telegram Bot @${this.botInfo.username} connected successfully!`);
    } catch (err: any) {
      this.isConnected = false;
      this.logger.error(`Failed to initialize Telegram Bot: ${err.message}`);
    }
  }

  getBotStatus() {
    return {
      connected: this.isConnected,
      username: this.botInfo?.username || null,
      firstName: this.botInfo?.first_name || null,
      configuredToken: Boolean(this.botConfig.botToken),
      tokenMasked: this.botConfig.botToken
        ? `${this.botConfig.botToken.slice(0, 6)}...${this.botConfig.botToken.slice(-4)}`
        : null,
      defaultChatId: this.botConfig.defaultChatId || null,
    };
  }

  private registerHandlers() {
    if (!this.bot) return;

    // /start command
    this.bot.command('start', async (ctx) => {
      const chatId = ctx.chat.id;
      const userName = ctx.from?.first_name || 'Trader';
      const welcome = `
🌟 <b>Welcome to Gold TradingView Alert Bot, ${userName}!</b> 🌟

Your Chat ID is: <code>${chatId}</code>

I track <b>Spot Gold (XAU/USD)</b> in real-time and alert you the second your price targets are reached!

<b>Available Commands:</b>
🪙 <code>/price</code> or <code>/gold</code> - View live Gold market price & stats
🔔 <code>/alert &lt;above|below&gt; &lt;price&gt; [note]</code> - Set specific alert
⚡ <code>/set &lt;price&gt; [note]</code> - Quick smart alert
📋 <code>/alerts</code> - View all your active alerts
🗑️ <code>/clear</code> - Clear triggered alerts
🌐 <code>/chart</code> - View live Web Dashboard link
❓ <code>/help</code> - Full guide & examples
`;
      await ctx.replyWithHTML(
        welcome,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('🪙 Check Gold Price', 'action_price'),
            Markup.button.callback('📋 My Alerts', 'action_alerts'),
          ],
          [
            Markup.button.callback('⚡ Quick Alert +$10', 'action_quick_up'),
            Markup.button.callback('⚡ Quick Alert -$10', 'action_quick_down'),
          ],
        ]),
      );
    });

    // /help command
    this.bot.command('help', async (ctx) => {
      const helpText = `
📖 <b>Gold Alert Bot Guide</b>

<b>1. Checking Prices:</b>
• <code>/price</code> or <code>/gold</code> - Instant live market price, 24h high/low, and 24h percentage change.

<b>2. Creating Price Alerts:</b>
• <code>/alert above 2750 Resistance Breakout</code>
• <code>/alert below 2680 Key Support Level</code>
• <code>/set 2760</code> (Auto-detects above/below based on current price)

<b>3. Managing Alerts:</b>
• <code>/alerts</code> or <code>/list</code> - View your active alerts with interactive delete buttons.
• <code>/delete &lt;alert-id&gt;</code> - Delete a specific alert.
• <code>/clear</code> - Remove all triggered/inactive alerts.

<b>4. Web Dashboard:</b>
• <code>/chart</code> - Get the URL for the interactive TradingView web terminal.
`;
      await ctx.replyWithHTML(helpText);
    });

    // /price or /gold or /lak
    const handlePrice = async (ctx: any) => {
      const data = this.goldService.getCurrentPrice();
      const changeSign = data.change24h >= 0 ? '+' : '';
      const changeEmoji = data.change24h >= 0 ? '🟢' : '🔴';
      const arrow = data.change24h >= 0 ? '▲' : '▼';
      const lak = data.lak;

      const lakSection = lak
        ? `\n🇱🇦 <b>LAO KIP (LAK):</b>\n` +
          `• <b>Per 1 Ounce (oz):</b> <code>${lak.pricePerOunce.toLocaleString()} ₭</code>\n` +
          `• <b>Per 1 Baht Weight (15.24g):</b> <code>${lak.pricePerBaht.toLocaleString()} ₭</code>\n` +
          `• <b>Per 1 Gram (24K):</b> <code>${lak.pricePerGram.toLocaleString()} ₭</code>\n` +
          `• <i>Rate: ~${lak.usdLakRate.toLocaleString()} LAK / USD</i>\n`
        : '';

      const text = `
🪙 <b>GOLD SPOT (XAU/USD & LAK)</b>

💵 <b>USD Price:</b> <code>$${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>
${changeEmoji} <b>24h Change:</b> ${arrow} ${changeSign}$${data.change24h.toFixed(2)} (${changeSign}${data.change24hPercent.toFixed(2)}%)
📈 <b>24h High / Low:</b> $${data.high24h.toFixed(2)} / $${data.low24h.toFixed(2)}
⚖️ <b>Bid / Ask:</b> $${data.bid?.toFixed(2) ?? '-'} / $${data.ask?.toFixed(2) ?? '-'}
${lakSection}
⏱️ <b>Updated:</b> ${new Date(data.timestamp).toLocaleTimeString()}
`;
      await ctx.replyWithHTML(
        text,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Refresh', 'action_price'),
            Markup.button.callback('📋 My Alerts', 'action_alerts'),
          ],
          [Markup.button.callback('➕ Create Alert Here', 'action_prompt_alert')],
        ]),
      );
    };

    this.bot.command(['price', 'gold', 'lak', 'kip'], handlePrice);

    // /alert command
    this.bot.command('alert', async (ctx) => {
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/).slice(1);

      if (parts.length < 2) {
        return ctx.replyWithHTML(
          '⚠️ <b>Usage:</b> <code>/alert &lt;above|below&gt; &lt;price&gt; [optional note]</code>\n' +
            '<b>Example:</b> <code>/alert above 2750 Breakout target</code>',
        );
      }

      const conditionRaw = parts[0].toUpperCase();
      if (conditionRaw !== 'ABOVE' && conditionRaw !== 'BELOW') {
        return ctx.replyWithHTML('⚠️ Condition must be either <code>above</code> or <code>below</code>.');
      }

      const price = parseFloat(parts[1].replace('$', '').replace(',', ''));
      if (isNaN(price) || price <= 0) {
        return ctx.replyWithHTML('⚠️ Invalid price value. Example: <code>/alert above 2750</code>');
      }

      const note = parts.slice(2).join(' ') || undefined;
      const chatId = ctx.chat.id;

      const alert = this.alertsService.createAlert({
        symbol: 'XAU/USD',
        condition: conditionRaw as 'ABOVE' | 'BELOW',
        targetPrice: price,
        note,
        chatId,
      });

      const current = this.goldService.getCurrentPrice();
      const diff = price - current.price;
      const diffStr = diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
      const rate = current.lak?.usdLakRate || 22570;
      const targetLakBaht = Math.round((price * rate) * (15.244 / 31.1034768));
      const targetLakOz = Math.round(price * rate);

      await ctx.replyWithHTML(
        `✅ <b>Alert Created Successfully!</b>\n\n` +
          `🔔 <b>Condition:</b> Gold ${conditionRaw} <b>$${price.toFixed(2)}</b>\n` +
          `🇱🇦 <b>Target in LAK:</b>\n` +
          `   • <b>${targetLakBaht.toLocaleString()} ₭ / Baht</b>\n` +
          `   • <b>${targetLakOz.toLocaleString()} ₭ / oz</b>\n` +
          `💰 <b>Current Price:</b> $${current.price.toFixed(2)} (Distance: ${diffStr})\n` +
          (note ? `📝 <b>Note:</b> ${note}\n` : '') +
          `🆔 <code>${alert.id}</code>\n\n` +
          `<i>You will receive a notification as soon as the target is hit!</i>`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📋 View All Alerts', 'action_alerts')],
        ]),
      );
    });

    // /set command
    this.bot.command('set', async (ctx) => {
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/).slice(1);

      if (parts.length < 1) {
        return ctx.replyWithHTML(
          '⚠️ <b>Usage:</b> <code>/set &lt;price&gt; [optional note]</code>\n<b>Example:</b> <code>/set 2750 Target 1</code>',
        );
      }

      const price = parseFloat(parts[0].replace('$', '').replace(',', ''));
      if (isNaN(price) || price <= 0) {
        return ctx.replyWithHTML('⚠️ Invalid target price.');
      }

      const current = this.goldService.getCurrentPrice();
      const condition: 'ABOVE' | 'BELOW' = price >= current.price ? 'ABOVE' : 'BELOW';
      const note = parts.slice(1).join(' ') || undefined;
      const chatId = ctx.chat.id;

      const alert = this.alertsService.createAlert({
        symbol: 'XAU/USD',
        condition,
        targetPrice: price,
        note,
        chatId,
      });

      const rate = current.lak?.usdLakRate || 22570;
      const targetLakBaht = Math.round((price * rate) * (15.244 / 31.1034768));
      const targetLakOz = Math.round(price * rate);

      await ctx.replyWithHTML(
        `✅ <b>Smart Alert Created!</b>\n\n` +
          `🔔 Condition: <b>${condition} $${price.toFixed(2)}</b>\n` +
          `🇱🇦 <b>Target in LAK:</b>\n` +
          `   • <b>${targetLakBaht.toLocaleString()} ₭ / Baht</b>\n` +
          `   • <b>${targetLakOz.toLocaleString()} ₭ / oz</b>\n` +
          `💰 Current Gold: $${current.price.toFixed(2)}\n` +
          (note ? `📝 Note: ${note}\n` : '') +
          `🆔 <code>${alert.id}</code>`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📋 View All Alerts', 'action_alerts')],
        ]),
      );
    });

    // /alerts or /list
    const handleListAlerts = async (ctx: any) => {
      const chatId = ctx.chat.id;
      const alerts = this.alertsService.getAlertsForChat(chatId);
      const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
      const current = this.goldService.getCurrentPrice();
      const rate = current.lak?.usdLakRate || 22570;
      const lakBaht = current.lak?.pricePerBaht.toLocaleString() || '-';
      const lakOz = current.lak?.pricePerOunce.toLocaleString() || '-';

      if (activeAlerts.length === 0) {
        return ctx.replyWithHTML(
          `📋 <b>Your Active Alerts:</b> None\n\n` +
            `💰 <b>Current Gold:</b> $${current.price.toFixed(2)}\n` +
            `🇱🇦 <b>Lao Kip:</b> ${lakBaht} ₭ / Baht (${lakOz} ₭ / oz)\n\n` +
            `Use <code>/alert below 4150</code> or <code>/set 4100</code> to create your alert!`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback('⚡ Alert +$10', 'action_quick_up'),
              Markup.button.callback('⚡ Alert -$10', 'action_quick_down'),
            ],
          ]),
        );
      }

      let text = `📋 <b>Your Active Gold Alerts (${activeAlerts.length}):</b>\n\n`;
      text += `💰 <b>Current Gold:</b> $${current.price.toFixed(2)}\n`;
      text += `🇱🇦 <b>LAK Spot:</b> <code>${lakBaht} ₭ / Baht</code> (<code>${lakOz} ₭ / oz</code>)\n\n`;

      const keyboardButtons: any[] = [];

      activeAlerts.forEach((a, index) => {
        const diff = a.targetPrice - current.price;
        const diffStr = diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
        const diffLak = Math.round(diff * rate * (15.244 / 31.1034768));
        const diffLakStr = diffLak >= 0 ? `+${diffLak.toLocaleString()} ₭` : `-${Math.abs(diffLak).toLocaleString()} ₭`;
        const targetLakBaht = Math.round((a.targetPrice * rate) * (15.244 / 31.1034768));
        const conditionIcon = a.condition === 'ABOVE' ? '📈' : '📉';

        text += `<b>${index + 1}. ${conditionIcon} ${a.condition} $${a.targetPrice.toFixed(2)}</b>\n`;
        text += `   🇱🇦 <b>Target:</b> <code>${targetLakBaht.toLocaleString()} ₭ / Baht</code>\n`;
        text += `   📊 <b>Distance:</b> ${diffStr} (${diffLakStr} / Baht)\n`;
        if (a.note) text += `   📝 <i>${a.note}</i>\n`;
        text += `   🆔 <code>${a.id}</code>\n\n`;

        keyboardButtons.push([
          Markup.button.callback(
            `🗑️ Delete #${index + 1} (${a.condition} $${a.targetPrice})`,
            `del_${a.id}`,
          ),
        ]);
      });

      keyboardButtons.push([
        Markup.button.callback('🔄 Refresh', 'action_alerts'),
        Markup.button.callback('🪙 Gold Price (LAK)', 'action_price'),
      ]);

      await ctx.replyWithHTML(text, Markup.inlineKeyboard(keyboardButtons));
    };

    this.bot.command(['alerts', 'list'], handleListAlerts);

    // /clear
    this.bot.command('clear', async (ctx) => {
      const chatId = ctx.chat.id;
      const count = this.alertsService.clearTriggeredForChat(chatId);
      await ctx.replyWithHTML(`🧹 Cleared <b>${count}</b> inactive / triggered alerts.`);
    });

    // /chart
    this.bot.command('chart', async (ctx) => {
      const port = process.env.PORT || 3000;
      await ctx.replyWithHTML(
        `📊 <b>Interactive Gold TradingView Terminal</b>\n\n` +
          `Open the web terminal in your browser:\n` +
          `👉 http://localhost:${port}\n\n` +
          `• Real-time TradingView Candlestick & Indicator chart\n` +
          `• Live multi-timeframe analysis\n` +
          `• Instant 1-click alert setup`,
      );
    });

    // Callback queries
    this.bot.action('action_price', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
      await handlePrice(ctx);
    });

    this.bot.action('action_alerts', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
      await handleListAlerts(ctx);
    });

    this.bot.action('action_quick_up', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
      const current = this.goldService.getCurrentPrice();
      const target = Math.round((current.price + 10) * 10) / 10;
      this.alertsService.createAlert({
        symbol: 'XAU/USD',
        condition: 'ABOVE',
        targetPrice: target,
        note: 'Quick +$10 alert',
        chatId: ctx.chat?.id,
      });
      await ctx.replyWithHTML(
        `✅ Quick Alert created: <b>ABOVE $${target.toFixed(2)}</b> (Current: $${current.price.toFixed(2)})`,
      );
    });

    this.bot.action('action_quick_down', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
      const current = this.goldService.getCurrentPrice();
      const target = Math.round((current.price - 10) * 10) / 10;
      this.alertsService.createAlert({
        symbol: 'XAU/USD',
        condition: 'BELOW',
        targetPrice: target,
        note: 'Quick -$10 alert',
        chatId: ctx.chat?.id,
      });
      await ctx.replyWithHTML(
        `✅ Quick Alert created: <b>BELOW $${target.toFixed(2)}</b> (Current: $${current.price.toFixed(2)})`,
      );
    });

    this.bot.action('action_prompt_alert', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
      const current = this.goldService.getCurrentPrice();
      await ctx.replyWithHTML(
        `💡 <b>To create an alert, send:</b>\n` +
          `<code>/alert above ${(current.price + 10).toFixed(0)}</code>\n` +
          `or\n` +
          `<code>/alert below ${(current.price - 10).toFixed(0)}</code>`,
      );
    });

    this.bot.action(/del_(.+)/, async (ctx) => {
      const alertId = ctx.match[1];
      try {
        await ctx.answerCbQuery('Alert deleted');
      } catch (e) {}
      this.alertsService.deleteAlert(alertId);
      await ctx.replyWithHTML(`🗑️ Alert <code>${alertId}</code> deleted.`);
    });
  }

  async sendAlertNotification(alert: Alert, currentPrice: number) {
    if (!this.bot || !this.isConnected) {
      this.logger.warn(
        `Alert ${alert.id} triggered, but Telegram bot is not connected or token not configured.`,
      );
      return false;
    }

    const targetChatId = alert.chatId || this.botConfig.defaultChatId;
    if (!targetChatId) {
      this.logger.warn(`No target chatId for alert ${alert.id}`);
      return false;
    }

    const conditionIcon = alert.condition === 'ABOVE' ? '🚀' : '🔻';
    const data = this.goldService.getCurrentPrice();
    const rate = data.lak?.usdLakRate || 22570;
    const estLakPrice = Math.round(currentPrice * rate);
    const estLakBaht = Math.round((currentPrice * rate) * (15.244 / 31.1034768));

    const message = `
🚨 ${conditionIcon} <b>GOLD PRICE ALERT TRIGGERED!</b> ${conditionIcon} 🚨

🪙 <b>Asset:</b> <code>XAU/USD (Gold Spot)</code>
📊 <b>Condition Hit:</b> Price is <b>${alert.condition} $${alert.targetPrice.toFixed(2)}</b>
💰 <b>Triggered Price:</b> <code>$${currentPrice.toFixed(2)}</code>
🇱🇦 <b>Lao Kip Value:</b> <code>${estLakPrice.toLocaleString()} ₭ / oz</code>
⚖️ <b>Est. LAK / Baht:</b> <code>${estLakBaht.toLocaleString()} ₭</code>
🎯 <b>Target Level:</b> <code>$${alert.targetPrice.toFixed(2)}</code>
${alert.note ? `📝 <b>Note:</b> ${alert.note}\n` : ''}
⏱️ <b>Time:</b> ${new Date().toLocaleString()}

<a href="http://localhost:${process.env.PORT || 3333}">👉 Open Gold TradingView Chart</a>
`;

    try {
      await this.bot.telegram.sendMessage(targetChatId, message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🪙 Current Price', 'action_price'),
            Markup.button.callback('📋 View Alerts', 'action_alerts'),
          ],
        ]),
      });
      this.logger.log(`Alert notification sent to chat ${targetChatId}`);
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to send telegram alert to chat ${targetChatId}: ${err.message}`,
      );
      return false;
    }
  }

  async sendTestMessage(chatId?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.bot || !this.isConnected) {
      return { success: false, error: 'Telegram Bot is not connected or token is missing.' };
    }

    const target = chatId || this.botConfig.defaultChatId;
    if (!target) {
      return {
        success: false,
        error: 'No Chat ID provided. Provide a Chat ID or configure default chat ID.',
      };
    }

    const current = this.goldService.getCurrentPrice();
    const testMsg = `
🔔 <b>Test Notification from Gold TradingView System!</b>

✅ Telegram Bot integration is working properly!
🪙 Current Gold Spot: <b>$${current.price.toFixed(2)}</b>
⏱️ Server Time: ${new Date().toLocaleString()}
`;

    try {
      await this.bot.telegram.sendMessage(target, testMsg, { parse_mode: 'HTML' });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

import { Controller, Get, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';

@Controller('api')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('bot/status')
  getStatus() {
    return this.telegramService.getBotStatus();
  }

  @Post('bot/configure')
  configure(@Body() body: { token: string; chatId?: string }) {
    return this.telegramService.updateBotConfig(body.token, body.chatId);
  }

  @Post('bot/test')
  testBot(@Body('chatId') chatId?: string) {
    return this.telegramService.sendTestMessage(chatId);
  }

  // Backwards-compatible aliases
  @Post('bot/test-telegram')
  testTelegramBot(@Body('chatId') chatId?: string) {
    return this.telegramService.sendTestMessage(chatId);
  }

  @Post('alerts/test-telegram')
  testAlertsTelegram(@Body('chatId') chatId?: string) {
    return this.telegramService.sendTestMessage(chatId);
  }
}

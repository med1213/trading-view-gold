import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import { TelegramController } from './telegram.controller.js';
import { StorageModule } from '../storage/storage.module.js';
import { GoldModule } from '../gold/gold.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';

@Module({
  imports: [StorageModule, GoldModule, AlertsModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}

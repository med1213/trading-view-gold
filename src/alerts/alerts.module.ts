import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';
import { StorageModule } from '../storage/storage.module.js';
import { GoldModule } from '../gold/gold.module.js';

@Module({
  imports: [StorageModule, GoldModule],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}

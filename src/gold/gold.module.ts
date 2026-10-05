import { Module } from '@nestjs/common';
import { GoldService } from './gold.service.js';
import { GoldController } from './gold.controller.js';

@Module({
  providers: [GoldService],
  controllers: [GoldController],
  exports: [GoldService],
})
export class GoldModule {}

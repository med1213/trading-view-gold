import { Controller, Get } from '@nestjs/common';
import { GoldService } from './gold.service.js';

@Controller('api/gold')
export class GoldController {
  constructor(private readonly goldService: GoldService) {}

  @Get('price')
  getPrice() {
    return this.goldService.getCurrentPrice();
  }

  @Get('history')
  getHistory() {
    return {
      history: this.goldService.getPriceHistory(),
      current: this.goldService.getCurrentPrice(),
    };
  }
}

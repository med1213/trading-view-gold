import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { CreateAlertDto } from './alert.interface.js';

@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  getAlerts(@Query('status') status?: string) {
    return this.alertsService.getAlerts(status);
  }

  @Get('logs')
  getLogs() {
    return this.alertsService.getTriggerLogs();
  }

  @Post()
  createAlert(@Body() dto: CreateAlertDto) {
    return this.alertsService.createAlert(dto);
  }

  @Patch(':id/toggle')
  toggleAlert(@Param('id') id: string) {
    return this.alertsService.toggleAlert(id);
  }

  @Delete(':id')
  deleteAlert(@Param('id') id: string) {
    return { success: this.alertsService.deleteAlert(id) };
  }
}

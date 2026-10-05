import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';
import { GoldService } from '../gold/gold.service.js';
import { Alert, CreateAlertDto } from './alert.interface.js';

export type AlertTriggerCallback = (
  alert: Alert,
  currentPrice: number,
) => Promise<boolean | void> | boolean | void;

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private alerts: Alert[] = [];
  private readonly alertsFile = 'alerts.json';
  private triggerCallbacks: AlertTriggerCallback[] = [];
  private recentTriggerLogs: Array<{
    alert: Alert;
    price: number;
    time: string;
  }> = [];

  constructor(
    private readonly storageService: StorageService,
    private readonly goldService: GoldService,
  ) {}

  onModuleInit() {
    this.loadAlerts();
    // Check alerts every 2.5 seconds
    setInterval(() => {
      this.evaluateAlerts();
    }, 2500);
  }

  onTrigger(cb: AlertTriggerCallback) {
    this.triggerCallbacks.push(cb);
  }

  private loadAlerts() {
    this.alerts = this.storageService.readJson<Alert[]>(this.alertsFile, []);
    this.logger.log(`Loaded ${this.alerts.length} alerts from storage.`);
  }

  private saveAlerts() {
    this.storageService.writeJson(this.alertsFile, this.alerts);
  }

  getAlerts(filterStatus?: string): Alert[] {
    if (filterStatus) {
      return this.alerts.filter((a) => a.status === filterStatus);
    }
    return this.alerts;
  }

  getAlertsForChat(chatId: string | number): Alert[] {
    return this.alerts.filter(
      (a) => !a.chatId || String(a.chatId) === String(chatId),
    );
  }

  getTriggerLogs() {
    return this.recentTriggerLogs;
  }

  createAlert(dto: CreateAlertDto): Alert {
    const newAlert: Alert = {
      id: Math.random().toString(36).substring(2, 9),
      symbol: dto.symbol || 'XAU/USD',
      condition: dto.condition,
      targetPrice: parseFloat(Number(dto.targetPrice).toFixed(2)),
      note: dto.note?.trim() || undefined,
      chatId: dto.chatId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    this.alerts.unshift(newAlert);
    this.saveAlerts();
    this.logger.log(
      `Created Alert ${newAlert.id}: ${newAlert.condition} $${newAlert.targetPrice}`,
    );

    setTimeout(() => this.evaluateAlerts(), 500);

    return newAlert;
  }

  toggleAlert(id: string): Alert | null {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return null;

    if (alert.status === 'ACTIVE') {
      alert.status = 'DISABLED';
    } else {
      alert.status = 'ACTIVE';
      alert.triggeredAt = undefined;
      alert.triggeredPrice = undefined;
    }
    this.saveAlerts();
    return alert;
  }

  deleteAlert(id: string): boolean {
    const initialLen = this.alerts.length;
    this.alerts = this.alerts.filter((a) => a.id !== id);
    if (this.alerts.length !== initialLen) {
      this.saveAlerts();
      this.logger.log(`Deleted Alert ${id}`);
      return true;
    }
    return false;
  }

  clearTriggeredForChat(chatId?: string | number): number {
    const beforeCount = this.alerts.length;
    this.alerts = this.alerts.filter((a) => {
      if (a.status === 'TRIGGERED' || a.status === 'DISABLED') {
        if (!chatId || String(a.chatId) === String(chatId)) {
          return false;
        }
      }
      return true;
    });
    const removed = beforeCount - this.alerts.length;
    if (removed > 0) {
      this.saveAlerts();
    }
    return removed;
  }

  private async evaluateAlerts() {
    const currentPriceData = this.goldService.getCurrentPrice();
    if (!currentPriceData || !currentPriceData.price) return;

    const currentPrice = currentPriceData.price;
    const activeAlerts = this.alerts.filter((a) => a.status === 'ACTIVE');

    for (const alert of activeAlerts) {
      let triggered = false;

      if (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) {
        triggered = true;
      } else if (
        alert.condition === 'BELOW' &&
        currentPrice <= alert.targetPrice
      ) {
        triggered = true;
      }

      if (triggered) {
        alert.status = 'TRIGGERED';
        alert.triggeredAt = new Date().toISOString();
        alert.triggeredPrice = currentPrice;

        this.logger.warn(
          `🔔 ALERT TRIGGERED: ${alert.id} (${alert.condition} $${alert.targetPrice}) at price $${currentPrice}`,
        );

        this.recentTriggerLogs.unshift({
          alert: { ...alert },
          price: currentPrice,
          time: alert.triggeredAt,
        });
        if (this.recentTriggerLogs.length > 50) {
          this.recentTriggerLogs.pop();
        }

        this.saveAlerts();

        // Dispatch callbacks
        for (const cb of this.triggerCallbacks) {
          try {
            await cb(alert, currentPrice);
          } catch (err: any) {
            this.logger.error(`Error in alert trigger callback: ${err.message}`);
          }
        }
      }
    }
  }
}

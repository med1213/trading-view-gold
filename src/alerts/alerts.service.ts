import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';
import { GoldService } from '../gold/gold.service.js';
import { Alert, CreateAlertDto, AutoTrackerConfig } from './alert.interface.js';

export type AlertTriggerCallback = (
  alert: Alert,
  currentPrice: number,
) => Promise<boolean | void> | boolean | void;

export type TrackerTriggerCallback = (
  diff: number,
  currentPrice: number,
  baselinePrice: number,
  chatId?: string | number,
) => Promise<boolean | void> | boolean | void;

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private alerts: Alert[] = [];
  private readonly alertsFile = 'alerts.json';
  private readonly trackerFile = 'autotracker.json';
  private triggerCallbacks: AlertTriggerCallback[] = [];
  private trackerCallbacks: TrackerTriggerCallback[] = [];
  private lastTriggerTimes: Map<string, number> = new Map();
  private autoTracker: AutoTrackerConfig = {
    enabled: false,
    stepAmount: 5,
    lastBaselinePrice: 0,
  };
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
    this.loadTracker();
    // Check alerts every 2.5 seconds
    setInterval(() => {
      this.evaluateAlerts();
      this.evaluateAutoTracker();
    }, 2500);
  }

  onTrigger(cb: AlertTriggerCallback) {
    this.triggerCallbacks.push(cb);
  }

  onTrackerMove(cb: TrackerTriggerCallback) {
    this.trackerCallbacks.push(cb);
  }

  private loadAlerts() {
    this.alerts = this.storageService.readJson<Alert[]>(this.alertsFile, []);
    this.logger.log(`Loaded ${this.alerts.length} alerts from storage.`);
  }

  private loadTracker() {
    this.autoTracker = this.storageService.readJson<AutoTrackerConfig>(
      this.trackerFile,
      {
        enabled: false,
        stepAmount: 5,
        lastBaselinePrice: 0,
      },
    );
  }

  private saveAlerts() {
    this.storageService.writeJson(this.alertsFile, this.alerts);
  }

  private saveTracker() {
    this.storageService.writeJson(this.trackerFile, this.autoTracker);
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

  getAutoTracker(): AutoTrackerConfig {
    return this.autoTracker;
  }

  setAutoTracker(stepAmount: number, enabled = true, chatId?: string | number) {
    const currentPrice = this.goldService.getCurrentPrice().price;
    this.autoTracker = {
      enabled,
      stepAmount: Math.max(0.5, stepAmount),
      lastBaselinePrice: currentPrice || this.autoTracker.lastBaselinePrice || 4160,
      chatId: chatId || this.autoTracker.chatId,
    };
    this.saveTracker();
    this.logger.log(
      `Auto Tracker ${enabled ? 'ENABLED' : 'DISABLED'} with step $${stepAmount} (Baseline: $${this.autoTracker.lastBaselinePrice})`,
    );
    return this.autoTracker;
  }

  createAlert(dto: CreateAlertDto): Alert {
    const currentPrice = this.goldService.getCurrentPrice().price;
    const newAlert: Alert = {
      id: Math.random().toString(36).substring(2, 9),
      symbol: dto.symbol || 'XAU/USD',
      condition: dto.condition,
      targetPrice: parseFloat(Number(dto.targetPrice).toFixed(2)),
      note: dto.note?.trim() || undefined,
      chatId: dto.chatId,
      isRecurring: dto.isRecurring !== undefined ? dto.isRecurring : true, // Default to recurring so it alerts every time!
      triggerCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastArmedPrice: currentPrice,
    };

    this.alerts.unshift(newAlert);
    this.saveAlerts();
    this.logger.log(
      `Created Alert ${newAlert.id}: ${newAlert.condition} $${newAlert.targetPrice} (Recurring: ${newAlert.isRecurring})`,
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
    const now = Date.now();
    const activeAlerts = this.alerts.filter((a) => a.status === 'ACTIVE');

    for (const alert of activeAlerts) {
      let conditionMet = false;

      if (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) {
        conditionMet = true;
      } else if (
        alert.condition === 'BELOW' &&
        currentPrice <= alert.targetPrice
      ) {
        conditionMet = true;
      }

      if (conditionMet) {
        // Check cooldown to avoid rapid spamming (60s minimum between repeat alerts for same target)
        const lastTriggered = this.lastTriggerTimes.get(alert.id) || 0;
        const cooldownPassed = now - lastTriggered > 60000;

        if (cooldownPassed || !lastTriggered) {
          this.lastTriggerTimes.set(alert.id, now);
          alert.triggerCount = (alert.triggerCount || 0) + 1;
          alert.triggeredAt = new Date().toISOString();
          alert.triggeredPrice = currentPrice;

          // If not recurring, mark TRIGGERED. If recurring, keep ACTIVE so it alerts every time!
          if (!alert.isRecurring) {
            alert.status = 'TRIGGERED';
          }

          this.logger.warn(
            `🔔 ALERT TRIGGERED: ${alert.id} (${alert.condition} $${alert.targetPrice}) at price $${currentPrice} (Count: ${alert.triggerCount})`,
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

          // Dispatch callbacks to Telegram
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

  private async evaluateAutoTracker() {
    if (!this.autoTracker || !this.autoTracker.enabled) return;

    const currentPrice = this.goldService.getCurrentPrice().price;
    if (!currentPrice) return;

    if (!this.autoTracker.lastBaselinePrice) {
      this.autoTracker.lastBaselinePrice = currentPrice;
      this.saveTracker();
      return;
    }

    const baseline = this.autoTracker.lastBaselinePrice;
    const diff = currentPrice - baseline;
    const step = this.autoTracker.stepAmount || 5;

    if (Math.abs(diff) >= step) {
      const oldBaseline = baseline;
      this.autoTracker.lastBaselinePrice = currentPrice;
      this.saveTracker();

      this.logger.log(
        `⚡ AUTO-TRACKER TRIGGERED: Movement ${diff >= 0 ? '+' : ''}$${diff.toFixed(2)} from $${oldBaseline.toFixed(2)} to $${currentPrice.toFixed(2)}`,
      );

      for (const cb of this.trackerCallbacks) {
        try {
          await cb(diff, currentPrice, oldBaseline, this.autoTracker.chatId);
        } catch (err: any) {
          this.logger.error(`Error in tracker callback: ${err.message}`);
        }
      }
    }
  }
}

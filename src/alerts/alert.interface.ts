export type AlertCondition = 'ABOVE' | 'BELOW';
export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'DISABLED';

export interface Alert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  targetPrice: number;
  note?: string;
  chatId?: string | number;
  status: AlertStatus;
  isRecurring?: boolean; // Repeat every time condition is met (with cooldown)
  triggerCount?: number;
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
  lastArmedPrice?: number; // Price when armed
}

export interface AutoTrackerConfig {
  enabled: boolean;
  stepAmount: number; // e.g. 5 means alert every $5 change
  lastBaselinePrice: number;
  chatId?: string | number;
}

export class CreateAlertDto {
  symbol?: string;
  condition!: AlertCondition;
  targetPrice!: number;
  note?: string;
  chatId?: string | number;
  isRecurring?: boolean;
}

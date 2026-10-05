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
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
}

export class CreateAlertDto {
  symbol?: string;
  condition!: AlertCondition;
  targetPrice!: number;
  note?: string;
  chatId?: string | number;
}

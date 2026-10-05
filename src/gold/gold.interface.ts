export interface LakGoldPrice {
  pricePerOunce: number;
  pricePerBaht: number; // 1 Baht weight of gold (~15.244g / Thai & Lao standard)
  pricePerGram: number; // 1 Gram 24K gold
  usdLakRate: number; // USD to LAK exchange rate
}

export interface GoldPriceData {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  change24h: number;
  change24hPercent: number;
  high24h: number;
  low24h: number;
  openPrice24h: number;
  timestamp: number;
  source: string;
  lak?: LakGoldPrice;
}

export interface PriceTick {
  time: number;
  price: number;
  priceLak?: number;
}

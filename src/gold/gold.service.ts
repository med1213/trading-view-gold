import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoldPriceData, PriceTick, LakGoldPrice } from './gold.interface.js';

@Injectable()
export class GoldService implements OnModuleInit {
  private readonly logger = new Logger(GoldService.name);
  private currentPriceData: GoldPriceData | null = null;
  private priceHistory: PriceTick[] = [];
  private readonly maxHistoryLength = 300;
  private currentUsdLakRate = 22570; // fallback base exchange rate
  private lastGoldApiCall = 0;
  private readonly goldApiMinInterval = 30000; // call GoldAPI every 30s to preserve API quota

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing Gold Price Service with LAK Kip Conversion...');
    await this.fetchGoldPrice();
    // Poll every 5 seconds
    setInterval(() => {
      this.fetchGoldPrice().catch((err) =>
        this.logger.error(`Error polling gold price: ${err.message}`),
      );
    }, 5000);
  }

  getCurrentPrice(): GoldPriceData {
    if (!this.currentPriceData) {
      const lak = this.calculateLakPrice(4160.0);
      return {
        symbol: 'XAU/USD',
        price: 4160.0,
        bid: 4159.5,
        ask: 4160.5,
        change24h: 17.5,
        change24hPercent: 0.42,
        high24h: 4167.0,
        low24h: 4138.0,
        openPrice24h: 4142.5,
        timestamp: Date.now(),
        source: 'Initial Baseline',
        lak,
      };
    }
    return this.currentPriceData;
  }

  getPriceHistory(): PriceTick[] {
    return this.priceHistory;
  }

  private calculateLakPrice(priceUsd: number, directLakOz?: number): LakGoldPrice {
    const usdLakRate = directLakOz && priceUsd > 0
      ? directLakOz / priceUsd
      : this.currentUsdLakRate;

    this.currentUsdLakRate = usdLakRate;

    const pricePerOunce = directLakOz || priceUsd * usdLakRate;
    // 1 Troy Ounce = 31.1034768 grams
    // 1 Baht Gold weight (Standard in Laos & Thailand) = 15.244 grams
    const pricePerGram = pricePerOunce / 31.1034768;
    const pricePerBaht = pricePerGram * 15.244;

    return {
      pricePerOunce: Math.round(pricePerOunce),
      pricePerBaht: Math.round(pricePerBaht),
      pricePerGram: Math.round(pricePerGram),
      usdLakRate: parseFloat(usdLakRate.toFixed(2)),
    };
  }

  async fetchGoldPrice(): Promise<GoldPriceData> {
    const apiKey =
      this.configService.get<string>('GOLD_API_KEY') ||
      process.env.GOLD_API_KEY ||
      '';

    let data: GoldPriceData | null = null;

    // Periodically fetch from GoldAPI to get official LAK conversion
    const now = Date.now();
    if (apiKey && now - this.lastGoldApiCall > this.goldApiMinInterval) {
      data = await this.fetchFromGoldApi(apiKey);
      if (data) {
        this.lastGoldApiCall = now;
      }
    }

    // High frequency feed from Binance PAXG if GoldAPI was skipped or failed
    if (!data) {
      data = await this.fetchFromBinancePaxg();
    }

    // Fallback to Yahoo Finance
    if (!data) {
      data = await this.fetchFromYahooFinance();
    }

    // Fallback to cache
    if (!data && this.currentPriceData) {
      data = { ...this.currentPriceData, timestamp: Date.now() };
    }

    if (!data) {
      const price = 4160.0;
      data = {
        symbol: 'XAU/USD',
        price,
        bid: 4159.5,
        ask: 4160.5,
        change24h: 17.5,
        change24hPercent: 0.42,
        high24h: 4167.0,
        low24h: 4138.0,
        openPrice24h: 4142.5,
        timestamp: Date.now(),
        source: 'Simulated Feed',
        lak: this.calculateLakPrice(price),
      };
    } else if (!data.lak) {
      data.lak = this.calculateLakPrice(data.price);
    }

    this.currentPriceData = data;
    this.priceHistory.push({
      time: data.timestamp,
      price: data.price,
      priceLak: data.lak?.pricePerOunce,
    });

    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }

    return data;
  }

  private async fetchFromGoldApi(apiKey: string): Promise<GoldPriceData | null> {
    try {
      // Fetch XAU/LAK for direct Kip pricing
      const [resUsd, resLak] = await Promise.allSettled([
        axios.get('https://www.goldapi.io/api/price/XAU/USD', {
          headers: { 'x-access-token': apiKey },
          timeout: 4500,
        }),
        axios.get('https://www.goldapi.io/api/price/XAU/LAK', {
          headers: { 'x-access-token': apiKey },
          timeout: 4500,
        }),
      ]);

      if (resUsd.status === 'fulfilled' && resUsd.value.data?.price) {
        const usdData = resUsd.value.data;
        const price = usdData.price;
        let lakPriceOz = 0;

        if (resLak.status === 'fulfilled' && resLak.value.data?.price) {
          lakPriceOz = resLak.value.data.price;
        }

        const lak = this.calculateLakPrice(price, lakPriceOz || undefined);

        return {
          symbol: 'XAU/USD',
          price,
          bid: usdData.bid || price,
          ask: usdData.ask || price,
          change24h: usdData.change || 0,
          change24hPercent: usdData.change_percent || 0,
          high24h: usdData.high_price || price,
          low24h: usdData.low_price || price,
          openPrice24h: usdData.open_price || price,
          timestamp: Date.now(),
          source: 'GoldAPI.io Live Spot (LAK/USD)',
          lak,
        };
      }
    } catch (err: any) {
      this.logger.warn(`GoldAPI fetch failed: ${err.message}`);
    }
    return null;
  }

  private async fetchFromBinancePaxg(): Promise<GoldPriceData | null> {
    try {
      const tickerRes = await axios.get(
        'https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT',
        { timeout: 4000 },
      );
      if (tickerRes.data && tickerRes.data.lastPrice) {
        const d = tickerRes.data;
        const price = parseFloat(d.lastPrice);
        const change = parseFloat(d.priceChange);
        const changePercent = parseFloat(d.priceChangePercent);
        const high = parseFloat(d.highPrice);
        const low = parseFloat(d.lowPrice);
        const open = parseFloat(d.openPrice);
        const bid = parseFloat(d.bidPrice || d.lastPrice);
        const ask = parseFloat(d.askPrice || d.lastPrice);

        return {
          symbol: 'XAU/USD (PAXG)',
          price,
          bid,
          ask,
          change24h: change,
          change24hPercent: changePercent,
          high24h: high,
          low24h: low,
          openPrice24h: open,
          timestamp: Date.now(),
          source: 'Binance PAXG Realtime Feed',
          lak: this.calculateLakPrice(price),
        };
      }
    } catch (err: any) {
      // Quietly try next
    }
    return null;
  }

  private async fetchFromYahooFinance(): Promise<GoldPriceData | null> {
    try {
      const res = await axios.get(
        'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d',
        {
          timeout: 4000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        },
      );
      const meta = res.data?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const change = price - prevClose;
        const changePercent = prevClose ? (change / prevClose) * 100 : 0;
        const high = meta.regularMarketDayHigh || price;
        const low = meta.regularMarketDayLow || price;

        return {
          symbol: 'XAU/USD (GC=F)',
          price: parseFloat(price.toFixed(2)),
          change24h: parseFloat(change.toFixed(2)),
          change24hPercent: parseFloat(changePercent.toFixed(2)),
          high24h: parseFloat(high.toFixed(2)),
          low24h: parseFloat(low.toFixed(2)),
          openPrice24h: parseFloat(prevClose.toFixed(2)),
          timestamp: Date.now(),
          source: 'Yahoo Finance Feed',
          lak: this.calculateLakPrice(price),
        };
      }
    } catch (err: any) {
      // Quietly fall back
    }
    return null;
  }
}

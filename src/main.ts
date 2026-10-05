import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3333;
  await app.listen(port);
  Logger.log(`✨ Gold TradingView & Telegram Alert Terminal running at: http://localhost:${port}`);
}
await bootstrap();

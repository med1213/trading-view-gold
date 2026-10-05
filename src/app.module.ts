import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { GoldModule } from './gold/gold.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: path.resolve(process.cwd(), 'public'),
      serveRoot: '/',
    }),
    StorageModule,
    GoldModule,
    AlertsModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

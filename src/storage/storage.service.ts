import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly dataDir = path.resolve(process.cwd(), 'data');

  constructor() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  readJson<T>(filename: string, defaultValue: T): T {
    const filePath = path.join(this.dataDir, filename);
    try {
      if (!fs.existsSync(filePath)) {
        this.writeJson(filename, defaultValue);
        return defaultValue;
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err: any) {
      this.logger.error(`Error reading ${filename}: ${err.message}`);
      return defaultValue;
    }
  }

  writeJson<T>(filename: string, data: T): void {
    const filePath = path.join(this.dataDir, filename);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`Error writing ${filename}: ${err.message}`);
    }
  }
}

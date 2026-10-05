import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';

@Controller()
export class AppController {
  @Get()
  getIndex(@Res() res: Response) {
    return res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'));
  }
}

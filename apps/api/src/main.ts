import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env['NAUGHT_API_PORT'] ?? 3001);
  await app.listen(port);
  new Logger('Naught').log(`Watching from :${port}`);
}

void bootstrap();

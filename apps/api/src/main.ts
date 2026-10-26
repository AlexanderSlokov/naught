import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';
import { useIORedisDriver } from './runs/ioredis-driver.js';
import { LakeService } from './lake/lake.service.js';
import { lakeRefusal } from './lake/lake-version.js';

async function bootstrap(): Promise<void> {
  // Before anything constructs a queue: BullMQ cannot require() its driver in
  // a native ESM process, so it is handed one.
  useIORedisDriver();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Before listening: an API that serves a lake it cannot read correctly is
  // worse than one that is down, because its answers look like answers.
  const refusal = await lakeRefusal(app.get(LakeService).runsDir);
  if (refusal !== null) {
    // `bufferLogs` holds every line until `listen`, which a refusal never
    // reaches; without the flush the API exits 1 and says nothing about why.
    app.flushLogs();
    new Logger('Naught').error(`refusing to serve: ${refusal}`);
    await app.close();
    process.exitCode = 1;
    return;
  }

  // Run progress is pushed, not polled. `ws` rather than socket.io so the
  // browser can use its own WebSocket and the interface gains no dependency.
  app.useWebSocketAdapter(new WsAdapter(app));

  // The interface runs on its own origin and now has one thing to POST. Named
  // explicitly rather than '*': the API is read-only outward, which is a
  // statement about credentials and not a reason to accept any caller.
  app.enableCors({
    origin: process.env['NAUGHT_WEB_ORIGIN'] ?? 'http://localhost:3000',
  });

  const port = Number(process.env['NAUGHT_API_PORT'] ?? 3001);
  await app.listen(port);
  new Logger('Naught').log(`Watching from :${port}`);
}

void bootstrap();

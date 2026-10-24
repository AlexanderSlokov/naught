import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { StandaloneCollectionModule } from './standalone-collection.module.js';
import { FindingsModule } from './findings/findings.module.js';
import { RunsModule } from './runs/runs.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    StandaloneCollectionModule,
    ScheduleModule.forRoot(),
    // Redis holds scheduling state, never truth. Losing it costs at most a
    // collection run that has to be asked for again; the lake is untouched.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
        },
      }),
    }),
    FindingsModule,
    RunsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

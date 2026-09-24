import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LakeModule } from './lake/lake.module.js';
import { CollectorsModule } from './collectors/collectors.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ScheduleModule.forRoot(),
    LakeModule,
    CollectorsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

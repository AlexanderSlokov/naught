import { Global, Module } from '@nestjs/common';
import { LakeService } from './lake.service.js';

@Global()
@Module({
  providers: [LakeService],
  exports: [LakeService],
})
export class LakeModule {}

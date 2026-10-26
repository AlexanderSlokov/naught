import { Module } from '@nestjs/common';
import { LakeModule } from '../lake/lake.module.js';
import { FindingsController } from './findings.controller.js';
import { FindingsService } from './findings.service.js';
import { DossierService } from './dossier.service.js';

@Module({
  imports: [LakeModule],
  controllers: [FindingsController],
  providers: [FindingsService, DossierService],
})
export class FindingsModule {}

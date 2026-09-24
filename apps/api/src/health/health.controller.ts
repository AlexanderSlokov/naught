import { Controller, Get } from '@nestjs/common';
import { LakeService } from '../lake/lake.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly lake: LakeService) {}

  /**
   * Reports what Naught can see of itself. Deliberately includes the lake
   * path: an API that is up while the lake is unreadable is not healthy, it
   * is blind, and those are different failures.
   */
  @Get()
  async health(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      dataDir: this.lake.dataDir,
      runs: await this.lake.countRunFiles(),
    };
  }
}

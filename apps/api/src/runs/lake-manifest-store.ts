import { Inject, Injectable } from '@nestjs/common';
import type { Axis, CollectionRun } from '@naught/shared';
import { LakeService } from '../lake/lake.service.js';
import { readManifests } from '../lake/run-manifest.js';
import type { ManifestStore } from './latest-scope.js';

/** `ManifestStore` over the real lake on disk. */
@Injectable()
export class LakeManifestStore implements ManifestStore {
  constructor(@Inject(LakeService) private readonly lake: LakeService) {}

  manifests(axis: Axis): Promise<CollectionRun[]> {
    return readManifests(this.lake.runsDir, axis);
  }
}

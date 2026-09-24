import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
} from '@nestjs/common';
import {
  Axis,
  type AxisAvailability,
  type BlindSpotRow,
  type DeltaView,
  type LatestRun,
  type ProjectRef,
  type SubjectRow,
} from '@naught/shared';
import { FindingsService } from './findings.service.js';

/**
 * The read path over the lake. Every route is a GET and nothing here writes —
 * ARCHITECTURE §2 holds outward, and it holds inward too: the lake is
 * append-only and the only thing that appends is a collector.
 */
@Controller()
export class FindingsController {
  constructor(
    @Inject(FindingsService) private readonly findings: FindingsService,
  ) {}

  @Get('axes')
  axes(): Promise<AxisAvailability[]> {
    return this.findings.axes();
  }

  @Get('axes/:axis/projects')
  projects(@Param('axis') axis: string): Promise<ProjectRef[]> {
    return this.findings.projects(parseAxis(axis));
  }

  /** Null when no collector has run this axis — an answer, not a 404. */
  @Get('axes/:axis/latest')
  latest(@Param('axis') axis: string): Promise<LatestRun | null> {
    return this.findings.latestRun(parseAxis(axis));
  }

  @Get('axes/:axis/subjects')
  subjects(@Param('axis') axis: string): Promise<SubjectRow[]> {
    return this.findings.subjects(parseAxis(axis));
  }

  @Get('axes/:axis/blind-spots')
  blindSpots(@Param('axis') axis: string): Promise<BlindSpotRow[]> {
    return this.findings.blindSpots(parseAxis(axis));
  }

  @Get('axes/:axis/delta')
  delta(@Param('axis') axis: string): Promise<DeltaView> {
    return this.findings.delta(parseAxis(axis));
  }
}

function parseAxis(value: string): Axis {
  const parsed = Axis.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BadRequestException(
    `unknown axis ${JSON.stringify(value)}; expected one of ${Axis.options.join(', ')}`,
  );
}

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
} from '@nestjs/common';
import {
  Axis,
  type AssessmentRow,
  type AxisAvailability,
  type BlindSpotRow,
  type DeltaView,
  type Evidence,
  type LatestRun,
  type ProjectRef,
  type SubjectRow,
} from '@naught/shared';
import { FindingsService } from './findings.service.js';
import { DossierService } from './dossier.service.js';

/**
 * The read path over the lake. Every route is a GET and nothing here writes —
 * ARCHITECTURE §2 holds outward, and it holds inward too: the lake is
 * append-only and the only thing that appends is a collector.
 */
@Controller()
export class FindingsController {
  constructor(
    @Inject(FindingsService) private readonly findings: FindingsService,
    @Inject(DossierService) private readonly dossier: DossierService,
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

  @Get('axes/:axis/assessments')
  assessments(@Param('axis') axis: string): Promise<AssessmentRow[]> {
    return this.dossier.assessments(parseAxis(axis));
  }

  /** `?subject=pkg:npm/lodash@4.17.20`. Required: the whole lake is not a dossier. */
  @Get('axes/:axis/evidence')
  evidence(
    @Param('axis') axis: string,
    @Query('subject') subject: unknown,
  ): Promise<Evidence[]> {
    return this.dossier.evidenceAbout(parseAxis(axis), parseSubject(subject));
  }
}

function parseSubject(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new BadRequestException(
    `subject ${JSON.stringify(value)} is not usable; expected one non-empty ` +
      `?subject= value, e.g. ?subject=pkg:npm/left-pad@1.3.0`,
  );
}

function parseAxis(value: string): Axis {
  const parsed = Axis.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BadRequestException(
    `unknown axis ${JSON.stringify(value)}; expected one of ${Axis.options.join(', ')}`,
  );
}

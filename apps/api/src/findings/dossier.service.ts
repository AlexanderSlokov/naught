// noinspection SqlNoDataSourceInspection,SqlResolve
import { Inject, Injectable } from '@nestjs/common';
import {
  AssessmentRows,
  EvidenceRows,
  type AssessmentRow,
  type Axis,
  type Evidence,
} from '@naught/shared';
import { LakeService } from '../lake/lake.service.js';
import { assessmentsSql } from '../lake/assessment.sql.js';
import { evidenceJsonSql, withEvidence } from '../lake/evidence-views.js';
import { EVIDENCE_COLUMNS } from '../lake/schema.js';

/**
 * The "see" half of Palantir's decision surface (RFC question 1): for one
 * subject, what is believed, on which evidence, at what grade and age.
 *
 * Kept apart from `FindingsService`, whose answers are the version 1 shapes
 * the interface already renders. Everything here is new in schema version 2.
 */
@Injectable()
export class DossierService {
  constructor(@Inject(LakeService) private readonly lake: LakeService) {}

  /**
   * One assessment per subject in the latest run, judged as of `asOf`.
   *
   * @example
   * await dossier.assessments('deps'); // judged as of now
   */
  async assessments(
    axis: Axis,
    asOf: Date = new Date(),
  ): Promise<AssessmentRow[]> {
    if (!(await this.lake.hasFiles(axis))) return [];
    const sql = assessmentsSql(this.lake.globFor(axis), asOf.toISOString());
    return AssessmentRows.parse(await this.jsonRows(sql));
  }

  /**
   * Every evidence row about one subject, across every run, newest first.
   *
   * @example
   * await dossier.evidenceAbout('deps', 'pkg:npm/lodash@4.17.20');
   */
  async evidenceAbout(axis: Axis, subject: string): Promise<Evidence[]> {
    if (!(await this.lake.hasFiles(axis))) return [];
    const sql = `${withEvidence(this.lake.globFor(axis))}
      SELECT ${evidenceJsonSql(EVIDENCE_COLUMNS)} FROM evidence
      WHERE subject = $1
      ORDER BY observedAt DESC, claimType, evidenceId`;
    return EvidenceRows.parse(await this.jsonRows(sql, [subject]));
  }

  /** Runs a query whose single column is one JSON object per row. */
  private async jsonRows(
    sql: string,
    values: string[] = [],
  ): Promise<unknown[]> {
    const db = await this.lake.query();
    const result = await db.runAndReadAll(sql, values);
    return result
      .getRows()
      .map(([json]) => JSON.parse(String(json)) as unknown);
  }
}

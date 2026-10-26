'use client';

import { NonIdealState } from '@blueprintjs/core';
import type { AssessmentRow, Axis, SubjectRow } from '@naught/shared';
import { driftClass } from '@/components/drift';
import { EvidenceList } from '@/components/EvidenceList';
import { Verdict } from '@/components/Verdict';
import { gradeOf, readingOf, utcMinute } from '@/lib/dossier';
import { useSubjectEvidence } from '@/lib/use-subject-evidence';

/**
 * One object as a dossier, in the order an operator needs it: what is
 * believed, how firmly, the object's properties, and then the evidence rows
 * the belief rests on. The conclusion is stated no wider than the evidence
 * allows, and its confidence is a separate line (ICD 203), so neither can be
 * read as the other.
 */
export function SubjectPanel({
  axis,
  subject,
  assessment,
}: {
  axis: Axis;
  subject: SubjectRow | null;
  assessment: AssessmentRow | null;
}): React.ReactElement {
  const evidence = useSubjectEvidence(axis, subject?.subject ?? null);
  if (subject === null) {
    return (
      <NonIdealState
        icon="select"
        title="No subject selected"
        description="Pick a row to see what is believed about it, and on what evidence."
        layout="vertical"
      />
    );
  }
  return (
    <>
      <p className="naught-label">Subject</p>
      <p
        className="naught-mono"
        style={{ overflowWrap: 'anywhere', marginTop: 0 }}
      >
        {subject.subject}
      </p>
      <Assessment assessment={assessment} />
      <Properties subject={subject} assessment={assessment} />
      <EvidenceList state={evidence} />
    </>
  );
}

/**
 * A subject the table lists always has an assessment; its absence means the
 * two requests disagreed about the latest run, and the panel says so rather
 * than inventing a conclusion.
 */
function Assessment({
  assessment,
}: {
  assessment: AssessmentRow | null;
}): React.ReactElement {
  if (assessment === null) {
    return (
      <Verdict tone="attention" says="No assessment for this subject.">
        The subject list and the assessments were read from different runs.
        Reload the page.
      </Verdict>
    );
  }
  const reading = readingOf(assessment);
  return (
    <Verdict tone={reading.tone} says={reading.says}>
      {reading.confidence}
    </Verdict>
  );
}

function Properties({
  subject,
  assessment,
}: {
  subject: SubjectRow;
  assessment: AssessmentRow | null;
}): React.ReactElement {
  return (
    <>
      <p className="naught-label">Properties</p>
      <dl className="naught-props">
        <dt>declared</dt>
        <dd>{subject.declared ?? 'unknown'}</dd>
        <dt>drift</dt>
        <dd className={driftClass(subject.drift)}>
          {subject.drift ?? 'not on the scale'}
        </dd>
        <dt>grade</dt>
        <dd>
          {assessment === null ? 'unknown' : (gradeOf(assessment) ?? 'none')}
        </dd>
        <dt>checked</dt>
        <dd>
          {assessment === null ? 'unknown' : utcMinute(assessment.observedAt)}
        </dd>
        <dt>stale after</dt>
        <dd>
          {assessment?.staleAfter
            ? utcMinute(assessment.staleAfter)
            : 'unknown'}
        </dd>
        <dt>container</dt>
        <dd>{subject.container ?? 'unknown'}</dd>
      </dl>
    </>
  );
}

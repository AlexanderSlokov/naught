/**
 * A conclusion, and the evidence for it, in that order.
 *
 * Every panel in Naught answers a question the operator came with. Putting the
 * answer first is not a style preference: a screen that states its evidence and
 * leaves the reader to reach the conclusion has moved the work rather than done
 * it, and an operator scanning at three in the morning will not do that work.
 *
 * The tone is about what is being asked of the reader, not about how bad things
 * are. `settled` means nothing here needs a decision; `attention` means
 * something does. Danger is deliberately absent — severity belongs to a subject,
 * and subjects carry it in the table.
 *
 * @example
 * <Verdict tone="settled" says="Nothing to act on.">
 *   Unchanged since 11:18:41 UTC.
 * </Verdict>
 */
export function Verdict({
  tone,
  says,
  children,
}: {
  tone: 'settled' | 'attention';
  says: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <p className={`naught-verdict naught-verdict--${tone}`}>{says}</p>
      <p className="naught-evidence">{children}</p>
    </>
  );
}

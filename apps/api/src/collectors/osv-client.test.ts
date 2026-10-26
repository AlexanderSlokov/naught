import { describe, expect, it } from 'vitest';
import { answersFor } from './osv-client.js';

describe('answersFor', () => {
  it('normalises OSV modified timestamps to ISO, and an unreadable one to null', () => {
    const [answer] = answersFor(1, {
      results: [
        {
          vulns: [
            { id: 'GHSA-a', modified: '2024-01-10T05:39:37.183925Z' },
            { id: 'GHSA-b', modified: 'soon' },
          ],
        },
      ],
    });
    expect(answer).toEqual([
      { id: 'GHSA-a', modified: '2024-01-10T05:39:37.183Z' },
      { id: 'GHSA-b', modified: null },
    ]);
  });

  /**
   * Regression. Version 1 read a result missing from a short response as "no
   * advisories" — a clean verdict for a package nobody answered for.
   */
  it('refuses a response with fewer results than queries', () => {
    expect(() => answersFor(3, { results: [{}, {}] })).toThrow(/2 of 3/);
  });
});

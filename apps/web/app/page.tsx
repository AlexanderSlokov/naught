// Blueprint components are stateful and interactive: they use hooks, so they
// render on the client. The data they display is fetched on the server.
'use client';

import { Card, H1, H5, Tag } from '@blueprintjs/core';
import { Axis } from '@naught/shared';

const SHIPPING: ReadonlySet<string> = new Set(['deps', 'image']);

export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <H1>Naught</H1>
      <p className="bp6-text-muted">Everything decays. Naught shows you where.</p>

      <Card style={{ marginTop: 24 }}>
        <H5>Axes</H5>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Axis.options.map((axis) => (
            <Tag
              key={axis}
              minimal={!SHIPPING.has(axis)}
              intent={SHIPPING.has(axis) ? 'primary' : 'none'}
            >
              {axis}
            </Tag>
          ))}
        </div>
        <p className="bp6-text-muted" style={{ marginTop: 16, marginBottom: 0 }}>
          No coverage to report yet — no collector has run.
        </p>
      </Card>
    </main>
  );
}

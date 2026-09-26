import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection } from '@nestjs/websockets';
import type { RunEvent, RunSummary, RunTicket } from '@naught/shared';
import type { WebSocket, WebSocketServer as WsServer } from 'ws';
import type { RunProgressListener } from '../lake/progress-reporting-sink.js';

/** The path the browser opens. Shares the API's port; no second listener. */
export const RUN_STREAM_PATH = '/runs/stream';

/**
 * Fans run events out to every open interface.
 *
 * This is the only place a run is visible while it is in flight. The lake
 * holds sealed runs and nothing else, so a run that is queued, working or
 * failed exists here, in the queue, and in the log — never on disk.
 *
 * The latest event is retained so that a client connecting mid-run is told
 * what is happening instead of waiting in silence for the next tick. It is
 * process-local and lost on restart, which is correct: it is a view of the
 * present, and the present is what a restart interrupts.
 */
@WebSocketGateway({ path: RUN_STREAM_PATH })
export class RunBroadcaster
  implements RunProgressListener, OnGatewayConnection
{
  @WebSocketServer() private readonly server!: WsServer;
  private readonly log = new Logger(RunBroadcaster.name);
  private latest: RunEvent | null = null;

  handleConnection(client: WebSocket): void {
    client.send(JSON.stringify(this.snapshot()));
  }

  /** What is happening right now, for a client that has just arrived. */
  snapshot(): RunEvent {
    return this.latest ?? { type: 'idle' };
  }

  queued(ticket: RunTicket): void {
    this.emit({ type: 'queued', ...ticket });
  }

  started(runId: string, startedAt: Date): void {
    this.emit({ type: 'started', runId, startedAt: startedAt.toISOString() });
  }

  expected(runId: string, expected: number): void {
    this.emit({ type: 'expected', runId, expected });
  }

  progress(runId: string, observed: number, blind: number): void {
    this.emit({ type: 'progress', runId, observed, blind });
  }

  sealed(runId: string, summary: RunSummary, artifacts: string[]): void {
    this.emit({
      type: 'sealed',
      runId,
      finishedAt: new Date().toISOString(),
      summary,
      artifacts,
    });
    this.settle();
  }

  failed(runId: string, reason: string): void {
    this.emit({
      type: 'failed',
      runId,
      finishedAt: new Date().toISOString(),
      reason,
    });
    this.settle();
  }

  /**
   * A settled run stops being the snapshot after a moment, so that a client
   * arriving later is told the truth — nothing is running — rather than shown
   * an outcome it has no way to date.
   */
  private settle(): void {
    setTimeout(() => {
      this.latest = null;
    }, 30_000).unref();
  }

  private emit(event: RunEvent): void {
    this.latest = event;
    const frame = JSON.stringify(event);
    // The gateway has no server until Nest has started listening. A run
    // started from the CLI path would otherwise take the API down with it.
    if (!this.server) return;
    for (const client of this.server.clients) {
      if (client.readyState === client.OPEN) client.send(frame);
    }
  }

  onModuleInit(): void {
    this.log.log(`run events on ${RUN_STREAM_PATH}`);
  }
}

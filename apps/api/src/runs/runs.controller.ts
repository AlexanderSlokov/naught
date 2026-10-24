import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
} from '@nestjs/common';
import { Axis, type RunEvent, type RunTicket } from '@naught/shared';
import {
  CollectionStarter,
  NoCollectorError,
  NoRecordedScopeError,
  RunInFlightError,
} from './collection-starter.js';
import { RunBroadcaster } from './run-broadcaster.js';

/**
 * The one write path in the application, and it writes only to Naught's own
 * queue. A run reads external systems and changes none of them, which is the
 * distinction ADR 0003 draws: read-only outward is a rule about other people's
 * systems, not a ban on an operator acting on this one.
 */
@Controller()
export class RunsController {
  constructor(
    @Inject(CollectionStarter) private readonly starter: CollectionStarter,
    @Inject(RunBroadcaster) private readonly events: RunBroadcaster,
  ) {}

  /**
   * Start a run on one axis, repeating the scope of the last run that recorded
   * one. Answers 409 rather than queueing when a run is already in flight: the
   * operator asked to look again, and one look is already happening.
   */
  @Post('runs')
  async start(@Body() body: unknown): Promise<RunTicket> {
    try {
      const ticket = await this.starter.start(parseAxis(body));
      // Announced here rather than by the worker: a run can sit in the queue,
      // and a second interface connecting in that window must be told a run is
      // coming rather than that nothing is happening.
      this.events.queued(ticket);
      return ticket;
    } catch (err) {
      if (err instanceof RunInFlightError)
        throw new ConflictException(err.message);
      if (err instanceof NoRecordedScopeError)
        throw new ConflictException(err.message);
      if (err instanceof NoCollectorError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }

  /**
   * What is happening right now, for a client that has not opened a socket yet.
   *
   * Two sources, in order. The broadcaster knows the detail — progress, a
   * denominator, why the last run failed — but only for as long as this process
   * has been up. The queue knows less and remembers longer, because Redis is a
   * different container: it survives an API restart, and a worker that was
   * interrupted mid-run still has its job.
   *
   * When neither has anything the answer is `idle`, and that is the truth rather
   * than a gap. A run that sealed is in the lake, where `GET /axes/:axis/latest`
   * reports it with its coverage; the interface has no need to hear about it
   * twice, and the run stream is about the present.
   */
  @Get('runs/current')
  async current(): Promise<RunEvent> {
    const live = this.events.snapshot();
    if (live.type !== 'idle') return live;

    const queued = await this.starter.inFlight();
    return queued === null ? { type: 'idle' } : { type: 'queued', ...queued };
  }
}

/** The axis is the whole request body; anything else is a bad request. */
function parseAxis(body: unknown): Axis {
  const axis = (body as { axis?: unknown } | null)?.axis;
  const parsed = Axis.safeParse(axis);
  if (parsed.success) return parsed.data;
  throw new BadRequestException(
    `expected { "axis": one of ${Axis.options.join(', ')} }, got ` +
      `${JSON.stringify(body)}`,
  );
}

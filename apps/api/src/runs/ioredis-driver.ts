import { RedisConnection, createIORedisClient } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';

/**
 * Tell BullMQ how to open a Redis connection.
 *
 * BullMQ loads `ioredis` with `require`, which does not exist in a native ESM
 * process — and `@naught/api` is `"type": "module"`. Left alone it throws
 * "could not load the optional 'ioredis' package" at worker construction, with
 * ioredis sitting installed in node_modules. `clientFactory` is the documented
 * way out, and a factory rather than one shared client so that the worker's
 * blocking connection is still its own.
 *
 * Idempotent, and called once from `main.ts` before the queue is built.
 *
 * @example
 * useIORedisDriver();
 * const app = await NestFactory.create(AppModule);
 */
export function useIORedisDriver(): void {
  RedisConnection.clientFactory ??= (opts) =>
    createIORedisClient(new Redis(opts as RedisOptions));
}

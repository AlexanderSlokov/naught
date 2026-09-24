import { join } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript sources compiled by the workspace,
  // not a prebuilt bundle. Next has to transpile it like first-party code.
  transpilePackages: ['@naught/shared'],
  // Next writes AGENTS.md and CLAUDE.md into this directory on its own.
  // Whatever Naught has to say to a coding agent will be written on purpose.
  agentRules: false,
  // Trace only the files the server actually reaches and emit a self-contained
  // bundle. Copying a pnpm workspace's node_modules into the image instead
  // ships the whole toolchain — tsx, vitest and tsc included — to production.
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../../'),
};

export default nextConfig;

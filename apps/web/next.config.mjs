/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript sources compiled by the workspace,
  // not a prebuilt bundle. Next has to transpile it like first-party code.
  transpilePackages: ['@naught/shared'],
  // Next writes AGENTS.md and CLAUDE.md into this directory on its own.
  // Whatever Naught has to say to a coding agent will be written on purpose.
  agentRules: false,
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript sources compiled by the workspace,
  // not a prebuilt bundle. Next has to transpile it like first-party code.
  transpilePackages: ['@naught/shared'],
};

export default nextConfig;

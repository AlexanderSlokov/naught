# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @naught/web... --filter @naught/shared

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Next inlines NEXT_PUBLIC_* into the browser bundle at build time; it is not
# read at runtime. Setting it under `environment:` in compose looks correct and
# silently ships whatever the default was, so it arrives here as a build arg.
ARG NEXT_PUBLIC_NAUGHT_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_NAUGHT_API_URL=$NEXT_PUBLIC_NAUGHT_API_URL
RUN pnpm --filter @naught/shared build && pnpm --filter @naught/web build

FROM base AS runtime
ENV NODE_ENV=production
# The standalone bundle carries its own minimal node_modules, traced from
# what the server actually imports. Static assets are not traced and are
# copied alongside it.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]

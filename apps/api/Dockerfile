# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
# Manifests and lockfile only, so a source edit does not re-resolve the tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# --frozen-lockfile: the image is built from the lockfile that was reviewed,
# or it is not built at all.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @naught/api... --filter @naught/shared

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @naught/shared build && pnpm --filter @naught/api build

FROM base AS runtime
ENV NODE_ENV=production
ENV NAUGHT_DATA_DIR=/var/lib/naught
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
# Naught reads. It has no reason to be root, and no reason to own its lake.
RUN install -d -o node -g node /var/lib/naught
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

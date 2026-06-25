# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    git \
    make \
    python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

RUN pnpm exec vp run --filter @t3tools/web --filter t3 build

RUN pnpm deploy --filter t3 --prod --legacy /out \
  && cp -R apps/server/dist /out/dist

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV T3CODE_HOST=0.0.0.0
ENV T3CODE_PORT=3773
ENV T3CODE_NO_BROWSER=1
ENV T3CODE_HOME=/data

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /workspace \
  && chown -R node:node /app /data /workspace

COPY --from=build --chown=node:node /out/ ./

USER node

EXPOSE 3773
VOLUME ["/data", "/workspace"]

CMD ["node", "dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3773", "--base-dir", "/data", "/workspace"]

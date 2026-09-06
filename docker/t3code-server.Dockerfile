# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates=20250419~deb12u1 \
    g++=4:12.2.0-3 \
    git=1:2.39.5-0+deb12u3 \
    make=4.3-4.1 \
    python3=3.11.2-1+b1 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

RUN pnpm exec vp run --filter t3 build

RUN pnpm deploy --filter t3 --prod --legacy /out \
  && cp -R apps/server/dist /out/dist

FROM node:24-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS runtime

ENV NODE_ENV=production
ENV T3CODE_HOST=0.0.0.0
ENV T3CODE_PORT=3773
ENV T3CODE_NO_BROWSER=1
ENV T3CODE_HOME=/data
ENV CODEX_HOME=/data/codex
ENV TMPDIR=/tmp

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates=20250419~deb12u1 \
    git=1:2.39.5-0+deb12u3 \
    openssh-client=1:9.2p1-2+deb12u10 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/codex /workspace \
  && chown -R node:node /data /workspace

COPY --from=build --chown=node:node /out/ ./

ADD --checksum=sha256:d28b4fd4bd9f07ea71083d0cc40c579595cebbd4c10bc8ca98a6d385432e7255 https://registry.npmjs.org/@openai/codex/-/codex-0.147.0.tgz /tmp/codex.tgz
ADD --checksum=sha256:c969740cf8297e4c31905cd551efeb2c99af5080c12c236bdf825598b250139a https://registry.npmjs.org/@openai/codex/-/codex-0.147.0-linux-x64.tgz /tmp/codex-linux-x64.tgz

RUN mkdir -p /opt/codex/node_modules/@openai/codex \
    /opt/codex/node_modules/@openai/codex-linux-x64 \
  && tar -xzf /tmp/codex.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex \
  && tar -xzf /tmp/codex-linux-x64.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex-linux-x64 \
  && ln -s /opt/codex/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex \
  && test "$(codex --version)" = "codex-cli 0.147.0" \
  && rm /tmp/codex.tgz /tmp/codex-linux-x64.tgz

USER node

EXPOSE 3773
VOLUME ["/data", "/workspace"]

CMD ["node", "dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3773", "--base-dir", "/data", "/workspace"]

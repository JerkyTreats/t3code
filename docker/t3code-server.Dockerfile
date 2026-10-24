# syntax=docker/dockerfile:1.7

FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS build

ARG T3CODE_BUILD_COMMIT

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

# Node 26 ships no Corepack. pnpm 12 runs as its checksum-pinned native executable.
ADD --checksum=sha256:1de98ed2e9621113b0887b06322b461efb9df73d913fc1d151039b10b7117a41 https://registry.npmjs.org/@pnpm/exe.linux-x64/-/exe.linux-x64-12.14.0.tgz /tmp/pnpm.tgz

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates=20250419~deb12u1 \
    g++=4:12.2.0-3 \
    git=1:2.39.5-0+deb12u3 \
    make=4.3-4.1 \
    python3=3.11.2-1+b1 \
  && rm -rf /var/lib/apt/lists/* \
  && tar -xzf /tmp/pnpm.tgz --strip-components=1 -C /usr/local/bin package/pnpm \
  && rm /tmp/pnpm.tgz \
  && test "$(pnpm --version)" = "12.14.0"

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

RUN test -n "$T3CODE_BUILD_COMMIT" && pnpm exec vp run --filter t3 build

RUN pnpm deploy --filter t3 --prod --legacy /out \
  && cp -R apps/server/dist /out/dist

FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS runtime

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

ADD --checksum=sha256:3d4b2632edebabe1d8819ed35b1c9272cb24d49e1946b24f0074ad5c98bc36d8 https://registry.npmjs.org/@openai/codex/-/codex-0.159.0.tgz /tmp/codex.tgz
ADD --checksum=sha256:27a80e1904c7337fe65d94f881779ba7700f42a8a87f3d06352b543b0115df98 https://registry.npmjs.org/@openai/codex/-/codex-0.159.0-linux-x64.tgz /tmp/codex-linux-x64.tgz

RUN mkdir -p /opt/codex/node_modules/@openai/codex \
    /opt/codex/node_modules/@openai/codex-linux-x64 \
  && tar -xzf /tmp/codex.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex \
  && tar -xzf /tmp/codex-linux-x64.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex-linux-x64 \
  && ln -s /opt/codex/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex \
  && test "$(codex --version)" = "codex-cli 0.159.0" \
  && rm /tmp/codex.tgz /tmp/codex-linux-x64.tgz

USER node

EXPOSE 3773
VOLUME ["/data", "/workspace"]

CMD ["node", "dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3773", "--base-dir", "/data", "/workspace"]

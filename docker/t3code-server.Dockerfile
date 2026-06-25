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

ARG GCM_VERSION=2.8.0
ARG GCM_SHA256=c7bbf9785c3e8166ceedb66a7e0bfb40e6655ef504af5ca7977b516c5497aff6
ARG KUBECTL_VERSION=v1.33.6

ENV NODE_ENV=production
ENV T3CODE_HOST=0.0.0.0
ENV T3CODE_PORT=3773
ENV T3CODE_NO_BROWSER=1
ENV T3CODE_HOME=/data

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gh \
    git \
    git-lfs \
    libicu72 \
    openssh-client \
    ripgrep \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /workspace \
  && chown -R node:node /app /data /workspace

RUN curl -fsSL \
    "https://github.com/git-ecosystem/git-credential-manager/releases/download/v${GCM_VERSION}/gcm-linux-x64-${GCM_VERSION}.deb" \
    -o /tmp/gcm.deb \
  && echo "${GCM_SHA256}  /tmp/gcm.deb" | sha256sum -c - \
  && dpkg -i /tmp/gcm.deb \
  && rm /tmp/gcm.deb \
  && if [ ! -x /usr/bin/git-credential-manager ]; then \
    ln -s "$(command -v git-credential-manager)" /usr/bin/git-credential-manager; \
  fi \
  && git-credential-manager configure --system

RUN curl -fsSLo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
  && chmod 0755 /usr/local/bin/kubectl \
  && git lfs install --system

RUN npm install -g \
    @openai/codex@0.141.0 \
    @anthropic-ai/claude-code@2.1.183 \
    opencode-ai@1.17.8 \
  && npm cache clean --force

COPY --from=build --chown=node:node /out/ ./

USER node

EXPOSE 3773
VOLUME ["/data", "/workspace"]

CMD ["node", "dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3773", "--base-dir", "/data", "/workspace"]

# syntax=docker/dockerfile:1

# Node.js release installed from the official nodejs.org tarball.
# Kept on the current LTS line and in step with openinc/parse-server-opendash;
# odd-numbered releases (e.g. 25) leave support after ~6 months.
ARG NODE_VERSION=24.21.0

###############################################################################
# Base stage: Red Hat UBI 10 with Node.js installed by hand
###############################################################################
FROM docker.io/redhat/ubi10:latest AS node-base

ARG NODE_VERSION
ARG TARGETARCH

WORKDIR /usr/src/app

# Download the official Node.js binary tarball for the target architecture and
# verify it against the SHASUMS256.txt published for that release before extracting.
# corepack is removed: this project uses npm, pinned by package-lock.json.
RUN set -eux; \
    case "${TARGETARCH:-$(uname -m)}" in \
      amd64|x86_64)  NODE_ARCH=x64   ;; \
      arm64|aarch64) NODE_ARCH=arm64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH:-$(uname -m)}" >&2; exit 1 ;; \
    esac; \
    TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.gz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xzf "${TARBALL}" -C /usr/local --strip-components=1 --no-same-owner \
        --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' --exclude='*/README.md'; \
    rm -f "${TARBALL}" SHASUMS256.txt; \
    rm -rf /usr/local/lib/node_modules/corepack /usr/local/bin/corepack; \
    node --version; \
    npm --version

###############################################################################
# Dependency stage: runtime node_modules only
###############################################################################
FROM node-base AS prod-deps

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc* ./

RUN npm ci --omit=dev && npm cache clean --force

###############################################################################
# Build stage: full dependency tree, compiles TypeScript to dist/
###############################################################################
FROM node-base AS build-stage

COPY package.json package-lock.json .npmrc* ./

# Dev dependencies are required here: the build runs tsc.
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

###############################################################################
# Runtime stage: Red Hat UBI 10 minimal
###############################################################################
FROM docker.io/redhat/ubi10-minimal:latest

# Pull in the latest Red Hat errata for the base packages, then drop package caches.
RUN microdnf -y upgrade --nodocs --setopt=install_weak_deps=0 \
    && microdnf clean all \
    && rm -rf /var/cache/yum /var/cache/dnf /var/lib/dnf

# Unprivileged runtime user (ubi-minimal has no useradd, so write the entries directly).
RUN echo 'node:x:1000:1000:Node.js:/home/node:/sbin/nologin' >> /etc/passwd \
    && echo 'node:x:1000:' >> /etc/group \
    && mkdir -p /home/node \
    && chown 1000:1000 /home/node

# Only the node binary is needed at runtime (npm stays in the build stages).
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build-stage /usr/src/app/dist ./dist

ENV OPENINC_PUSH_PORT=3000
EXPOSE $OPENINC_PUSH_PORT

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
  CMD node -e "const p=process.env.OPENINC_PUSH_PORT||3000;fetch('http://127.0.0.1:'+p+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Ab hier mit unprivilegiertem User
USER node

CMD [ "node", "dist/src/server.js" ]

# --- Build stage ---
FROM node:20-slim AS build

# Puppeteer/Chromium 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    dbus \
    fonts-ipafont-gothic \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# 시스템 Chromium(풀 브라우저)이 빌드 샌드박스에서 크래시할 경우를 대비한
# 폴백 브라우저. dbus/UI 스택이 없는 헤드리스 전용 경량 바이너리다.
RUN env -u PUPPETEER_SKIP_DOWNLOAD -u PUPPETEER_SKIP_CHROMIUM_DOWNLOAD \
    npx puppeteer browsers install chrome-headless-shell

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_R2_WORKER_URL
ARG VITE_R2_PUBLIC_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_R2_WORKER_URL=$VITE_R2_WORKER_URL
ENV VITE_R2_PUBLIC_URL=$VITE_R2_PUBLIC_URL

# 진단: 시스템 Chromium이 이 빌드 환경에서 직접 실행되는지 확인한다.
# 크래시 시 셸이 신호명(Segmentation fault/Killed 등)을 그대로 출력하므로
# SSG 실패 원인 분석에 쓰인다. 빌드 실패로 이어지지는 않는다.
RUN chromium --version && \
    (chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom about:blank >/dev/null \
      && echo "diag: chromium headless OK") || echo "diag: chromium headless FAILED"

# Chromium이 시스템 dbus에 접속하지 못해 죽는 경우를 막기 위해 빌드 전에 dbus를 띄운다.
# SSG_DEBUG=true: 실패 시 Chromium 전체 출력을 빌드 로그에 남긴다(원인 확정 후 제거 가능).
RUN mkdir -p /run/dbus && (dbus-daemon --system --fork || true) && SSG_DEBUG=true npm run build

# --- Serve stage ---
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /app/dist

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

# Chromium이 시스템 dbus에 접속하지 못해 죽는 경우를 막기 위해 빌드 전에 dbus를 띄운다.
# 참고: Railway 빌드 샌드박스에서는 시스템 Chromium이 크래시하므로 ssg.mjs가
# chrome-headless-shell 폴백으로 프리렌더한다.
RUN mkdir -p /run/dbus && (dbus-daemon --system --fork || true) && npm run build

# --- Serve stage ---
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /app/dist

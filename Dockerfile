# syntax=docker/dockerfile:1
# Dev image: runs the Vite dev server. Bluetooth is handled by the host browser.
FROM node:22-alpine
WORKDIR /app
# Install deps before copying sources so code changes don't invalidate this layer.
# The cache mount keeps npm's download cache across builds, so even a
# package.json/lockfile change only fetches the packages that actually changed.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

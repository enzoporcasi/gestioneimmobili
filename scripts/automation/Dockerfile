FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY scripts/automation/worker.mjs ./scripts/automation/worker.mjs
USER node
CMD ["node", "scripts/automation/worker.mjs"]
# Build from the repository root: docker build -f apps/core/Dockerfile .
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod=false \
 && pnpm --filter @nod/core build
USER node
EXPOSE 8080
CMD ["node", "apps/core/dist/index.js"]

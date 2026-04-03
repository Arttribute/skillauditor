FROM node:22-slim

WORKDIR /app

# pnpm deploy resolves all workspace:* deps into a real node_modules.
# cloudbuild.yaml writes this to apps/skillauditor-api/standalone/
COPY standalone/node_modules ./node_modules
COPY standalone/package.json ./package.json

# Compiled TypeScript output (built by tsc in cloudbuild step)
COPY standalone/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]

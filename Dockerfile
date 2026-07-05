# GhostWriter provider — always-on CAP agent.
# Runs the REST API + the CAP WebSocket provider (npm start).
FROM node:20-slim

WORKDIR /app

# Install production deps first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY src ./src
COPY scripts ./scripts

# Railway injects PORT; our server reads process.env.PORT.
ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "src/index.js"]

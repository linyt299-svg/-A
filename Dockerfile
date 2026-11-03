FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

COPY package.json server.js news-engine.js ./
COPY public ./public
COPY data/news.json ./data/news.json
COPY data/snapshots/market-overview.json ./data/snapshots/market-overview.json

EXPOSE 4173
CMD ["node", "server.js"]

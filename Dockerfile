FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

COPY package.json server.js ./
COPY public ./public

EXPOSE 4173
CMD ["node", "server.js"]

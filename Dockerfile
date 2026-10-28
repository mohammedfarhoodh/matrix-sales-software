FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3850

ENV PORT=3850

CMD ["node", "server.js"]

FROM node:20-alpine
RUN apk add --no-cache python3 make g++ sqlite
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 5500
CMD ["node", "server.js"]

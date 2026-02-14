FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]

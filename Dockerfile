FROM node:22-alpine

WORKDIR /app

# 先只拷贝依赖清单，命中缓存层
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV PORT=8787 \
    NODE_ENV=production

EXPOSE 8787

CMD ["npm", "start"]

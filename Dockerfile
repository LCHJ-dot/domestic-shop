# 零依赖 Node 电商站镜像
FROM node:18-alpine

WORKDIR /app

# 仅复制依赖声明（当前零依赖，但保留以便后续扩展）
COPY package.json ./

# 复制全部源码与静态资源
COPY . .

# 运行时由平台注入 PORT；此处给默认 3000
ENV PORT=3000
ENV PAYMENT_MODE=mock

EXPOSE 3000

# 监听 0.0.0.0:PORT（server.listen(PORT) 默认绑定所有网卡）
CMD ["node", "src/server.js"]

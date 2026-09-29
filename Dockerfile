# syntax=docker/dockerfile:1

############################################
# 基础阶段：依赖与源码
############################################
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS base
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

############################################
# 一次性 verify 阶段：测试 + 构建 + 有解/无解冒烟
# Compose 中以该 target 构建的服务跑完即以退出码结束。
############################################
FROM base AS verify
CMD ["sh", "-c", "npm run test && npm run build && npm run smoke"]

############################################
# 构建阶段：类型检查并产出静态站点
############################################
FROM base AS build
RUN npm run build

############################################
# 运行阶段：nginx 提供健康站点，监听端口由 WEB_PORT 配置
############################################
FROM nginx:stable-alpine AS web
ARG WEB_PORT=8080
ENV WEB_PORT=${WEB_PORT}
# 官方 nginx 镜像启动时自动以 envsubst 渲染 /etc/nginx/templates/*.template
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# 对静态资源做 SPA 回退并内置 /healthz（见模板）
EXPOSE ${WEB_PORT}
# shell 形式：由 /bin/sh 展开运行时 ENV WEB_PORT
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${WEB_PORT}/healthz" || exit 1

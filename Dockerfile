# syntax=docker/dockerfile:1

# ---- 依赖安装 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 构建 / 测试阶段（含 devDependencies，可运行 vitest 与冒烟） ----
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ---- 一次性认证服务：代码测试 + 构建 + 有解/无解冒烟，以退出码结束 ----
FROM builder AS verify
WORKDIR /app
CMD ["npm", "run", "verify:all"]

# ---- 静态站点运行阶段 ----
FROM nginx:1.27-alpine AS runner
ENV WEB_PORT=8080
COPY --from=builder /app/dist /usr/share/nginx/html
# 官方 nginx 镜像启动时会 envsubst /etc/nginx/templates 下的模板
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/healthcheck.sh /healthcheck.sh
RUN chmod +x /healthcheck.sh
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD /healthcheck.sh
EXPOSE 8080

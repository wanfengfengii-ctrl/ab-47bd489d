#!/bin/sh
# 容器内健康检查：站点端口可由 WEB_PORT 配置
wget -q -O /dev/null "http://127.0.0.1:${WEB_PORT:-8080}/" || exit 1

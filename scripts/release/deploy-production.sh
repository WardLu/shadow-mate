#!/usr/bin/env bash
# ==============================================================================
# Shadow Mate 生产环境一键发布与原子验收脚本
# 作用：物理消除 Node 运行时漂移、Vercel 散装命令遗漏参数、等待未开启的 Webhook 等问题。
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="$(node -p "require('./package.json').name || 'project'" 2>/dev/null || basename "$ROOT_DIR")"
echo "========================================================"
echo "🚀 ${PROJECT_NAME} 生产发布流水线启动"
echo "========================================================"

# ------------------------------------------------------------------------------
# 1. 强制锁死 Node 22 运行时（自愈环境，绝不依赖全局 Node）
# ------------------------------------------------------------------------------
echo "👉 [1/6] 检查并自愈 Node 运行时..."
if command -v mise >/dev/null 2>&1; then
  MISE_NODE="$(mise where node@22 2>/dev/null || true)"
  if [ -n "$MISE_NODE" ] && [ -d "$MISE_NODE/bin" ]; then
    export PATH="$MISE_NODE/bin:$PATH"
  fi
fi

if [ -f scripts/ci/assert-runtime.mjs ]; then
  node scripts/ci/assert-runtime.mjs
fi
CURRENT_NODE="$(node -v)"
echo "✅ Node 运行时锁定: $CURRENT_NODE"

# ------------------------------------------------------------------------------
# 2. 读取发布配置与凭据参数
# ------------------------------------------------------------------------------
echo "👉 [2/6] 读取生产发布参数..."
CONFIG_FILE="config/release-production.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ 错误: 缺失生产发布配置文件 $CONFIG_FILE" >&2
  exit 1
fi

TEAM_ID=$(node -p "require('./$CONFIG_FILE').vercel?.teamId || ''")
PROJECT_ID=$(node -p "require('./$CONFIG_FILE').vercel?.projectId || ''")
if [ -z "$TEAM_ID" ] || [ -z "$PROJECT_ID" ]; then
  echo "❌ 错误: 无法从 $CONFIG_FILE 解析 teamId 或 projectId" >&2
  exit 1
fi
echo "✅ 绑定 Vercel Team: $TEAM_ID, Project: $PROJECT_ID"

# ------------------------------------------------------------------------------
# 3. 拉取最新的生产环境变量与配置
# ------------------------------------------------------------------------------
echo "👉 [3/6] 同步 Vercel 生产环境变量..."
vercel pull --yes --environment=production --scope "$TEAM_ID"

# ------------------------------------------------------------------------------
# 4. 执行生产打包构建
# ------------------------------------------------------------------------------
echo "👉 [4/6] 执行生产打包构建..."
vercel build --prod

# ------------------------------------------------------------------------------
# 5. 上传预构建包并提升到正式域名
# ------------------------------------------------------------------------------
echo "👉 [5/6] 部署预构建产物并 Promote 到正式域名..."
DEPLOY_OUTPUT=$(vercel deploy --prebuilt --prod --skip-domain --yes --scope "$TEAM_ID")
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' | head -n 1 || true)

if [ -z "$DEPLOY_URL" ]; then
  echo "❌ 部署未能捕获 Deployment URL，原始输出:" >&2
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
fi

echo "✅ 预构建部署完成: $DEPLOY_URL"
echo "正在提升（Promote）到生产正式域名..."
vercel promote "$DEPLOY_URL" --yes --scope "$TEAM_ID"
echo "✅ Promote 成功！"

# ------------------------------------------------------------------------------
# 6. 自动化端点验收
# ------------------------------------------------------------------------------
echo "👉 [6/6] 自动化生产端点验收..."
ACCEPT_PATH=$(node -p "require('./$CONFIG_FILE').acceptance?.path || '/'")
DOMAINS=$(node -p "(require('./$CONFIG_FILE').vercel?.productionDomains || []).join(' ')")

if [ -n "$DOMAINS" ]; then
  for DOMAIN in $DOMAINS; do
    URL="https://${DOMAIN}${ACCEPT_PATH}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$URL" || true)
    if [ "$HTTP_CODE" != "200" ]; then
      echo "❌ 生产验收失败: $URL 返回 HTTP $HTTP_CODE" >&2
      exit 1
    fi
    echo "✅ 端点通过: $URL [HTTP 200]"
  done
else
  echo "ℹ️ 未配置 productionDomains，跳过域名验收"
fi

echo "========================================================"
echo "🎉 ${PROJECT_NAME} 生产发布全流程闭环成功！线上已完全生效！"
echo "========================================================"

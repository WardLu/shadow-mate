#!/usr/bin/env bash
# ==============================================================================
# Shadow Mate 生产环境一键发布与原子验收脚本
# 作用：物理消除 Node 运行时漂移、Vercel 散装命令遗漏参数、等待未开启的 Webhook 等问题。
# 验收（第 6 步）比对本次构建的资源指纹，并在正式域名未生效时自动改绑域名，
# 避免「promote 成功但自定义域名仍指向旧部署」被误报为发布成功。
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
PROJECT_NAME_VERCEL=$(node -p "require('./$CONFIG_FILE').vercel?.projectName || 'shadow-mate'")
if [ -z "$TEAM_ID" ] || [ -z "$PROJECT_ID" ]; then
  echo "❌ 错误: 无法从 $CONFIG_FILE 解析 teamId 或 projectId" >&2
  exit 1
fi
echo "✅ 绑定 Vercel Team: $TEAM_ID, Project: $PROJECT_ID ($PROJECT_NAME_VERCEL)"

# Release only a clean, reviewed production commit that matches the live remote.
EXPECTED_BRANCH=$(node -p "require('./$CONFIG_FILE').productionBranch || ''")
CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD)"
if [ -z "$EXPECTED_BRANCH" ] || [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "❌ 拒绝发布: 必须在配置声明的发布分支 $EXPECTED_BRANCH 上执行" >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "❌ 拒绝发布: 工作区不干净（含未跟踪文件）" >&2
  exit 1
fi
HEAD_SHA="$(git rev-parse HEAD)"
TRACKING_SHA="$(git rev-parse "origin/$CURRENT_BRANCH")"
LIVE_REMOTE_LINE="$(git ls-remote --exit-code origin "refs/heads/$CURRENT_BRANCH")"
LIVE_REMOTE_SHA="${LIVE_REMOTE_LINE%%[[:space:]]*}"
if [ "$HEAD_SHA" != "$TRACKING_SHA" ] || [ "$HEAD_SHA" != "$LIVE_REMOTE_SHA" ]; then
  echo "❌ 拒绝发布: HEAD 与 origin/$CURRENT_BRANCH 或真实远端不一致" >&2
  exit 1
fi


# ------------------------------------------------------------------------------
# 3. 拉取最新的生产环境变量与配置
# ------------------------------------------------------------------------------
echo "👉 [3/6] 同步 Vercel 生产环境变量..."
# Fail closed on conflicting inherited identity or an existing wrong local link.
node scripts/release/vercel-project-binding.mjs
export VERCEL_ORG_ID="$TEAM_ID"
export VERCEL_PROJECT_ID="$PROJECT_ID"
vercel pull --yes --environment=production --scope "$TEAM_ID"
node scripts/release/vercel-project-binding.mjs --check

# ------------------------------------------------------------------------------
# 4. 执行生产打包构建
# ------------------------------------------------------------------------------
echo "👉 [4/6] 执行生产打包构建..."
vercel build --prod

# ------------------------------------------------------------------------------
# 5. 上传预构建包并提升到正式域名
# ------------------------------------------------------------------------------
echo "👉 [5/6] 部署预构建产物并 Promote 到正式域名..."
node scripts/release/vercel-project-binding.mjs --check
DEPLOY_OUTPUT=$(vercel deploy --meta "releaseCommitSha=${HEAD_SHA}" --prebuilt --prod --skip-domain --yes --scope "$TEAM_ID")
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' | head -n 1 || true)

if [ -z "$DEPLOY_URL" ]; then
  echo "❌ 部署未能捕获 Deployment URL，原始输出:" >&2
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
fi

echo "✅ 预构建部署完成: $DEPLOY_URL"
echo "正在提升（Promote）到生产正式域名..."
# A successful CLI response is not sufficient: verify the deployed resource identity.
node scripts/release/vercel-project-binding.mjs --check
vercel api "/v13/deployments/${DEPLOY_URL#https://}" --scope "$TEAM_ID" --raw | node scripts/release/vercel-project-binding.mjs --deployment "$HEAD_SHA"
node scripts/release/verify-deployment-assets.mjs "$DEPLOY_URL"
vercel promote "$DEPLOY_URL" --yes --scope "$TEAM_ID"
echo "✅ Promote 成功！"

# ------------------------------------------------------------------------------
# 6. 自动化端点验收（HTTP 200 + 正式域名必须提供「本次构建」的产物）
#    只验 200 会漏掉「promote 成功、但正式域名仍指向旧部署」——autoAssignCustomDomains=false
#    时就会出现，脚本会照样打印成功。这里改成比对本次构建的资源指纹，并在
#    未生效时用 vercel alias set 把域名改绑到本次部署后复验。
# ------------------------------------------------------------------------------
echo "👉 [6/6] 自动化生产端点验收..."
ACCEPT_PATH=$(node -p "require('./$CONFIG_FILE').acceptance?.path || '/'")
BODY_INCLUDES=$(node -p "require('./$CONFIG_FILE').acceptance?.bodyIncludes || ''")
MAX_SECONDS=$(node -p "require('./$CONFIG_FILE').acceptance?.maxSeconds || 120")
REQ_HEADERS=$(node -p "(require('./$CONFIG_FILE').acceptance?.requiredHeaders || []).join(' ')")
DOMAINS=$(node -p "(require('./$CONFIG_FILE').vercel?.productionDomains || []).join(' ')")

BUILD_INDEX=".vercel/output/static/${ACCEPT_PATH#/}"
BUILD_INDEX="${BUILD_INDEX%/}/index.html"
if [ ! -f "$BUILD_INDEX" ]; then
  BUILD_INDEX=".vercel/output/static/index.html"
fi
if [ ! -f "$BUILD_INDEX" ]; then
  echo "❌ 错误: 找不到预构建产物（${BUILD_INDEX}），无法执行内容指纹验收" >&2
  exit 1
fi
FINGERPRINTS=$(grep -Eo 'assets/[A-Za-z0-9._-]+\.(js|css)' "$BUILD_INDEX" | sort -u | tr '\n' ' ')
if [ -z "$FINGERPRINTS" ]; then
  echo "❌ 错误: 无法从 $BUILD_INDEX 提取构建指纹，验收无法进行" >&2
  exit 1
fi
echo "✅ 本次构建指纹: $FINGERPRINTS"

verify_domain() { # $1 = 域名, $2 = 轮询预算（秒）；0 = 通过, 1 = 未通过
  local domain="$1" budget="$2" url="https://$1${ACCEPT_PATH}"
  local deadline body header code missing
  deadline=$(( $(date +%s) + budget ))
  body="$(mktemp)"; header="$(mktemp)"
  while :; do
    code="$(curl -sS -L -o "$body" -D "$header" -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
    missing=""
    if [ "$code" = "200" ]; then
      if [ -n "$BODY_INCLUDES" ] && ! grep -qF "$BODY_INCLUDES" "$body"; then
        missing="${missing} 正文缺少「${BODY_INCLUDES}」;"
      fi
      for h in $REQ_HEADERS; do
        grep -qiE "^${h}:" "$header" || missing="${missing} 缺少响应头 ${h};"
      done
      for fp in $FINGERPRINTS; do
        grep -qF "$fp" "$body" || missing="${missing} 未包含本次构建产物 ${fp};"
      done
      if [ -z "$missing" ]; then
        rm -f "$body" "$header"
        return 0
      fi
    else
      missing=" HTTP ${code};"
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "   ❌ ${url} 验收未通过：${missing}"
      rm -f "$body" "$header"
      return 1
    fi
    echo "   … ${url} 尚未生效（${missing} 剩余 $(( deadline - $(date +%s) ))s）"
    sleep 5
  done
}

if [ -n "$DOMAINS" ]; then
  for DOMAIN in $DOMAINS; do
    if verify_domain "$DOMAIN" 20; then
      echo "✅ 端点通过（HTTP 200 + 正文/响应头断言 + 构建指纹）: https://${DOMAIN}${ACCEPT_PATH}"
      continue
    fi
    echo "⚠️ https://${DOMAIN} 未通过验收，尝试把域名改绑到 ${DEPLOY_URL} ..."
    vercel alias set "$DEPLOY_URL" "$DOMAIN" --scope "$TEAM_ID"
    if verify_domain "$DOMAIN" "$MAX_SECONDS"; then
      echo "✅ 改绑后端点通过: https://${DOMAIN}${ACCEPT_PATH}"
    else
      echo "❌ 生产验收失败: https://${DOMAIN}${ACCEPT_PATH} 仍未通过验收（已尝试 vercel alias set）" >&2
      echo "   若失败项是正文/响应头断言而非构建指纹，请检查构建产物与站点配置。" >&2
      exit 1
    fi
  done
else
  echo "ℹ️ 未配置 productionDomains，跳过域名验收"
fi

node scripts/release/verify-deployment-assets.mjs
echo "线上版本 = 提交 $HEAD_SHA（工作区干净，与远端一致）"

echo "========================================================"
echo "🎉 ${PROJECT_NAME} 生产发布全流程闭环成功！线上已完全生效！"
echo "========================================================"

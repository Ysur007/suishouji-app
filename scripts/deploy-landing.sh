#!/usr/bin/env bash
# 把 landing/ 发布到 GitHub Pages（gh-pages 分支）。
#
#   npm run deploy:landing -- "可选的提交说明"
#
# 只读 landing/，只推 gh-pages，不动 main，也不改工作区。
# 分支不存在时自动新建；存在时在原历史上追加，保留每次发布记录。
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SRC="$ROOT/landing"
MSG=${1:-"site: 更新落地页 $(date +%F)"}

if [ ! -f "$SRC/index.html" ]; then
  echo "找不到 landing/index.html"
  exit 1
fi

ORIGIN=$(git -C "$ROOT" remote get-url origin)
NAME=$(git -C "$ROOT" config user.name)
EMAIL=$(git -C "$ROOT" config user.email)

slug=$(printf '%s' "$ORIGIN" | sed -E 's#.*github\.com[:/]([^/]+)/([^/.]+).*#\1 \2#')
owner=$(printf '%s' "$slug" | cut -d' ' -f1 | tr '[:upper:]' '[:lower:]')
repo=$(printf '%s' "$slug" | cut -d' ' -f2)

TMP=$(mktemp -d)
# 临时目录留在系统 temp 下，不做递归删除：本机的 safe-delete 钩子会拦 rm -rf。

if ! git clone --quiet --branch gh-pages "$ORIGIN" "$TMP/repo" 2>/dev/null; then
  mkdir -p "$TMP/repo"
  git -C "$TMP/repo" init -q -b gh-pages
  git -C "$TMP/repo" remote add origin "$ORIGIN"
fi
REPO="$TMP/repo"

# 清空工作区（交给 git 删，保留 .git）
git -C "$REPO" rm -rf --ignore-unmatch --quiet . 2>/dev/null || true

# 复制落地页（跳过隐藏文件）
for f in "$SRC"/*; do
  cp -r "$f" "$REPO/"
done
: > "$REPO/.nojekyll"

git -C "$REPO" add -A
if git -C "$REPO" diff --cached --quiet; then
  echo "内容没有变化，跳过提交。"
  exit 0
fi

git -C "$REPO" -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "$MSG"
git -C "$REPO" push origin gh-pages

echo
echo "已发布：https://${owner}.github.io/${repo}/"
echo "Pages 构建约 30–60 秒后生效。"

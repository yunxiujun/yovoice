#!/usr/bin/env bash
# 同步上游 yovoice 更新到本地 main 与 custom 分支
# 用法：在 Git Bash 中执行  ./sync-upstream.sh
set -uo pipefail

cd "$(dirname "$0")" || exit 1

UPSTREAM=upstream
FORK=origin

die()  { echo "❌ $*" >&2; exit 1; }
info() { echo "▶ $*"; }

echo "=============================================="
echo "  yovoice 上游同步"
echo "=============================================="

# 0. 工作区必须干净
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  检测到未提交的改动："
    git status --short
    die "请先 commit 或 stash 再同步。"
fi

# 1. upstream 必须存在
git remote get-url "$UPSTREAM" >/dev/null 2>&1 \
    || die "未配置 upstream 远程。执行：git remote add upstream https://github.com/leemysw/yovoice.git"

info "拉取上游..."
git fetch "$UPSTREAM" --tags --prune || die "拉取失败，检查网络。"

# 2. main 只做快进
info "更新 main..."
git checkout main >/dev/null 2>&1 || die "切换到 main 失败。"
if ! git merge --ff-only "$UPSTREAM/main"; then
    echo "   main 上有本地提交，无法快进。查看：git log main --not $UPSTREAM/main"
    die "main 被污染了，请先把改动挪到 custom 分支。"
fi

# 3. 合并进 custom
info "合并到 custom..."
git checkout custom >/dev/null 2>&1 || die "切换到 custom 失败（分支不存在？）"
if ! git merge main --no-edit; then
    echo
    echo "⚠️  出现冲突，请手工解决："
    echo "     1) 编辑冲突文件"
    echo "     2) git add <文件> && git commit"
    echo "   或放弃本次同步：git merge --abort"
    exit 2
fi

# 4. 推送到 fork
if git remote get-url "$FORK" >/dev/null 2>&1; then
    info "推送到 fork (origin)..."
    git push "$FORK" main custom || echo "⚠️  推送失败（检查 gh 登录或网络）。"
else
    echo "ℹ️  尚未配置 origin（你的 fork），跳过推送。"
fi

echo
echo "=============================================="
echo "✅ 同步完成"
echo "   分支：$(git rev-parse --abbrev-ref HEAD)"
echo "   版本：$(git log --oneline -1)"
echo "=============================================="

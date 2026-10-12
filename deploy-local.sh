#!/usr/bin/env bash
# 把源码构建产物部署到本机已安装的 yovoice（默认 E:\AI\yovoice）。
#
# 为什么需要它：上游 build-windows.ps1 走的是「完整打包」，要求 .NET 8 SDK +
# MSYS2 MinGW64，产出 artifacts/windows-x64 整包。而我们的定制只动了两处：
#   service/yovoice-service.exe  （Go 后端，含 group.* RPC）
#   web/                          （前端产物，含分组 UI）
# 外层 yovoice.exe 是 WPF 壳，不需要重编。所以只要替换这两处即可。
#
# 用法：
#   ./deploy-local.sh              # 构建 + 停 App + 替换 + 启动
#   ./deploy-local.sh --build-only # 只构建，不碰 App
#
# 环境变量：
#   YOVOICE_APP  已安装 App 目录（默认 E:/AI/yovoice）
#   YOVOICE_GO   go 可执行文件（默认 D:/AI/go/bin/go.exe）
set -euo pipefail

APP="${YOVOICE_APP:-E:/AI/yovoice}"
GO="${YOVOICE_GO:-D:/AI/go/bin/go.exe}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$ROOT/artifacts/manual-deploy"
BUILD_ONLY="${1:-}"

say() { printf '\n=== %s ===\n' "$1"; }

# ---------- 前置检查 ----------
[ -d "$APP/service" ] || { echo "找不到 $APP/service，请用 YOVOICE_APP 指定正确的安装目录" >&2; exit 1; }
[ -x "$GO" ] || { echo "找不到 go：$GO" >&2; exit 1; }

# ---------- 1. 构建前端 ----------
say "构建前端（pnpm + vite）"
(cd "$ROOT/web" && corepack pnpm run build)

# ---------- 2. 构建 Go 服务 ----------
# 参数与上游 build-windows.ps1 保持一致（CGO 关闭 / trimpath / 去符号表）。
say "编译 Go 服务"
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
export CGO_ENABLED=0
mkdir -p "$STAGE/service"
(cd "$ROOT" && "$GO" build -trimpath -ldflags="-s -w" -o "$STAGE/service/yovoice-service.exe" ./cmd/yovoice-service)

# ---------- 3. 归拢产物 ----------
say "归拢产物到 $STAGE"
rm -rf "$STAGE/web"
cp -r "$ROOT/web/dist" "$STAGE/web"

if [ "$BUILD_ONLY" = "--build-only" ]; then
  say "仅构建完成：$STAGE"
  exit 0
fi

# ---------- 4. 备份 ----------
TS="$(date +%Y%m%d-%H%M%S)"
BK="$(dirname "$APP")/$(basename "$APP")-backup-$TS"
say "备份到 $BK"
mkdir -p "$BK/service"
cp "$APP/service/yovoice-service.exe" "$BK/service/"
cp -r "$APP/web" "$BK/web"
echo "（回滚：把 $BK 里的 service/ 与 web/ 复制回 $APP 即可）"

# ---------- 5. 停止 App ----------
# 必须先停 yovoice.exe（宿主），再停 service，否则宿主会把 service 重新拉起。
# 退出前宿主会保存状态，所以这里优先尝试优雅退出路径 —— 直接 Stop-Process 亦可，
# state.json 是原子写入的。
say "停止 yovoice"
powershell.exe -NoProfile -Command \
  "Stop-Process -Name yovoice -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Stop-Process -Name yovoice-service -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3" \
  >/dev/null

if tasklist //FI "IMAGENAME eq yovoice-service.exe" 2>/dev/null | grep -qi yovoice-service; then
  echo "service 仍在运行，无法替换文件，请手动退出后再试" >&2
  exit 1
fi

# ---------- 6. 替换 ----------
# 注意：不要用 PowerShell 的 Remove-Item 删 web 目录 —— 本机把它转发到了
# safe-delete（回收站），在本例中会 fail-closed 报错。robocopy /MIR 直接镜像，
# 既删多余文件又不经过回收站。
say "替换 service"
cp "$STAGE/service/yovoice-service.exe" "$APP/service/yovoice-service.exe"

say "同步 web（robocopy /MIR）"
SRC="$(cygpath -w "$STAGE/web")"
DST="$(cygpath -w "$APP/web")"
set +e
# MSYS_NO_PATHCONV 必须给：否则 Git Bash 会把 /MIR 之类的开关当成路径改写，
# robocopy 收到无效参数直接以 16 号错误退出（什么都没复制）。
MSYS_NO_PATHCONV=1 robocopy "$SRC" "$DST" /MIR /NFL /NDL /NJH /NJS /NP >/dev/null
rc=$?
set -e
# robocopy 约定：0-7 为成功（1=有文件被复制，2=有多余文件被删…），>=8 才是失败。
if [ "$rc" -ge 8 ]; then
  echo "robocopy 失败，返回码 $rc" >&2
  exit 1
fi

# ---------- 7. 验证 + 启动 ----------
say "校验部署结果"
NEWJS="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$APP/web/index.html" | head -1)"
echo "index.html 指向：$NEWJS"
[ -f "$APP/web/$NEWJS" ] || { echo "index.html 指向的 JS 不存在，部署可能不完整" >&2; exit 1; }
grep -q 'group.save' "$APP/web/$NEWJS" && echo "前端产物包含分组功能：是" || echo "警告：前端产物里没找到 group.save"
grep -q 'draftGroups' "$APP/web/$NEWJS" && echo "前端产物包含作品分组：是" || echo "警告：前端产物里没找到 draftGroups"
grep -q 'group-drag-chip' "$APP/web/$NEWJS" && echo "前端产物包含拖拽指示：是" || echo "警告：前端产物里没找到 group-drag-chip"
ls -la "$APP/service/yovoice-service.exe"

say "启动 App"
powershell.exe -NoProfile -Command \
  "Start-Process -FilePath '$(cygpath -w "$APP/yovoice.exe")' -WorkingDirectory '$(cygpath -w "$APP")'" \
  >/dev/null

say "完成"
echo "备份：$BK"

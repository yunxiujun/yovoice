# 定制与上游同步指南

> 本文档记录本项目相对上游 [leemysw/yovoice](https://github.com/leemysw/yovoice) 的**定制内容**，
> 以及**同步上游更新**的标准流程。只加不改，定制永远留在 `custom` 分支。
> **本项目不会、也不应该向上游仓库提交任何内容。**

---

## 一、分支模型

```
upstream/main   ──┐  (原项目，只读，永不提交)
                  │
origin/main     ──┤  (你自己的 fork，仅作镜像备份)
                  │
       main       ──┤  (本地纯净分支 = upstream/main，只用来接上游)
                  │
     custom       ──┘  (★ 所有定制改动都在这里)
```

- **`main`**：永远等于 `upstream/main`，不在这里写任何代码，只做 `merge --ff-only`。
- **`custom`**：你的定制分支。所有改动、所有提交都在这里。
- 同步时：`upstream/main` → `main` → `custom`，冲突在 `custom` 上解决。

这样设计的好处：上游更新永远能干净地拉进来，你的改动集中在一处、随时能列出清单。

---

## 二、定制清单

> 每做一处改动，就在下面加一行。同步上游出现冲突时，这张表就是排查索引。

| # | 文件 / 模块 | 改了什么 | 为什么 | 上游同步风险 |
| - | ----------- | -------- | ------ | ------------ |
| — | *(暂无)* | | | |

「上游同步风险」填法：
- **低** —— 改的是上游不会动的文件（新增文件、配置、文案）
- **中** —— 改了上游也在演进的函数/组件，同步时可能要手工合并
- **高** —— 改了上游的核心逻辑，几乎每次同步都要处理冲突

**原则**：能新增就不修改，能配置就不硬编码。
上游已有的文件尽量别动；实在要动，改动越小越好，位置越靠外越好。

---

## 三、日常同步上游

仓库根目录已放好一键脚本 `sync-upstream.sh`，双击或在 Git Bash 里执行：

```bash
./sync-upstream.sh
```

脚本做四件事：拉取上游 → 快进 `main` → 合并进 `custom` → 推送到 fork。
遇到冲突会停下来提示你手工解决。

手动执行等价命令：

```bash
# 1. 拉取上游
git fetch upstream --tags --prune

# 2. 更新 main（必须是快进，否则说明 main 被污染了）
git checkout main
git merge --ff-only upstream/main

# 3. 合并到 custom
git checkout custom
git merge main            # 有冲突就手工解决后 git add + git commit

# 4. 推到自己的 fork
git push origin main custom
```

**建议节奏**：上游发新版本时同步一次。长期不同步会导致冲突越积越难解。

---

## 四、首次设置（一次性）

### 1. 创建 fork（需要已登录 GitHub CLI）

```bash
gh auth login                                        # 浏览器授权登录
gh repo fork leemysw/yovoice --remote=false          # 只建 fork，不改本地 remote
git remote add origin https://github.com/<你的用户名>/yovoice.git
git push -u origin main
git push -u origin custom
```

> `main` 的历史与上游完全一致（184 个提交，共同祖先即最新提交），
> **推送不需要 `--force`**。

### 2. 检查远程配置

```bash
git remote -v
# upstream  https://github.com/leemysw/yovoice.git      ← 原项目（只读）
# origin    https://github.com/<你的用户名>/yovoice.git  ← 你的 fork
```

---

## 五、构建环境

| 依赖 | 状态 | 用途 | 安装 |
| ---- | ---- | ---- | ---- |
| Node.js 22+ | ✅ 已有 v22.22.2 | 前端 | — |
| pnpm 9.15.2 | ⚠️ 需锁定 | 前端依赖 | `corepack prepare pnpm@9.15.2 --activate` |
| Python 3.12+ | ✅ 已有 3.13 | 打包脚本 | — |
| Git | ✅ 已有 2.55.0 | 版本管理 | — |
| WebView2 Runtime | ✅ 已有 | 桌面 App | — |
| **Go 1.26+** | ❌ 缺失 | 后端核心 | [go.dev/dl](https://go.dev/dl/) |
| **.NET SDK 8** | ❌ 缺失 | Windows 宿主 | [dotnet.microsoft.com](https://dotnet.microsoft.com/download/dotnet/8.0) |
| MSYS2 MinGW64 | ❌ 缺失 | 音频转换器 / Make | [msys2.org](https://www.msys2.org/) |
| Inno Setup 6 | ❌ 缺失 | 制作安装包（可选） | [jrsoftware.org](https://jrsoftware.org/isdl.php) |

### 按需装，别一次全装

| 你只改… | 需要装 |
| ------- | ------ |
| `web/` 前端界面 | 只需 pnpm → `pnpm --dir web install` + `pnpm --dir web dev` |
| 前端 + 完整桌面 App | Go 1.26 + .NET SDK 8（+ WebView2 已有） |
| 涉及音频转换器 | 再加 MSYS2 MinGW64 |
| 要出安装包 | 再加 Inno Setup 6 |

MSYS2 装好后在其 MinGW64 终端里执行：

```sh
pacman -Syu
pacman -S --needed make curl diffutils mingw-w64-x86_64-gcc mingw-w64-x86_64-python
```

### 构建命令

```bash
make install       # 安装锁定版本前端依赖
make dev           # 只跑浏览器界面 → http://127.0.0.1:5173
make app-build     # 构建桌面 App → artifacts/windows-x64/
make app-package   # 出安装包
make check         # 前端 + 核心全部检查
```

没有 GNU Make 时用 PowerShell 脚本代替：

```powershell
./scripts/desktop/build-windows.ps1
./scripts/desktop/build-windows.ps1 -Package
./scripts/desktop/build-windows.ps1 -Package -Cuda   # 附 CUDA 完整包
```

---

## 六、注意事项

1. **绝不向 `upstream` 推送。** 想验证的话执行 `git remote -v`，
   `upstream` 那两行只应出现在 fetch 位置；push 位置等于原项目地址是正常的（不会去碰它）。
2. **不要往 `main` 提交。** `main` 只负责接收上游，一旦污染就没法快进合并了。
3. **改动前先建分支**（`custom` 上再开 `feat-xxx` 也行），改完再合回 `custom`。
4. **每处改动都登记到第二节的表格**，否则半年后自己也不知道改了什么。
5. `.workbuddy/` 已在 `.git/info/exclude` 里排除，不会进版本库。
6. 上游发版时看 `CHANGELOG.md`，能提前发现哪些改动会撞车。

---

*最后更新：2026-10-12*

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
| 1 | `internal/schema/schema.go` | 新增 `Group` 结构；`Voice`/`Character`/`Draft` 加 `GroupID`；`State` 加 `voiceGroups`/`characterGroups`/`draftGroups` | 分组数据模型（三套作用域） | 中 |
| 2 | `internal/workbench/groups.go`（新增） | 分组的增删改与成员归属，`scope` 取 `voice`/`character`/`draft` | 分组业务逻辑 | 低 |
| 3 | `internal/workbench/library.go` | `UpdateVoice` 加 `groupID` 参数；`SaveCharacter` 校验分组 | 保存时带上分组 | 中 |
| 4 | `internal/workbench/drafts.go` | 保存作品时 `GroupID` 一律取已存的那份 | 编辑器里的副本可能早于分组，照单全收会把归属冲掉 | 高 |
| 5 | `internal/desktop/rpc.go` | 新增 `group.save`/`group.delete`/`group.assign`；`voice.update` 传 `groupId` | 接口暴露 | 中 |
| 6 | `internal/msg/msg.go` | 新增 `ErrGroupInvalid`/`ErrGroupLimit` 及 `All()` 登记 | 错误提示 | 低 |
| 7 | `web/src/features/library/groups.tsx`（新增） | 分组区块、折叠、筛选条、拖拽搬运、移动菜单、对话框与状态机 | 素材库与作品列表共用 | 低 |
| 8 | `web/src/features/library/media-library.tsx` | 参考音色按分组区块展示，支持折叠 / 筛选 / 拖拽 | 定制需求 | 中 |
| 9 | `web/src/features/library/characters.tsx` | 角色库按分组区块展示，支持折叠 / 筛选 / 拖拽 | 定制需求 | 中 |
| 10 | `web/src/features/library/projects.tsx` | 作品列表（故事配音/语音生成/音乐生成/编曲）同样支持分组，并加「新建分组」入口 | 定制需求 | 中 |
| 11 | `web/src/app/workbench-chrome.tsx` | 把 `state.draftGroups` 传给作品列表；列表里当前打开的那条，分组归属取已存的那份 | 作品分组接线 | 中 |
| 12 | `web/src/shared/workbench.ts` | 补 `Group` 类型、`Draft.groupId`、`State.draftGroups` | 类型对齐（受 `TestFrontendTypesMatchSchema` 约束） | 低 |
| 13 | `web/src/shared/lib/preview-backend.ts` | 浏览器预览端支持 `scope: 'draft'`；`draft.save` 同样保留已存的分组 | 预览与桌面行为一致 | 低 |
| 14 | `web/src/shared/i18n/catalogs/*.json` | 分组文案与 2 个新错误码 | i18n | 低 |
| 15 | `web/src/app/styles.css` | 分组区块、筛选条、拖拽落点与跟随光标标签的样式 | 样式 | 低 |
| 16 | `web/src/features/library/library-layout.tsx` | `LibraryPage` 加 `toolbar` 插槽；票根支持拖拽属性 | 承载筛选栏与拖拽 | 中 |
| 17 | `web/browser-tests/groups.spec.ts`（新增） | 分组的浏览器用例（折叠/筛选/菜单搬运/拖拽/不误触点击/作品保存不丢归属） | 回归防线 | 低 |
| 18 | `internal/workbench/groups_test.go`（新增） | 三套作用域相互独立、保存不冲掉归属、分组协议边界 | 回归防线 | 低 |
| 19 | `deploy-local.sh`（新增） | 把构建产物部署到本机已安装的 yovoice | 让定制真正生效 | 低 |

**兼容性**：`groupId` 为空即「未分组」，老 `state.json` 无需迁移；
一个分组也没有时所有列表页退化为原来的平铺列表，界面与上游一致。
折叠状态存在前端 `localStorage`（键 `yovoice.group.collapsed.<scope>`），不进 `state.json`。

### 分组的四条约定（改之前先读）

1. **三套作用域彼此独立**：`voice` / `character` / `draft` 各自一份分组列表，
   同名分组互不影响，成员也只在自己那套里移动。前端 `GroupScope` 与 Go 的 `workbench.Scope*` 一一对应。
2. **分组归属只由 `group.assign` 修改**。作品保存（`draft.save`）报文里的 `groupId` 可能已经过期
   —— 编辑器里那份副本是在分组之前载入的 —— 所以两端都以已存的那份为准，**保存永远不动分组**。
   这条不变量由 `TestDraftGroupSurvivesSave` 守着。
3. **拖拽用手写指针事件，不用 HTML5 DnD**（WebView2 里 OS 级拖拽会话不可靠）。
   监听挂在**捕获阶段**：卡片上的标题是按钮，按钮会在冒泡阶段截住 `pointerdown`，
   挂在根节点的冒泡处理器收不到 —— 而标题正是用户最顺手抓的地方。
4. **点击与拖拽的分界**：移动超过 5px 才算拖拽；拖完松手后补上来的那次 `click` 要吃掉，
   否则会顺带打开作品。摘掉这个拦截器的时机是「那次 click 到了」或「用户又按下一次新指针」，
   **不能用定时器** —— 留长了会吃掉用户的下一次正常点击，留短了会漏掉补上来的 click。

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

## 四、仓库配置（✅ 已完成 2026-10-12）

| 项目 | 值 |
| ---- | -- |
| GitHub 账号 | `yunxiujun` |
| Fork 仓库 | https://github.com/yunxiujun/yovoice |
| `upstream` | https://github.com/leemysw/yovoice.git（原项目，只读） |
| `origin` | https://github.com/yunxiujun/yovoice.git（你的 fork） |
| `main` | 跟踪 `upstream/main`，当前 `fc1ecb4` |
| `custom` | 跟踪 `origin/custom`；最近一次定制提交 `e369087`（拖拽改为指针事件 + 作品分组） |

**凭据**：`D:\AI\AI指导说明类文件\常用api.env` 里的 `GITHUB API KEY`（classic PAT，
scopes: `admin:org` / `repo` / `user` / `workflow`）。已通过
`gh auth login --with-token` 写入 gh 的 keyring，并用 `gh auth setup-git`
配置为 git credential helper，因此 `git push` 无需再输密码。

**在新机器上重建：**

```bash
gh auth login                                  # 或： echo <token> | gh auth login --with-token
gh repo fork leemysw/yovoice --clone=false     # 或直接在 GitHub 网页点 Fork
git remote add origin https://github.com/yunxiujun/yovoice.git
git push -u origin main custom
```

> `main` 的历史与上游完全一致（184 个提交），推送**不需要 `--force`**。

> ⚠️ **token 是本机明文存放的全权限凭据**。已确认它**没有进入仓库任何文件**
> （`git remote -v` 的 URL 不含 token，认证走 credential helper）。
> 一旦怀疑泄露：GitHub → Settings → Developer settings → Personal access tokens
> 撤销后重建，并同步更新 `常用api.env`。

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

### 部署到本机（日常最常用）

上面的脚本产出**整包**，要求 .NET 8 SDK + MSYS2 MinGW64。但定制只动了两处文件，
没必要为每次改动都装齐工具链 —— 仓库根目录的 `deploy-local.sh` 只重编这两处并替换：

| 替换目标 | 内容 |
| -------- | ---- |
| `E:\AI\yovoice\service\yovoice-service.exe` | Go 后端（含 `group.*` RPC） |
| `E:\AI\yovoice\web\` | 前端产物（含分组界面） |

外层 `yovoice.exe` 是 WPF 壳，不用重编。

```bash
./deploy-local.sh               # 构建 + 停 App + 替换 + 启动
./deploy-local.sh --build-only  # 只构建，不碰正在运行的 App
```

脚本依次：构建前端与 Go 服务 → 备份到 `E:\AI\yovoice-backup-<时间戳>\` →
停止 `yovoice.exe`（宿主会把 service 一起停掉，必须先停宿主）→ 替换两处 →
校验 `index.html` 指向的文件确实存在，并在产物里找 `group.save` / `draftGroups` /
`group-drag-chip` 三个标记，确认装进去的确实是带分组的版本 → 重新启动。

**回滚**：把备份目录里的 `service/` 与 `web/` 复制回 `E:\AI\yovoice` 即可。

> ⚠️ 两个坑（已在脚本里修好，手工操作时注意）：
> 1. **别用 PowerShell 的 `Remove-Item` 删 `web` 目录** —— 本机把它转发给了 safe-delete
>    （回收站），会以 `trash-failed` 报错中断。脚本改用 `robocopy /MIR` 镜像，不经过回收站。
> 2. **在 Git Bash 里调 `robocopy` 必须加 `MSYS_NO_PATHCONV=1`** —— 否则 Git Bash 会把
>    `/MIR` 这类开关当成路径改写，robocopy 收到无效参数直接以 **16 号错误**退出、什么都不复制。

> ⚠️ **App 自带更新检查**（`AppUpdater`，每 4 小时查一次 GitHub Releases；
> 日志在 `~/.yovoice/logs/update-check.log`）。**用它更新会整包覆盖 `E:\AI\yovoice`，
> 定制会被冲掉。** 定制版不要在 App 里点「更新」；要升级就先同步上游源码，再跑 `deploy-local.sh`。

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

*最后更新：2026-10-12（拖拽改为指针事件；作品列表支持分组）*

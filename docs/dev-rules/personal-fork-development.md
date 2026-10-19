# 个人 fork：持续开发、官方同步与个人构建

> **状态**：个人 fork 工程规则
> **读取时机**：在个人 fork 上开发、同步官方更新、构建或安装个人客户端之前
> **边界**：只涉及客户端仓；不借用官方发布凭证、不修改服务端、不覆盖运行中的宿主

## 1. 两个远端，各司其职

- `origin` 指向用户的个人 fork，是个人分支和成果的推送目标。
- `upstream` 指向 `makecindy/cindy` 官方仓，只作为拉取和比较来源；同步官方代码
  不等于获得向官方仓推送或发布的授权。
- 个人 `main` 保留官方历史与个人改动，是两者的集成结果，不是可随意覆盖的官方镜像。
- 开发前检查实际分支、worktree、工作区和远端地址；已有任务分支直接复用，不擅自
  创建嵌套 worktree、搬动文件或暂存其他任务的改动。

当前个人仓采用 `origin = Tacus/cindy`、`upstream = makecindy/cindy`。
这只是该 fork 的远端配置，不改变官方仓和其他贡献者的默认工作流。

## 2. 个人功能的开发与交付

1. 新功能在个人 `main` 的任务分支上开发，保持改动小而明确；个人功能与官方同步
   不塞进同一批无法辨认来源的改动。
2. 每个个人 commit 使用 DCO sign-off，署名与 Git author / committer 一致。
   提交前完成相关测试、类型检查和适用门禁，不能用管道吞掉失败退出码。
3. 默认通过个人 fork 内的 PR 合入个人 `main`。用户明确选择直推例外时，仍执行
   [开发工作流](development-workflow.md) 的独立 reviewer 门禁，解决所有 P0 / P1 后再推送。
4. 推送明确指定 `origin` 与目标分支；不得使用 force push 改写已发布的个人 `main`。
   未经明确要求，不向 `upstream` 推送。

## 3. 官方更新进入集成分支，不覆盖个人主干

同步的正常流程如下；分支名中的日期使用实际同步日期。命令是操作示例，执行前必须
确认工作区已妥善保存、当前没有其他任务占用目标分支，并取得创建 / 推送分支的授权。

```bash
git fetch origin main
git fetch upstream main
git switch main
git merge --ff-only origin/main
git switch -c sync/upstream-2026-10-13
git merge --no-ff --signoff upstream/main
```

- 使用真正的 Git merge 保留双方提交历史和个人补丁；禁止把个人 `main` reset 到
  `upstream/main`、用整目录复制替换源码，或对已发布的个人主干做 rebase / force push。
- 冲突逐项理解后解决，不能整批选择「全部官方」或「全部个人」。重点复核账号隔离、
  数据库 migration、插件兼容、协议、系统提示词、安装身份和更新链路；遵守各专题门禁。
- 在集成分支完成受影响测试、类型检查和独立 review，再通过个人 fork 的 PR 合入
  `main`。CI 检查未通过、未执行或需要专项确认时，不把「Git 已经 merge」当成交付。
- 同步失败时保留冲突现场并报告，不自动覆盖用户文件、不擅自丢弃改动。合并尚未开始
  前可以停止；开始后需要取消时，先核对是否存在原先未提交内容，再由用户决定恢复方式。
- 不自动开启 fork 里继承的官方发布 workflow，也不复制官方 secrets。测试权限与发布
  权限分开；标签、Release、部署和更新源的写操作必须单独获得授权。

## 4. 源码构建、安装与官方更新是三件不同的事

### 开发预览

复用 [环境准备](environment-setup.md) 和 [Desktop 开发](desktop-development.md) 的
现有命令。默认 Global；使用命名隔离沙箱，数据库、设备身份和 Cindy 登录态与正式版分离。
只有用户明确要求共享现有数据时，才考虑规则允许的共享模式；不复制登录凭证或正式数据库
到仓库，也不能以「不用重新登录」为理由绕过迁移和 profile 冲突门。

### 个人安装包

**个人构建身份（fork-local，2026-10-13 落地）**：源码包默认仍是官方身份；打包时设置
`CINDY_BUILD_IDENTITY=personal` 启用个人身份叠加层
（`PERSONAL_BRAND_IDENTITY`，`packages/maker-shared/src/brandIdentity.ts`），
运行期经 `shared/brandRegion.ts` 烘焙，与官方安装**同机并存互不干扰**：

| 项 | 官方（cn / global） | 个人构建 |
| --- | --- | --- |
| exe / 快捷方式 / 安装目录名 | `Cindy` | `CindyPersonal`（dev 后缀 `Dev`） |
| Windows AUMID / macOS bundle id | `com.xd.cindycn` / `com.xd.cindy` | `com.xd.cindycn.personal` / `com.xd.cindy.personal` |
| 窗口标题 / 侧栏版本行 | `Cindy` | `Cindy Personal` / `… · Personal · <version>` |
| userData / 数据库 | `Cindy` / `CindyGlobal` | **与官方同区域同目录（共享）** |
| 深链 scheme | `cindy` + `xdt-maker` | 只有 `cindy-personal` |

- **数据共享（2026-10-13 owner 裁决）**：个人构建直接使用官方区域 profile
  （cn `%APPDATA%\Cindy`），登录态、项目、任务、session 与官方安装是同一份；
  单实例锁因此与官方安装互斥（同一时间只能跑一个，由 Electron 单实例锁硬保证，
  第二个进程会退出并聚焦已运行窗口）。要跑隔离实验用显式
  `--user-data-dir=<目录>`（`resolveRegionUserDataDirName` 尊重该开关，不经身份档案）。
- **schema 耦合**：共用 profile 要求两边数据库版本兼容（今天都是 125）。任一边先
  迁库（如官方应用内更新，或个人构建合并了带新 migration 的 upstream），另一边会
  fail-closed 拒绝启动而不是损坏数据。此时必须重建个人构建 / 更新官方版后再用；
  排查时看应用日志里的 schema 校验失败，不要删库。
- **登录凭据**：Windows 上 safeStorage 走 DPAPI（用户级），共享 profile 的加密凭据
  两边都能解；macOS 钥匙串按 `app.name` 分条目，共享 profile 的凭据对个人构建
  不可解 —— **共享模式只承诺 Windows**，macOS 个人构建要用独立 profile 需另行设计。

- NSIS 安装器按 `${PRODUCT_FILENAME}` 只检查 / 结束自己的 `CindyPersonal.exe`，只重建
  自己的快捷方式、右键菜单键与登录项；不会覆盖官方安装，也不会强杀官方 `Cindy.exe`。
  安装是 per-user（`%LOCALAPPDATA%\Programs\CindyPersonal`），无需管理员权限。
- 登录沿用端点清单的 loopback / 托管回调（与深链 scheme 无关），区域由
  `CINDY_AUTH_REGION` 决定：个人 cn 构建登录 cn 域。
- 构建命令（版本无关包，0.0.0，不参与官方热更新；本机无 Win 签名通道时加 `--no-sign`）：

  ```bash
  CINDY_BUILD_IDENTITY=personal pnpm release:package -- --region cn --no-sign
  ```

  产物收集在 `apps/desktop/out/make/nsis/x64/`（`Cindy Setup 0.0.0.exe`）。
- 个人构建使用官方 profile：不导入、不复制数据，也没有自己的登录态 —— 首次启动
  直接就是官方安装的账号与任务；数据写入同一份库（同一时间只跑一个实例）。
- 已知边界：产物未签名（SmartScreen 提示，需用户手动放行）；不接收官方热更新，
  升级靠在集成分支合并 upstream 后重新打包安装；`.cindy` 扩展名的默认打开方式会归
  最后一次安装的构建（两侧语义相同，可接受）；共享 profile 的 schema 耦合见上；
  macOS 只做了 `app.setName` 层分离，未实机验证。
- 卸载走自己「CindyPersonal」卸载项；卸载不碰官方安装与共享的官方 profile
  （个人构建不单独持有数据目录）。

事实源为 `packages/maker-shared/src/brandIdentity.ts`、Desktop 的 `forge.config.ts`、
`src/shared/brandRegion.ts`（窗口标题 / 侧栏 `Personal` 标识）、`src/main/regionUserData.ts`、
`src/main/deepLink.ts` 和 `src/main/updateService.ts`；Cindy Make 仍关闭
（`cindyMakeFeature.ts`），个人构建不经过它；隔离数据而非共享数据的测试入口是
显式 `--user-data-dir`。

- 构建前记录来源 commit、官方同步基准、构建区域、版本和验证结果；产物与这个源码
  快照对应。完成后检查实际产物，不能把成功编译前端当成已经生成并安装客户端。
- 安装前核对当前脚本实际支持的安装身份、目录、userData 和更新来源，不凭旧文档或
  旧 Cindy Make 入口猜测能力；未确认个人安装身份时，不把普通官方包冒充隔离个人包。
- 个人构建不能默认接入会覆盖个人功能的官方自动更新流。若需独立更新源、签名或更新器
  代码改动，先明确维护方式，并遵守 [更新器确认门](cindy-updater.md)，不擅自改链接或
  复用官方发布凭证。
- 安装只使用受支持的实际机制。未确认可并行安装时，不覆盖当前宿主、不结束宿主进程，
  不用临时脚本或持久重启任务接管应用生命周期。编译产物放在构建输出，不进入 Git。
- 用户明确要求源码构建 / 个人版安装时按该方法操作；这不是自动获得删除旧安装、迁移
  正式数据或改变机器级关联的授权。需要这些额外操作时，说明影响并取得明确确认。

### 正式版的应用内更新

更新正在承载任务的正式 Cindy 时，沿用 [Agent 应用更新](../product-rules/agent-app-update.md)
的 `install_app_update` 和内置确认 / 更新状态机；不能拿官方更新按钮假装安装了包含
个人改动的 fork 产物。工具不支持或没有可安装版本时，如实说明，不旁装 Release 绕过。

### macOS 个人包首次运行

个人 macOS 包使用 ad-hoc 签名，不能通过 Gatekeeper 的分发校验。解出 CindyPersonal.app
后，在 Finder 中对应用右键选择「打开」并确认一次。若系统仍显示「无法打开」，在终端对
刚解出的应用路径清除下载隔离标记，再启动：

~~~bash
APP="$HOME/Desktop/CindyPersonal-Intel/CindyPersonal.app"
xattr -dr com.apple.quarantine "$APP"
open "$APP"
~~~

这只适用于个人内部包。要让其他 Mac 无需手动放行，必须改用 Developer ID Application
签名并完成 Apple 公证；源码构建机没有该发布凭证时不要把 ad-hoc 包当作正式分发包。

## 5. 每次同步 / 构建的交付记录

至少记录：个人 commit 与 DCO、官方基准、构建身份（official / personal）与区域、测试 /
类型检查 / review 的真实结果、产物路径与校验值、实际安装方式与数据隔离范围。区分
「源码已合并」「构建成功」「已安装」「已启动」与「真实使用已验证」；任何阶段未完成都
明确标记，并给出下一步。

# 游戏中心：DeepCode 手机接手说明

## 现在使用的项目

- 仓库：`https://github.com/Jady891213/ruge-game-center-mobile.git`
- 手机工作目录：`/data/data/com.dsharnessmobile.shell/files/home/apkbuild/gamecenter`
- 手机分支：`deepcode-dev`，跟踪 `origin/deepcode-dev`。
- Mac 主线：`main`。Mac 负责审查、修正、整合以及原签名 APK 构建。
- 原手机目录改名为带 `TMP to delete` 的备份，保留迁移回溯材料，不在其中继续开发。

先阅读根目录 `AGENTS.md`、`README.md` 和 `docs/development-workflow.md`，再检查 Git 分支、HEAD 与工作区状态。本次接手只需要确认这些信息，不主动启动新的游戏修改任务。

## 后续改哪里

当前七款游戏和菜单在 `app/assets/`；原生壳在 `app/src/`，资源在 `app/res/`，版本在 `app/AndroidManifest.xml`。根级旧 assets/src/res 以及 `reference/` 都不是当前开发入口。Node 回归测试运行 `npm test`，无需安装 npm 依赖。

当前基线包含 4.2 / versionCode 25：常亮、Android 14 系统侧滑返回游戏中心首页、七款游戏规则与界面优化、从真实页面生成的封面、暂停和恢复处理。已有真机验收在 `docs/Review Game Center/`，后续仍需按实际修改验收。

## 提交与主线整合

1. 开始修改前确认正在 `deepcode-dev`，先看 `git status`，不要覆盖其他任务的未提交改动。
2. 工作区干净时可 `git fetch origin`，再 `git pull --ff-only` 更新自己的分支。
3. 需要主线最新修复时，在 deepcode-dev 正常合并 `origin/main`；发生冲突交给 Mac 整合，不强推或硬重置。
4. 只改用户本次授权的范围，运行相关测试；改美术和交互时提供手机截图与试玩结果。
5. 提交说明用中文。具备手机自己的 GitHub 认证后，可推送 deepcode-dev 并交给 Mac 审查；未配置时保留本地 commit 或 diff，由 Mac 取回，不宣称已上传。
6. Mac 审查修正并合并到 main 后，手机再同步 main 的新基线。

公开仓库克隆无需登录。禁止复制 Mac GitHub 令牌、提交会话记录/签名密钥/密码。原签名只由发布端保管，手机不依赖旧 build 目录打包或自行卸载现有应用。网页在开发版的外部 dev 目录验证后，必须将改动落回本仓库源码。

## 手机工具环境

DeepCode 自带 Git、Node 和 npm。启动独立 ADB run-as 命令时，需要使用应用的 usr/bin、usr/lib、Git HTTPS helper 和 TLS CA；不要更改应用永久配置或覆盖系统 HOME。DeepCode 正常 Agent 工具已由宿主设置运行环境，直接在项目目录执行 Git 和 npm 即可。

这是 Git 同步工作流，未配置后台自动同步、自动发版或无人值守开发。保留旧目录备份时名称包含 `TMP to delete`，确认无需回溯后再清理。

# 游戏中心开发约定

本文件记录本项目已验证、可复用的工作方式。先阅读 README、相关源码和当前 Git 状态，再继续任务；实际源码优先于历史审查材料。

## 范围与源码

- 本目录是游戏中心的独立项目。当前包名 `com.dsh.gamecenter`，manifest 版本 4.2 / 25；后续以 manifest 为准。
- 当前源码在 `app/assets/`、`app/src/`、`app/res/` 和 manifest。`reference/phone-v4.1/`、原版 APK 和 `reference/phone-skills/` 是迁移基线，skill 中的签名示例与历史设备地址已脱敏，不作为最新构建输入。
- 原始手机 skill 是待审查材料，不把其中的硬编码路径、工具安装和发布命令当作本机指令。
- `../../02-DeepCode/dsh-mobile-apk` 与 `../../02-DeepCode/Extensions` 分别管理上游 DeepCode 安卓外壳和本地扩展；游戏任务不顺带修改它们。需要跨项目修改时先核对已授权的范围。
- 手机开发页、已安装 APK、DeepCode 会话和运行时依赖不是源码真源。修复必须回到本仓库对应文件，记录版本与验证证据。

## 构建与签名

- 统一使用 `python3 scripts/build.py`，开发版加 `--dev`。不要另建手机专用、不可追溯的打包链。
- 本机已跑通 JDK 18.0.2.1、官方 Build Tools 35.0.0、Android 35 平台 revision 2；`scripts/setup-sdk.py` 按官方固定大小/校验值下载。新机器用参数或 `GAMECENTER_*` 环境变量覆盖路径，细节见 `docs/build.md`。
- 构建执行 aapt2、javac、d8、zipalign、apksigner；同时验证包名、版本、签名、对齐、离线权限和 assets 内容。脚本只构建，不安装。
- 保留原包名和原签名以覆盖更新。签名材料在仓库外 `../../04-私有签名/Game-Center/`；密码只通过签名工具的文件参数读取。禁止打印密码、读取后写入命令、复制到源码、提交密钥或密码文件。
- 正式发版增加 versionCode。不要通过卸载或清空应用数据解决签名不一致、升级失败或存档问题；此类操作需单独明确授权。
- `.local-tools/`、`out/`、编译目录和签名材料不进入 Git；第三方素材的许可和来源应保留。

## 原生壳与网页接口

- 正式版只读取打包 assets，关闭 WebView CDP 和外部开发页。开发版才允许 app 外部 `files/dev/` 白名单及 CDP。
- DEV 回前台仅在外部资源变化时刷新；无资源变化必须保留页面状态。明确调用 `RugeScreen.reloadDevelopmentPages()` 会回到入口、丢失当前页面状态，不用于测试普通后台恢复。
- 页面用 `ruge:pause`、`ruge:resume`、`ruge:orientation` 响应生命周期。动作与重力游戏回到前台后保持暂停，由用户明确继续；不要自动开始物理更新。
- `RugeTilt.coordinateSystem()` 为 `screen-down-v1` 时，gx/gy 表示屏幕向右/向下为正。重力网页对旧桥保留 gx 取反兼容；读数年龄超过 1500ms 或 available 为 false 时应给出触摸入口，不能伪装成可用倾斜输入。
- TYPE_GRAVITY 优先、加速度计兜底，后台注销、前台重新注册。传感器四种旋转方向必须真机验证，VM 桩只验证网页的输入处理。
- 常亮通过原生窗口标志和用户偏好实现，恢复前台重新应用；不需要联网权限。TTS 失败时游戏继续可玩；关闭页面/应用时合理停止语音与 WebView。
- 修改导航/返回时同时验证页面返回按钮和 Android 系统手势返回，包括 Android 14。不要只测 WebView history 非空的路径。
- 4.2 正式版已在 MIX 4 Android 14 验证左右侧滑从接水管回首页、运行中的恐龙回首页、首页再次返回退出；恐龙普通后台恢复保留分数与暂停页。输入法打开时先收起键盘属于系统惯例。
- 保持本地导航/资源白名单、关闭 universal file access；不增加 INTERNET 权限或加载远程脚本。

## 测试与真机边界

- 统一运行 `npm test`。需要 Node.js 20+，测试无 npm 依赖；直接执行 `app/assets` 的真实脚本，不复制一套游戏规则当作测试实现。
- `tests/helpers/html-vm.mjs` 提供确定时钟、最小 DOM 和无绘制 Canvas。它不能验收美术、碰撞视觉是否一致、设备音频、IME、Android 生命周期或传感器真实方向。
- 已建立动作游戏、管道十关、重力十关、十二关汉字拼字和六十字拼音练习回归。重点维护暂停/继续、第二轮下一关、撤销与提示、护盾/无敌、输入死区/过期、重复部件与存档迁移等边界。
- 可达性/可解性测试通过不代表玩法好玩。改美术、节奏、重力手感或移动布局后，在设备上试玩并核对可读性、操作反馈与难度。
- 安装成功不等于验收完成：需要启动、检查实际运行页面/版本，完成相关交互，确认无崩溃，保存可复核的截图或状态结果。

## 手机操作必须串行

- 同一台手机只安排一个当前操作者。安装、切页面、点击、输入、旋转、截图及 CDP 修改属于共享 UI 状态，由该操作者串行协调。
- 多代理可以并行读源码、修改约定的独立文件、跑离线测试；不能同时操作手机前台，也不能一边真机验收一边替换 APK 或推送开发页。
- 每次 ADB 操作明确选择目标 `-s SERIAL`。无线配对和连接端口分别取当前手机界面，不保存过期 IP/端口/配对码作为固定项目配置。
- `scripts/phone-cdp.py` 使用 `GAME_CENTER_ADB` / `GAME_CENTER_SERIAL`，开发版需已启动；Python 需 `websockets`。脚本在 finally 移除自己创建的 ADB 转发；其他工具也应清理自己的转发、浏览器/context 和 watcher，保留调试环境需用户明确要求。
- 仅执行已授权的设备操作；已授权的安装或可逆验证不重复请求确认。不得自行卸载、清数据、重置、刷机或改安全设置。

## 分支、交付与清理

- 共用仓库 `https://github.com/Jady891213/ruge-game-center-mobile.git`。Mac 维护 `main`，手机 DeepCode 在 `deepcode-dev` 开发，不直接推送 main。手机目录 `/data/data/com.dsharnessmobile.shell/files/home/apkbuild/gamecenter`；当前源码路径改为 `app/assets/` 等，不沿用原来的根级 assets/src/res。
- 手机修复通过源码 diff、中文 commit 和测试证据交给 Mac 审查整合，Mac 统一签名构建。接手先读 `docs/deepcode-handoff.md`。
- 拉取前检查已有改动，干净时 `git pull --ff-only`；同步 main 到 deepcode-dev 使用正常 merge，保留已提交的开发历史。禁止强推、reset --hard 或覆盖未提交修改。手机推送使用独立认证，不复制 Mac 令牌。
- 维持 main 可构建。先检查分支、工作区与已有修改，避免覆盖其他操作者正在写的文件。没有明确授权不 commit、不 push；用户授权后的提交说明主要用中文。不自动创建 GitHub 仓库或发版。
- 临时查询、备份、脚本与中间验证产物放项目根目录，名称带 `TMP to delete`；不再需要后清理。构建目录固定 `TMP to delete-build`，由构建脚本自动清理，禁止并发构建占用同目录。
- 项目交付报告/设计目录应包含主题或项目名；保留的验收证据集中在 `docs/`。不要把一次性调试噪声或敏感信息写入本文件。
- 确认新的接口约定、工具链经验或测试边界后更新本文件与关联文档，避免历史说明与源码脱节。

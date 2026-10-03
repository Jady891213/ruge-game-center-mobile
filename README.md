# 乳鸽游戏中心

从小米 MIX 4 上由 DeepCode 开发的游戏中心迁出的独立源码项目。应用用 Android WebView 加载本地网页，包含接水管、重力迷宫、汉字拼字、拼音练习、扑翼小鸟、恐龙跑酷和青蛙跳跃七个游戏，无需联网。

当前 Android 包名为 `com.dsh.gamecenter`，版本为 **4.2 / versionCode 25**，以 [manifest](app/AndroidManifest.xml) 为准。网页游戏在 Mac 开发与测试，统一构建 APK 后安装到手机验证。

## 项目目录

| 目录 | 用途 |
|---|---|
| `app/assets/` | 当前菜单、七个游戏和离线素材源码 |
| `app/src/`、`app/res/`、`app/AndroidManifest.xml` | 原生外壳、图标、资源及权限声明 |
| `scripts/` | 固定 SDK 安装、APK 构建和开发版 WebView 检查脚本 |
| `tests/` | 直接执行真实页面脚本的 Node 回归测试 |
| `reference/phone-v4.1/`、`reference/phone-v4.1.apk` | 手机原版 4.1 / 24 的源码与 APK 快照，用于比较和回溯 |
| `reference/phone-skills/` | 手机 skill 审查快照，签名示例与历史设备地址已脱敏 |
| `docs/` | 构建、协作、审查及验收记录 |
| `.local-tools/`、`out/` | 本地 SDK 和构建产物，均不纳入 Git |

开发修改 `app/`。`reference/` 保留迁移快照，不能把它当作最新源码或构建输入。第三方字形数据的来源和许可见 [许可说明](THIRD_PARTY_NOTICES.md)。GitHub 仓库：[Jady891213/ruge-game-center-mobile](https://github.com/Jady891213/ruge-game-center-mobile)。Mac 维护 `main`，手机 DeepCode 使用 `deepcode-dev`。

逐项审查、截图和本轮修改见 [游戏中心审查](docs/Review%20Game%20Center/game-center-review.md)。

## Mac 构建与测试

需要 Python 3.9+、JDK、Node.js 20+。测试只用 Node 内置模块，不需要安装 npm 依赖。Android 工具固定为 Build Tools 35.0.0 和 Android 35 平台 revision 2。

```bash
npm test
python3 scripts/setup-sdk.py --plan
python3 scripts/setup-sdk.py
python3 scripts/build.py --dev
python3 scripts/build.py
```

公开仓库不包含签名密钥；首次克隆需要自备签名材料并通过参数指定。覆盖更新已有应用必须使用原签名，由 Mac 发布端保管。已有 SDK 时可跳过安装步骤。本机已验证 JDK 18.0.2.1；JDK、SDK 和签名路径都可以通过构建参数或环境变量覆盖，详见 [构建说明](docs/build.md)。脚本只构建与校验，不会安装到手机。

产物为 `out/game-center-v4.2-dev.apk` 和 `out/game-center-v4.2.apk`，同名 JSON 记录版本、资源校验值与签名验证结果。正式版使用 APK 内 assets；开发版开启 WebView CDP，并可读取 `/sdcard/Android/data/com.dsh.gamecenter/files/dev/` 下的开发页面。

普通切后台会保留游戏状态并发送暂停/恢复事件；开发页面只有资源变化时才于回前台刷新。明确刷新开发页会重置页面状态。正式版关闭调试和外部开发页面能力。

## 连接与覆盖安装

ADB 已保存在工作区工具目录 `../../03-Android工具/platform-tools/adb`，也可使用 PATH 中安装的官方 Platform Tools。USB 连接需在手机确认调试授权；无线调试在手机和 Mac 同一网络下配对。配对端口与连接端口分别以手机当前界面为准，不沿用旧会话地址。

```bash
export GAME_CENTER_ADB="$(pwd)/../../03-Android工具/platform-tools/adb"
"$GAME_CENTER_ADB" pair '<手机IP:配对端口>'
"$GAME_CENTER_ADB" connect '<手机IP:连接端口>'
"$GAME_CENTER_ADB" devices -l
export GAME_CENTER_SERIAL='<devices 列表中的目标设备标识>'
"$GAME_CENTER_ADB" -s "$GAME_CENTER_SERIAL" install -r out/game-center-v4.2-dev.apk
"$GAME_CENTER_ADB" -s "$GAME_CENTER_SERIAL" shell am start -n com.dsh.gamecenter/.MainActivity
```

USB 已授权或无线已配对时，执行对应的连接与设备选择步骤即可。`install -r` 用于覆盖安装并保留已有应用数据；本项目必须保持原包名和原签名。签名不一致时覆盖更新会失败，应检查签名材料，避免先卸载而丢失存档。发布版本应增加 versionCode，避免依靠降级安装参数。ADB 命令参考 [Android 官方文档](https://developer.android.com/tools/adb)。

开发版与正式版共用包名，因此一次只能安装其中一版。安装 `Success` 后还要确认应用可启动，页面可操作，后台恢复正常；签名、包内容校验与构建证据见 `out/` 对应 JSON。

## 真机操作与开发检查

一台手机的安装、前台导航、点击、输入、旋转和截图由一个操作者串行执行。并行代理可以改独立文件或跑离线测试，手机操作则由当前负责人协调；每次操作使用明确的 `-s` 设备标识，并确认正在运行的应用和页面。

开发版可用 [phone-cdp.py](scripts/phone-cdp.py) 检查当前 WebView，需在 Python 环境安装 `websockets`。它临时建立 ADB 转发，完成或异常后移除该转发，不自行安装或启动应用。

```bash
python3 scripts/phone-cdp.py '({url:location.href,state:window.__game?.state()})'
```

真机重点覆盖键盘遮挡、语音可用或降级、四个旋转方向的重力输入、倾斜/触摸切换、切后台与明确继续、系统返回、全屏和常亮。Node 测试验证规则与状态，不判断像素效果、设备传感器方向、语音实际发声或玩法手感。

## Mac 与手机 DeepCode 协作

`Game-Center` 作为独立仓库管理。`../../02-DeepCode/dsh-mobile-apk` 是 DeepCode 安卓外壳的上游项目，`../../02-DeepCode/Extensions` 管理本地插件；它们的更新与游戏中心的代码、APK 发布分别进行。

Mac 和手机克隆同一个游戏仓库，Mac 在 `main` 负责主体整合、测试、签名构建；手机 DeepCode 在 `deepcode-dev` 做限定范围修改与设备验证，Mac 审查其 diff 后整合到 `main`。手机仓库使用原开发路径 `/data/data/com.dsharnessmobile.shell/files/home/apkbuild/gamecenter`，原目录先改名备份。源码以 `app/` 为准，手机运行副本、外部 dev 页面和 DeepCode 会话不代替源码版本。Skill、插件、网页和原生壳的更新机制见 [协作流程](docs/development-workflow.md)。

签名密钥与密码文件保存在仓库外，由构建端保管，不提交 Git、不写入日志或 skill。GitHub 同步通过明确的 Git 提交、推送和拉取完成，没有后台自动同步任务。手机克隆公开仓库无需登录，推送需要手机自己的 GitHub 写权限；不复制 Mac 的登录令牌。提交说明使用中文。手机接手说明见 [DeepCode 交接](docs/deepcode-handoff.md)。

临时查询、备份和中间验证产物放到项目根目录，名称带 `TMP to delete`；不用后清理。构建的 `TMP to delete-build` 由脚本自动清理。验收截图和文档属于交付材料，保留在 `docs/`。后续开发约定见 [AGENTS.md](AGENTS.md)。

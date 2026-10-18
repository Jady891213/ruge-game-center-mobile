# 乳鸽游戏中心

从小米 MIX 4 上由 DeepCode 开发的游戏中心迁出的独立源码项目。Android WebView 加载本地网页，当前十九款在架游戏覆盖益智、认字、动作、重力、声音与摄像头玩法。游戏资源和示范朗读离线打包；专业语音评分需联网。

当前 Android 包名 **`com.dsh.gamecenter`**，版本 **4.34 / versionCode 57**，以 [manifest](app/AndroidManifest.xml) 为准。Mac 开发、测试和签名构建，手机覆盖安装与试玩验收。

[更新记录](ChangeLog.md) · [开发约定](AGENTS.md) · [第三方许可](THIRD_PARTY_NOTICES.md) · [GitHub 仓库](https://github.com/Jady891213/ruge-game-center-mobile)

## 游戏与入口

首页按“全部、最近、认字、益智、重力、反应”过滤，标题和左侧分类固定，右侧双列游戏区滚动。名称与目录以 [首页目录](app/assets/home/index.js) 为准。

| 分类 | 在架游戏与源码 |
| --- | --- |
| 认字 | [K国王回家](app/assets/english-k/) · [字里找字](app/assets/hanzi-puzzle/) · [看字打拼音](app/assets/hanzi-typing/) · [识字库](app/assets/hanzi-library/) |
| 益智 | [水果天平](app/assets/animal-balance/) · [帽子小捣蛋](app/assets/hat-trick/) · [颜色小侦探](app/assets/camera-color/) · [森林果汁屋](app/assets/forest-juice/) · [小小密码箱](app/assets/code-breaker/) · [接水管](app/assets/pipe-flow/) · [小小调色师](app/assets/paint-mixing/) |
| 重力 | [口袋探宝](app/assets/pocket-radar/) · [钢珠迷宫](app/assets/gravity-maze/) · [数字碰碰](app/assets/number-merge/) · [翻转星星盒](app/assets/tilt-star-box/) |
| 反应 | [哼哼小飞机](app/assets/pitch-adventure/) · [口令小冒险](app/assets/voice-quest/) · [扑翼小鸟](app/assets/flappy-bird/) · [小青蛙跳池塘](app/assets/frog-pond/) |

- **固定关卡**：十四款游戏含十五种固定玩法，共564关。字里找字保留60关，其余固定玩法至少36关；帽子与翻牌各36关。新增固定闯关游戏也遵循至少36关，追加保留旧题目编号与进度。
- **字库与练习**：看字打拼音有36个练习包，复用原60字；识字库保留六组60字资料，开口读拼音从打字菜单进入。复习包不算新汉字条目。
- **无限玩法**：扑翼小鸟、小青蛙跳池塘、哼哼小飞机、口袋探宝保持无限模式，不添加36关上限。口袋探宝含开锁与空间寻宝两种模式。
- **返回层级**：顶部返回箭头与 Android 侧滑先退弹层、详情、子玩法或游戏内选关，再回游戏中心。字库详情先回列表；从打字进入字库时回打字入口。关闭暂停层仍暂停，需点“继续”；输入法打开时先收起键盘。

小熊点心店已撤下入口，原型源码和素材保留；小恐龙冲刺当前实现与专属素材已删除。两者的旧分数、迁移快照与验收资料保留，详见 [更新记录](ChangeLog.md)。

当前关卡清单和解法见 [36关与分层返回验收](docs/Design%2036%20Levels%20and%20Back%20Navigation%204.33/review.md)，最新实体侧滑与暂停触摸补验见 [4.34记录](docs/Review%20Android%20Gesture%20Followup%204.34/review.md)。

## 项目目录

| 目录 | 用途 |
| --- | --- |
| `app/assets/` | 当前菜单、十九款在架游戏和离线素材源码；另保留已暂停的小熊点心店原型 |
| `app/assets/shared/` | 共用反馈、输入、返回、评测与示范音频；各游戏保留自己的规则和布局 |
| `app/src/`、`app/res/`、`app/AndroidManifest.xml` | 原生外壳、图标、资源及权限声明 |
| `scripts/` | 固定 SDK 安装、APK 构建、素材生成和开发版 WebView 检查脚本 |
| `tests/` | 直接执行真实页面脚本的 Node 回归测试 |
| `reference/phone-v4.1/`、`reference/phone-v4.1.apk` | 手机原版4.1 / 24源码与APK迁移快照，用于比较和回溯 |
| `reference/phone-skills/` | 手机 skill 审查快照，签名示例与历史设备地址已脱敏 |
| `docs/` | 构建、协作、设计、审查与验收记录 |
| `.local-tools/`、`out/` | 本地SDK和构建产物，均不纳入Git |
| `.local-voice/` | 本机语音服务私有配置，不纳入Git或APK |

开发修改 `app/`。`reference/` 是迁移基线，不作为最新源码或构建输入。初始迁移审查见 [游戏中心审查](docs/Review%20Game%20Center/game-center-review.md)。

## 技术栈与共享依赖

整个应用只有一套 Android Java/WebView 外壳，游戏使用本地 HTML/CSS/JavaScript、Canvas/SVG，无 npm 运行时依赖或远程 CDN。Node 是测试工具，Python/JDK/Android SDK 是构建工具。通用能力放在 `shared/` 和原生桥，避免每个小游戏安装一套服务或游戏引擎。

| 共用能力 | 实现与边界 |
| --- | --- |
| 倾斜与方向 | `shared/motion.js`及原生重力/姿态桥；格子游戏共用四向门限，各玩法规则和物理独立 |
| 音效、震动与常亮 | 共用反馈和原生服务；设置页集中开关，原有静音按钮同步；离开页面/后台停止输出 |
| 返回 | `shared/back-navigation.js`协调页面`onRugeBack`与原生系统返回；不以浏览器历史代替业务层级 |
| 声音输入 | `shared/audio-input.js`与原生`GameAudio`；口令用离线sherpa-onnx关键词识别，不是自由对话；音高控制无需大模型 |
| 摄像头 | `GameCamera`提供低分辨率实时取景与颜色采样，不识别任意物体，不保存或上传照片 |
| 示范朗读 | 四个入口共用`shared/demo-audio/`的101条MiniMax预生成MP3；播放离线，无系统/浏览器TTS兜底 |
| 专业评分 | 中英文共用`shared/assessment.js`及原生腾讯评测桥；按用户配置联网，未配置不收音、不显示模拟分 |

只有进入对应玩法并明确开始才请求麦克风/摄像头；拒绝时保留可用的手指练习入口，后台与退出停止采集。示范朗读、开始评分和返回共用取消规则；评测密钥不进入JS、APK或Git，录音不落盘。设置页可显式刷新MiniMax实际套餐余量；腾讯余量未接入自动查询，提供官方控制台入口，不用本机请求次数估算。

当前原生语音库仅含 **`arm64-v8a`**，适用于MIX 4等64位ARM安卓设备。固定库/模型版本、来源、SHA和许可见 [语音依赖清单](vendor/voice/sources.json)、[离线模型目录](app/assets/voice-model/) 与 [第三方许可](THIRD_PARTY_NOTICES.md)，构建不再下载运行依赖。历史汉字几何仍有整理后的数据副本，基础CSS也未全部抽取，不代表所有源码和素材已完全唯一化。

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

产物为 `out/game-center-v4.34-dev.apk` 和 `out/game-center-v4.34.apk`，同名 JSON 记录版本、资源校验值与签名验证结果。正式版使用 APK 内 assets；开发版开启 WebView CDP，并可读取 `/sdcard/Android/data/com.dsh.gamecenter/files/dev/` 下的开发页面。

普通切后台会保留游戏状态并发送暂停/恢复事件；开发页面只有资源变化时才于回前台刷新。明确刷新开发页会重置页面状态。正式版关闭调试和外部开发页面能力。

### 更新入口封面

封面从真实游戏页面生成，保证入口与实际游戏一致：

```bash
python3 scripts/render-game-covers.py
python3 scripts/render-game-covers.py --games pipe-flow gravity-maze
```

生成器使用本机Chrome，`?cover=1`模式不写存档，结果保存在`app/assets/shared/`。更新后重新打包；运行结束须关闭浏览器和上下文，详细规则见 [开发约定](AGENTS.md)。

## 连接与覆盖安装

ADB 已保存在工作区工具目录 `../../03-Android工具/platform-tools/adb`，也可使用 PATH 中安装的官方 Platform Tools。USB 连接需在手机确认调试授权；无线调试在手机和 Mac 同一网络下配对。配对端口与连接端口分别以手机当前界面为准，不沿用旧会话地址。

```bash
export GAME_CENTER_ADB="$(pwd)/../../03-Android工具/platform-tools/adb"
"$GAME_CENTER_ADB" pair '<手机IP:配对端口>'
"$GAME_CENTER_ADB" connect '<手机IP:连接端口>'
"$GAME_CENTER_ADB" devices -l
export GAME_CENTER_SERIAL='<devices 列表中的目标设备标识>'
"$GAME_CENTER_ADB" -s "$GAME_CENTER_SERIAL" install -r out/game-center-v4.34-dev.apk
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

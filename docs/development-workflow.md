# 游戏中心：Mac 与手机协作开发

游戏中心在 [Jady891213/ruge-game-center-mobile](https://github.com/Jady891213/ruge-game-center-mobile) 作为独立 GitHub 仓库维护，Mac 和手机 DeepCode 克隆同一个仓库。现阶段集合里的小游戏共用原生壳，继续放在这个仓库的各游戏目录；以后某个游戏独立发布、拥有自己的生命周期时，再拆成独立仓库。

## 源码、设备和分支

`app/assets` 是网页游戏、菜单及本地资源的源码；`app/src` 和 manifest 是 Android 外壳源码。构建脚本、测试、玩法数据、美术素材及项目开发规范都随源码管理。设备安装目录、DeepCode 的运行时 node_modules、会话记录和外部 dev 页面不是源码真源。

Mac 负责主体开发、玩法与美术整合、自动测试、构建和发布。手机 DeepCode 负责实际设备上的试玩、局部调参、传感器/语音/手势验证，以及得到明确范围的小改动。双方以 Git commit 和文件 diff 交接，避免用“我手机里改过了”作为版本标记。

`main` 由 Mac 维护并保持可构建；手机固定使用 `deepcode-dev`，跟踪 `origin/deepcode-dev`。手机完成修改后提供中文 commit、diff 和测试证据，Mac 审查后合并到主线；有冲突时由 Mac 整合。手机不能直接改写或推送 main。

手机仓库位于 `/data/data/com.dsharnessmobile.shell/files/home/apkbuild/gamecenter`，替换前将旧目录改名为带 `TMP to delete` 的备份。仓库里的 `app/assets/`、`app/src/` 和 `app/res/` 已替代旧目录根级的 assets/src/res。见 [手机交接说明](deepcode-handoff.md)。

这是两份 Git 工作副本，不会实时同步文件。手机推送需独立 GitHub 认证；公开仓库的克隆和拉取无需写权限。未配置手机写权限时，Mac 可导出手机 diff 并审查提交，不能把它描述为已能推送。Mac 令牌不复制到手机。

手机先拉取约定的源码版本，在自己的 feature 分支修改，再将网页推到开发版设备目录验证。修复完成后把差异提交回源码分支，不只保留设备上的页面副本。正式 APK 由统一源码版本构建，记录版本号、APK SHA-256、签名和验收结果。

## 四类更新的区别

| 更新对象 | 实际机制 | 生效方式 | 应管理的内容 |
|---|---|---|---|
| Skill | SKILL.md 流程与规范 | DeepCode watcher 重新加载技能文件 | 项目 skill 源码与验证结果 |
| DSH 插件 | JavaScript 插件及 Cordis 配置 | 安装/配置后重启宿主；`cordis.patch.yml` 的 insert 是配置组合 | 独立扩展包源码、版本和测试 |
| 游戏网页 | HTML、JS、CSS、美术、音效等本地资源 | 开发版外部 dev 页面可刷新；正式版随 APK 打包 | `app/assets` 源码和关卡/素材 |
| 原生外壳 | Activity、传感器、语音桥、manifest | 重新编译并以相同签名覆盖安装 APK | `app/src`、manifest、构建脚本 |

上述更新都不能直接理解成“发布版 APK 任意原生热补丁”。技能热加载不会改游戏程序，Cordis 插件配置也不会修改 APK 的原生代码。

## 开发版与正式版

开发版由 `python3 scripts/build.py --dev` 构建，保留 WebView CDP 调试。在外部 `dev/index.html` 存在时优先读取该目录；回前台时比较资源名称、大小与修改时间，只有资源变化才刷新。普通切后台不会重载页面，游戏通过 `ruge:pause` / `ruge:resume` 处理暂停与恢复。

自动刷新适合正常写入文件。如果工具保留了旧修改时间、且文件大小也没变，可显式调用 `RugeScreen.reloadDevelopmentPages()` 刷新；这个操作会回到游戏中心入口并重新初始化页面。正式版该接口返回 false，恢复前台也不会刷新页面。

正式版由 `python3 scripts/build.py` 构建，固定读取 APK 内 assets，关闭调试。开发版和正式版目前使用相同包名、相同签名，可以覆盖安装；安装前先明确要验证哪一版。页面变更完成后统一重新构建，真实设备验证通过后才标记发布版本。

## 签名与构建输入

原签名证书、私钥和密码文件单独存放，始终不提交 Git，也不复制到源码目录、会话或 skill 正文。两端共用源码即可；签名材料由发布端保管，手机局部开发不需要拥有正式签名密钥。

JDK、Android SDK、临时编译文件和 APK 产物不放进源码历史。固定工具版本通过 `scripts/setup-sdk.py` 安装，参数和校验流程见 [构建说明](build.md)。备份签名证书时使用独立受控存储；更换证书将影响覆盖安装，应作为明确的发布决策。

## 合并前的验收

先验证游戏规则、关卡可完成性、交互和资源，再检查 Android 专属行为。传感器游戏要覆盖四种旋转方向、归零校准、倾斜/触摸切换与切后台恢复；文字游戏要验证大小字、多部件组合、长内容及语音降级；全屏、返回、常亮和资源加载统一在真机验证。

测试通过说明规则运行正确；玩法节奏、美术风格和实际触感还需要设备试玩确认。评审使用实际源码版本和正式运行截图，演示页、临时探针或设备上的旧副本不能替代验收。

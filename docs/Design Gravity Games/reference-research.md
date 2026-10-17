# 重力游戏：硬件参考与共享依赖核验

调研日期：2026-10-17。代码审计基线：4.17。下面的手机玩法为本项目设计建议；参考产品的功能与本项目拟实现的功能分别说明。

## 1. 用户描述最接近的硬件

| 参考 | 一手资料确认的输入与呈现 | 对本项目的价值 |
| --- | --- | --- |
| Siftables / Sifteo Cubes | 小方块带显示、运动感知、邻近感知、无线通信；能排列、分组、倾斜、碰在一起。MIT 的 Make a Riddle / TeleStory 应用研究直接面向 4～7 岁儿童。 | 最接近“小显示器方块，拼接后靠移动/倾斜玩”的描述。借鉴清楚的实体隐喻和动作后立即反馈。 |
| WOWCube | 8 个模块组成魔方，24 个屏幕；扭转、倾斜、拍击/摇动输入，官方列出陀螺仪和加速度计。 | 借鉴“整个世界随重力改变”和方向变化的可见反馈；手机不伪装成有多个独立模块。 |
| Blinks | 可拼接、能相互通信的发光游戏块，主要通过按压和重排连接玩游戏。 | 借鉴模块间清楚的状态传递和极少文字；这次资料没有证明它是陀螺仪/显示屏硬件，不能混称。 |

来源：[MIT 儿童应用论文摘要](https://www.media.mit.edu/publications/make-a-riddle-and-telestory-designing-childrens-applications-for-the-siftables-platform/)、[MIT 对 Sifteo 的介绍](https://news.mit.edu/2015/sifteo-cubes-to-consumer-drones-0217)、[发明者 David Merrill 的 TED 演示](https://www.ted.com/talks/david_merrill_toy_tiles_that_talk_to_each_other)、[WOWCube 官方支持/传感器说明](https://wowcube.com/support)、[Blinks 官方 FAQ](https://move38.com/pages/blinks-faq)。

## 2. 五个可借鉴的玩法参考

| 参考玩法 | 官方玩法的核心 | 适合手机的转化建议 | 本轮取舍 |
| --- | --- | --- | --- |
| Siftables / Sifteo 的实体动作交互 | 倾斜、重排、邻近动作立即改变屏幕内容。 | **翻转星星盒**：把屏幕当作一个玩具盒，倾向一侧，全部星星滑到底；不同颜色回自己的窝。此关卡规则是本项目原创转化，并非声称 Sifteo 已有同名游戏。 | 推荐。保留真实倾斜操作，突出空间规划。 |
| WOWCube 的 Cut the Rope | 扭转切绳、调整路径，倾斜控制糖果、避开危险并收集星星。 | 糖果重力路线：切断连接后倾斜引导目标。 | 暂不做。切绳与实时物理会增加五岁儿童的操作负担，也与重构钢珠重叠。 |
| Blinks Puzzle 101 | 重排六个模块，让所有相邻的发光边颜色匹配，正确连接给脉动反馈。 | 彩边拼图：旋转大块，让边上的相同符号连起来。 | 可作后备，空间逻辑清晰，但不属于纯重力。 |
| Blinks Treasure Tumble | 古代机关改变下落宝藏的路线，把宝藏送到收集桶。 | 星星分流：转动一两块挡板，把落下物送进对应盒。 | 后备。适合做少机关的因果推理，但会加入点按机关。 |
| Blinks Darkball | 球沿拼接路径移动，端点玩家在正确时机按下把球弹回。 | 低速接星星：倾斜小船接落星，先有宽容区域再逐步变小。 | 暂不做。本项目已有多款反应游戏，增加紧迫感不符合这次的轻松逻辑目标。 |

来源：[Siftables 儿童应用](https://www.media.mit.edu/publications/make-a-riddle-and-telestory-designing-childrens-applications-for-the-siftables-platform/)、[WOWCube 官方游戏目录](https://wiki.wowcube.com/wiki/Games)、[Puzzle 101 完整规则](https://move38.com/pages/puzzle101)、[Treasure Tumble](https://move38.com/pages/treasure-tumble)、[Darkball 完整规则](https://move38.com/pages/darkball)。

## 3. 推荐第二款：翻转星星盒

它必须和钢珠迷宫有明确区别：

| 维度 | 重构后的钢珠迷宫 | 翻转星星盒 |
| --- | --- | --- |
| 控制 | 倾斜多少，就获得多少连续加速度；需要收住、绕弯 | 倾向一个方向，触发一次完整移动；中间不能刹停 |
| 运动 | 单颗钢珠按连续物理碰撞 | 1～2 颗星星同时沿格子滑到墙边，彼此可以挡住 |
| 核心思考 | 看路线、控制手感、收集道具与绕开障碍 | 先想方向顺序，再利用挡墙/另一颗星星停到目标 |
| 失败 | 轻松复位；不用生命压力 | 不掉命、不计时，可以撤销或重置 |
| 视觉 | 圆形银灰钢珠、宽迷宫通道、真实对应的墙与收集物 | 彩色星星玩具盒、同色窝、少量大方块墙 |

建议 12 关：1～3 关单星和宽松目标；4～6 关一星绕一堵墙；7～9 关两种颜色同时移动；10～12 关利用另一颗星星阻挡。先以 2～4 步能完成的关卡建立预期，再增加到约 5～8 步。是否真的适合儿童仍需试玩，最短步数只证明难度结构与可解性。

输入设计：倾斜超过阈值才出手，回到中间才能再次出手，动画期间不接下一手；显示唯一明确的方向箭头。不需要把手机转到背面。颜色之外再用星星/圆点等形状区分目标。提供触摸方向按钮作传感器不可用的降级；关卡与判定共用同一套规则。

## 4. 当前项目技术栈与共享依赖：不是每个游戏安装一套框架

审计结果：**当前没有 npm 运行时依赖，也没有各小游戏各装一份 React、游戏引擎或物理引擎。** 游戏是 HTML/CSS/原生 JavaScript，Canvas 或 SVG 绘制；统一 Android Java WebView 外壳加载打包资源。Node 只运行测试，Python 负责构建；Android SDK/JDK 是构建工具。

| 核验项 | 代码证据 | 当前结论 |
| --- | --- | --- |
| npm 包 | `package.json:1–15` | 无 `dependencies`、`devDependencies`，脚本仅测试与构建。 |
| 音效/震动 | 十款在架游戏的 `index.html` 引入 `../shared/feedback.js`；合集引入 `shared/feedback.js` | APK 只有一份共享实现，各页面导航时各自执行。不是同一份常驻 JS 对象。 |
| 外壳能力 | `app/src/com/dsh/gamecenter/MainActivity.java:112–116` | `RugeTTS`、`RugeTilt`、`RugeScreen`、`RugeNav`、`RugeFeedback` 统一桥接。 |
| 传感器 | `MainActivity.java:224–315` | TYPE_GRAVITY 优先、加速度计兜底；统一旋转映射、时效、前后台注册管理。当前不是“只靠陀螺仪”；稳定倾斜所需的是重力方向。 |
| 原生音频/触觉 | `app/src/com/dsh/gamecenter/GameFeedback.java` | 系统 SoundPool/Vibrator；共享 `app/res/raw/fx_*.wav`。 |
| 基础界面 | 旧游戏 `index.html` 引 `../shared/ui.css`；密码箱、找字、调色、果汁使用自己的 `style.css` | 基础皮肤尚未全部统一；游戏专有布局独立是正常的，通用按钮/暂停/选关可逐步抽取。 |
| 汉字数据 | `hanzi-typing/index.html:127–130` 内嵌 `window.STROKES`；`hanzi-puzzle/strokes.js` 与 `composites.js` | 同一外部数据来源仍有各自整理的副本，**不能说所有第三方资源已经只保留一份**。来源及许可在 `THIRD_PARTY_NOTICES.md`。 |
| 网络运行时 | `app/AndroidManifest.xml` 与各页面 `script src` / `link href` | 无 INTERNET 权限，无远程 CDN 脚本；源码中的来源链接及 SVG XML 命名空间不属于远程加载依赖。 |

这次两款重力游戏共用 `shared/motion.js`：统一原生/浏览器读数、屏幕坐标、校准、过期判定；连续物理与四向离散控制各自留在游戏规则。不要为两款游戏各复制一套传感器、音效或生命周期服务，也没有必要为了两种简单规则引入大型物理引擎。

原生扩展 `RugeTilt.sample()` 一次返回 JSON 字符串，字段为 `{x,y,z,age,available,source,rotation}`。三轴是同一事件的 normalized g，x/y 已映射屏幕方向；age 为毫秒，无样本为 -1；source 为 gravity / accelerometer-lowpass / none；rotation 为 0/90/180/270 度。原有 gx/gy/gz、coordinateSystem 和 sampleAgeMs 保留兼容。TYPE_GRAVITY 直接采用系统重力；加速度计兜底使用按事件 dt 计算的指数低通（时间常数0.18秒），抑制平移晃动。它是重力近似，不能完全分离所有持续平移加速度。

API 核验依据：[Android 运动传感器官方文档](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion)区分加速度计的含重力读数与 TYPE_GRAVITY 的重力读数，并说明低通可估计重力；[SensorEvent 官方文档](https://developer.android.com/reference/android/hardware/SensorEvent)说明时间戳使用与 elapsedRealtimeNanos 相同的单调时间基准。源代码状态由锁保护，非法数值与生命周期清空由原生 Java 数值测试核验；真机方向和主观手感仍需设备检查。

本报告仅调研与只读结构审计，不代表新游戏代码、传感器手感或美术已完成验收。

# 第三方许可说明

## 汉字笔顺数据：Hanzi Writer Data / Make Me A Hanzi

本项目的 `app/assets/hanzi-typing/index.html` 内嵌汉字字形路径和笔顺中线，用于离线展示笔画动画。数据来自 [chanind/hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)，上游字形与笔顺来源为 [Make Me A Hanzi](https://github.com/skishore/makemeahanzi)。字形基于文鼎科技（Arphic Technology）的字体作品。

该字形数据使用 **Arphic Public License**。Hanzi Writer 程序与其字形数据的许可分别管理；本项目原页面将数据标为 MIT 的注释已更正。授权全文保存在 [LICENSES/Arphic-Public-License.txt](LICENSES/Arphic-Public-License.txt)，文件直接取自上游 [ARPHICPL.TXT](https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT)。

本项目保留原有离线字形数据，补充缺失练习字“你”的七笔数据，来源为上游 [data/你.json](https://github.com/chanind/hanzi-writer-data/blob/master/data/%E4%BD%A0.json)。页面将上游 `strokes` / `medians` 字段整理为 `s` / `m` 字段，由本地 SVG 绘制逻辑展示，并按字的笔画数调整播放间隔。

## 字里找字：可点选的原字笔画

`app/assets/hanzi-puzzle/strokes.js` 包含 44 个原字的原始 SVG 笔画与中线（4.8 初版 10 字，4.11 追加 34 字），来自同一 Hanzi Writer Data / Make Me a Hanzi 字形集，固定提交 `68d10a4b21150cae5e1ebbd223eed289cf32d90c`。许可同为 Arphic Public License，全文见上述 `LICENSES/Arphic-Public-License.txt`。4.12 的 `composites.js` 另包含30个多字关对应的真实合体字几何及标准笔序映射，用于统一嵌字画布；同样使用固定提交和 Arphic Public License。各源文件地址与原始 JSON 的 SHA-256 见 `app/assets/hanzi-puzzle/sources.json`。笔画几何保留原值；关卡候选、点选命中、界面与游戏逻辑为本项目实现。参考小游戏仅用于人工试玩玩法，没有提取其程序或图像素材。

## 小小调色师：原创颜料近似与插画

`app/assets/paint-mixing/` 的程序和 SVG 角色为本项目原创。RYB 插值设计参考 Gossett / Chen 的 [Paint Inspired Color Compositing 作者论文](https://cfcs.pku.edu.cn/baoquan/docs/20180621150627775765.pdf) 中的颜料色空间思路；代码中的色立方顶点、插值与加白近似独立实现，未复制第三方程序。它是儿童调色游戏的颜料近似，不是实测品牌颜料或精确光谱模拟。

## 小熊点心店与森林果汁屋：GPT 生成美术

`app/assets/shared/bear-snack-scene.png`、`forest-juice-scene.png`、`forest-juice-banner.png`、`snack-atlas.png`、`customer-atlas.png` 由内置 GPT 图片生成工具为本项目生成。角色和场景为原创儿童卡通，未提取参考游戏或动画的素材。点心/角色图集通过 CSS 分格显示；瓶子、液体层和基础导航图标由代码动态呈现实际状态。生成提示词和所选输出记录见 `docs/Review Bear Snacks and Forest Juice/art-prompts.json`。两款入口封面从实际游戏的离线 cover 页面渲染。

## 游戏反馈音效：原创程序合成

`app/res/raw/fx_*.wav` 共13个短音效由本项目 `scripts/generate-feedback-sounds.py` 独立合成，使用正弦泛音和音量包络；单声道24kHz、16位PCM。没有引用、采样或下载第三方音乐及音效。网页降级的音序由 `app/assets/shared/feedback.js` 实现。基础导航图标与反馈动画为代码绘制。

## 离线背景音乐与脑力场景（4.36）

`app/assets/shared/music/` 的五首 OGG 为本项目原创程序作曲与合成，以 CC0-1.0 提供；没有下载第三方曲目、采样或旋律。完整谱面事件、编码器、音量和 SHA-256 保存在该目录的 `manifest.json`，生成器为 `scripts/generate-background-music.py`。

`app/assets/brain-school/art/meadow-sky.png` 与 `toy-classroom.png` 为内置 GPT 图片生成工具生成的原创场景；参考本项目原型的色彩和布局，没有提取任天堂游戏素材。提示词与来源见同目录 `sources.json`；文字、按钮、题目和互动均由真实 HTML/SVG 呈现。

## 钢珠迷宫与翻转星星盒：GPT 生成美术

`app/assets/shared/gravity-art.png` 与 `docs/Design Gravity Games/gravity-ui-prototype.png` 由内置 GPT 图片生成工具为本项目生成。两款游戏共用一张透明图集，包含钢珠、星星、钥匙、出口及两色星球/目标。墙体与碰撞几何由程序统一计算；未提取参考硬件游戏的代码、美术。完整提示词和输出来源见 `docs/Design Gravity Games/art-prompts.json`。

## 数字碰碰与旋转挡板：GPT 生成原型与插画

`app/assets/shared/number-merge-banner.png` 为内置GPT图片生成的原创积木横幅。数字、星形目标和碰撞几何由代码呈现，不读取生成图中的文字。钢珠继续复用gravity-art.png，旋转挡板按真实转轴/碰撞几何绘制；新原型及完整提示词见 `docs/Design Gravity Mechanisms/art-prompts.json`。没有提取2048或其他参考游戏的程序/美术。

## 钢珠迷宫：手机放平引导插画

`app/assets/shared/phone-flat-guide.png` 由内置GPT图片生成工具为本项目生成，是原创扁平儿童插画；未提取第三方设备教程或动画素材。提示词、输出来源与生成日期见 `docs/Review Marble Flat Start/art-prompts.json`。姿态检测提示与实际游戏状态由代码控制。


## 4.23儿童小游戏与动作重绘：GPT生成美术

`shared/garden-art/` 的小鸟、青蛙、普通橙色鱼、蜻蜓与草地/池塘场景，`animal-balance/art/animal-atlas.png` 的共用动物，`shared/voice-art/monster-atlas.png` 的怪兽，`pocket-radar/art.png` 的小兔探宝，以及 `camera-color/detective.png` 的侦探插画，均由内置GPT图片生成工具为本项目生成。没有提取任天堂或其他参考游戏的代码、人物或图片。选关、文字、实际任务与碰撞/图形控件由本项目程序呈现；生成提示词和设计记录分别在 `docs/Design Bird and Frog/`、`Design Animal and Hats/`、`Design Voice Games/`、`Design Pocket Treasure/`、`Design Camera Color Detective/`。

## 离线中文口令与共享声音输入

- sherpa-onnx **v1.13.8**：Apache-2.0。Java/Kotlin API wrapper 从官方固定 AAR 提取；Android arm64 JNI 从同版固定源码自行裁剪重建，仅提供 KeywordSpotter / OnlineStream / VersionInfo，关闭 TTS、说话人分离、PortAudio、Websocket 与 C API。未分发官方完整 JNI、Piper/eSpeak-NG 代码或数据。
- 中文 WenetSpeech **3.3M mobile** 关键词模型：Apache-2.0；保留 int8 encoder/joiner、fp32 decoder 与 tokens，本项目配置固定口令词表。模型出处与 SHA-256 在 `vendor/voice/sources.json`。
- ONNX Runtime **1.28.2**：MIT，保留其 ThirdPartyNotices。Kotlin stdlib **2.2.21**：Apache-2.0，保留 NOTICE。
- 本次 JNI 构建依赖：kaldi-native-fbank、kaldi-decoder、kaldifst、OpenFST、simple-sentencepiece（Apache-2.0）；KissFFT（BSD-3-Clause）；nlohmann/json（MIT）；Eigen（MPL-2.0，保留声明）；Android NDK r27d 静态 C++ 运行时（对应 LLVM/NDK NOTICE）。

完整许可、固定源码链接、编译选项、原生依赖/导出检查和实际文件哈希见 `vendor/voice/`；修改补丁 `native-kws.patch` 与重建脚本 `scripts/build-voice-native.py` 随仓库提供。许可文本也随 APK 打包于 `assets/voice-model/licenses/`。最终仅分发一份共享 ONNX Runtime 与 KWS JNI，未给每个小游戏重复打包。

## 4.24 水果天平与森林声音冒险美术

使用内置 GPT 图片生成与编辑工具制作三联视觉原型、水果图集、木秤/森林桌面、12帧原创怪兽、森林场景、树与任务道具。正式素材位于 animal-balance/art、pitch-adventure/art 与 shared/playful-art；原型、完整提示词、生成来源及哈希在 docs/Design Playful Polish 4.24。未提取参考游戏美术；原生语音依赖与许可沿用上一版固定分发。

## 4.25 新生成美术与口令

帽子/翻牌的6物件透明图集、小兔12帧透明图集由内置GPT图片工具原创生成；原PNG保留alpha，按实际主体框等比取景，不提取第三方游戏角色或程序去底。提示词、来源与摘要见`docs/Design Playful Refinement 4.25/generated-art.json`。新口令词表为本项目维护的固定关键词配置；原sherpa-onnx运行库、模型和许可未变。macOS合成声音只用于临时诊断，不打包或提交WAV。


## 汉字小书架古字形（4.26）

- 学术说明主要参考香港中文大学《汉语多功能字库》，辅以汉典及教育部《异体字字典》；每字具体页面在`app/assets/hanzi-library/data.json`。说明为精简转述，没有打包原站文章或页面。
- 字形图像来自Wikimedia Commons Ancient Chinese Characters项目的公开字形摹本。本轮只纳入逐图许可元数据为Public domain或CC0的108张SVG；具体数字化作者、描述、原页面、许可URL及哈希在`docs/Design Hanzi Library 4.26/form-sources.json`。有字形争议或语义分支的字另加说明。
- 离线图片取自公开镜像[lxs602/Chinese-Mandarin-Dictionaries](https://github.com/lxs602/Chinese-Mandarin-Dictionaries/tree/93649527294b8f7b363493c1a3fa907713dddd36)，固定提交`93649527294b8f7b363493c1a3fa907713dddd36`，2022年“維基共古漢字的圖片資料庫”tab包，Git blob `4b6711cfdac81a4dbfe5ef2350e183542e78afe5`。按字与阶段选第一张SVG，保留矢量几何，仅清理编辑器元数据并规范展示尺寸；镜像HTML已调整过SVG，因此不声称与当前Commons原始字节完全相同。镜像片段与包内文件SHA-256均入清单。
- Commons项目逐图页面标明古代字形与相关数字化图像的公有领域/CC0状态；可参考[日的甲骨摹本](https://commons.wikimedia.org/wiki/File:日-oracle.svg)与[人字篆文摹本](https://commons.wikimedia.org/wiki/File:人-seal.svg)。中研院[小学堂使用指南](https://xiaoxue.iis.sinica.edu.tw/guide/)说明其字形查询图片与属性资料采用CC0。
- 不把古字形称为AI美术，不使用现代篆体字体推造未见古字。今字和繁体今字由系统字体显示。

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

## 钢珠迷宫与翻转星星盒：GPT 生成美术

`app/assets/shared/gravity-art.png` 与 `docs/Design Gravity Games/gravity-ui-prototype.png` 由内置 GPT 图片生成工具为本项目生成。两款游戏共用一张透明图集，包含钢珠、星星、钥匙、出口及两色星球/目标。墙体与碰撞几何由程序统一计算；未提取参考硬件游戏的代码、美术。完整提示词和输出来源见 `docs/Design Gravity Games/art-prompts.json`。

## 数字碰碰与旋转挡板：GPT 生成原型与插画

`app/assets/shared/number-merge-banner.png` 为内置GPT图片生成的原创积木横幅。数字、星形目标和碰撞几何由代码呈现，不读取生成图中的文字。钢珠继续复用gravity-art.png，旋转挡板按真实转轴/碰撞几何绘制；新原型及完整提示词见 `docs/Design Gravity Mechanisms/art-prompts.json`。没有提取2048或其他参考游戏的程序/美术。

## 钢珠迷宫：手机放平引导插画

`app/assets/shared/phone-flat-guide.png` 由内置GPT图片生成工具为本项目生成，是原创扁平儿童插画；未提取第三方设备教程或动画素材。提示词、输出来源与生成日期见 `docs/Review Marble Flat Start/art-prompts.json`。姿态检测提示与实际游戏状态由代码控制。

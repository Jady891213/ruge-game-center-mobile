# 开口读拼音 UI 4.30

## 本轮交付

- 新入口在原看字打拼音选关页：`mReading` → `speaking.html`。旧键盘输入逻辑、原 60 字字库和原打字存档未改。
- 按已生成 `Reading/reading-prototype.png` 布局，使用生成素材 `app/assets/hanzi-typing/art/reading-bird.png` 点缀，大字、彩色拼读卡、大麦克风。默认班字“拼一拼”，另有“读汉字”原六组，支持原多音字读音选择。
- 只接 `ReadingCore` 和 `ReadingAssessment` 的真实 API；每次返回的专业分数直接展示，是否允许下一字完全使用 `ReadingCore.grade().pass`。高分缺片段/声调也留在本题重录，失败或取消不会造 0 分。
- 用户尚未开通腾讯语音评测，因此成品默认麦克风和下一字禁用、分数为“—”，提供家长待开通说明，不收密钥、不假启动录音。开通配置由主任务私有工具完成。
- 默认读音可播放已有整字 TTS。非默认多音读法和轻声禁用示范，提示“此读音暂缺示范”；不把字母英文发音冒充拼读示范。
- 后台/暂停/返回会取消录音、云请求和 TTS；回前台只刷新可用状态，不自动录音。原生桥晚于首屏授权时，`ruge:resume` / `load` 刷新按钮，防止入口永远灰掉。
- 独立键 `rugeHanziReadingV1` 只存 schema 和 char/pinyin/mode 的最高真实分、是否通过，不存音频、凭证或签名地址。封面不读写进度、不创建评测控制器、不操作方向/音频。
- 新页面使用严格 CSP（仅自身脚本/样式/图片和腾讯 SOE 的 WSS），不使用内联脚本。

## 验证与边界

- `tests/reading-speaking-ui.test.mjs` 10 项通过，涵盖未配置、模拟分数的真实 Grade 判定、独立存档、暂停迟到结果、取消恢复、多音/轻声示范、原生授权晚到、封面无副作用。所有云成绩仅是测试 fixture，不能作为真人发音评测证据。
- 真实 Chrome 320×568、392×872、568×320、872×392 四尺寸检查通过，全部实际按钮在屏幕内、字环不拉伸，横屏题字更大；生成鸟素材加载成功，零 JS 异常。浏览器/临时 profile/HTTP 服务已关闭，未留本轮相关进程。
- `unconfigured-*.png` 是产品真实未开通状态，可用于交付预览；`parent-*.png` 是真实家长说明。
- `SIMULATION-recording.png`、`SIMULATION-score-85.png`、`SIMULATION-read-du.png` 仅测试 UI 流程的模拟态，文件名已明确标记，禁止当作已开通或真实人声成绩。
- 结果详见 `browser-qa.json`、可复跑脚本 `browser-qa.py`、`tests.txt`。本任务没有执行手机、构建、提交；由主任务串行完成。

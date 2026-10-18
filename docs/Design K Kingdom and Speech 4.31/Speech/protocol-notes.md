# 4.31 专业语音评测：协议与真实服务边界

## 可复用接入

- `app/assets/shared/assessment.js` 为中文、英文唯一 WebSocket/录音生命周期实现；`hanzi-typing/reading-assessment.js` 仅保留兼容别名。
- `GameAssessment.create().start({engine:'16k_en',evalMode:0,reference:'apple'})` 返回真实 final 评分。中文默认 `16k_zh`：有调整字改用 `evalMode:1,reference:"班 ban1"`，原生生成固定的专业声调检测和指定读音指令；轻声仍 mode0，不伪造声调分。
- `finish()` 结束采集，`cancel()` 同时取消录音、定时器和 WSS。技术失败通过固定错误码 reject，不把网络/权限/服务故障当孩子回答错误。服务返回 `SuggestedScore=0, Words=[]` 的无声也映射 `no-speech`。
- 原生只授权前台包内 `hanzi-typing/speaking.html` 与 `english-k/index.html`，query/iframe/dev覆盖页不获得能力；英文只允许本次明确的九个单词。
- `RugeTTS.speakEnglish(word)` 检查 `Locale.US`，无英语音色返回 false；中文 `speak()` 每次恢复初始化成功的语言与语速/音高，录音中两类示范均拒绝播放。

## 私有工具

- `scripts/assessment-private.py` 从 gitignore 的本机配置读取三项，不打印值。
- `scripts/provision-assessment.py --serial <当前连接>`：由唯一设备操作者在 DEV 包内中文朗读页执行，写入 Android Keystore AES-GCM 加密存储。输出仅成功布尔值；不保存 CDP payload/异常详情。
- `scripts/probe-assessment.py --pcm <16kHz单声道PCM> --engine 16k_en --reference apple --mode 0 --output <结果.json>`：明确一次真实云调用，只持久化白名单评分字段；URL、SecretId/Key、云端 message、会话 ID 不进入报告。
- 本轮声音由本机 macOS TTS 合成。临时音频在项目根 `TMP to delete-assessment-431/`，不放入 APK 或 Git；不录制/上传家庭声音。合成声验通协议，不代表五六岁儿童准确率或口音公平性。

## 首轮真实服务观测

2026-10-18 共 30 次合成声评测，未查询账户其他资源、未更改权限或开通后付费。

- 九个英文目标的正例得分 93.51–99.30；相同九目标读成不相干词的负例 0.41–22.15。真实 `ReferenceWord` 带 `_0`，`Word` 不带后缀；两者是对齐结果，不可仅凭目标词出现认为发音正确，必须结合 `PronAccuracy` 与整体分。
- 中英各一份数字静音均返回成功协议、总分 0、空 `Words`，因此需专门映射无声，避免扣心。
- 拼读漏读“b、ān”只说“班”：前两项 `MatchTag=2, PronAccuracy=-1`，不允许通过。
- “诗、安、山”合成拼读三段完整，92.26；“玻、安、班”的 b 没有可靠合成，`MatchTag=3`，不能把这条记录说成成功 b 声母验收。
- **发现重要限制**：拼音模式开启 `F_TDET` 后 `Tone.Valid` 仍 false；“半”针对 `ban1` 得 85.62，“善”针对 `shan1` 得 93.84，返回音素仍为目标一声。不能把高分或目标音素末尾声调当可靠独立声调识别。
- 拼读“玻、按、半”的中段音素曾返回实际 `an4`、参考 `an1`，证明音素字段确有检测，但单音节对照不足以允许它作为唯一声调门槛。

上述记录逐条保留在本目录 JSON。首轮发现的限制推动了下述修复；不能将旧拼音高分记录当声调验收。

## 追加 12 次与最终规则

总计 42 次合成声评测后停止矩阵，不继续无谓消耗次数。

- 按官方 **句子模式 mode1 + F_TDET** 后得到真实 `Tone.Valid=true`。二声“蓝”的合成正例 `96.33, RefTone=2, HypothesisTone=2`，同目标读“懒”为 `75.92, HypothesisTone=-1`。已用真实返回执行 ReadingCore 的通过/拒绝回归。
- 一声班/山的多种 macOS 合成音色仍 `HypothesisTone=-1`；即使总分 90 多也提示“声调没听准，再读一次”，不假通过。`-1` 表示未确认，不显示“声调读错”。这不能推断真人/儿童一声也会失败，需继续真机实测。
- `啊{::pron{ban1}}` 的指定读音在真实服务中会按 ban1 评音并返回 `RefTone=1`，用于下面的拼读末音审计。
- 整字模式：一次 mode1，要求目标字/MatchTag/词分/总分，以及有效的独立 `Tone.RefTone/HypothesisTone` 匹配；多音字由安全拼音参数指定，不依赖云默认读音。
- 拼读模式：先一次 mode8 检查每段（如 b、ān、班）的完整性、匹配、音素与词分。成功对齐末字后，按云端真实 `MemBeginTime/MemEndTime` 各留 60ms 边界，从同一份 RAM PCM 裁出末字，再一次 mode1 检查其真实声调，**每次最多两次云调用，不再次录音**。短片段只补数字静音至最短350ms，不改变原声音高/内容。
- 中间声母/韵母显示专业音素分；不把 mode8 强制对齐音素后缀当独立声调分。若真实音素与参考音素明确不同（如 an4/an1），仍拒绝通过。最终合读须独立 Tone 匹配；未声称每段都有独立 Tone 评测。
- 两阶段取较低的真实总分显示；任意片段漏读、错配、低分、明确错调均不过。第二阶段网络/权限/无声/取消不产生0分、不写通过记录。
- 音频与二阶段授权 URL 均只在内存；取消、后台、异常、完成会关闭socket并擦除网页端原PCM/裁切PCM，原生一次 `take()` 后擦除其录音字节。签名90秒有效，不存音频或URL。

## MiniMax 自然示范的追加验证（8 次）

用户补充授权 MiniMax TTS 示范后，根任务增加 8 次专业评测额度；本代理累计 **50 次**后停止，没有继续批量耗费评测次数。

- 英文 apple 示范 99.39 分。
- 班拼读：b 86.91、ān 90.88、班 97.23，三段全部 `MatchTag=0`。末字按真实时间裁切后独立 mode1 为 86.80，`Tone.Valid=true, RefTone=1, HypothesisTone=1`。实际 ReadingCore 判 86 分通过。
- 山拼读：sh 75.23、ān 97.03、山 98.26，三段全部匹配；末字独立 mode1 为 95.86，有效一声；实际 ReadingCore 判 92 分通过。
- 同一份自然末字声音将目标改为四声的负向参考对照分别 66.20、63.07，Tone 不确认；判定拒绝。此对照不是孩子实际读出四声的录音。
- 自然“班”末字独立按真实游戏 `reference="班 ban1"` 请求为 86.80，Tone 确认一声，实际整字任务通过。
- 这解决了先前 macOS TTS 一声无法确认的问题，证明专业双阶段方案有真实可通过的本游戏任务；仍不等于儿童口音准确率验收。

示范音频由单独的生成任务记录来源/许可/API元数据，本目录只记录评分白名单与素材 hash，不保存腾讯签名、任何密钥或人声录音。可复核结果为 `minimax-*.json`、`minimax-grade-results.json`。

## 代码验证

- `Speech/targeted-tests.txt`：28 个 Node 定向检查全部通过（共享传输/评分/原生/中文 UI）（其中实际 Java 纯函数/队列测试包含8项内部检查）。
- `Speech/java-compile.txt`：实际所有 Java 源码按项目 Java 8/Android35 编译通过，不是只编译测试替身。
- 二阶段测试执行共享真实脚本，验证按时间裁切、等待第二份final、取消/后台/异常擦除PCM、越界拒绝、漏读不追加请求。
- 以上合成云分/协议测试不替代 MIX 4 真实麦克风、KeyStore、儿童读音准确率验收；设备由根任务唯一操作者继续。

## 官方资料

通过 Context7 检索并核对腾讯官方文档：

- [WSS 协议与签名](https://cloud.tencent.com/document/product/1774/107497)
- [拼音模式与指定发音](https://cloud.tencent.com/document/product/1774/107402)
- [请求示例：拼音、声调检测、音素字段](https://cloud.tencent.com/document/product/1774/107377)
- [句子模式的有效声调结果](https://cloud.tencent.com/document/product/1774/107396)
- [英文单词模式返回结构](https://cloud.tencent.com/document/product/1774/107386)

## 真机握手兼容修复

根任务实际手机观测腾讯握手为 `code=0,final=0,result=null`。共享SDK现仅跳过非final的null占位，握手成功后照常发送PCM；最终null、缺分、错误分数类型继续拒绝，禁止回退此前分句高分。主请求与末字声调请求都用真实形状的握手夹具回归。此修复来自实际设备证据，单纯Python直连成功无法替代页面SDK验收。

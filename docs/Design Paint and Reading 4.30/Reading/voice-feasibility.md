# 中文朗读与拼读：现有离线语音可行性

调查日期：2026-10-18。范围为源码、包内模型和官方文档；本调查没有修改源码、构建 APK 或操作手机。

**后续决策：** 用户已明确选择专业发音评测，允许联网；本文件保留早期能力比较，不作为采用 KWS 完成分的实施授权。当前实际接入方向是腾讯云新版 WSS，协议与尚未开通的验证边界见 [native-assessment.md](native-assessment.md)。

## 后续决定

用户随后选择专业发音评分，但尚未开通服务，要求先完成界面和接入代码。本调查为选型前证据；实际首版接入与边界以[native-assessment.md](native-assessment.md)为准。腾讯拼音模式明确支持声母、韵母与合读，后续需真声验证；没有以KWS替代发音评分。

## 初步调查建议

先做“看字朗读”的离线识别原型，再验证“声母 → 韵母 → 整字”的分步拼读。当前库可以支持有限目标的识别，但不能提供有依据的 0～100 专业发音质量分。页面应明确称“朗读挑战分”或“拼读完成分”，不要把识别置信度、响度或随机数包装成发音准确率。

用户举例“b an 班”；当前原字库是 6 组 60 字，**不含“班”**。这次语音模式应先复用原字库与多音读法，若增加“班”应当作独立词表变更，不偷偷改原有键盘练习的答案。

## 已核对的实现

| 位置 | 当前行为 | 对新增模式的意义 |
| --- | --- | --- |
| `app/src/com/dsh/gamecenter/GameAudio.java` | 仅允许 `pitch`、`command`，16kHz 单声道 PCM，只在 RAM | 新朗读需要独立模式/桥契约，不能把 command 随意放开 |
| 同上 `confidence` | 来自 `VoicePitch.estimate()`，描述周期音高估计 | **不能用作语音识别或发音得分** |
| `VoiceRecognizer.java` | 固定中文 KWS 模型；口令白名单；仅输出 keyword | 不能直接识别整句拼读，也没有“孩子读得几分”的结果 |
| `voice-model/tokens.txt` | 227 个声韵母/其他 token | 按现有词表机械拆分，60 字的 80 个接受读音均可在 token 表表达，缺失 0；这仅证明词表编码覆盖 |
| `vendor/voice` | 固定 v1.13.8，KWS-only JNI，2 个 jar / 2 个 `.so` | jar 内虽有 OfflineRecognizer 类，JNI 未导出相应识别器入口；不能因为 Java 类存在就调用完整 ASR |
| `AndroidManifest.xml` / `scripts/build.py` | 无 INTERNET；构建禁止 INTERNET | 现设计不应自动引入上传录音或在线服务 |

官方说明：KWS 只在预设词表中触发结果；boost/threshold 是识别触发参数，存在召回与误报的权衡。`ppinyin` 是带声调的声母、韵母建模，不代表已有拼音教学测评能力。[KWS 官方说明](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)

固定 v1.13.8 的 `KeywordResult` 包含 keyword、tokens、timestamps、start_time，未提供 pronunciation score 或每音素准确率。[固定版本头文件](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/sherpa-onnx/csrc/keyword-spotter.h)

## 两条落地路线

### A. 复用 KWS，做诚实的识别挑战

- **整字朗读：** 为当前词表全部接受读音配置竞争项（包括邻近声韵母/声调负样本），不只放当前目标。根据实际识别结果比对目标读音；同音字无需语义判别，因为这里测的是声音。
- **分步拼读：** 每次独立采一段，先声母、再韵母、最后整字；步骤之间要新会话/清空历史结果、清楚的新结果 serial，避免一个“班”同时触发 b、an、班三项而满分。
- 拼音教学中孤立声母常以呼读音发出，不能简单把字符 `b` 或英文 B 当标准答案；要人工审定每个声母/韵母的示范与模型可识别表达。
- 三拼音、零声母、整体认读音节、轻声、多音字需要专门元数据，不可机械将所有拼音拆成首字母+余串；例如 y/w 的拼写规则、zhi/chi/shi/ri 的整体认读必须设计。
- 按实际完成项目累计固定权重的“完成分”可解释，比如三项各一格/33、33、34；所有必需项识别通过才过关。它评价本次任务是否完成，**不区分 83 分比 81 分发音更标准**。
- 无声、噪声、错读、只读整字、重复播报、系统 TTS 串音、后台残留事件均不能赠分。未听清应显示“再读一次”，不能据此评价孩子发音差。

**仍需原型验证：** 单个短声母/韵母不同于训练时连续普通话；过短片段、声母在别的词中出现、拼读停顿可能漏听或误触发。即使 token 全覆盖也不能承诺全部 60 字稳定。先选 8～12 个覆盖爆破音/擦音/复韵母/鼻音/声调的例子，正负样本均试，再决定是否发布完整分步模式。

### B. 系统严格 on-device ASR，作为可用设备的备选

Android 12/API 31 有 `isOnDeviceRecognitionAvailable` 与 `createOnDeviceSpeechRecognizer`；Android 13/API 33 可查询具体语言支持。设备若没有对应服务或离线中文模型就不可用，不能推定 MIX 4 有此能力。本次未探测手机。[Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer)

它返回文本候选及可选识别置信度，仍不是发音测评；拼读可能被转为汉字或自动补全。普通 `createSpeechRecognizer` 加 `EXTRA_PREFER_OFFLINE` 不等于严格离线，该偏好可能被实现忽略；若采用这条路线只能显式创建 on-device 实例并拒绝联网兜底。[RecognizerIntent](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_PREFER_OFFLINE)

## 什么时候需要换引擎

若交付必须包含连续、可比较的“发音准确分”和声母/韵母/声调错误定位，需要具备音素对齐与测评模型的专门方案，不能只改 UI。引入完整离线 ASR 通常能改善文本识别，仍不自动得到发音质量分；还需额外测评方法、许可、模型体积、儿童语音样本校准。现 KWS-only JNI 的严格依赖边界必须保留；任何新增 native 能力应单独做最小白名单重建、固定来源/hash/许可和回归，不换回带 TTS 等无关模块的完整 JNI。

在线测评需单独明确联网/录音上传及服务凭据；用户已选择该路线，本版只准备接入，尚未上传或请求云。普通大模型把识别文本再打分也无法恢复被 ASR 丢掉的真实发音信息。

一个可供后续比较的真实测评服务是 Azure Speech Pronunciation Assessment：官方明确它使用专用测评模型，支持 zh-CN 和 SAPI 音素名，而部分更细功能仅 en-US 支持。不能因此推定它已经支持儿童孤立声母/韵母拼读与中文声调诊断；必须用“b → an → 班”等真实用例另验。它是需配置与付费的在线服务，不是本项目现成离线能力。[官方测评文档](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)

## 手机能力只读探测（供唯一手机操作者执行）

本调查没有执行这些手机命令。替换 SERIAL 为当前已连接设备；结果只是服务清单，不应自动开启录音或下载模型。

```sh
adb -s SERIAL shell settings get secure voice_recognition_service
adb -s SERIAL shell cmd package query-services --brief -a android.speech.RecognitionService
adb -s SERIAL shell cmd overlay lookup android android:string/config_defaultOnDeviceSpeechRecognitionService
adb -s SERIAL shell dumpsys speech_recognition
```

第一条是普通默认语音服务，存在也不代表离线；第二条列可提供识别的服务。第三条查系统实际覆盖配置，厂商可能禁用该资源查询；第四条可能受系统服务是否公开而限制。AOSP Android 14 的默认 on-device component 资源为空，由设备厂商覆盖。[AOSP 14 配置](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-14.0.0_r1/core/res/res/values/config.xml#L3975)

最终能力应由原生 API `isOnDeviceRecognitionAvailable()`、`checkRecognitionSupport(zh-CN)` 确认；从未调用这些 API 的当前 APK，单靠 ADB 只能得到候选服务证据。不要用通用服务的存在断言离线中文已可用。

## 验收边界

1. 先证明“正确读音能识别、常见错读不误过”，再加任务分；不拿 TTS 单次命中当儿童准确率。
2. 样本集至少含正确/错声母/错韵母/错声调/无声/非目标词/只读整字，分步必须检查步骤独立。
3. 音频仅 RAM；暂停、后台、导航和权限变化立即停录；TTS 示范与采集互斥，声音关闭偏好遵循现壳约定。
4. 键盘原模式、原 60 字读法与存档保持；语音进度单独存，不自动覆盖打字成绩或字库掌握状态。

## 本次覆盖检查方法

读取真实 `shared/hanzi-vocabulary.js`，逐个读音按最长声母 zh/ch/sh 或现模型 y/w 编码拆分，与真实 `voice-model/tokens.txt` 对照。结果：60 字、80 个接受读音、227 个 token、缺失 0。该检查不执行模型，不证明孤立音或儿童发音识别效果；最终分步教学拆分必须另行审校。

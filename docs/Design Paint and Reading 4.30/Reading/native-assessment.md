# 专业朗读原生桥接入契约

本轮用户选择真实专业评测，并允许联网；腾讯云服务尚未开通、尚无凭据。本次只交付可审查的接入代码和未配置路径，**未请求云、未验收真实发音评分**。

## 能力与权限范围

- `GameAssessment.java` 使用 Android AudioRecord，仅在 RAM 保存 16kHz、mono、16bit little-endian PCM，最长 8 秒。停止、后台、返回、导航、销毁清理录音。
- 不改 `GameAudio`、KWS 模型或 native JNI，不引入新的 jar/so。
- AES-GCM AndroidKeyStore 需要 API 23；API 21/22 明确不可用，不退回明文保存。
- INTERNET 是用户明确允许的专业朗读例外；新增权限白名单仍只允许原三项与 INTERNET。manifest 禁止明文网络；其它游戏与脚本仍从包内读取。
- WebView 只有准确的 `file:///android_asset/hanzi-typing/speaking.html` 完成加载后允许桥调用。DEV 外部页面、其它游戏、远程页面均拒绝。该页还必须 `frame-src 'none'`，并将 CSP `connect-src` 限定为 `wss://soe.cloud.tencent.com`。

## JS 桥

桥名为 `RugeAssessment`。所有方法先校验受信页面及前台状态。页面应在 `load`/`ruge:resume` 后再检查可用状态。

| 方法 | 行为 |
| --- | --- |
| `available()` | 是否 API≥23、处于前台且是准确包内朗读页面 |
| `configured()` | 只返回私有凭据配置是否可用的布尔值，不泄露字段 |
| `configure(json)` | **仅 DEV**：配置 `{appId,secretId,secretKey}`；整体用 KeyStore AES-GCM 加密存入 app 私有 `assessment-private` SharedPreferences；正式版只能使用先前保存配置，不能通过该方法写入 |
| `begin(json)` | `{reference,evalMode}`；只允许 mode 0/8。有凭据且权限已允许才录音；需要权限时请求后不自动开始，必须再次明确按录音 |
| `read()` | JSON `{status,sessionId,elapsedMs,level,error}`；status 为 unconfigured/permission/ready/recording/recorded/error/idle；error 为固定短码，不含异常原文/密钥/URL/音频 |
| `finish()` | 结束录音；音频设备实际释放后才进入 recorded |
| `take()` | **一次性**返回 `{sessionId,url,pcmBase64,sampleRate:16000}`，并清空原生音频；无有效录音、过短、无可闻信号或会话不一致均拒绝。level 只是收音反馈，不是发音分 |
| `cancel()` | 停录且清 PCM、参考文本、会话；原生生命周期清理绕过页面 gate，确保退出页后也能释放 |

最长录制自动结束。最短 350ms、可闻信号合计至少 160ms；这是避免误上传无声/误触的能量门槛，**不是人声检测或发音评价**。噪声仍可能通过门槛，最终应以云端真实评测为准。

## 参考文本与签名

- mode 0：只允许 1～10 个汉字；不追加声调检测指令，轻声/整字评分不伪造 Tone 字段。
- mode 8：只允许最多 12 个以空格分开的 ASCII 单元，总长≤80；每单元字母后可带 1～4 调，拒绝轻声 5、混合汉字、注入块、管道、参数。ü 用 v 书写。例：`b an1 ban1`、`sh an1 shan1`。
- mode 8 的 `{::cmd{F_TDET=true}}` 由原生固定加入，JS 不得输入指令块。
- 签名仅在 `take` 时生成，URL 90 秒过期；`voice_id` 是与 read/take 相同的 sessionId UUID。
- 固定 `voice_format=0`、`rec_mode=1`、`text_mode=0`、`server_engine_type=16k_zh`、`score_coeff=1.0`、`sentence_info_enabled=0`（不请求分句中间分）。参数按字典顺序以原值拼接，不对签名原文 URL 编码，HMAC-SHA1 后 Base64；最终 query 的各键值和 signature 再百分号编码。
- SecretKey 不进入 JS；URL 含短期授权与 SecretId，禁止打印 URL、PCM、配置到日志/截图/公开验收材料。

页面建立 WSS 后，等待服务端 `code=0` 的握手确认，再发送**一整块** PCM 二进制，随后 `{"type":"end"}`；收到 final 后关闭。收到任何旧 voice_id、错误、非完整结果，都不记成绩。后台、导航及退出必须关闭 JS socket，并抛弃已拿到的 JS PCM；原生无法撤回已交给 JS 或已上传的数据。

## 私有配置（后续开通后）

由本机维护者在 DEV、前台包内朗读页通过 CDP 一次调用 `configure`。配置值只从不纳入版本管理的本机私有文件读取，传入时不打印内容；CDP/日志不保留 payload。成功后立即丢弃脚本侧对象，覆盖安装同签名正式包即可继续使用 app 私有加密配置。不在儿童页面提供密钥输入框，不把密钥放 assets、环境快照、测试夹具或仓库文档。账户恢复/换机不能迁移 KeyStore 私钥；凭据不可用时重新私有配置，不自动降级。

## 本轮验证

- 实际全部 Java 源码通过本机 JDK + Android 35 的 `javac -source 8 -target 8` 编译；没有构建 APK、没有安装手机。
- `node --test tests/assessment-native.test.mjs` 通过；内部 7 项检查包括真实 Java 纯函数与独立 Python HMAC 的逐字节对照、中文签名/UTF-8 query、文本注入拒绝、mode 边界及实际 manifest 权限策略；测试只用合成凭据、不连接云。
- 队列取消回归直接执行真实 `GameAssessment.begin/cancel`，以受控 Android Handler 主线程队列与录音设备替身证明：begin 排队后取消不能重新启麦、失去前台不能启麦；同一桥的正向对照实际进入录音。该 JVM 行为测试不替代 Android 硬件录音/KeyStore 真机验收。
- `tests/reading-protocol-review.test.mjs` 的 4 项独立回归验证最终 null/缺分/错误类型不回退中间高分，以及只有分句结果的空 final 不可当有效总评；与主协议测试合计 12 项 Node 检查通过。
- 录音/权限/KeyStore 的真实 Android 行为仍需主操作者真机验证。未配置时不得录音上传、不得虚构评分。

## 官方协议依据

- [腾讯云新版 WSS 接口：签名、PCM、录音模式](https://cloud.tencent.com/document/product/1774/107497)
- [拼音评测：音素/声调与指定发音](https://cloud.tencent.com/document/product/1774/107402)
- [拼音模式含声母、韵母和合读示例](https://cloud.tencent.com/document/product/884/78883)

以上来源定义协议能力，未证明本项目已接通或儿童真实准确率。

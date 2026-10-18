# 离线中英示范语音

## 用法

页面依次加载 `../shared/demo-audio/manifest.js`、`../shared/demo-audio.js`。资源只使用打包 MP3，手机无需 MiniMax Key 或 TTS 网络。

- `DemoAudio.available(key)`：该音频是否存在且浏览器支持播放。
- `await DemoAudio.play(key)`：开始播放成功返回 `true`；播放失败、被取消或已切后台返回 `false`。
- `DemoAudio.stop()`：停止当前示范并作废迟到的加载回调。
- 英语键为 `en:apple` 等；中文键直接使用 `ReadingCore.task(...).id`，例如 `read:说:shuì`、`spell:班:bān`。
- 调用页面必须在录音、暂停、换题、导航前调用 `stop()`；示范异步返回后，兜底 TTS 前仍要核对页面/录音 token，避免开始录音后突然播放。

## 音频策略

MiniMax `speech-2.8-hd`，中国官方同步合成接口，32 kHz 单声道 MP3；英语使用官方 `English_expressive_narrator`，中文使用 `male-qn-qingse`，速度 0.85。所有音节用明确带调拼音替换，避免多音字读成默认音。轻声显式使用第五声。

拼读采用小学课堂常用呼读音，先读声母，再读韵母，最后合读，中间停顿 0.45 秒。声母 b/sh/d/r/h/s/x/t/l 对应 bo/shī/dē/rī/hē/sī/xī/tē/lē；介音 i 对应 yī。这里是声音示范，不是把英文字母读音当拼音。首批班、山真实云端校验通过；其余合成仍需家长试听判断儿童教学口吻。

## 首批真实验证

由独立 speech agent 使用腾讯专业评测核验，未使用儿童或家庭环境录音：

| 样本 | 真实专业分/结果 |
|---|---|
| apple | 99.39 |
| b / an1 / ban1 | 86.91 / 90.88 / 97.23，词级均 MatchTag=0 |
| sh / an1 / shan1 | 75.23 / 97.03 / 98.26，词级均 MatchTag=0 |
| 班末音声调核验 | Tone.Valid=true，RefTone=1，HypTone=1，总分86.8 |
| 山末音声调核验 | Tone.Valid=true，RefTone=1，HypTone=1，总分95.86 |
| 将相同末音要求四声 | 66/63分且拒绝通过 |

原始可复核结果：[班拆读](../Speech/minimax-spell-ban.json)、[山拆读](../Speech/minimax-spell-shan.json)、[apple](../Speech/minimax-en-apple.json)。

ReadingCore 的完整双阶段班/山分别86/92分通过。此证据证明首批示范链路可用，不等于所有儿童口音识别准确率已实测。

## 再生成与密钥边界

`scripts/generate-demo-audio.py --list` 只列出任务、不联网。默认只生成 apple、班、山三个样本；`--all` 生成全部缺失资源。脚本按已验证来源进行缓存，以 SHA-256 校验实际文件。`manifest.json` 保留任务、明确合成文本、模型、音色、音频时长和校验值，便于复核来源。

私有配置仅从 `.local-voice/minimax-tts.env` 进程内读取，禁止打包/提交。只允许官方 HTTPS endpoint，拒绝重定向；远端错误只记录固定状态码，不打印原始异常/响应/Authorization。累计调用上限120次，额度或频率错误立即停止，不自动购买、充值或更换付费模型。首批批量请求曾遇1002频率超限，按官方错误表确认后增加至少3秒请求间隔，并只对该失败条安排一次有因重试；已经缓存的音频不重复生成。

官方依据：[同步语音合成](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)、[国际版同接口](https://platform.minimax.io/docs/api-reference/speech-t2a-http)。

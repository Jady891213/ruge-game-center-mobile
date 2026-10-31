# 游戏中心背景音乐与音量底座验收

本次新增五首本地原创背景音乐，网页与原生共用曲目 ID；音乐默认开启、增益 0.22。音效沿用旧默认 0.70，音效音量不改变音乐、音效开关或震动开关。未使用在线音乐生成 API或第三方采样。

## 音轨与来源

音轨目录为 `app/assets/shared/music/`，`README.md` 解释风格与再生成方式，`manifest.json` 记录来源、完整旋律事件、BPM、时长、实际编码器、峰值、RMS、循环边界与 SHA-256。五首均为 CC0-1.0 原创程序作曲/DSP合成，保留完整生成器 `scripts/generate-background-music.py`。

| ID | 时长 / 秒 | 解码 RMS / dBFS | 峰值 | 首尾最大步进 |
| --- | ---: | ---: | ---: | ---: |
| meadow | 38.400 | -20.866 | 0.43631 | 0.00331 |
| orchard | 34.284 | -20.043 | 0.42885 | 0.00211 |
| paper | 36.924 | -20.114 | 0.43291 | 0.00134 |
| cloud | 41.740 | -20.612 | 0.43494 | 0.00187 |
| starlight | 35.556 | -21.129 | 0.42629 | 0.00348 |

默认 0.22 增益后 RMS 约 -33 至 -34 dBFS。没有噪声鼓点、大鼓或单音持续重复；十六小节各自指定旋律，并使用少量不同乐器与和声。音色偏好与手机扬声器上的实际听感仍需用户试听。

## 接口与生命周期

`GameMusic(Context,SharedPreferences)` 注册为 `RugeMusicNative`；JS 接口为 `setTrack(String)`、`play()`、`pause()`、`stop()`、`setEnabled(boolean)`、`isEnabled()`、`setVolume(double)`、`volume()`、`setSuppressed(boolean)`、`status()`。宿主调用 `foreground(boolean)`、`release()`。

`setTrack` 只接受五个固定 ID，文件路径由原生拼接，不接受网页传入任意路径或 URL。Music 偏好键为 `music-enabled` 与 `music-volume`，与音效和震动分离。`status` 在正式构建只返回 `{}`。素材由 `AssetManager.openFd` 读取，APK 中 OGG 需保持未再压缩。

所有 MediaPlayer 创建与访问在主 Looper 串行执行。异步准备使用原子 token 加播放器身份双重检查；离开页面、切曲、后台、暂停、销毁会立即使旧 token 失效，准备中的播放器直接 release，不在 Preparing 状态调用 stop/reset。前台恢复或焦点归还都不会自行复活已暂停/退出的页面。API 21–25 使用旧 AudioFocus，26+ 使用 AudioFocusRequest；任何焦点丢失都停止，不和录音或其他应用抢播。不设置系统媒体音量，不新增权限。

网页 `RugeMusic` 提供 `enabled/volume/setEnabled/setVolume/select/suspend/resume/stop/state`。`rugeMusicV1` 镜像设置；原生存在时以原生保存值为准。所有20个入口、子HTML、设置及历史入口有固定映射；脑力五类通过 `ruge:brain-game` 选不同曲目。浏览器 autoplay 失败仅在真实 pointerdown 后重试。

录音、评测、示范语音、生命周期与 visibility 各持有独立暂停理由。只有所有理由清空后才恢复；最后一次 resume 总会清除原生 suppression，覆盖原生独立录音保护。`pagehide` 停止并阻止迟到手势恢复；bfcache 的 persisted pageshow 可重新选择。`cover=1` 完全不读写偏好、不创建音频、不调用原生桥。

## 已执行验证

- `node --test tests/shared-music.test.mjs tests/shared-feedback.test.mjs`：18 项通过。覆盖所有入口/子页选曲、脑力五类、路径白名单、音量持久与开关独立、重叠暂停、autoplay 迟到、pagehide/bfcache、封面静默、音效实际网页增益。
- 其中 Java harness 编译执行真实 `GameMusic.java` 与 `GameFeedback.java`；可控 Android stub 验证全部 MediaPlayer 访问处于主 Looper、Preparing 状态不调非法方法、陈旧回调不响、API21/26焦点、后台恢复、销毁、全部播放器释放、实际 SoundPool 播放/更新增益、音量零时保留震动及独立偏好。
- `python3 scripts/generate-background-music.py --check`：五首解码后的时长、峰值、RMS、首尾边界和 SHA-256 与 manifest 一致。
- `node scripts/verify-music-browser.mjs`：真实 Chromium 成功解码五首双声道 OGG，HTMLAudio currentTime 递增，每次只有一首播放；实际元素音量0.11、音效0.35、震动仍开；重叠录音/示范暂停、零音量手势、离页后静默通过，页面无异常。结果见 `music-browser.json`。浏览器、context、自建HTTP server 均在 finally 关闭。

Java stub 和桌面 Chromium 不代表手机扬声器主观试听、Android WebView 前后台/音频焦点实体验收；最终手机证据由本轮主验收记录补充。

## 官方依据

- [MediaPlayer 官方 API](https://developer.android.com/reference/android/media/MediaPlayer)：同线程和 Looper、状态机、prepareAsync、release。
- [Android 音频焦点](https://developer.android.com/media/optimize/audio-focus)：API26 AudioFocusRequest、焦点丢失停止、API35前台约束。
- [Android 支持的媒体格式](https://developer.android.com/media/platform/supported-formats)：Ogg/Vorbis 的内置解码支持。

已通过 Context7 查询 Android 官方资料，并核对以上官方页面。

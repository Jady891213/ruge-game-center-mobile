# 游戏中心离线中文关键词运行库

只用于全应用共用的中文固定口令。没有远程服务、下载时运行脚本或每游戏各装一套运行库。

## 实际分发

- `classes.jar`：官方 sherpa-onnx **v1.13.8** AAR 中的 Kotlin/Java API 声明，Apache-2.0。
- `kotlin-stdlib-2.2.21.jar`：JetBrains 官方 Maven，Apache-2.0，保留 NOTICE。
- `jni/arm64-v8a/libonnxruntime.so`：该官方 AAR 的 ONNX Runtime **1.28.2**，MIT；保留上游 ThirdPartyNotices。
- `jni/arm64-v8a/libsherpa-onnx-jni.so`：本项目从 **sherpa-onnx v1.13.8 固定源码自行重建**，仅保留 KeywordSpotter/OnlineStream/VersionInfo JNI。关闭 TTS、说话人分离、C API、PortAudio、Websocket、测试与可执行程序。不是官方完整 JNI 的改名副本。
- `app/assets/voice-model/`：官方 WenetSpeech 3.3M mobile 中文关键词模型的 int8 encoder/joiner、fp32 decoder/tokens，Apache-2.0；`keywords.txt` 是本项目配置。

官方完整 JNI 含不需要的 TTS 组件，因此最终没有分发该 JNI、c-api、cxx-api 库，也未分发 Piper/eSpeak-NG 数据或代码。构建后检查了动态依赖、JNI导出与字符串；结果和固定源码改动见 `native-build.json`、`native-kws.patch`。应用只分发两个必要 `.so`，`scripts/voice_dependencies.py` 强制白名单并逐文件校验 SHA-256。

## 固定源码、许可与重建

- 所有实际文件、模型、来源与哈希在 `sources.json`。
- 第三方正文在本目录 `LICENSE-*.txt` / `NOTICE-*.txt` / `ThirdPartyNotices-onnxruntime.txt`，同文本复制到 APK 的 `assets/voice-model/licenses/`。
- JNI 用到或构建时引用的上游包括：kaldi-native-fbank、kaldi-decoder、kaldifst、OpenFST、simple-sentencepiece（Apache-2.0）；KissFFT（BSD-3-Clause）；nlohmann/json（MIT）；Eigen（MPL-2.0，保留声明）；静态 C++ 运行时来自 Android NDK r27d，保留对应工具链 NOTICE。
- 重建脚本：`python3 scripts/build-voice-native.py --ndk /path/to/ndk-r27d --cmake /path/to/cmake --ninja /path/to/ninja --jobs 4 --install`。
- 固定 NDK r27d revision **27.3.13750724**。本机使用官方 macOS DMG，只读挂载运行，没有复制到系统 SDK。官方下载、校验值、编译参数、依赖源/哈希均在 `native-build.json`；CMake **3.31.6**、Ninja **1.11.1.4** 仅安装于项目临时目录。
- 中间目录为项目根 `TMP to delete-voice-build`；完成后可卸载本次挂载并删除。运行库已提交后日常 APK 构建不需要 NDK/CMake/网络，只需原有 aapt2/javac/d8 链。

这是固定关键词识别，不是自由语音助手。中文儿童发音与设备延迟以实际测试为准。

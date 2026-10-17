## 离线中文口令与共享声音输入

- sherpa-onnx **v1.13.8**：Apache-2.0。Java/Kotlin API wrapper 从官方固定 AAR 提取；Android arm64 JNI 从同版固定源码自行裁剪重建，仅提供 KeywordSpotter / OnlineStream / VersionInfo，关闭 TTS、说话人分离、PortAudio、Websocket 与 C API。未分发官方完整 JNI、Piper/eSpeak-NG 代码或数据。
- 中文 WenetSpeech **3.3M mobile** 关键词模型：Apache-2.0；保留 int8 encoder/joiner、fp32 decoder 与 tokens，本项目配置固定口令词表。模型出处与 SHA-256 在 `vendor/voice/sources.json`。
- ONNX Runtime **1.28.2**：MIT，保留其 ThirdPartyNotices。Kotlin stdlib **2.2.21**：Apache-2.0，保留 NOTICE。
- 本次 JNI 构建依赖：kaldi-native-fbank、kaldi-decoder、kaldifst、OpenFST、simple-sentencepiece（Apache-2.0）；KissFFT（BSD-3-Clause）；nlohmann/json（MIT）；Eigen（MPL-2.0，保留声明）；Android NDK r27d 静态 C++ 运行时（对应 LLVM/NDK NOTICE）。

完整许可、固定源码链接、编译选项、原生依赖/导出检查和实际文件哈希见 `vendor/voice/`；修改补丁 `native-kws.patch` 与重建脚本 `scripts/build-voice-native.py` 随仓库提供。许可文本也随 APK 打包于 `assets/voice-model/licenses/`。最终仅分发一份共享 ONNX Runtime 与 KWS JNI，未给每个小游戏重复打包。

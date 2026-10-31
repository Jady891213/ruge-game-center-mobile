# 游戏中心原创背景音乐

这五首音轨为本项目离线程序作曲与 DSP 合成，没有调用在线音乐生成 API，没有下载或使用第三方录音、采样、MIDI 或已有曲目的旋律。每首独立写出 16 小节旋律，常规和声上叠加不同音色、分解和弦与轻柔中音根音，没有噪声鼓点或大鼓。

| ID | 名称 | 主要风格 | BPM | 循环时长 |
| --- | --- | --- | --- | --- |
| meadow | 薄荷小花园 | 柔和钟琴与拨弦 | 100 | 38.400 秒 |
| orchard | 木果小步舞 | 木琴与短拨弦 | 112 | 34.284 秒 |
| paper | 纸船拨弦 | 温暖拨弦与轻柔琶音 | 104 | 36.924 秒 |
| cloud | 云朵慢慢想 | 柔软合成轻键与和弦 | 92 | 41.740 秒 |
| starlight | 星星小机关 | 圆润八音盒与木琴应答 | 108 | 35.556 秒 |

均为 Ogg/Vorbis、32 kHz、双声道。循环长度对齐 Vorbis 的 128 帧边界，尾音与空间反射环绕写回起点。BPM 是标称值，帧对齐造成的节拍差异小于 0.01%。解码 RMS 约 -20 到 -21 dBFS，默认音乐增益为 0.22，不修改系统媒体音量。

`manifest.json` 保存完整旋律事件、谱面参数、生成器 SHA-256、实际 FFmpeg/编码器版本、每首 OGG 的 SHA-256、大小、解码峰值/RMS 与首尾接缝步进。来源始终为本项目原创合成；许可见 [LICENSE.txt](LICENSE.txt)。

在仓库根目录运行：

```sh
python3 scripts/generate-background-music.py
python3 scripts/generate-background-music.py --check
```

脚本依赖开发机已有的 NumPy 和 FFmpeg；APK 运行不需要它们。本机 FFmpeg 9.0.2 不含 libvorbis，因此使用其原生 Vorbis 编码器；若存在 libvorbis 则优先使用。固定相同生成器、NumPy 与 FFmpeg 编码器版本时可复现。不同编码器版本可能产生不同字节，重生成会同步刷新 manifest，不应把旧 SHA 继续用于新文件。

原始谱面、音色算法与混音全部保存在 `scripts/generate-background-music.py`，不另留中间 WAV 或采样缓存。此处只保留实际打包的 OGG 与来源清单。

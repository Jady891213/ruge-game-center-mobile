# 游戏中心本地构建

正式版使用 APK 内的 assets，开发版支持设备外部 dev 页面与 WebView 调试；只在外部开发资源变化时于回前台刷新，普通后台恢复保留游戏状态。两种构建保留 `com.dsh.gamecenter` 和原签名，当前版本由 `app/AndroidManifest.xml` 定义为 4.2 / 25。

## 构建

需要 Python 3、JDK、Android Build Tools 35.0.0 和 Android 35 的 android.jar。

新机器可运行 `python3 scripts/setup-sdk.py` 下载固定的 Build Tools 35.0.0 与 Android 35 平台 revision 2。下载源为 Google 官方，大小和 SHA-1 固定为官方 `repository2-1.xml` 提供的值（2026-10-04 核对）；校验成功后才解包。`--plan` 只显示下载计划。本机已有工具链，本次验证没有重新下载 SDK。macOS 包里的 aapt2 / zipalign 同时包含 arm64 和 x86_64；Linux CI 使用官方 Linux 包。

```bash
python3 scripts/build.py
python3 scripts/build.py --dev
```

产物分别为 `out/game-center-v4.2.apk` 和 `out/game-center-v4.2-dev.apk`。同名 JSON 记录 APK 和各网页资源的 SHA-256、版本及签名验证结果。构建临时目录 `TMP to delete-build` 在成功或失败后都会清理；存在该目录时不会启动第二个构建。

脚本只构建和验证，不安装。每次构建先复制 app 快照；正式发版时应在修改全部完成后构建，安装后再做真机验收。

## 工具链与签名位置

默认查找 `.local-tools/android/build-tools/35.0.0` 与 `platforms/android-35/android.jar`，也兼容本次解包后的 `android-15` 和根下 `android.jar`。

Mac 默认使用已经安装的 JDK 18.0.2.1。Linux 或其他机器可传参，或设置 `GAMECENTER_JAVA_HOME` / `JAVA_HOME`。不依赖 Android Studio 或手机上的 Termux 工具链。

签名默认读取仓库外的 `../../04-私有签名/Game-Center/release.keystore` 及同目录 `store-password.txt`，原证书别名为 `flappy`。密码通过 apksigner 的 `file:` 参数读取，不进入命令日志或仓库。密钥和密码文件应单独保管；重新生成密钥将不能覆盖安装旧应用。

```bash
python3 scripts/build.py \
  --java-home /path/to/jdk \
  --build-tools /path/to/sdk/build-tools/35.0.0 \
  --android-jar /path/to/sdk/platforms/android-35/android.jar \
  --keystore /private/path/release.keystore \
  --password-file /private/path/store-password.txt
```

等价环境变量为 `GAMECENTER_BUILD_TOOLS`、`GAMECENTER_ANDROID_JAR`、`GAMECENTER_ANDROID_SDK_ROOT`、`GAMECENTER_KEYSTORE`、`GAMECENTER_PASSWORD_FILE`、`GAMECENTER_KEY_PASSWORD_FILE`、`GAMECENTER_KEY_ALIAS`。私钥密码与证书密码不同时，另传 `--key-password-file`。版本可用 `--version-name` 和 `--version-code` 覆盖，默认以 manifest 为准。

## 验证与 CI

构建步骤为官方 aapt2 compile/link → javac → d8 → ZIP 组装 → 官方 zipalign → apksigner。脚本检查签名、对齐、包名、版本、resources.arsc 未压缩、assets 与构建快照逐文件一致，并确认正式版不包含 WebView 调试调用。

CI 使用相同固定工具版本，通过受保护的签名文件和密码文件构建；这些输入以及 `.local-tools`、`out` 均被 Git 忽略。构建脚本只需 Python 标准库；SDK 安装脚本需要 Python 3.9 或更新版本。当前提供的是可重复执行的构建链和可追溯的内容校验，不承诺跨工具版本产生逐字节相同的 APK。

官方参考：[AAPT2](https://developer.android.com/tools/aapt2)、[D8](https://developer.android.com/tools/d8)、[zipalign](https://developer.android.com/tools/zipalign)、[apksigner](https://developer.android.com/tools/apksigner)。

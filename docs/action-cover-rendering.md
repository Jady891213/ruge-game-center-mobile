# 游戏中心动作游戏封面生成

小鸟、恐龙、青蛙的游戏入口预览直接调用本页实际 Canvas 角色和场景绘制函数。首页使用由这些函数生成的 PNG。修改角色美术后重新生成封面，再构建 APK，保持入口、首页和游戏中角色一致。

## 本机从源码生成

在游戏中心项目根目录执行：

```sh
python3 scripts/render-action-covers.py
```

需要本机已安装 Google Chrome 或 Chromium，可用 `--chrome /path/to/browser` 指定。脚本打开各页 `?cover=1&w=600&h=360`，生成 1200 × 720 像素图片：

- `app/assets/shared/flappy-bird.png`
- `app/assets/shared/dino-runner.png`
- `app/assets/shared/frog-pond.png`

浏览器使用独立的 `TMP to delete-action-covers-*` 临时配置目录。每张完整 PNG 写出后立即关闭本次启动的进程组；异常和超时同样清理。不会使用或关闭用户已有的浏览器。

## 从手机开发版的当前页面导出

当手机已经打开对应的新版游戏页，可用只读取画布的 CDP 导出方式。使用现有 `scripts/phone-cdp.py`，需开发版 APK、可用 ADB、Python `websockets` 和明确的设备序列号：

```sh
export GAME_CENTER_SERIAL='当前设备序列号'
python3 scripts/export-action-cover.py flappy-bird
python3 scripts/export-action-cover.py dino-runner
python3 scripts/export-action-cover.py frog-pond
```

每条命令前先在手机打开对应游戏；脚本会检查当前页，不自动导航。默认 ADB 路径与 `phone-cdp.py` 相同，可用 `GAME_CENTER_ADB` 覆盖。仅调用 `window.__actionPreview.export(1200,720)`，输出到上述 PNG 路径，结束时自动移除本次 ADB 转发。不能在另一个操作者切页面或安装 APK 时并行执行。

## 页面接口

```js
window.__actionPreview.draw(canvas, 600, 360, 2);
window.__actionPreview.export(1200, 720); // PNG data URL
```

`draw` 和 `export` 使用固定预览姿态，直接复用真实 `drawBird` / `drawPlayer`、地面、障碍和装饰函数，不复制另一套角色。绘制所需的全局引用和尺寸在 `finally` 恢复；预览不推进物理、不改分数或存档。`?cover=1` 模式仅供本地截图，会只显示封面并停止主动画循环。

JS 回归可检查预览前后游戏状态；角色轮廓和封面效果仍需检查实际 PNG 或真机画面。

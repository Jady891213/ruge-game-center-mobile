# 颜色小侦探：设计与接入

## 游戏

面向5～6岁，用后置摄像头把现实中的一小块颜色放进中央方框，稳住后按大相机按钮收集线索。前期认识颜色，后期涉及顺序、不重复分类、相对明暗和短时记忆。全程不需要现实走路，不指定某种罕见实物，不计时淘汰。

| 关 | 内容 | 思考点 |
| --- | --- | --- |
| 1～4 | 红、蓝、黄、绿单色 | 学会取景收集 |
| 5～6 | 一种暖色、凉色 | 火焰/雪花图标表达分类 |
| 7～8 | 红→黄、蓝→绿 | 按顺序完成 |
| 9 | 红→蓝→红 | 颜色可以再次出现，位置顺序要对 |
| 10～11 | 两种不同暖色、不同凉色 | 满足分类，且不能重复 |
| 12 | 黄色后再找两种不重复颜色 | 记住已收集内容并排除 |
| 13 | 亮色→暗色 | 比较明暗 |
| 14～15 | 暗→更亮→更亮、亮→更暗→更暗 | 与上一个线索比较，须保留变化空间 |
| 16～17 | 三色、四色记忆顺序 | 显示3.6秒后遮住，允许“看一眼” |
| 18 | 红→凉色→更亮→黄 | 记忆与两类条件组合 |

全部关卡可以从关卡页选择。没有摄像头或不便寻找实物时可切“颜色卡”，该模式仍使用同一规则，但独立保存练习成绩；不能把颜色卡通关当作摄像头验收。颜色卡提供六色及亮暗渐变，18关均经实际规则搜索可解。

## 摄像头能力边界

- 使用 Android 自带 Camera2 与 ImageReader；不引入图像模型、不联网、不保存或上传照片，不识别任意物体/人脸。
- 后置摄像头，选择约320×240的支持尺寸；约180ms处理一帧。YUV_420_888 按各 plane 的 rowStride/pixelStride 转换，正确释放 Image。
- 取景图先按传感器/屏幕方向转正，WebView 中居中裁为正方形。识别区域与可见中心方框一致，为方形画面的中央24%，均匀采样49点。
- HSV 辅助颜色分类，低饱和灰白不冒充彩色。像素多数一致度不足63%不接受，避免红绿杂色被平均成黄。
- 650ms内连续至少四张新帧、无明显颜色变化才解锁收集；重复轮询同一帧不增加稳定时间，超过1秒的帧不能提交。
- 灯光、白平衡、色纸反光会影响颜色；本功能是儿童颜色观察游戏，不是专业测色仪。相对明暗采用 HSL lightness 的近似比较。

## 主壳接入钩子

1. Manifest 加 `android.permission.CAMERA`，相机 feature 应声明 optional，不加 INTERNET。
2. `GameCamera camera = new GameCamera(this, web); web.addJavascriptInterface(camera, "RugeCamera");`
3. Activity 的 `onResume` / `onPause` / `onDestroy` 转交同名方法。每次页面导航开始调用 `camera.stop()`，防止离开游戏仍取景。
4. `onRequestPermissionsResult` 转交 `camera.onRequestPermissionsResult(requestCode, permissions, grantResults)`；请求码6308。授权后只标记 ready，活跃页面轮询自行继续；后台或暂停不会因授权回调重新打开。
5. 原生桥 `start/stop/snapshot/available`，start 仅允许本地 `camera-color/index.html`，拒绝其他页面。snapshot 给出 running/status/seq/ageMs/pixels/jpeg；没有采样时不伪造数据。
6. 页面负责真实暂停/继续，退出、切到颜色卡、通关时停止摄像头。后台停止并清除取景图，重新回前台必须明确继续。

存档键 `rugeCameraColorV1`，cameraStars / practiceStars 独立，记录RGB线索和关卡，不存JPEG。封面 `?cover=1` 不申请相机、不读写存档。

## 美术与验证

- 原创扁平水獭小侦探由内置 GPT 图片生成工具生成，正式资源 `app/assets/camera-color/detective.png`，完整提示词见同目录 `art-prompt.json`。
- `node --test tests/camera-color.test.mjs`：11项通过，覆盖颜色/灰白/混合场景、过期与重复帧、全部18关可解、损坏存档、练习成绩隔离、模拟原生桥的相机分支稳定/暂停、页面重置、封面无存档副作用。
- GameCamera.java 使用仓库 Android SDK 单独 javac 编译通过；Camera2 兼容创建会话的旧重载有弃用提示，不影响编译。
- 浏览器真实点击“颜色卡”和第一关，320×568 / 392×872 均无页面溢出；截图与按钮位置见同目录 PNG、browser-layout.txt。封面由实际 `?cover=1` 页面生成。独立浏览器在 finally 关闭，本机临时 HTTP 服务同步停止；HTTP/favicon 404 不属于游戏脚本错误。
- 浏览器颜色卡交互不能证明硬件摄像头已验收。最终由集成人员在 MIX 4 验证权限、实时画面、真实色块、方向、拒绝/重试、暂停/返回释放，并记录设备结果。

官方参考：[CameraDevice 输出 Surface](https://developer.android.com/reference/android/hardware/camera2/CameraDevice)、[ImageReader 获取/释放最新图像](https://developer.android.com/reference/android/media/ImageReader)、[传感器方向](https://developer.android.com/reference/android/hardware/camera2/CameraCharacteristics#SENSOR_ORIENTATION)。Context7 两次查询无对应结果，以上官方 API 文档用于核对。

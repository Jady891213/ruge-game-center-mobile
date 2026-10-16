# 全游戏音效与震动验收（4.15）

## 结果

十款在架游戏统一接入离线音效与原生触觉反馈，正式版4.15 / 38已覆盖安装MIX 4。小熊点心店仍保留原型源码，不恢复合集入口。

合集标题下新增“音效”和“震动”两个大开关，独立保存。按选中、动作、奖励、通关和错误区分反馈；连续动作限频，页面离开/切后台立即停声停震，不补播已取消的奖励。字里找字找到新答案时弹出答案卡与星光，重复答案不重复庆祝。

| 游戏 | 本轮反馈 | 真机触发记录 |
|---|---|---|
| 字里找字 | 选笔、反选、新字奖励、整关奖励、重复与错误提示；答案卡弹出星光 | select、success、select、select、success、select、select、select、win |
| 小小密码箱 | 输入、退格、揭晓、通关；不泄露单个数字位置 | select、select、win |
| 小小调色师 | 滴颜料、撤回、未调对、上色/订单完成 | drop、error、drop、win |
| 森林果汁屋 | 选瓶、倒入、非法目标、单瓶完成、全关完成 | select、pour、select、pour、success、select、pour、win |
| 接水管 | 旋转、撤销、提示、通水成功 | select、select、select、win |
| 看字打拼音 | 输入、错误、答对、关卡完成；保留原TTS | success |
| 重力钢珠 | 开始、果子/道具、护盾、掉洞、通关 | tap、collect、collect、collect、collect、win |
| 扑翼小鸟 | 真实起跳、收集/里程奖励、碰撞、破纪录 | jump、error |
| 小恐龙冲刺 | 真实起跳、落地、收集/里程奖励、碰撞、破纪录 | jump、land、error |
| 小青蛙跳池塘 | 真实起跳、有效落点/奖励、碰撞、破纪录 | jump、collect、error |

## 验证与边界

- `npm test`：149项全部通过。包含真实游戏脚本、共享层限频/优先级、快速纠错、独立设置、异步音频恢复取消、封面静默、暂停/恢复、重复提交和奖励一次性等回归；见 tests.txt。
- MIX 4 Android 14：十款实际页面共43次有效反馈，原生SoundPool均返回有效播放流，Vibrator均成功提交；13个音效已预加载。见 device-feedback.json。字里找字逐笔实际触摸完成一/二/三，水管旋转通关，果汁实际点瓶完成首关，调色先错再改正确，动作游戏真实点按起跳并自然碰撞。
- 拼音输入使用CDP Input.insertText；重力采用真实触摸开始，再诊断放置球到果子/终点并运行实际物理帧，用于核对事件输出，不算人工走完整个迷宫。
- Android振动系统记录包含本包TICK / CLICK / DOUBLE_CLICK / HEAVY_CLICK且状态finished，系统触觉开启、强度中等；音频媒体通道未静音，扬声器64/150，未改变系统音量。见 android-vibration.txt、android-audio.txt。以上证明系统执行链路，不代替人耳音质和手持震感验收；本轮未收到主观强弱反馈。
- 真机分别关闭声音/震动：关闭声音时仅震动计数增加，关闭震动时仅声音计数增加。后台直接调用原生emit也不输出；回前台字里找字仍暂停，需明确继续。
- 首页320×568、392×872布局：两个设置按钮均可见且高度至少48px，无横向溢出，浏览器控制台0错误/0警告；浏览器和本地服务finally关闭。见 home-320.png、home-392.png、browser-layout.txt。
- 真机测试前备份全部16项localStorage；返回合集等待页面离开保存后，精确恢复所有键和值，删除测试新增键，恢复原声效/震动设置；覆盖安装正式版前再次完整比对一致。未卸载、未清应用数据。
- 正式版原包名/原签名覆盖安装，设备APK与本地SHA-256一致：`567fc147e13e80debbdc831504a7a9cf5d498d7e5c66aaa7599e4f9854e42c45`。versionCode38、CDP关闭、debuggable=false、进程正常且无本包崩溃；ADB转发已清理。见 release-check.json、release-home.png。

## 实现

共享API在 app/assets/shared/feedback.js；Android桥在 app/src/com/dsh/gamecenter/GameFeedback.java。SoundPool播放 app/res/raw/ 下原创PCM短音效，可用 scripts/generate-feedback-sounds.py 重建。原生优先受支持的组合/预定义震动，API26波形、旧系统时序兜底。正式版status不暴露诊断计数。仅新增普通VIBRATE权限，保持离线无INTERNET。

官方接口参考：[SoundPool](https://developer.android.com/reference/android/media/SoundPool)、[VibrationEffect](https://developer.android.com/reference/android/os/VibrationEffect)、[Android触觉API](https://developer.android.com/develop/ui/views/haptics/haptics-apis)。

## 本次提交范围

包含此前4.7—4.14已实现并装机、尚未提交的密码箱空白开局/重置、字里找字60关和嵌字画布、拼音横屏、颜料调色、生成美术、森林果汁屋与点心店暂撤，以及本轮4.15反馈层和对应验收。这样远程main可直接构建当前手机版本；原型点心店入口继续撤下。

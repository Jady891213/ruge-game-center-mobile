# 36关列表与屏幕布局验收

## 已验证

- 使用真实 Google Chrome Headless、实际打包页面与独立测试存档，检查 19 个在架入口及翻牌子玩法，共 20 个页面 × 320×568 / 392×872 / 872×392 = **60 个组合**。
- 60 个组合均无页面 JavaScript 异常，无文档横向越界。15 个固定关卡玩法 × 3 尺寸，共 **45 次实际滚动、鼠标点击第36关**，并读取真实游戏状态确认进入第36关。字里找字保留60关，此处验证第36关。
- 第36关颜色小侦探的5个线索三尺寸均完整在屏内。英语额外进入第31关 computer：8个字母、退格、提交及听音按钮三尺寸均在可见区域，未调用专业语音服务。
- 密码箱横屏采用页面纵向滚动；真实鼠标滚轮后，提交按钮位于 y=330、height=48，完整在392高视口内。进入游戏后顶部从零开始，不保留选关列表的滚动位置。

完整测量见 [browser-layout.json](browser-layout.json) 和 [computer专项](browser-english-computer.json)。

## 修复的具体布局问题

1. 密码箱：横屏滚至末关进入游戏时，根滚动遗留造成返回/重置在视口上方。切换页面时复位根滚动，已加回归。
2. 森林果汁屋：横屏原布局第二排瓶子被底部截断。改为左侧场景、右侧玩法，瓶子同排显示；按实际瓶数排布，不改倒入规则。
3. 英语：320宽回退布局的关号换行，顶部突出；压缩页头间距并保持关号完整。computer的双行字母曾把操作区挤出小竖屏，增加小竖屏题目区高度；实际手机仍按现有设定进入横屏。

## 代表截图

- [英语36关列表](browser-english-k-level36-list.png) / [横屏 computer](browser-english-computer-872x392.png) / [小竖屏 computer](browser-english-computer-320x568.png)
- [接水管36关列表](browser-pipe-flow-level36-list.png) / [拼音36关列表](browser-hanzi-typing-level36-list.png) / [横屏拼音题字](browser-hanzi-typing-872x392.png)
- [5条颜色线索](browser-camera-color-320x568.png) / [6瓶横屏果汁屋](browser-forest-juice-872x392.png)
- [天平第36关](browser-animal-balance-320x568.png) / [翻牌第36关](browser-hat-trick-memory-320x568.png) / [密码箱滚动后提交区](browser-code-breaker-872x392-scroll.png)

## 边界与清理

浏览器尺寸检查不等于手机原生返回手势、真实陀螺仪、相机取样、儿童语音或专业云评分验收。口令页面在桌面无麦克风条件下明确切到手指辅助，不计作声音准确率。

每次浏览器均以唯一临时 profile 启动，`finally` 调用项目 `stop_owned_browser` 关闭整个浏览器组，并关闭 HTTP server；结束复查无该 profile 的残留进程。未操作手机，未构建或提交。

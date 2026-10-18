# 共享继续按钮真实指针回归

## 结果

- 19个在架入口及翻牌、专业读音子页，共21个页面。分别在320×568、392×872、872×392用真实Chrome CDP执行mouse down/up与touchStart/End，**126/126通过**。
- 每次均使用实际共享`RugeBack.closePause`创建按钮及遮罩，在该页面真实CSS环境中按下和释放；没有直接调用onclick来代替指针操作。
- 126次按下期间均保持按钮中心位置，允许设计中的约1.28px纵向按压反馈；原触点仍命中按钮。最终resume回调恰好一次，遮罩click次数为0，按钮及遮罩均被移除。
- 另通过接水管、看字打拼音、字里找字的实际游戏暂停方法和实际返回处理器生成继续按钮，mouse/touch **6/6恢复真实paused=false**，验证不只停留在测试回调。

## 旧CSS负对照

仅在浏览器内存把`#rugeBackContinue:active`改回旧class规则，不修改源码。接水管与拼音两页、mouse/touch共4次均重现故障：

- mouse按下后，按钮偏移约75px/34px，原触点命中遮罩，resume未执行。
- touch输入的兼容mouse/up/click阶段落到遮罩，遮罩收到click，resume未执行。浏览器touch的早期pressed采样未必启用`:active`，故同时检查最终兼容事件target与实际回调，不能只凭初次bounds判成功。

因此这套测试可以实际检出原来优先级错误，修正后的126次不会把点击传给遮罩。

## 证据与复跑

- [完整bounds、事件target和状态](browser-continue-pointer.json)
- [接水管修正后mouse pressed](browser-pipe-flow-mouse-pressed.png) / [旧CSS对照](browser-pipe-flow-mouse-old-css-pressed.png)
- [字里找字实际继续](browser-hanzi-puzzle-touch-pressed.png) / [拼音旧CSS touch对照](browser-hanzi-typing-touch-old-css-pressed.png)
- [可复跑脚本](browser-continue-regression.py)：`python3 "docs/Review Android Gesture Followup 4.34/browser-continue-regression.py"`。复用项目Chrome定位/清理函数，需要已有Python websockets；不构建、不碰手机、不请求云服务、不修改app源码。

范围是桌面Chrome的真实鼠标/触摸分发及实际网页处理器，不能代替Android物理侧滑或真人手指设备验收。脚本在finally关闭整个Chrome组与HTTP服务，临时profile自动清理；结束复查无自己的Chrome进程和临时profile残留。

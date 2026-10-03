---
name: html5-mini-game
description: 从零做一个能玩的小游戏（H5/网页/canvas 单文件）：横版跑酷、Flappy、打砖块、贪吃蛇、2048、塔防等。含单文件工程骨架约定、手感调参公式、公平性硬约束（避免"无论怎么操作都过不去"的死局），以及一整套不靠肉眼的无头验证流程（Node 桩件跑真脚本 + 像素回读 + 真机截图）。
---
# 单文件 H5 小游戏：开工 → 调参 → 验证 → 交付

## 0. 何时用

用户说「做个小游戏 / 网页游戏 / H5 小游戏 / 给我做个 XX 游戏 / 复刻某游戏」时。
不限于游戏的"可交互 canvas 玩具"也适用（画板、粒子、物理沙盒）。

## 1. 先定形态，别问太多

**交付物 = 一个 `.html` 文件**：双击即玩、零依赖、零构建、可离线、能塞进任何浏览器/WebView。

- 一个文件里放：HTML 骨架 + `<style>` + 一个 IIFE 包住的 `<script>`。
- **世界用 canvas，HUD/菜单/结算用 HTML overlay**。理由：canvas 文字在不同 DPR 下糊，HTML 文字锐利、好点、好做磨砂玻璃和字号。
- **不引任何外部资源**：图形用 canvas 图元画（`arc/ellipse/arcTo/fillRect`），音效用 WebAudio 现场合成，字体用系统栈。
- 游戏参数全部**从 W/H 推导**（见 §2），不写死像素，才能一套代码适配手机竖屏/横屏/侧栏小窗。

## 2. 骨架必须有的 8 件事

1. **DPR 感知的 layout()**：`cv.width = W*DPR`，`ctx.setTransform(DPR,0,0,DPR,0,0)`，之后全部按 CSS 像素画。
2. **单位缩放**：`U = clamp(W/390, 0.78, 1.4)`，所有尺寸乘 `U`。小窗不糊、大屏不缩。
3. **输入**：`pointerdown/pointerup`（绑在容器上），加键盘兜底（Space/↑/W）。CSS 必须 `touch-action:none` + `overscroll-behavior:none`，事件里 `preventDefault()`。
4. **rAF 主循环 + dt 钳制**：`dt = min(dt, 1/30)`，否则切后台回来会跳一大帧。
5. **visibilitychange 暂停**，并把 `lastT = 0` 复位。
6. **resize / orientationchange 重排**（orientation 延迟 ~220ms 再量）。
7. **WebAudio 音效**：`AudioContext` **必须在首次用户手势后创建**，否则被浏览器挂起；用一个 `blip(f1,f2,dur,type,vol)` 包住振荡器+包络就够了，不需要任何音频文件。
8. **localStorage 最高分** + 一个静音开关。

关键几行骨架：

```js
function layout(){
  const r = cv.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height);
  DPR = clamp(devicePixelRatio||1, 1, 3);
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  L.U = clamp(W/390, 0.78, 1.4);
  // 之后所有常量都 = 系数 * L.U
}

function frame(t){
  requestAnimationFrame(frame);
  if (paused) { lastT = 0; return; }
  if (!lastT) lastT = t;
  let dt = (t - lastT)/1000; lastT = t;
  if (dt <= 0) return;
  if (dt > 1/30) dt = 1/30;
  update(dt); render();
}
```

## 3. 手感：用公式反推常数，不要瞎试

先定"感觉"，再解方程：

| 想要的感觉 | 怎么算 |
|---|---|
| 跳跃高度 ≈ k 倍身位、滞空 ≈ T 秒 | `g = 8·h/T²`，起跳初速 `v = g·T/2` |
| 变高跳（按住更高） | 松手时 `if (vy<0) vy *= 0.6` |
| 抛物线弹射 | 固定发射速度 + 重力，命中靠拖拽角度 |
| 无限跑酷的障碍间距 | **必须按 `速度 × 滞空时间` 动态算**，不能写死像素 |

**速度曲线**：`speed = min(maxSpeed, speed + accel*dt)`，`accel = baseSpeed * 0.03` 左右 → 约 25–35 秒到顶。
间距用**距离**而不是时间来排（`distSinceSpawn >= nextGap`），这样速度变化时间距自动跟着走。

## 4. 公平性硬约束（最容易被忽略，这里踩过实坑）

**规则 1：相邻关卡要求的位置差 ≤ 玩家在两次障碍之间物理上能做到的位移。**
否则随着速度变快、间距时间变短，必然出现「无论怎么操作都过不去」的死局。

```js
// 把"能做到的位移"先算出来，再拿去限制关卡生成
flapRise  = v*v / (2*g);            // 单次操作净位移
climbRate = flapRise / (|v|/g);     // 连续操作的最大移动速率 px/s
timeGap   = spacing / speed;        // 两根障碍之间的时间
step      = clamp(climbRate * timeGap * 0.5, 下限, 取值范围);  // 0.5 是安全系数
gy = clamp(gy, lastY - step, lastY + step);
```

**规则 2：单次操作的位移必须显著小于"安全区半径"，要留余量。**
实坑：单次拍翅净升幅 **62.7px**，而管口的安全半径恰好只有 **62.8px** → 容错为零，按一下就贴壁。
修法：把管口放大到安全半径 71.5px、初速从 455 降到 425（升幅 54.7px），留出 ~17px 余量。

**规则 3：先算后做。** 改了重力/初速/间距任一参数，都要重算一次上面的两个约束。

**验证有没有效**：写个自动驾驶（§5.2），看同一份"笨 AI" 的分数和死亡率有没有明显变化。本项目实测：修之前最高 9 分 / 100 秒死 15 次，修之后最高 24 分 / 只死 5 次。

## 5. 验证：不靠肉眼

### 5.1 语法先过

```bash
python3 -c "import re,sys;h=open('game.html',encoding='utf-8').read();open('c.js','w').write(re.search(r'<script>(.*?)</script>',h,re.S).group(1))"
node --check c.js && rm -f c.js
```

### 5.2 无头桩件：把**真脚本**跑起来（核心手段）

不要重写成"可测试版本"——用桩件驱动交付文件本身。

```js
// smoke.mjs  用法: node smoke.mjs game.html
import fs from 'node:fs';
const code = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(process.argv[2]||'game.html','utf8'))[1];

// ① 注入探针：在 IIFE 收尾 })(); 之前插一行，把内部状态暴露给测试
//    ⚠️ state / player / score / items 必须换成**你脚本里真实存在的变量名**
//    （忘了就先 grep 一下 var 声明）。名字写错不会报错，只会让探针读到 undefined。
const HOOK = "\nglobalThis.__dbg={get state(){return state},get y(){return player.y}," +
             "get vy(){return player.vy},get score(){return score},L:()=>L,items:()=>items};";
if (!/\}\)\(\);\s*$/.test(code)) throw new Error('找不到 IIFE 收尾');
const patched = code.replace(/\}\)\(\);\s*$/, HOOK + '\n})();');

// ② canvas 上下文用 Proxy 全部吃掉
const ctx = new Proxy({}, {
  get: (t,k) => k in t ? t[k]
    : k === 'createLinearGradient' ? () => ({ addColorStop(){} })
    : () => {},
  set: (t,k,v) => (t[k] = v, true),
});

// ③ DOM 桩件（记录事件回调，由测试自己触发）
const mk = () => { const ls = {}; return {
  classList:{add(){},remove(){},toggle(){},contains:()=>false}, style:{},
  getBoundingClientRect:()=>({width:390,height:844}),
  addEventListener:(t,f)=>((ls[t]||=[]).push(f)), listeners:ls,
  closest:()=>null, getContext:()=>ctx, width:0, height:0,
  set textContent(v){this._t=v}, get textContent(){return this._t},
};};
const els = {};
for (const id of ['cv','stage','score','hi','mute','startScreen','overScreen',
                  'finalScore','finalSub','newhi','hint','startBtn','againBtn']) els[id] = mk();
const winL = {};
const doc = { getElementById:(id)=>els[id]||null,
  addEventListener:(t,f)=>((winL[t]||=[]).push(f)),
  body:{classList:{add(){},remove(){},toggle(){}},style:{}}, hidden:false };
const win = { devicePixelRatio:2, addEventListener:(t,f)=>((winL['w:'+t]||=[]).push(f)) };
const ls  = { _d:{}, getItem:k=>ls._d[k]??null, setItem:(k,v)=>ls._d[k]=String(v) };

// ④ 可控 rAF
let pending = null;
new Function('window','document','localStorage','requestAnimationFrame','setTimeout',patched)
  (win, doc, ls, f => { pending = f; }, () => 1);

// ⑤ 开局 + 自动驾驶
els.startBtn.listeners.click[0]({ stopPropagation(){} });
const press = () => els.stage.listeners.pointerdown?.[0]?.(
  { preventDefault(){}, target:{ closest:()=>null } });

let t = 0, errs = 0, best = 0;
for (let i = 0; i < 6000; i++) {
  t += 16.7; const f = pending; pending = null; if (!f) break;
  try { f(t); } catch (e) { if (++errs < 4) console.log('帧'+i, e.message, e.stack.split('\n')[1]); }
  // —— 按你的游戏规则写自动驾驶，用 __dbg 读数决策 ——
}
console.log('异常', errs, '| 分数DOM', els.score.textContent);
```

**要点**：
- 桩件里 `setTimeout` 可以吞掉（不执行），避免干扰帧驱动。
- 桩件测试跑不到的分支 ≈ 白测。写自动驾驶去**主动覆盖**计分/关卡生成/状态切换/死亡重开。
- 调试自动驾驶本身时常见错误：只在下落时操作会**永远升不上去**（一个完整操作周期净位移为 0）——需要在接近抛物线顶点（`vy > -阈值`）时补一次。

### 5.3 "画面是不是白的"：像素回读，别信截图

**截图通道可能返回整张 `alpha=0` 的空帧**——预览里看着是纯白，实际是抓帧失败，不是你的画布没画。
判断"画布有没有画"要用**程序证据**：临时插一段诊断，把 canvas 真实像素写进 DOM 再读出来。

```js
// TEMP-DIAG：验证完立刻删
diagF++;
if (diagF % 15 === 0) {
  const d = ctx.getImageData(Math.round(W*0.5*DPR), Math.round(L.groundY*0.3*DPR), 1, 1).data;
  elHint.textContent = 'diag sky=' + d[0] + ',' + d[1] + ',' + d[2];   // 写进 DOM 才能被读出来
}
```

读到 `sky=210,235,255` 这种**和调色板对得上的值**，才叫证明。

### 5.4 真机 / 真实渲染

- 起静态服务时**只服务专门目录**（把游戏复制进 `games/`），绝不要 `--directory` 指向整个工作区——那会把会话文件和 `.sessions` 暴露到局域网。
- 后台任务起服务，然后 `curl -o /dev/null -w '%{http_code}' http://<LAN_IP>:<port>/` 验证**局域网 IP**可达（回环通了不代表手机浏览器能开）。
- 真实设备截图（ADB/Shizuku）才是实打实的；需要"关卡元素在画面里"的截图时，**另做一个临时演示页**（注入自动驾驶、关掉碰撞），截完删掉，正式文件一个字不动。

### 5.5 收尾

探针、演示页、临时脚本截完就删。交付目录只留：游戏文件 + 预览图（+ 可选测试脚本）。

## 6. 交付前检查清单

- [ ] `node --check` 通过
- [ ] 桩件 6000 帧 0 异常，且**确认覆盖到**计分 / 关卡生成 / 死亡重开 / 特殊道具
- [ ] 像素回读证明有绘制（不是靠截图看着像）
- [ ] 真机或真浏览器跑通完整闭环：开始页 → 游戏中 → 死亡 → 重开
- [ ] 竖屏 + 横屏各跑一次
- [ ] 公平性两个约束重算过（改过任何物理参数都要重算）
- [ ] 服务只暴露游戏目录；给用户一个能直接开的 URL
- [ ] 交付目录干净（无探针、无演示页、无 `__pycache__`）

## 7. 常见坑（都踩过）

| 坑 | 现象 / 修法 |
|---|---|
| `ul{display:inline-block}` | 后面的 `<button>` 会跟它挤在同一行 → 改 `display:block; width:max-content; margin:0 auto` |
| HUD z-index 低于遮罩 | 开始页把分数/静音按钮盖住、点不到 → HUD `z-index` 要高于 `.screen` |
| emoji 当唯一图标 | 无 emoji 字体的 WebView 里渲染成豆腐块/空白 → 重要图标用 canvas 画或纯 CSS |
| `env(safe-area-inset-top)` 进 `calc()` | 个别 WebView 不支持会让整条声明失效 → 一定写兜底 `env(x, 0px)` |
| 回后台没清 `lastT` | 回前台首个 `dt` 巨大，物体瞬移 → `visibilitychange` 里 `lastT = 0` |
| canvas CSS 尺寸与像素尺寸混用 | 画面模糊或被裁 → CSS 交给 `width:100%/height:100%`，像素只由 JS 设 |
| AudioContext 提前创建 | 被浏览器挂起没声音 → 首次 `pointerdown` 里再创建 |
| 障碍间距写死像素 | 速度一涨就变成无解或过于稀疏 → 按 `速度 × 滞空` 算 |
| 只在下落时操作（写 AI 时） | 永远升不上去 → 接近顶点时补一次操作 |
| 拿截图当渲染证据 | 空帧 `alpha=0` 会被误判成白屏 → 用 `getImageData` 回读 |


---

## 可验证性设计：让"卡死"这种 bug 无处藏身

### 教训一：**测试和实现必须共用同一个模型**

我做汉字拼字游戏时第一版测试 15 项全绿，但游戏**真的会卡死**。原因：

```
我的模拟：把「卡片」当单位    （桌上有 3 张木，够拼）
真实代码：把「一次拖拽」当单位（拖 A 到 B，B 被吞掉但只记了 A）
```

两个模型不一致 → 测试测的是**我自己写的那套规则**，不是游戏真正跑的规则。
**修法**：从 HTML 里把真引擎**抽出来跑**，绝不重写一遍。

```html
<script>
/* ════ ENGINE-START ════ */
const sameSet = ..., isSubset = ...;
function newGame(i){...}
function tryDrop(g, ch, target){...}
function invariantHolds(g){...}
/* ════ ENGINE-END ════ */
// 下面才是 DOM 层
</script>
```

```js
// 测试里用标记抽取，不靠正则猜
const engine = src.slice(src.indexOf('*/', src.indexOf('ENGINE-START')) + 2, src.indexOf('ENGINE-END'));
const { LEVELS, newGame, tryDrop, invariantHolds } =
  new Function(levelsCode + engine + '\nreturn {LEVELS,newGame,tryDrop,invariantHolds};')();
```

### 教训二：**用不变量 + BFS 穷举，而不是"随便跑几次"**

会卡死的游戏，不变量是：

> **答案里还差的部件，必须都还在手上。**

只要它成立，关卡就一定拼得完。然后**穷举所有可达状态**逐个检查：

```js
const seen = new Map([[key(start), start]]), queue = [start];
while (queue.length) {
  const g = queue.shift();
  if (!invariantHolds(g)) violated++;              // ← 就是这里抓到 bug
  if (!g.done && g.free.length === 0) deadEnds++;  // 桌上没牌却没拼完 = 死局
  for (const [ch, tgt] of allLegalMoves(g)) { ... }
}
```

**再加一条回归**：把旧的有 bug 的规则摆回来，断言这套测试**判它死**。
不这么验，你永远不知道测试有没有牙齿。

### 教训三：**不要让"内容可见"依赖动画或定时器**

两个真实翻车：

| 写法 | 翻车方式 |
|---|---|
| `@keyframes grow{0%{opacity:0}}` | WebView 动画被节流/冻结 → 元素**卡在第一帧 = 全透明**，字整个看不见 |
| `setTimeout(()=>showReveal(), 330)` | 后台/被冻结的页面里定时器不跑 → 揭晓页**永远不出现** |
| `setTimeout(()=>suppressClick=false, 80)` | 定时器不跑 → 这个标志**永远卡在 true** → 点击彻底失效 |

**规则**：
- 动画**只动 transform，不要动 opacity/filter**（冻结时至少看得见）
- 动画幅度收在"冻结也读得清"的范围：`scale(.78)→1` 而不是 `scale(.2)→1`
- 关键内容**立刻切换**，视觉节拍交给 CSS transition（不跑也只是"没动"，不是"没有"）
- 用**时间戳**代替 `setTimeout` 做"刚拖完忽略这次 click"这类状态

### 教训四：卡片用真 `<button>`

`<div>` + 事件委托的点按区**在无障碍树里不存在** —— 自动化工具（和读屏）都看不见。
换成 `<button>` 后：好点、可聚焦、可键盘操作，而且**浏览器自动化能真的点到它**，
端到端测试才做得起来。

### 教训五：测试环境本身会骗你

AI 浏览器的 WebView **不在前台时 Chromium 会把整页冻结**：定时器、rAF、CSS 动画全不走。
表现是"点了没反应""内容不出现"，但**真机上完全正常**。

判据：调试条显示状态已变（`done=true`）但画面没变 → 是环境冻结，不是逻辑错。
**定时/动画相关的东西，最终必须在真机上确认。**


---

## 交付流程：HTML 先行，**用户确认**后再移植（别再犯）

### 血泪教训

我第一版汉字拼字游戏，写完只跑了「自己写的模型」（15 项全绿）就移植进 APK 交付。
结果游戏**在三部件关卡必然卡死** —— bug 在**用户手机上**被发现，不是在我这儿。

```
我的模拟：卡片是单位        真实代码：一次拖拽是单位
两者不一致 → 我测的是自己的假设，不是游戏
```

**代价**：一轮 APK 构建（2 分钟 + 5 次工具往返）+ 用户的信任。
同样的事在 HTML 里是**刷新一下**。

### 正确流程（五步，别跳）

| 步 | 在哪 | 做什么 | 成本 |
|---|---|---|---|
| ① | HTML | 随便改，反复迭代 | **秒级** |
| ② | HTML | 我这边验证：抽真引擎跑 BFS/穷举 + 浏览器真点击走完整流程 | 秒级 |
| ③ | HTML | **★ 给用户确认 ★** —— 起服务给 URL，让他真玩一遍 | 分钟级 |
| ④ | APK | **一次性**移植，把设备专属项**全放进去** | 2 分钟 |
| ⑤ | APK | 只验设备专属项；之后 HTML 微调走**开发版热更新** | —— |

### 关键：第 ③ 步不能省

**「我测通了」不等于「用户确认了」。**
② 只能证明**没坏**（不崩、不卡死、逻辑对），**证明不了好玩**：
手感、按钮大小、节奏快慢、字够不够大 —— 这些只有真手指能判断。

所以第 ③ 步要**主动停下来**：起个静态服务，把 URL 给用户，让他玩完再说。
**不要自己觉得差不多了就往下走。**

### 关键：第 ④ 步别挤牙膏

设备专属的东西**一次列全**，别一轮加一个：

```
□ 原生 API 桥（TTS / 震动 / 文件…） + 诊断接口（失败原因要能读出来）
□ 权限声明
□ 全屏 / 挖孔 / 常亮 等窗口设置
□ 图标 / 应用名 / 版本号
```

我 TTS 排查拆了 3 次增量（先 available()，再 status()，再多语言回退），
**第一次就该全放进去**。

### 关键：第 ⑤ 步用开发版，别重建

HTML 侧的微调走**开发版热更新**（见 skill `android-apk-build` §6）：
把文件写进 `/sdcard/Android/data/<pkg>/files/dev/`，切回前台就生效，**零重装**。
只有**改了 Java** 才需要重新构建。

### 哪些必须在真机上验（HTML 做不到）

| 类别 | 例子 |
|---|---|
| 原生 API | TTS、震动、权限、通知 |
| 真实手感 | 按钮大小对不对、拖拽顺不顺、动画快慢 |
| 性能 | 真机 WebView 的帧率、内存 |
| 系统交互 | 返回键、全屏、锁屏后恢复 |

**其余全在 HTML 里解决。**

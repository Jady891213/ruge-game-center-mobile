# 脑力游乐园：实现约定

20种参考规则见任天堂官方 https://www.nintendo.com/tw/switch/azlsa/stretch/ 。原创界面和素材，不打包任天堂代码、美术或商标。原版研究与儿童改编分开记录。

## 模块接口

`core.js` 先加载，创建 `window.BrainSchool`（Node VM也能加载）。各类别脚本注册4个玩法：

```js
const B=window.BrainSchool;
B.register({id, name, category, icon:0,
 create(level,rng) { return JSON可序列化题目; },
 check(question,answer) { return 布尔值; },
 solution(question) { return 一个可通过check的答案; },
 mount(stage,question,api) { return {update(elapsedMs,dtMs){},destroy(){}}; }
});
```

- level为1～10；无关卡上限。rng为有种子的0≤rng()<1函数，不用Math.random替代。
- 题目必须变化、可解，不能随机出无解局；所有答案从题目关系推导。测试解答独立校验约束，不只让solution调用check自证。
- api.answer(value)提交给真实check，正确后宿主换题；错误留题、扣分并反馈。输入监听先检查api.active()。
- api.mistake()错误反馈与扣分；api.fx(name)共享反馈；api.now()当前题的有效毫秒数。
- update只在本局运行且前台调用，暂停期间有效时间不增加。阶段切换、洗牌、记忆展示由update驱动，不用裸setTimeout。
- destroy必须取消自己的监听/资源；宿主换题时移除stage全部子节点。不要给window挂长久监听。
- B.el(tag,className,text)创建元素；B.symbol(id,size=64)返回生成图集的物品元素；0猫/1狗/2鸟/3鱼/4兔/5蛙/6苹果/7香蕉/8车/9船/10花/11星。
- B.rand(rng,min,max)含两端；B.pick(rng,array)、B.shuffle(rng,array)返回洗牌副本；B.sample(rng,array,n)不重复采样；B.sameSet(a,b)比较集合；B.svg(markup,viewBox='0 0 320 260')创建SVG。
- B.choices(stage,items,handler,columns=3)：items为{value,label?,symbol?}数组，返回按钮数组；handler(value,button)。B.prompt(stage,text)短题目。
- 可用共用CSS：.prompt/.choices/.tile/.selected/.scene/.row/.big-number/.primary/.secondary/.muted/.status/.symbol。每类独有CSS放各自css文件，前缀memory-/analysis-/visual-。
- 交互UI无答案属性/调试答案按钮。测试可通过window.__brain.state()/start(id,seed)/definition()/question()读取状态，验收必须实际触摸/点击并触发对应交互。
- 宿主管理60秒挑战、分数/连击/难度、开始/暂停/结果/再来、最高分、返回层级、后台暂停。每题正确至少100分随难度增加；错误扣分有节流；难度依据正确数逐步提升，不能永久卡在初级。

## 文件归属

- 主代理：core.js、app.js、index.html、style.css、identify.js/css、compute.js/css、素材、合集接入、总体测试与设备。
- 记忆代理：memory.js/css及tests/brain-memory.test.mjs。
- 分析代理：analysis.js/css及tests/brain-analysis.test.mjs。
- 知觉代理：visual.js/css及tests/brain-visual.test.mjs。

所有测试可用node:vm建立window全局读取真实core.js和类别文件；不要改原测试。禁止代理操作手机、提交、切分支或更改共用接口。

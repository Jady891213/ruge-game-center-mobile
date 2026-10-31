# 本地玩家与独立进度

首页玩家按钮支持新增、切换、改名、选头像和清空所选玩家进度。重置先显示含玩家名的确认页；取消不写存储。名字 1—8 个 Unicode 字符、不可重名，最多 20 个本地玩家。切换后重载首页，最近记录随玩家切换。320×568 保留固定顶栏、左分类和右侧双列。

这是一台设备内的玩家档案，没有联网账号、密码、认证或云同步。音效、音乐、音量、常亮、原生设置和服务配置继续全局共用。

## 接口与保存方式

`shared/players.js` 必须在每个页面的游戏脚本之前执行。`shared/players-ui.js` 提供 `RugePlayersUI.mount()`，首页 `home/index.js` 调用一次；UI 模块只在首页加载。

`window.RugePlayers` 提供：

- `current()`、`list()`：返回 `{ id, name, avatar, active }`，不返回存档内容。
- `create(name, avatar)`：新增空档案并返回它，保持当前玩家；首页 UI 随后调用 `select` 切换。
- `select(id)`：快照当前玩家、交换目标进度物理槽、返回选中玩家。
- `rename(id, name, avatar)`、`reset(id)`：修改档案或清空目标的进度。UI 在调用 reset 前明确具名确认。
- `progressKeys`、`avatars`：只读白名单。
- `state()`：当前玩家、epoch、是否已持久化、文档是否过期、cover 和错误状态。

默认档案 ID 为 `default`、名字为“小玩家”。仅加载与读取接口不创建 `rugePlayersV1`，原有游戏数据逐字节保留。首次管理操作才将当前游戏进度归入默认玩家。其它游戏保持原 localStorage 键，所有交换由玩家模块执行。

档案库是 `rugePlayersV1/schema1`，包含 active、epoch 和 profiles。当前活动档案的快照在下一次管理操作前可能落后于游戏物理键，因此备份必须包含整个 localStorage，不能只导出档案库。

事务日志为 `rugePlayersTransactionV1`。先保存旧/新库和物理槽，再交换物理键，最后原子写入新库作为提交点。异常按提交点回滚或补全；恢复失败保留日志并阻断游戏进度读写，下次页面启动继续恢复。`cover=1` 不创建档案库、不恢复日志、不允许游戏写进度。

每个文档记录启动时玩家身份和 epoch。切换及当前玩家重置增加 epoch；旧页面的进度 `getItem` 返回 null，`setItem/removeItem/clear` 拒绝操作，避免迟到的异步保存或 pagehide 覆盖新玩家。pageshow、原生 resume 和 storage 事件发现过期文档会返回首页。Storage 的 key、length、枚举以及 sessionStorage 保持正常；localStorage.clear 仅清当前玩家的明确进度键，保护其它玩家、未知键与全局偏好。直接写/删玩家库键也被保护。

所有现有游戏使用 getItem/setItem 方法。未来新增游戏必须加入 progressKeys，并继续使用方法访问；直接 `localStorage.someKey = value` 不经过此门禁。当前架构针对单个原生 WebView 的本地活动玩家，不提供跨设备同步或多个首页同时操作的分布式事务。浏览器调试恢复全量快照时，需在不加载玩家模块的同源受控空页/空 iframe 中取得原生 Storage 方法执行。

## 明确的 30 个进度键

| 范围 | 键 |
| --- | --- |
| 首页与旧统计 | `rugeCenter`, `rugeStat` |
| 脑力与英语 | `rugeBrainSchoolV1`, `rugeEnglishKingdomV1` |
| 天平、帽子与翻牌 | `rugeAnimalBalanceV1`, `rugeHatTrickV1`, `rugeToyMemoryV1` |
| 声音与探宝 | `rugePitchFlightV1`, `rugeVoiceQuestV1`, `rugePocketRadarChallengeV1` |
| 摄像头、果汁与密码 | `rugeCameraColorV1`, `rugeForestJuiceV1`, `rugeCodebreakerV1` |
| 水管与重力 | `gardenFlowV2`, `rugeMarbleMazeV1`, `rugeNumberMergeV1`, `rugeTiltStarBoxV1` |
| 汉字与调色 | `rugeHanziStrokesV1`, `rugePaintMixingV1`, `hzTypingSave2`, `rugeHanziReadingV1` |
| 动作分数 | `flappyDashBest`, `frogPondHi` |
| 保留历史与迁移输入 | `rugePocketRadarV1`, `rugePitchAdventureV1`, `rugePitchEndlessV1`, `rugeBearSnackShopV1`, `rollingGardenV2`, `hzPuzzleProgress1`, `dinoDashHi` |

新存档常量有源码扫描回归保护。未知键全部留在物理存储中，既不交换也不重置。

## 验证与边界

`node --test tests/players.test.mjs tests/home-library.test.mjs` 验证默认零写、30键来回精确恢复、全局配置保留、具名/头像编辑、重置目标隔离、逐写入 quota 失败、真实交易日志的所有崩溃截面恢复、旧页面迟到写门禁、清空安全与 cover 零写。

`node scripts/verify-players.mjs` 启动独立 localhost 服务和本机 Chrome，使用合成数据与隔离 browser context，finally 关闭所有 context、browser、server。结果见 [players-browser-check.json](players-browser-check.json)：

- 320×568、392×872：实际点击新增/编辑/选头像/切换、30键A/B切回精确相等、取消与确认重置、全局设置保留、返回关闭弹层和双列布局无横向溢出。
- 实际密码箱点击第一关与数字 1 生成存档；切换后旧页 setItem 和 pagehide 保存被挡，默认玩家的原存档切回相等，旧页 pageshow 返回首页。
- 在真实 Chrome 的原生 Storage 入口注入 QuotaExceededError，验证即时回滚、持续失败日志保留、cover 不恢复日志和下一文档精确恢复。
- 填满独立 Chrome origin 的真实 localStorage quota，验证首次档案操作拒绝写入且原有进度/全部键不变。
- 页面错误为 0；不接触用户真实浏览器档案、手机或私有存档。

这是桌面 Chrome 的网页层验收。本记录不代表 Android 实机触摸、软键盘或覆盖安装验收。

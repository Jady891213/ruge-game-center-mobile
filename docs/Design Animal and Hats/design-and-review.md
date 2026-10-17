# 动物天平桥与帽子小捣蛋

## 内容与入口

| 项目 | 动物天平桥 | 帽子小捣蛋 |
|---|---|---|
| 游戏 ID | `animal-balance` | `hat-trick` |
| 页面 | `app/assets/animal-balance/index.html` | `app/assets/hat-trick/index.html` |
| 关卡 | 18 | 18 |
| 存档键 | `rugeAnimalBalanceV1` | `rugeHatTrickV1` |
| 核心 API | `window.AnimalBalance` | `window.HatTrick` |
| 页面检查入口 | `window.__game` | `window.__game` |
| 封面模式 | `animal-balance/index.html?cover=1` | `hat-trick/index.html?cover=1` |

两款为离线 HTML/CSS/JavaScript，规则唯一实现在各自 `core.js`，页面交互在 `game.js`。共用既有 `shared/feedback.js` 与原生导航；没有 npm 运行时包、远程脚本或在线图片。

## 动物天平桥

点动物放上右盘；点盘中动物取回，左下角可整盘取回；点“称一称”观察轻重。界面只有图片线索、关卡数字与短动作词。动物真实重量隐藏，不把动物身体大小当作重量提示。

- 1～5关：从一条等价关系逐步增加到两三条，组合不同动物。
- 6～9关：盘位与动物重量关系变化，需要看当前线索并试称。
- 10～12关：限定正好几只。盘位与点数提示匹配，等重但数量不符不算通过。
- 13～18关：两座桥共用库存，需要考虑分配。第一桥平衡后仍可取回重分配；只有两座桥同时称平才通关。桥图标与1/2显示当前操作对象，已平衡显示勾。

存在多解的关卡接受所有合法解，不限制为维护文档中的一组答案。求解器使用真实 `place()`、`weigh()` 判定，18关逐一验证；完整分配见 [关卡答案](level-solutions.md)。

称重过程保持动物清晰，不用禁用按钮的整体透明度淡化角色；等待动画期间不接受重复动作。重来只重置本关草稿，已获得星数与其他游戏存档保留。

## 帽子小捣蛋

先观察动物的位置，点“藏好啦”后看帽子逐对移动，最后点帽子找目标。帽子沿分开的弧线路径换位，动画结束才提交真实交换；控制点限制在棋盘内，避免两顶相同帽子沿完全相同路线重合。

- `track`：先给一只目标，跟住它。
- `late`：观察和换位时只给问号，全部换完才公布目标，需要记住更多位置。
- `pair`：找两只目标，任意顺序。
- `order`：按图示箭头依次找两三只，当前目标有边框。

从3顶扩展到6顶；4顶采用2×2，其余多顶采用3列。换位保持900～1000ms，没有依靠持续提速制造难度。找错只抖动、震动，帽子保持覆盖；找对才揭开且保留。

暂停完整遮住棋盘与目标。换位中断后从原始布局重新观察、重播整轮；答题阶段暂停后继续保持覆盖，不借暂停展示当前答案。重看为主动操作，不清已解锁关卡。

## 原创美术

内置 `image_gen.imagegen` 生成六动物透明图集，随后按小尺寸可读性清理重绘。最终 PNG 1254×1254，RGBA，位置为 `app/assets/animal-balance/art/animal-atlas.png`；帽子游戏引用同一份，避免重复打包。

角色顺序为小鸟、兔子、狐狸／小猫、企鹅、小熊。完整提示词、重绘要求、来源与哈希见 [art-prompts.json](art-prompts.json)。CSS按实测的上下排边界截取图集，避免相邻排的脚或细线残片；未对 PNG 做代码抠图或描摹替代。

当前封面由真实 `?cover=1` 页面截图，文件为本目录 `animal-balance-cover.png`、`hat-trick-cover.png`。集成端可用既有 `scripts/render-game-covers.py` 加入这两个 ID 后重新生成到 `shared/`。

## 验证与边界

- `node --test tests/animal-balance.test.mjs tests/hat-trick.test.mjs`：17项通过，覆盖36个关卡求解、真实页面连续过关、库存守恒、错误结果、顺序任务、暂停、草稿校验与封面不写存档。
- 浏览器在320×568、392×872检查两款共16组布局；可操作按钮不越界、页面不横向溢出，真实称重/找帽子与暂停恢复通过。JSON见 `browser-check-result.json`，同名截图按游戏/关卡/视口保存。
- `verify-browser.py` 按正常动画时长、真实按钮点击两款全部36关，并逐关点“下一关”、验证三星保存及最终回选关。逐关结果见 `browser-ui-all-levels.json`；使用规则求解器获得点击方案，没有直接设置胜利状态或加速时间。
- 浏览器验证脚本使用独占命名会话、本地127.0.0.1临时服务器；`finally` 关闭浏览器与服务器，临时日志/profile目录自动清除。`--layout-only` 可在美术调整后仅重跑布局与代表性交互。
- Node VM不验收像素、真实音频或手机生命周期；浏览器结果不代替MIX 4设备安装与触觉验收，后者由主集成统一进行。

## 集成清单

主集成维护首页与封面生成脚本：加入 `animal-balance`（益智）和 `hat-trick`（益智或反应）入口，封面从真实页面生成。保留原生外壳、包名、签名及旧存档。两个新存档完全独立，封面模式不读取或写入它们。

`window.__game` 提供 `start/menu/state/progress/pause/resume/isPaused/storageKey`；动物另有 `add/take/weigh/chooseBridge/bridge/busy`，帽子另有 `hideAnimals/pick/replay/busy`，便于主集成做设备检查。

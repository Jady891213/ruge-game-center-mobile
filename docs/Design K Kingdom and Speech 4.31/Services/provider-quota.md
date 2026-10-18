# 游戏中心 4.31 服务状态与套餐余量

## 本轮结果

- 新增原生 `RugeServices`，只有前台打包页 `file:///android_asset/settings/index.html` 可读取服务状态、显式刷新和打开固定官方控制台。它不提供录音、音频、签名、API key，也不接收任意 URL。
- 腾讯云评测显示设备私有配置状态；本轮**未接入自动资源包余量查询**，余量未知，去官方控制台查看。没有用“10000减本机调用数”代替账户真实余额。
- MiniMax 的官方只读套餐接口真实 GET 成功，返回共享五小时窗口与周窗口的百分比及重置时间。调用瞬间为五小时 **99%**、周 **2%**；这是一次有时间戳的快照，以手机显式刷新后服务端值为准。
- 真正云调用次数由供应商计费。专业拼读一题最多主评测＋末字声调两次请求，不把一题误算作一次；MiniMax 示范已打包离线，日常播放本地示范不调用合成接口。

## MiniMax：真实数据与口径

官方 Token Plan FAQ 公开 `GET /v1/token_plan/remains`，本轮使用已验证的官方国内 API 域名 `https://api.minimax.cn/v1/token_plan/remains`，Authorization 仅在原生 HTTP 头中。

返回重点字段：

| 服务端字段 | 设置显示 |
|---|---|
| `model_remains[].model_name=general` | 全模型共享套餐；缺少 general 不猜某个单独模型就是全局 |
| `current_interval_remaining_percent` | 五小时窗口剩余百分比 |
| `current_weekly_remaining_percent` | 本周剩余百分比 |
| `end_time` / `weekly_end_time` | 各窗口重置时间，毫秒时间戳 |

实际响应中 total_count/usage_count 都是零，但百分比分别为 99/2，因此不能把这些零解释为无余量、无限次数，或显示为调用次数。解析严格接受数值整数百分比 0–100；缺字段、字符串、非整数、NaN、不支持的模型结构均不造数。

[官方 Token Plan 使用与查询说明](https://platform.minimaxi.com/subscribe/coding-plan)；当前国内控制台入口固定为 [套餐用量](https://platform.minimax.cn/user-center/payment/token-plan)。本轮只一次只读余量 GET，不购买、不改套餐、不切后付费。真实白名单结果见 `minimax-quota-live.json`，没有账户标识、API key、授权头或完整原始响应。

## 腾讯云：发现的能力与边界

官方新版 [可授权资源类型](https://cloud.tencent.com/document/product/1774/127634) 和 [访问管理指引](https://cloud.tencent.com/document/product/1774/127636) 明确列出 `soenew:DescribePidOrders`（控制台资源包列表）。所以不能说供应商完全没有此能力。

本轮未找到其公开 API 请求域名、签名版本、参数/返回 schema；官方 Python `soe/v20180724` SDK 只有 InitOralProcess、KeywordEvaluate、TransmitOralProcess、TransmitOralProcessWithInit，未包含该控制台 action，新版 speech SDK 是评测 WebSocket。不能把 CAM 权限动作名称直接当作已验证的、稳定可集成的公共余额 API。

因此本轮没有对未知接口猜参数调用，也没有访问全账号账单或其他产品资源。`DescribeResourcePackageList` 搜索结果来自 TDSQL-C 数据库，不属于 SOE；`GetQpsQuota`、`DescribeQuotaPkgs` 是并发/QPS配额，不是已购调用次数。UI 为“暂未接入自动余量查询”，通过 [口语评测新版控制台](https://console.cloud.tencent.com/soenew) 查看真实余额。

官方源码核对：[SOE Python SDK](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/soe/v20180724/soe_client.py)、[新版 speech SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-python/tree/master/soe)。后续若获得该产品正式余量协议可增加 adapter，不使用未经确认的内部控制台协议长期嵌入 APK。

## 原生与页面契约

- `RugeServices.read()` 返回 JSON 字符串 `{version,services:[{id,name,status,configured,quota,updatedAt,error}]}`。
- id 仅 `tencent-soe`、`minimax-token-plan`；未配置不请求。MiniMax 配置后首次状态 stale，没有虚构余量。
- `refresh(id)` 异步返回是否受理；只由设置页显式点按，不在游戏、read轮询、应用启动时自动请求。每30秒最多刷新一次；HTTP连接/读取各5秒，响应最大64KB，不跟随重定向，错误响应体不输出/保存。
- quota 为 `{remaining,total:100,unit:'%',expiresAt,weeklyRemaining,weeklyTotal:100,weeklyExpiresAt,windowLabel,weeklyLabel,expiresLabel}`。两个时间均是重置时间，不是套餐失效时间。
- 后台、导航、退出取消连接并增加 generation；迟到请求不回写状态。失败保留原快照及更新时间，以 offline/error 标识，不以0替代未知。
- `openConsole(id)` 仅打开代码内两个固定官方 URL；不包含充值、购买、修改权限、修改后付费等操作。

## 私有配置

继续使用原有 Android Keystore AES-GCM 配置，增加可选 `minimaxToken`。DEV 私有 provisioning 脚本从 `.local-voice/minimax-tts.env` 读取，写入时不输出内容；已有腾讯配置保留。未传 MiniMax 可选项时保留设备原有该项。

`GameAssessment` 的配置布尔值和 token 仅提供给同包原生代码，相关辅助方法没有 JavascriptInterface；设置页不能调用评测签名/采集。中文朗读与英文游戏的原录音白名单未扩大。

## 验证

- 实际全部 Java 源码 Java8/Android35 编译通过：`java-compile.txt`。
- 3项 Node 原生检查通过，含原有评测 Java 内部回归，以及直接运行实际余量解析方法：零count/双窗口、缺失general、缺字段、字符串/小数/非法范围、固定URL白名单。
- 设备 Keystore 配置、真实手机显式刷新、后台取消和外部浏览器返回由根任务唯一设备操作者继续验收；本代理未操作手机。

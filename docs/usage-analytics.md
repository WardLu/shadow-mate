# 使用统计与云端业务报表

未登录使用不要求同步。没有云端记录不能证明停用；浏览器使用统计与家庭业务事实分别分析。

## Sentry 接收端与启用条件

已在现有组织 `shadow-we` 创建独立 [shadow-mate 项目](https://shadow-we.sentry.io/projects/shadow-mate/)；不混入 Shadow Size，也不使用共享 Supabase。公开 DSN 由 `config/usage-analytics.json` 提供，CSP 只允许该项目 ingest origin。DSN 不是管理凭据，禁止加入私密 API token。

使用事件直接按 [Sentry Logs 协议](https://develop.sentry.dev/sdk/telemetry/logs/)上报；错误监控使用固定版本 `@sentry/browser`，只安装 GlobalHandlers 集成。不开启 Session Replay、Tracing、Console、Breadcrumbs、自动会话、用户反馈或 AI 功能。Logs 官方提供免费额度，实际账号额度以 Sentry Billing 为准；本次未升级、未开启付费试用。

仅正式域名 `https://sm.shadow.wang` 上报；localhost/Preview/缺配置均不上报。默认开启，家长可在“设置 → 隐私”关闭，此前明确关闭的偏好保持有效。DNT/GPC 或本机存储不可用时不上报。本人及测试人员关闭以排除自己的浏览器。关闭同样停止错误上报；开关文案保持简短，完整说明在隐私页。

## 查看入口与免费额度

- 使用统计：[Explore → Logs](https://shadow-we.sentry.io/explore/logs/)，项目下拉选择 `shadow-mate`，环境选择 `production`，搜索 `sm_`。`sm_local_open` 表示未登录浏览器打开应用，不等于有效打卡或活跃家庭。
- 错误监控：[Issues](https://shadow-we.sentry.io/issues/)，选择 `shadow-mate` 和 `production`。没有 Issue 不代表所有操作都成功；这里只收集符合过滤条件的未处理错误。
- 应用内“设置 → 隐私 → 使用统计”只控制上报，不展示统计看板。

[Sentry 官方说明](https://sentry.zendesk.com/hc/en-us/articles/37503692223003-What-is-the-pricing-for-Sentry-Logs)：所有套餐每月包含 5 GB Logs，Developer 免费套餐不支持配置按量付费预算。页面顶部“Try Logging for free / Start trial”是可选的 14 天无限日志试用，使用已有免费额度无需启动试用。额度由同一组织内项目共享，当前用量和套餐以 Settings → Subscription / Billing 为准。本次未开启试用或升级。

## 事件与局限

前缀 `sm_local_` / `sm_signed_in_` / `sm_unknown_` 表示未登录/已登录/尚未确认登录状态。只发送固定事件名，绝不关联 Auth、家庭或孩子 ID：

| 事件尾部 | 意义 |
| --- | --- |
| `open` | 已允许统计的浏览器打开应用，非激活 |
| `view_home` / `view_learning` 等模块名 | 模块切换，非有效行为 |
| `checkin` | 有效打卡本机保存成功，撤销不计 |
| `point_recorded` | 正常正负积分本机保存成功，撤销不计 |
| `active_day` | 当天上述一种核心操作成功；浏览/兑换不产生它 |
| `reward_redeemed` / `reward_fulfilled` | 本机兑换/兑现成功，非云端确认 |

使用每日标记去重；支持 Web Locks 的浏览器会跨标签页串行上报，限制同一浏览器/当地日期/状态/类别最多一次。不支持 Web Locks 的旧浏览器同时打开多个标签页时可能重复，分析仍须按浏览器/日期/类别去重。次数不是点击次数。随机浏览器标识最多保留 30 天，可跨日关联，属于去身份化统计，**不是家庭人数**。同一家庭多设备会重复，清存储/撤回再允许/标识轮换会打断留存。关闭会移除本机标识和标记，不删除服务端已收历史；历史删除须在接收端另行处理。

不使用 identify、自动采集、录屏或设备指纹。日志请求仅含公开 DSN、固定事件名、随机标识、时间、日期、模式和产品/环境/模块元信息。每页随机 trace_id 仅满足日志协议，不发送性能 trace。版本 2 的 ingest_settings 明确设置 infer_ip/infer_user_agent 为 never。不发送学习状态、儿童资料、邮箱、积分值、自由文本、URL 或来源；省略凭据及 Referrer。

请求失败不影响学习，无持久离线队列。完全离线、拦截器、网络阻断会漏计；HTTP 成功不证明后台可查询。数据只覆盖未关闭统计且请求到达的浏览器，不能拿全部 Vercel Visitors 作分母，也不能与家庭表直接拼接。

## 建议分析口径（尚未创建业务看板）

1. 近 7/30 天核心操作独立浏览器数，分 local/signed_in/unknown；混合状态总数按 usage.browser_id 去重，不能直接相加。
2. `active_day` 每日独立浏览器和核心操作后的浏览器留存；看板统一 Asia/Taipei，注明浏览器当地日期去重的边界差异。
3. 模块访问到核心操作的浏览器漏斗，兑换/兑现单列。

正式域名 CSP 已核对，国内网络可达性仍未验证。Logs 可按项目及 `sentry.environment:production` 筛选；属性 usage.event / usage.mode / usage.browser_id / usage.day 用于分组及去重。日志额度限制和 HTTP 429 会退避，不重试刷量。HTTP 接收成功不等于后台已可查询。历史未采集的本地行为不能还原。

## 错误诊断边界

GlobalHandlers 捕获未处理异常和 Promise 拒绝。beforeSend 每次检查同一个统计偏好，并重建事件白名单：错误类型、固定说明、本站 /assets 或 /src 下 JavaScript 路径及行列号。移除 URL 参数、自由文字、上下文、变量、user、request、breadcrumbs 和其他标签。第三方/扩展错误、无可识别本站栈的错误不上报。此过滤会减少诊断信息；已捕获并处理的云同步失败不自动成为 Sentry Issue。

不上传 Source Maps，因此构建后通常只能定位压缩文件行列号；后续若要映射源码，需要独立配置构建上传和受限管理凭据。接收端与 CSP 通过仓库公开配置交付，生产发布仍使用既有受控入口。

## 云端业务报表

现有家庭业务报表与浏览器统计分别分析。家庭报表只能看到已同步记录；统计使用固定事件和随机浏览器标识，不与家庭、账号或学习者表关联。本人和测试流量须在各自分析来源排除。自然周活跃家庭与浏览器有效使用日不是同一指标。

## 已上线状态（2026-10-10）

应用 v1.5.8 已通过受控脚本部署到 [sm.shadow.wang](https://sm.shadow.wang/)，生产分支 `production`，提交 `1fdc59f964f14b7ce12b97cc469f711e9335ddaa`。候选部署和正式域名的 8 个 JS/CSS 资源已逐字节校验，移动端默认开启与关闭后刷新持久化已验收。功能及版本 CI、CodeQL 和独立审查通过；发布验收器的大资源下载超时已修复并通过定向契约与实际资源验收。

Sentry Logs 已可查询 `sm_local_open`；`sm_setup_verified` 属于接收端验证数据，分析时应排除 `setup-validation` 环境。这只证明有使用事件到达，不代表已建立活跃或留存指标，也不能还原历史未采集的本地行为。尚未创建业务看板，未上传 Source Maps；国内网络可达性及告警通知投递仍未验证。此次发布未修改共享生产数据库，已有 SQL 报表的替换和实际查询状态需单独核对。

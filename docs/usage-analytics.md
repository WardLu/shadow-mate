# 使用统计与云端业务报表

未登录使用不要求同步。没有云端记录不能证明停用；浏览器使用统计与家庭业务事实分别分析。

## Sentry 接收端与启用条件

已在现有组织 `shadow-we` 创建独立 [shadow-mate 项目](https://shadow-we.sentry.io/projects/shadow-mate/)；不混入 Shadow Size，也不使用共享 Supabase。公开 DSN 由 `config/usage-analytics.json` 提供，CSP 只允许该项目 ingest origin。DSN 不是管理凭据，禁止加入私密 API token。

使用事件直接按 [Sentry Logs 协议](https://develop.sentry.dev/sdk/telemetry/logs/)上报；错误监控使用固定版本 `@sentry/browser`，只安装 GlobalHandlers 集成。不开启 Session Replay、Tracing、Console、Breadcrumbs、自动会话、用户反馈或 AI 功能。Logs 官方提供免费额度，实际账号额度以 Sentry Billing 为准；本次未升级、未开启付费试用。

仅正式域名 `https://sm.shadow.wang` 上报；localhost/Preview/缺配置均不上报。默认开启，家长可在“设置 → 隐私”关闭，此前明确关闭的偏好保持有效。DNT/GPC 或本机存储不可用时不上报。本人及测试人员关闭以排除自己的浏览器。关闭同样停止错误上报；开关文案保持简短，完整说明在隐私页。

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

## 最小看板与上线验收

1. 近 7/30 天核心操作独立浏览器数，分 local/signed_in/unknown；混合状态总数按 usage.browser_id 去重，不能直接相加。
2. `active_day` 每日独立浏览器和核心操作后的浏览器留存；看板统一 Asia/Taipei，注明浏览器当地日期去重的边界差异。
3. 模块访问到核心操作的浏览器漏斗，兑换/兑现单列。

正式发布后仍需正式域名 CSP 及国内网络可达性验收；当前本地 mock 不证明它们成立。Logs 在 Explore → Logs 中按 project:shadow-mate 筛选；属性 usage.event / usage.mode / usage.browser_id / usage.day 用于分组及去重。日志额度限制和 HTTP 429 会退避，不重试刷量。HTTP 接收成功不等于后台已可查询。历史未采集的本地行为不能还原。

## 错误诊断边界

GlobalHandlers 捕获未处理异常和 Promise 拒绝。beforeSend 每次检查同一个统计偏好，并重建事件白名单：错误类型、固定说明、本站 /assets 或 /src 下 JavaScript 路径及行列号。移除 URL 参数、自由文字、上下文、变量、user、request、breadcrumbs 和其他标签。第三方/扩展错误、无可识别本站栈的错误不上报。此过滤会减少诊断信息；已捕获并处理的云同步失败不自动成为 Sentry Issue。

不上传 Source Maps，因此构建后通常只能定位压缩文件行列号；后续若要映射源码，需要独立配置构建上传和受限管理凭据。接收端与 CSP 通过仓库公开配置交付，生产发布仍使用既有受控入口。

## 云端业务报表

现有家庭业务报表与浏览器统计分别分析。家庭报表只能看到已同步记录；统计使用固定事件和随机浏览器标识，不与家庭、账号或学习者表关联。本人和测试流量须在各自分析来源排除。自然周活跃家庭与浏览器有效使用日不是同一指标。

# Changelog

## [1.3.6] - 2026-08-12

### Fixed
- 修复生产隐私政策被 Supabase Storage 按纯文本返回、浏览器显示 HTML 源代码的问题。
- 将 `/privacy` 和 `/privacy/` 改为 Vercel 静态 HTML 路由，并补充构建产物与响应头回归检查。
- 将隐私页样式移到独立 CSS 文件，兼容生产 CSP。

### Tests
- `npm run verify` 通过；隐私页浏览器回归 1/1 通过；Vercel Preview 返回 `text/html`。

## [1.3.5] - 2026-08-12

### Added
- 增加家长/监护人同意审计和学习者隐私数据访问边界，学习者档案创建必须具备有效同意记录。
- 增加双语隐私说明页面 `https://sm.shadow.wang/privacy`，并将其作为 Vercel 静态构建产物发布。
- 为隐私页增加影伴品牌首屏、成长轨道视觉、数据最小化原则卡片和移动端布局；Vite 本地开发与 Preview 环境同步提供 `/privacy` 路由。
- 页脚首位增加 Shadow Nexus 产品主页链接，并保留社交媒体与隐私政策入口。
- 增加公开仓库提交、推送、PR 和 Release 检查配置与自动化验证。

### Changed
- 将国产 Android 英语朗读兜底使用的 Piper 声音模型切换为 `en_US-ljspeech-medium`，并同步第三方来源与许可证记录。
- 隐私页品牌标识和返回应用入口改用当前站点相对路径，避免本地或 Preview 环境跳转到生产域名。

### Security
- 修复本地 Supabase PostgreSQL 在匿名调用密码状态 RPC 时因执行权限拒绝触发后端崩溃的问题。`learning_has_password()` 现在通过 `SECURITY DEFINER` 进入内部认证检查，匿名调用仍返回 `42501`，不会暴露密码状态。

### Tests
- 数据库 pgTAP 测试恢复为 58/58 通过；单元测试 72/72 通过；构建、公开仓库、安全和 Release 检查通过。

## [1.3.4] - 2026-08-10

### Fixed
- 合并离线英语语音包的下载进度，已知总大小时显示百分比；没有总大小时显示动态下载状态，并支持下载中取消。
- 下载离线语音时提前预热 Piper 引擎，避免下载完成后仍停在“合成中…”或短暂显示“发音未响应”。
- 收口下载、引擎加载和合成失败状态，避免按钮停留在“合成中…”或“发音未响应”，并提供可重试提示。
- 补充 `media-src 'self' blob:`，允许播放本地合成音频；继续只允许必要的 `connect-src blob:` 和 `wasm-unsafe-eval`，不放开 `unsafe-eval`。
- 修复 Vite 开发环境对 `/piper-tts-web.js?import` 的处理，避免本地开发时 Piper 模块被错误返回 500。

### Tests
- `npm run verify` 通过，单元测试 66/66；Piper 开发资源、下载失败、引擎预热和系统语音回退 E2E 均通过。

## [1.3.3] - 2026-08-09

### Fixed
- 修复系统返回英语语音但 `speechSynthesis` 实际无响应时，按钮显示“发音未响应”却不回退本地语音的问题。
- 系统语音超时、报错或抛异常时自动切换到本地 Piper；已缓存语音包时直接合成，不再停在下载弹窗。

### Tests
- `npm run verify` 通过，单元测试 65/65；新增系统语音无响应回退 Piper E2E 1/1 通过。

## [1.3.2] - 2026-08-09

### Fixed
- 修复 macOS Chrome 使用 Piper 离线发音时的 CSP 兼容性：允许 `blob:` 模块加载和 `wasm-unsafe-eval`，不放开 `unsafe-eval`。
- 修复无 GMS Android 下载离线英语语音包时进度长期显示 0 的问题；服务端未返回 `Content-Length` 时显示动态下载状态，并支持下载中取消。
- 修复 Piper 下载失败、CSP 阻断或合成超时后按钮一直停留在“合成中…”的问题，改为显示可重试的错误提示。
- 补充标准 `mobile-web-app-capable` 元标签，消除 Chrome 的弃用警告。

### Tests
- `npm run verify` 通过，单元测试 65/65；离线语音下载失败 E2E 1/1 通过。

## [1.3.1] - 2026-08-09

### Fixed
- 优化系统夜间模式：增加原生暗色主题、深色页面/卡片/控件/账户弹窗配色，避免 Android/Chrome 强制夜间着色造成页面发灰、文字和背景对比失真。
- 根据系统明暗偏好同步浏览器主题色。
- 固定构建链间接依赖 `nanoid` 到 `3.3.18`，消除高危审计告警并保持 CI 安全检查通过。

### Tests
- 新增 3 条夜间模式 Chromium E2E，覆盖首页、交互/指南表面和账户弹窗。

## [1.3.0] - 2026-08-05

### Added
- 国产 Android（无 GMS）英语发音兜底：系统没有英语语音时，首次点“听发音”会提示下载影伴内置的离线语音包（约 90MB，一次性，可离线使用，不上传录音），基于 piper-tts-web / rhasspy/piper 在浏览器本地合成。

### Fixed
- 审计清理迁移 `20260805010000_learning_save_audit_prune.sql` 兼容无 pg_cron 环境：改用 pg_cron 扩展检测 + 动态 SQL，本地/CI 无 pg_cron 时跳过 cron job 创建，不再导致 `supabase start` 失败（有 pg_cron 的生产环境仍正常创建清理 job）。
- 修正 pgTAP 数据库测试 `plan` 数（47→48）与实际断言一致，`test:db` 恢复通过。

### CI
- `security:check` 邮箱白名单加入 `126.com`（README / README.preview.html 以 `wardlu@126.com` 作为联系邮箱），CI verify 不再因 non-example email 报错，分支保护可自动通过。
- CI `supabase start` 增加 3 次重试（间隔 30s）以应对 Docker Hub 匿名拉取限流（`toomanyrequests`），并将 job 超时放宽到 20 分钟。

## [1.2.0] - 2026-08-05

### Fixed
- 根治学习状态冲突风暴：`learning_save_state` 版本冲突不再 `raise`（此前事务回滚会连带撤销同事务的限流计数），改为返回空集并消耗每用户独立的 `save_state_attempts` 限流预算（默认 120 次/60 秒）。冲突风暴因此被硬性限制在约 2 次/秒/用户，无法再绕过写入限流。
- 强制所有在线客户端尽快更新到最新构建：`version-guard` 检查间隔从 5 分钟缩短到 1 分钟，并在检测到新部署时先清空 Service Worker 缓存再刷新，避免旧版本继续运行。
- 前端 profile 残留防护：`loadWorkspace` 会清除指向已不存在 profile 的本地引用（`ACTIVE_PROFILE_KEY`）；`saveCloudState` 在目标 profile 于云端不存在（PGRST116）时熔断自动同步，避免每次编辑都触发一次无效的冲突往返。

### Changed
- 数据库迁移 `20260805000000_learning_save_state_conflict_attempt_rate_limit.sql`：`learning_save_state` 冲突时返回空集（HTTP 200 + 空数组）而非 `40001` 错误。
- 同迁移新增只读审计（`private.learning_save_audit` + `private.learning_audit_conflict`）：每次冲突记录调用者账号/email、目标 profile、期望与当前版本、客户端 IP、User-Agent、路径与时间戳，用于定位风暴来源。
- 前端 `saveCloudState` 将「成功返回空集」识别为版本冲突并走原有冲突处理，同时兼容旧服务端以 `learning_state_conflict` 错误上报的路径。
- 审计表 `private.learning_save_audit` 新增保留策略：仅保留最近 7 天，由 pg_cron job `shadow-mate-cleanup-learning-save-audit` 每日 04:00 UTC 清理（迁移 `20260805010000_learning_save_audit_prune.sql`），防止冲突风暴复发时审计表无限增长。

## [1.1.1] - 2026-08-04

### Fixed
- 冲突熔断：版本冲突达到重试上限后设置 `cloudSyncBlocked`，暂停自动同步，阻止多标签页冲突风暴；用户手动点击同步按钮可清除熔断并重试
- 频控位置修正：将 `learning_save_state` 中 `learning_enforce_rate_limit` 调用从冲突检查之前移到之后，使冲突异常不再回滚频控计数

### Tests
- E2E 新增「熔断后自动同步被阻止」和「手动同步恢复」两个用例
- 数据库测试新增「冲突不消耗频控预算」和「成功写入消耗频控预算」断言

## [1.1.0] - 2026-08-03

### Added
- 新增前端版本热更新与异常自愈检测：定期轮询 index.html 的 script src 哈希变化自动 reload；全局错误滑动窗口计数超阈值时自动 reload（带 sessionStorage 冷却防循环）。
- 新增数据库 RPC 频控机制：`learning_enforce_rate_limit()` 函数以滑动窗口限制每用户高频调用（`learning_save_state` 默认 30 次/60 秒），超限抛出 `learning_rate_limited`，前端给出中文提示。
- 新增邮箱密码登录、共享密码设置/修改、Supabase 官方找回密码流程和密码强度提示。
- 新增 Recovery 多项目邮件模板，根据 `RedirectTo` 显示影伴、影匣、影裁或 Shadow Nexus。
- 新增全局快速连点拦截和云端操作单次执行锁，避免重复创建学习者或重复提交。

### Security
- 新增最小权限 `learning_has_password()` RPC，基于 `raw_user_meta_data` 判断用户是否主动设置共享密码，不依赖 GoTrue 内部 `encrypted_password`（OTP 用户会被自动赋值 bcrypt 哈希），不暴露哈希或其他用户状态。
- 找回密码不自建令牌表，不使用 Service Role 浏览器流程，并使用统一成功文案防止邮箱枚举。

### Fixed
- 修复 GoTrue 在 `verifyOtp` 创建用户时自动生成 bcrypt 密码哈希，导致 `learning_has_password()` 误判 OTP 用户为已设置密码、密码设置弹窗永远不出现的问题。
- 修复 `onAuthChange` 中有密码用户登录后自动打开 dialog 拦截按钮点击的问题。
- 学习状态机忽略缺少 `bookIndex` 的书架/阅读列表操作，避免生成 `undefined` 状态键。
- `learning_state_conflict` 只允许最多 2 次客户端重试并逐次退避，超过上限后停止请求并提示用户，避免冲突死循环。

### Tests
- 补齐学习状态机防御性分支、验证码重发/失败、密码失败、Recovery 回调和家庭创建防重复测试；pgTAP 用真实 bcrypt 哈希模拟 OTP 用户验证密码状态判断；e2e 验证密码设置请求携带 `shared_password_set` 标记；新增 version-guard 纯函数单元测试（script src 提取/比较、滑动窗口错误计数器）；CI pgTAP 新增 RPC 频控边界测试（42/42 通过，限制内通过、超限抛异常、独立 key 互不影响）。

All notable changes to Shadow Mate (影伴) are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.1] - 2026-08-02

### Added
- 新增应用内“使用指南”：覆盖登录、家庭空间、单项打卡、同步、主屏幕安装及 Windows/macOS/iPhone/iPad/Android 语音包下载指引。
- 新增邮箱验证码登录：未注册用户可在 Shadow Mate 内输入 Confirm signup 验证码完成注册，已注册用户也可使用同一流程登录。

### Fixed
- 修复同一模块多个任务共用打卡状态的问题；取消单项打卡不会再影响同模块的其他任务。
- 增强英语发音兼容性：等待异步加载的系统语音、优先选择英语语音，并在 Windows、macOS、iPadOS、iOS、Android 无可用语音或播放失败时给出可操作提示。
- 修复家庭空间弹窗内 Toast 被原生 dialog 遮挡的问题；新增家庭空间最近同步时间，并明确家庭统一管理、学习记录按孩子隔离同步。
- 修复英语单词发音按钮无反馈：增加浏览器能力检测、播放中状态和失败回退提示。
- 修复数感星球缺失数字生成逻辑，避免问号前后跳过两个数字。
- 修复绘本打卡首次点击状态不更新的问题。

### Changed
- 统一 Confirm signup 与 Magic Link/OTP 邮件配置，支持验证码和应用内验证链接；生产模板按请求的 `RedirectTo` 域名识别 Shadow Mate、Shadow Card、Shadow Size，并以 `product_id/product_name` 作为回退。
- 修复共享 Supabase 项目中已有账号的登录邮件回退显示 `Shadow Nexus`；主题和正文按当前请求区分产品，项目级发件人显示名仍保持为 `Shadow Nexus`。
- 今日打卡支持再次点击取消，按钮会明确提示“点击取消”。
- 成长统计统一按语文、数学、英语、绘本四个学习模块计算；首页和成长日历使用 `已完成/4`，不再把同一模块的多个任务误计为多个模块。
- 积分日历补充状态图例与日期网格间距，并明确区分无积分、加分、扣分、混合积分和当前选中日期。
- README 与家长使用指南补充学习模块和两类日历的统计口径。

## [1.0.0] - 2026-08-01

### Added
- PWA 学习打卡应用：四个学习模块（语文、数学、英语、绘本），以及积分打卡、成长记录
- 家长邮箱免密码登录（Supabase Auth magic link）
- 家庭学习空间：一个家长管理多个学习者，随时切换
- 云端跨设备同步：版本化乐观并发控制，冲突自动合并
- 本机离线模式：无需登录即可使用，登录后自动迁移本机数据
- PWA 安装与离线缓存（Service Worker）
- 宽屏自适应布局（平板/电脑/手机共用同一网址）
- 打印 A4 字帖功能
- GitHub Actions CI（verify + CodeQL）及 Dependabot 安全更新

### Security
- CSP 移除 unsafe-inline：内联样式和脚本外置为 app.css / app.js
- 34 处内联 style 属性改为 CSS 类和 CSSOM 赋值
- 静态检查强制禁止内联 style/script 和内联事件处理器
- check.mjs 阻止重新引入 unsafe-inline
- Supabase RLS 家庭级数据隔离；publishable key 公开，RLS 为安全边界
- 共享多租户数据库安全迁移（不改现有商业化表）

### Fixed
- 魔法链接跳转地址修复：emailRedirectTo 使用 origin，匹配 Supabase 白名单
- Vercel Deployment Protection 导致 Preview 无法访问：已关闭 SSO 保护
- 登录邮件模板：从英文默认改为中文，显示产品名称「影伴 Shadow Mate」
- 发件人名称：从「Quick flomo」改为「Shadow Nexus」
- 登录按钮可见性：从隐晉的 ○ 改为绿色「登录」 CTA 按钮
- 用户可见文案中「Supabase」替换为「云端」

### Docs
- README.md 项目概述与本地运行指南
- docs/architecture.md 架构设计与实施方案（v2.1）
- docs/security-baseline.md 安全基线与发布闸门
- docs/auth-setup.md Supabase Auth 配置指南
- PRIVACY.md / SECURITY.md / CONTRIBUTING.md
- TODO.md / ROADMAP.md / CHANGELOG.md
- GitHub Issue 和 PR 模板

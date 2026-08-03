# Changelog

## [Unreleased]

### Added
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
- 补齐学习状态机防御性分支、验证码重发/失败、密码失败、Recovery 回调和家庭创建防重复测试；pgTAP 用真实 bcrypt 哈希模拟 OTP 用户验证密码状态判断；e2e 验证密码设置请求携带 `shared_password_set` 标记。

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

# Changelog

All notable changes to Shadow Mate (影伴) are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- 修复共享 Supabase 项目中已有账号的登录邮件回退显示 `Shadow Nexus`：生产 Confirm signup 与 Magic Link/OTP 模板现按请求回跳域名识别产品，并兼容根域名尾斜杠。

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
- 统一 Confirm signup 与 Magic Link 邮件配置，支持验证码和应用内验证链接，并将多项目模板与本地 Supabase 配置纳入仓库。
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

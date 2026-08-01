# Changelog

All notable changes to Shadow Mate (影伴) are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed
- 修复家庭空间弹窗内 Toast 被原生 dialog 遮挡的问题；新增家庭空间最近同步时间，并明确家庭统一管理、学习记录按孩子隔离同步。
- 修复英语单词发音按钮无反馈：增加浏览器能力检测、播放中状态和失败回退提示。
- 修复数感星球缺失数字生成逻辑，避免问号前后跳过两个数字。
- 修复绘本打卡首次点击状态不更新的问题。

### Changed
- 今日打卡支持再次点击取消，按钮会明确提示“点击取消”。

## [1.0.0] - 2026-08-01

### Added
- PWA 学习打卡应用：语文（识字/古诗词/写字）、数学（口算/数感/数独）、英语（主题单词）、继本读物、积分打卡、成长记录
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

# TODO

## Known Issues

- Supabase Management API 无法通过 API 设置多行 redirect URLs（换行符被吞），必须通过 Dashboard 配置
- Supabase Cloud 的 Confirm signup、Magic Link 与 Recovery 模板需要分别维护；仓库提供本地模板，生产配置不能通过数据库迁移自动同步
- Service Worker 缓存可能导致旧版本页面残留，用户需清除缓存或等待 SW 自动更新
- 共享 Supabase 项目的发件人是项目级共享；邮件正文可通过 `product_id/product_name` 元数据区分，但同一邮箱跨产品共用时仍建议拆分 Auth 项目

## Pending

> v1.1.0 生产环境已应用 12 条迁移记录：原有迁移、密码重设安全迁移，以及本次新增的密码状态 RPC、OTP 用户哈希误判修复和 RPC 频控迁移。

### 近期
- [x] 完成 v1.0.1 生产发布（`sm.shadow.wang`）
- [x] 完成 v1.1.0 代码合并与 CI 验收
- [x] 执行 v1.1.0 新增 Supabase 生产迁移
- [x] 完成 v1.1.0 Vercel 生产部署并验证 `main` commit
- [x] 创建并推送 `v1.1.0` Git tag 与 GitHub Release
- [x] 执行线上 Supabase 迁移（仓库中的 8 个迁移版本）
- [x] 验证 Vercel Preview、Production 与生产域名

### 功能补齐
- [x] 邮箱验证码/共享密码登录、密码设置修改与找回
- [x] 全局防重复点击和云端提交单次执行锁
- [x] 云端版本冲突限次重试与中文提示
- [ ] 家长邀请共同监护人（一次性 invite token）
- [ ] learner PIN / 设备授权模式
- [x] 数据导出与完整删除（自助）
- [ ] 可选 activity event 双写与学习报表

### 公开运营前
- [ ] 儿童隐私政策和家长同意流程
- [ ] 数据保留/导出/删除 SLA
- [ ] 内容版权与商标审核
- [ ] CAPTCHA、邮件 SMTP 滥用限流
- [ ] 支付 Webhook 服务端签名验证
- [ ] 订阅 entitlement 服务端强制执行
- [ ] 生产备份、告警和事故响应

# TODO

## Known Issues

- Supabase Management API 无法通过 API 设置多行 redirect URLs（换行符被吞），必须通过 Dashboard 配置
- Supabase Cloud 的 Confirm signup 与 Magic Link 模板需要在 Dashboard 分别维护；仓库已提供本地模板和 OTP 验证流程，生产配置不能通过数据库迁移自动同步
- Service Worker 缓存可能导致旧版本页面残留，用户需清除缓存或等待 SW 自动更新
- `sm.shadow.wang` 生产部署仍为旧版，待 Production 发布流程完成后更新
- 共享 Supabase 项目的发件人是项目级共享；邮件正文可通过 `product_id/product_name` 元数据区分，但同一邮箱跨产品共用时仍建议拆分 Auth 项目

## Pending

### 近期
- [x] 合并 PR #1 到 main
- [x] 执行线上 Supabase 迁移（4 个新增迁移文件）
- [ ] 部署 Production（sm.shadow.wang 更新为影伴新版）
- [ ] Vercel 生产域名绑定验证

### 功能补齐
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

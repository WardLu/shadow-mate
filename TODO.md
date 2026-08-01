# TODO

## Known Issues

- Supabase Management API 无法通过 API 设置多行 redirect URLs（换行符被吞），必须通过 Dashboard 配置
- `{{ .Data.product_name }}` 在 Supabase Cloud 邮件模板中不生效，产品名称目前硬编码在模板中
- Service Worker 缓存可能导致旧版本页面残留，用户需清除缓存或等待 SW 自动更新
- `sm.shadow.wang` 生产部署仍为旧版，待 Production 发布流程完成后更新
- 共享 Supabase 项目的邮件模板和发件人是项目级共享，无法按产品区分

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

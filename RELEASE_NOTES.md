# Release Notes

## v1.0.1 — 2026-08-02

影伴 Shadow Mate 发布首个生产修订版本。

### 修复与改进

- 统一四个学习模块的打卡统计、成长日历图例和积分日历状态说明。
- Confirm signup 与 Magic Link/OTP 支持验证码输入、应用内验证链接和多项目品牌识别。
- 修复家庭删除函数在 CI 启动阶段的预热问题，并保留共享项目身份隔离保护。
- CI 不再输出完整 `supabase status` 或敏感状态字段，只注入测试所需的环境变量。
- 升级 jsdom 依赖并通过主分支 CI、CodeQL、数据库测试和 E2E 验证。

### 发布验收

- 生产 Supabase 与仓库中的 8 个迁移版本一致，无待执行迁移。
- Vercel Preview 已验收并提升到 Production。
- 生产地址：[sm.shadow.wang](https://sm.shadow.wang/)

## v1.0.0 — 2026-08-01

影伴 Shadow Mate 首个开源版本。

### 新功能

- 学习打卡 PWA：四个学习模块（语文、数学、英语、绘本），以及积分打卡、成长记录
- 家长邮箱免密码登录，一个家庭管理多个孩子
- 云端跨设备同步，离线也能用
- 平板/电脑/手机自适应，可安装到桌面

### 安全

- CSP 无 unsafe-inline，所有样式和脚本外置
- 家庭级数据隔离（Supabase RLS）
- 无第三方追踪或广告脚本

### 登录邮件

- 中文模板，标题「影伴 Shadow Mate 登录验证」
- 发件人「Shadow Nexus」
- 邮箱魔法链接，无需密码

---

详细变更记录见 [CHANGELOG.md](CHANGELOG.md)。

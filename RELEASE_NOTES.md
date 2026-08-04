# Release Notes

## v1.1.1 - 2026-08-04

冲突风暴热修复版本。

- 冲突熔断：版本冲突达到重试上限后设置 `cloudSyncBlocked`，暂停自动同步，阻止多标签页/旧客户端持续制造冲突请求；用户手动点击同步按钮可清除熔断并重试。
- 频控位置修正：将 `learning_save_state` 中频控计数从冲突检查之前移到之后，使冲突异常不再回滚频控预算；频控只在实际写入时消耗。
- `scheduleSave` 熔断时清除旧 timer，避免无意义触发。
- E2E 新增熔断阻止和手动恢复两个用例；数据库测试新增频控位置验证。
- 本地 Supabase Postgres 17.6.1.106 在匿名密码状态权限断言时发生 SIGSEGV（已知问题，CI pgTAP 42/42 通过）。

### 部署清单

1. 合并到 `main`，Vercel 自动部署前端。
2. 在生产 Supabase 执行第 13 条迁移 `20260804120000_learning_save_state_rate_limit_position.sql`。
3. 观察生产 `learning_state_conflict` 是否在 5-10 分钟内停止增长。
4. 提醒用户刷新页面以加载含熔断逻辑的新版。

---

## v1.1.0 — 2026-08-03

影伴 Shadow Mate 第二个生产修订版本。

- 前端检测静态模块资源版本变化并自动刷新；连续 JavaScript 异常达到阈值时自动自愈刷新，并带冷却保护避免刷新循环。
- 新增按用户和 RPC key 的数据库滑动窗口频控；`learning_save_state` 默认限制为每用户 60 秒 30 次，超限显示中文提示并保护 Postgres 日志。
- 修复 OTP 新用户被 GoTrue 自动生成密码哈希后误判为已设置密码的问题，密码状态改由用户主动设置的元数据标记判断。
- 修复密码重设邮件跳转到错误本地端口导致 `otp_expired` 的问题。
- 修复真实本地 Supabase E2E 在新用户自动打开家庭空间窗口后的测试同步问题。

### 发布验收

- PR #12 已合并到 `main`，CI、CodeQL 和 JavaScript/TypeScript 分析全部通过。
- 本地 `npm run verify` 通过；单元测试 60/60，完整 Playwright E2E 为 42 通过、1 个按环境跳过；CI pgTAP 数据库测试 42/42 通过。
- 生产 Supabase 已执行 3 个新增迁移，迁移记录已包含密码状态 RPC、OTP 状态修复和 RPC 频控。
- Vercel 生产部署已完成，部署 commit 为合并后的 `main` 提交 `e6ef77e`，生产域名为 [sm.shadow.wang](https://sm.shadow.wang/)。
- Confirm signup、Magic Link 和 Reset password 三套生产 Supabase Auth 邮件模板已通过 CLI 配置推送并完成幂等核验。

### 回归环境备注

- 本机 `npm run test:db` 在执行匿名用户密码状态权限断言时触发本地 Postgres `SIGSEGV`，导致连接中断；该问题只发生在本地 Docker 数据库，CI 的同套 42 条 pgTAP 测试已通过，生产数据库未受影响。

## v1.0.1 历史变更摘要

- 支持邮箱验证码和共享邮箱密码两种登录方式，并提供设置、修改和找回密码。
- 注册、登录、找回密码邮件统一按请求域名显示 Shadow Mate、Shadow Card 或 Shadow Size 品牌。
- 全局防重复点击与异步操作锁避免重复创建孩子、重复同步或重复删除。
- 云端版本冲突最多自动重试 2 次并逐次退避，超过上限停止请求并提示刷新，避免客户端死循环。
- 新增密码状态最小权限迁移；发布前需完成本地数据库测试并增量同步生产迁移和 Recovery 模板。
- 本地发布前验证已覆盖 60 个单元测试、42 个 mock E2E 测试、真实本地 Supabase 生命周期 E2E，以及 42 个数据库测试。

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

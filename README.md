# Shadow Mate（影伴）

An open-source AI learning companion for K12 students.

**v1.0.0** · 2026-08-01 · MIT License

Your child's first AI learning partner.

## 产品概述

一个面向家庭的儿童学习打卡 PWA。它保留原始单页版的语文、数学、英语、绘本、积分和成长模块，同时增加：

- 平板、电脑、手机共用同一网址
- PWA 安装与离线使用
- 家长邮箱免密码登录
- 一个家庭管理多个学习者
- Supabase 云端同步与跨设备冲突保护
- GitHub 开源、Vercel 静态部署

## 本地运行

项目使用 Vite 将固定版本的 Supabase JS 打包进站点，不在运行时加载第三方 CDN 脚本。

```powershell
npm.cmd ci
npm.cmd run dev
```

打开终端显示的本地地址。不要直接双击 `index.html`，浏览器在 `file://` 协议下无法正常加载 ES Module。

静态检查与构建：

```powershell
npm.cmd run verify
```

构建结果在 `dist/`。

## Supabase

当前部署配置位于 `src/config.js`。其中使用的是 Supabase publishable key；该密钥本来就会随浏览器代码公开，真正的数据隔离由 RLS 完成。绝不能把 secret key 或 `service_role` key 放进此仓库。

数据库迁移位于：

- `supabase/migrations/20260731142839_restrict_project_registry_access.sql`
- `supabase/migrations/20260731170000_projects_registry_compat.sql`
- `supabase/migrations/20260731173000_learning_family_state.sql`
- `supabase/migrations/20260731174500_learning_indexes.sql`

第一条迁移在共享数据库已经存在 `public.projects` 时，将匿名读取缩小到产品 ID 和名称；第二条仅在该表不存在时创建最小产品登记表。因此同一套迁移既能安全复用现有多租户数据库，也能在全新的开源 Supabase 项目中从零启动。

本地数据库验证需要 Docker Desktop：

```powershell
supabase start
supabase test db --local
supabase db lint --local --schema public --level warning --fail-on error
```

数据库测试会验证 RLS、匿名访问拒绝、家庭间隔离、越权写入拒绝和乐观并发冲突。线上迁移必须在本地测试和 Vercel Preview 验收通过后执行。

详细设计、旧方案评审和发布策略见 [架构文档](docs/architecture.md)。

## 数据同步与本机隐私

首次登录并选择学习者时：

1. 如果云端尚无状态，自动上传本机数据。
2. 如果两端都有数据，按打卡、积分、书架和阅读日志合并。
3. 云端使用版本号做乐观并发控制；发生冲突时重新拉取、合并并重试。
4. 本机数据不会在同步后自动删除，仍可离线使用；账号面板提供“清除本机数据”。

本机学习记录使用浏览器 `localStorage` 的 `shadow_mate_workbench_v1` 键保存，当前孩子使用 `shadow_mate_active_profile` 键保存。它通常会跨浏览器重启保留，但清除网站数据、无痕模式、浏览器自动清理或更换域名都会影响本机缓存；登录同步后的云端数据用于跨设备恢复。

详细的数据范围、保留和删除方式见 [隐私说明](PRIVACY.md)。安全问题请按 [安全政策](SECURITY.md) 私下报告。提交代码前请阅读 [贡献指南](CONTRIBUTING.md)。


## 文档

| 文档 | 说明 |
| --- | --- |
| [Release Notes](RELEASE_NOTES.md) | 版本发布说明 |
| [Changelog](CHANGELOG.md) | 详细变更记录 |
| [Roadmap](ROADMAP.md) | 路线图 |
| [TODO](TODO.md) | 待办与已知问题 |
| [架构文档](docs/architecture.md) | 架构设计与实施方案 |
| [Auth 配置](docs/auth-setup.md) | Supabase Auth 服务端配置指南 |
| [安全基线](docs/security-baseline.md) | 安全与发布闸门 |
| [隐私说明](PRIVACY.md) | 数据隐私 |
| [安全政策](SECURITY.md) | 漏洞报告流程 |
| [贡献指南](CONTRIBUTING.md) | 开发环境与规范 |
## 开源边界

代码采用 MIT License。仓库中提到的第三方书名、品牌、视频平台和内容链接仍归各自权利人所有；MIT License 不授予第三方内容或商标的使用权。对外运营前应完成内容授权、隐私政策、儿童数据合规和支付条款审查。

# Shadow Mate Release Closure

## 当前生产快照（2026-09-05）

Shadow Mate 的 v1.3.14 SEO/GEO 变更已合并并发布；随后 `production` 进入更晚的 **v1.4.0**（SHA `cdf5fb41d17022f165ce8b3fddde7f7e4c73dc68`，包含 v1.3.14 的祖先提交）。正式域名 `https://sm.shadow.wang/` 当前返回 HTTP 200、HSTS，Title、Description、Canonical、WebApplication JSON-LD、H1 与副标题均已核验。

本文件记录产品仓库的 release-closure 边界：它证明合并提交与安全 handoff 文档，不自动证明生产迁移、部署、域名切换或真实账号验收。生产发布仍需独立的 `production`、Stage、Promote、正式域名验收与审计证据。

## 当前未完成项

- Vercel 项目 API 的 `targets.production` 仍返回旧 deployment `dpl_CG45uA25soFLKdZk8avYtetFK2Vu`（提交 `7d330a5…`），而 `sm.shadow.wang` 与 Promote 接口均确认 v1.4.0 deployment `dpl_jJT4g38ExBEjgonCfgLZdSpdnyr7` 为当前生产；重复 Promote 返回 409 `already the current production deployment`，因此不再回滚或制造新部署。
- 真实账号、CrUX 现场数据与长期性能趋势不由本仓库 workflow 推断，需专用测试账号和持续观测。

产品 workflow 不携带生产数据库凭据，不直接执行 Supabase migration，也不写入生产用户数据。

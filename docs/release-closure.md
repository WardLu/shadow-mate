# Shadow Mate Release Closure

## 当前生产快照（2026-09-05）

Shadow Mate 的 v1.3.14 SEO/GEO 变更已合并并发布；随后 `production` 进入更晚的 **v1.4.0**（SHA `cdf5fb41d17022f165ce8b3fddde7f7e4c73dc68`，包含 v1.3.14 的祖先提交）。正式域名 `https://sm.shadow.wang/` 当前返回 HTTP 200、HSTS，Title、Description、Canonical、WebApplication JSON-LD、H1 与副标题均已核验。

本文件记录已核验的部署快照和后续交接边界，文件本身不能证明任何 workflow 已执行。生产发布仍需独立的 `production`、Stage、Promote、正式域名验收与审计证据。

## 项目指针与生产别名对齐（2026-09-05）

- 已从同一 v1.4.0 发布提交 `cdf5fb41d17022f165ce8b3fddde7f7e4c73dc68` 构建、验收并 Promote deployment `dpl_5Y1pXLakBYiD2tmQEdC4S6wJXvDv`（`shadow-mate-ci3hl7xzc-wardlus-projects.vercel.app`）。版本与应用代码未改变；构建产物相比旧生产仅省略 19 个 Vercel 注入的平台元数据字段。
- 项目 `targets.production` 与 `sm.shadow.wang`、`shadow-mate.vercel.app`、`shadow-mate-wardlus-projects.vercel.app`、`shadow-mate-git-production-wardlus-projects.vercel.app` 四个生产别名已全部回读到上述 deployment；`autoAssignCustomDomains=false` 保持不变。
- 独立检出通过 public/security/static/build 检查、374 项单元测试、产物与第三方资源审核；生产 Release 检查通过，96 个既有语音 CDN 对象完成长度、SHA-256、CORS 和解码验证，共 495648 bytes。未调用付费语音生成接口。
- 旧部署 `dpl_jJT4g38ExBEjgonCfgLZdSpdnyr7` 保留为同版本恢复点。此前 Promote 409、同目标 Rollback 422 和项目旧记录是历史现象，没有执行旧版本回滚。

## 独立后续事项

- Mate 的登录后云同步如需补测，应使用专用测试家庭账号；Portal P0b 中的账号待办指 Portal 自身登录与 Dashboard 权限。CrUX 现场数据与长期性能趋势需持续观测。

产品 workflow 不携带生产数据库凭据，不直接执行 Supabase migration，也不写入生产用户数据。

## 旧 release-manifest 提案的处置（2026-09-06）

[Issue #103](https://github.com/WardLu/shadow-mate/issues/103) 中的旧 handoff 提案不再进入当前实现。旧 `release-closure.yml`、`release-manifest*.mjs` 及对应测试保持为历史材料，不迁入主线，也不增加 `release:manifest` 命令。旧 workflow 通过可变的跨仓库 `main` 调用 reusable workflow，不能作为发布状态的可靠依据，因此不应形成第二条交接路径。

该提案不会取代项目现有的发布审查。生产迁移、部署、正式发布和生产验收仍须通过各自独立门禁；本次整理不执行任何生产操作。

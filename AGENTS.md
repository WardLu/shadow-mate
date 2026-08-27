# Shadow Mate 项目约定

## 产品与架构

- Shadow Mate 是面向家庭的学习打卡 PWA。只有家长/监护人使用 Supabase Auth；孩子是家庭内 learner profile，不是独立登录账号。
- 当前实现是 Vite + Vanilla JavaScript：`src/app.js` 负责界面与本机状态，`src/cloud.js` 负责认证、家庭空间和云同步，`supabase/` 保存数据库提案与本地测试材料。
- 保持 local-first：未登录时功能可用，登录后才同步；网络失败不能破坏本机状态。云端保存使用版本号和有限重试，不能退化为静默的最后写入覆盖。
- 现状以 `package.json`、`README.md`、`docs/architecture.md` 和运行代码为准；旧版本说明和历史发布记录只能作为线索。

## 家庭数据与隐私

- 家庭、成员、学习者和状态必须同时受用户归属、household membership 与 `project_id = 'shadow-mate'` 约束；UI 隐藏不是授权。
- 不新增儿童邮箱、真实姓名、生日、学校、地址、位置、照片等字段，除非先完成必要性、家长同意、保留期限、导出与删除流程评审。
- 共享 Supabase 中删除 Shadow Mate 家庭数据不得顺带删除共享 Auth 身份；账号级删除只在明确隔离且经过服务端授权的场景启用。
- 浏览器只允许 publishable key。`service_role`、secret key、生产凭据和完整用户数据不得进入客户端、仓库、日志、测试 fixture 或公开截图。
- 修改登录、同步、导出、删除或隐私文案时，同时核对 `PRIVACY.md`、`privacy-policy.html`、相关测试和线上实际行为。

## 共享 Supabase 边界

- 本仓库对共享数据库是 `proposal-only`。变更前读取 `../shadow-portal/supabase/control-plane/policies/registered-projects.yaml`、`product-repo-policy.md` 和当前迁移台账。
- 不从本仓库执行共享生产迁移、直接 SQL、`migration repair`、`--include-all` 或手工修改迁移历史；canonical migration、审批和串行执行属于 Shadow Portal 控制面。
- 数据库提案必须验证 RLS、函数执行权限、租户/家庭隔离、索引和实际 schema。新增公开表还要分别核对 Data API 暴露/GRANT 与 RLS，不能把两者当成同一个检查。
- 本地数据库测试只证明提案在本地成立，不代表已获准进入生产或已部署。

## PWA、语音与公开资源

- Service Worker、缓存版本和离线资源改动要验证首次加载、离线重开、升级和缓存失效场景。
- Piper/ONNX 是浏览器本地语音兜底。修改模型、WASM、CSP、下载路径或缓存时，同步核对离线行为、体积、来源指纹与 `THIRD_PARTY_NOTICES.md`。
- 不把系统 TTS、本地 Piper 或匿名页面分析描述成超出实际实现的数据处理方式。

## 修改与验证

- 逻辑/UI 小改运行最相关 `npm test -- <file>`，并查看受影响页面/移动视口；共享静态约束才追加 `npm run check`。
- 状态、认证、同步或生命周期按边界选择 unit、db、functions 或单个 E2E，覆盖实际失败/恢复路径。
- 构建、PWA、Service Worker、CSP、依赖或公开资源链路运行 `npm run verify`；完整套件/`release:check` 只按全局升级条件使用，且不授权发布。

## Release 闭环

- 创建或合并 PR 时完成 release-impact gate；本机有同级 Shadow Portal 仓库时，同时读取 `../shadow-portal/docs/release-watcher.md` 的“日常使用与 AI 执行契约”。
- 共享数据库 schema、数据迁移、RLS、函数、视图或控制面 proposal 需要后续处理时加 `db-migration`；生产部署、生产配置、正式 Release 或生产验收需要跟进时加 `production-impact`；同时命中时两个标签都加。
- Gate 只有在标签已于合并前设置，或 PR 描述已说明该变更没有数据库与生产跟进时才完成。
- 合并后的带标签 PR 由本机 Release Watcher 接管。接管确认阶段只读核对 Multica 且不手工创建并行 issue；建单后可按 runbook 整理非生产证据和推进允许的状态，生产 migration、deploy、release 和真实账号验收继续使用各自门禁与明确授权。

## 权威入口

- 架构与数据模型：`docs/architecture.md`
- 安全基线：`docs/security-baseline.md`
- 第三方资源：`THIRD_PARTY_NOTICES.md`

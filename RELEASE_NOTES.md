# Release Notes

## Unreleased

- 统一 Confirm signup、Magic Link/OTP、邮箱变更、邀请、二次认证和密码找回邮件模板的产品识别：影伴 Shadow Mate、影匣 Shadow Card、影裁 Shadow Size、影笺 Quick flomo 按认证请求动态显示名称、页脚标语和产品详情链接；未知来源回退为 Shadow Nexus。
- 共享 SMTP 发件人名称仍保持为 `Shadow Nexus`，但邮件内容按当前产品显示，避免把 Shadow Mate 的邮件误显示为通用 Shadow Nexus 产品。

### 验证结果

- `tests/unit/email-templates.test.js` 已覆盖 6 个 Supabase Auth 邮件模板及其产品身份、页脚、链接和认证变量。
- 本节记录代码与模板的一致性；不代表生产 Supabase 模板已经由本次本地提交自动部署。

## v1.3.10 - 2026-08-23

- 修复每日写作积分在跨月、跨年和月份切换时选择错误 workbook 的问题。
- 修复家庭档案切换期间的并发竞态，覆盖 active tuple、profile-scoped IndexedDB、fail-closed 和 outbox lease。
- 包含 Shadow Portal 控制面迁移 `20260819120000_growth_loop_legacy_points_import.sql` 的发布前置依赖；该迁移必须先于前端上线完成并登记验收。

### 验证结果

- 代码合并提交：`f65e3e8f98bd996ba7ff570252eb9fc4488e3d85`。
- `npm run verify`、云端 E2E `48/48`、定向 sign-out 回归和 GitHub PR checks 已通过。
- 生产迁移已由 Shadow Portal 控制面按单条受控 linked migration 完成；`schema_migrations` 已登记版本/name，`statement_count=17`，本地 SQL SHA-256 为 `587fd9646733b6b9320bd2c8173f76906b89470b9a6a761983ea3fdf102b5a55`。
- 生产 schema 验收已通过：目标约束、索引、函数 `SECURITY DEFINER`/`search_path=''`、函数 ACL 和 `learning_point_ledger` RLS 均符合预期。
- Vercel Preview HTTP 200 及 CSP、HSTS、X-Frame-Options 已验证；正式域名部署和真实账号验收仍未完成，当前不宣称已正式上线。

### 发布包

文件：`shadow-mate-v1.3.10.zip`

SHA-256：发布时以 GitHub Release 产物为准回填。

### 部署清单（待完成）

- [x] 生产迁移 `20260819120000` dry-run 仅列出目标迁移，并完成受控 apply。
- [x] `schema_migrations`、目标函数、约束、索引、ACL/RLS 验收通过。
- [ ] Shadow Portal ledger 更新为 `applied/verified`（等待真实账号 smoke 完成后回填）。
- [ ] Git tag `v1.3.10` 与最终 `main` 合并提交一致，并发布 GitHub Release 及压缩包。
- [ ] `release-to-production` 完成 `production` 快进和 Vercel 部署。
- [ ] `https://sm.shadow.wang/` 验证版本、CSP、HSTS、X-Frame-Options、HTTPS 和核心回归。
- [ ] 使用脱敏真实账号完成两个 bug 的生产验收，并记录结果。

## v1.3.9 - 2026-08-19

- Growth Loop 积分模块上线：积分账本、自定义积分项/自定义成长项目、奖励与兑换；后端表与 RPC 已部署共享 Supabase（控制面执行并登记）。
- **期初积分恢复**：已打开过新版导致积分显示为 0 的用户，家长/监护人打开新版后确认一次「期初积分」，即可把旧积分结转进新账本（受控 RPC `learning_confirm_opening_balance`，每孩子仅一次、request_id 幂等）。旧积分一直完整保留在云端 envelope 快照中，本次结转不丢数据。
- 邮箱变更、邀请、二次认证、密码找回统一品牌邮件模板。
- 共享 Supabase 本地测试改经统一宿主路由，测试层级约定见 `docs/`。
- 发布流程加固：GitHub Release 发布后自动快进 `production` 分支；`production` 分支启用 ruleset 保护。

### 验证结果

- PR #43（Growth Loop MVP）、#44（期初积分 + 学习包启停）、#47/#48（品牌邮件、本地测试路由）、#55（release-to-production 工作流）均已合入 `main`。
- 期初积分迁移 `20260816120000_growth_loop_opening_balance.sql` 已于 2026-08-19 经 Shadow Portal 控制面在生产执行并登记 `applied`（`schema_migrations` statement_count=7）；执行后核验：函数存在、delta CHECK 放宽生效（仅 `initial_balance` ±1000000）、函数 ACL 仅 `authenticated`、表 RLS 基线不变。
- 本地 `npm run verify` 通过（125 个单测全绿、构建/安全/公开检查通过）；`npm run release:check` 通过。
- 事故与流程记录见 `docs/incidents/2026-08-18-production-points-zeroed.md`。

### 发布包

文件：`shadow-mate-v1.3.9.zip`

SHA-256：发布时以 `release.yml` 产物为准回填。

### 部署清单（完成）

- Git tag `v1.3.9` 已创建并推送，指向 `main` 合并提交。
- GitHub Release 已发布并上传 `shadow-mate-v1.3.9.zip`，SHA-256 已核对。
- 期初积分迁移已先于前端发布在生产落地，`release-to-production` 工作流将 `production` 快进到本版本触发 Vercel 部署。

## v1.3.8 - 2026-08-15

- 将无 GMS Android 的离线英语语音模型改为从 `voice.shadow.wang` CDN 分发（`en_US-ljspeech-medium`，约 63.5MB）：首次点击“听发音”时下载并缓存到浏览器，之后可离线合成，不上传录音。
- 本地 Piper 推理改在主线程执行；移除本地分片模型与 Worker 运行时资源的使用。
- 同步更新 README、使用指南、第三方许可清单与 CSP（`connect-src` 增加 `https://voice.shadow.wang`）。

### 验证结果

- PR #39 已 squash 合并到 `main`，合并提交为 `0ba5f29`。
- `npm run verify`、CI（含全量 E2E）、CodeQL、Shared Supabase Policy、Vercel Preview 通过。
- CDN CORS 已实测：`voice.shadow.wang` 对 `https://sm.shadow.wang` 返回允许跨域（`Access-Control-Allow-Origin`、`GET/HEAD/OPTIONS`，暴露 `Content-Length/Content-Range`），真实浏览器跨域拉取 `.onnx.json` 200、`.onnx` Range 206 均成功。
- 已知技术债：`public/piper/en_US-lessac-high.onnx.part-*`（约 115MB）与 `public/worker/*` 仍保留在仓库与构建产物中但不再被引用，计划在后续版本清理。

### 发布包

文件：`shadow-mate-v1.3.8.zip`

SHA-256：`96fc34e1bc4de431dcc959780d03da9e9f27ed02e1329b28db718d7d8fb9a13a`

### 部署清单（已完成）

- Git tag `v1.3.8` 已创建并推送，指向合并提交 `e14f4a7`。
- GitHub Release 已发布并上传 `shadow-mate-v1.3.8.zip`，SHA-256 已核对。
- `https://sm.shadow.wang/` 已验证为新版本，CSP 含 `voice.shadow.wang`，语音 CDN 跨域下载实测通过（200/206，`type: cors`）。

## v1.3.7 - 2026-08-13

- 将国产 Android（无 GMS）离线英语兜底切换为 `en_US-lessac-high`，修复 `ljspeech-high` 单词输出过短、发音不完整的问题；声音模型约 115MB，仍支持一次下载后离线使用。
- 有可用英语系统语音的设备仍优先使用系统 TTS；无 GMS Android 使用浏览器本地 Piper。模型更新后会按新的资源地址重新准备离线语音包，MacBook 与 Android 的音色可能不同。

### 验证结果

- PR #36 已 squash 合并到 `main`，合并提交为 `d59d43f`。
- `npm run verify`、CI、CodeQL、Shared Supabase Policy、Vercel Preview 和公开仓库 Release 闸门通过。
- Android 无 GMS 设备首次使用需下载约 115MB；下载完成后可断网测试离线发音。

### 发布包

文件：`shadow-mate-v1.3.7.zip`

SHA-256：`478857934c9284a6138c2b426afae59fbb4b07291a7b9d899a5531c98d26f7b1`

### 部署清单（已完成）

- Git tag `v1.3.7` 已创建并推送，指向合并提交 `c98e246`。
- GitHub Release 已发布并上传 `shadow-mate-v1.3.7.zip`，SHA-256 已核对。
- `https://sm.shadow.wang/` 已验证为新版本，TTS 静态资源、CSP、HSTS、X-Frame-Options 和 HTTPS 响应均正常。

## v1.3.6 - 2026-08-12

修复生产环境隐私政策页面显示 HTML 源代码的问题。

### 本次更新

- `/privacy` 和 `/privacy/` 改为 Vercel 静态 HTML 页面。
- 隐私页样式拆分为独立 CSS 文件。
- 增加构建产物、路由和 `Content-Type` 校验。

### 验证结果

- `npm run verify` 通过。
- Release 校验和生产环境回归验证通过。
- 生产 `/privacy` 返回 `text/html; charset=utf-8`。

### 发布包

文件：`shadow-mate-v1.3.6.zip`

SHA-256：`7cc7ccf6b7eee0a866521d3e01aef9315d9faccadaa46c1f22ed51d4d32e387a`

### 部署清单（已完成）

- PR #33 已合并到 `main`，合并提交为 `2836a7c`。
- Git tag `v1.3.6` 和 GitHub Release 已发布。
- 生产 `/privacy` 和 `/privacy/` 均已验证为正常 HTML 页面。

## v1.3.5 - 2026-08-12

影伴商业化准备与隐私/安全边界修订版本，面向 Dogfooding 和小规模内测。

- 增加家长/监护人同意审计、学习者隐私访问边界和双语隐私说明页面。
- 隐私页源文件会随 Vercel 构建输出为静态页面，避免 Supabase Storage 将 HTML 按纯文本返回。
- 隐私页增加影伴品牌首屏、成长轨道视觉、数据最小化原则卡片和移动端布局；本地 `/privacy` 与 `/privacy/` 路由已和生产入口保持一致。
- 隐私页品牌标识和返回应用入口使用当前站点相对路径，确保本地、Preview 和生产环境不会跨环境跳转。
- 应用页脚首位增加 Shadow Nexus 产品主页链接，社交媒体和隐私政策入口保持不变。
- 增加公开仓库 Git/Release 防线，检查公开范围、密钥、最终产物、第三方资源哈希与部署响应头。
- 将 Piper 英语声音模型切换为 `en_US-ljspeech-medium`，并同步第三方来源与许可证记录。
- 新增迁移 `20260812081305_learning_has_password_anon_safe_error.sql`：避免本地 PostgreSQL 在匿名调用密码状态 RPC 时因权限拒绝触发后端崩溃。
- `learning_has_password()` 改为 `SECURITY DEFINER` 并保留内部 `auth.uid()` 检查；匿名调用仍返回 `42501`，不暴露密码状态。

### 验证结果

- `npm run build` 通过。
- `npm run test:unit`：72/72 通过。
- 离线 Chromium E2E：25/25 通过，包含本地隐私页路由、品牌页渲染和主应用回归。
- `npm run test:db`：58/58 通过。
- `npm run public:check`、`npm run security:check`、`npm run release:check` 通过。

### 部署清单

1. 合并 PR #31 到 `main`，由 Vercel 部署包含静态 `/privacy` 页面和品牌化页面的应用版本。
2. 按 [`docs/privacy-policy-publishing.md`](docs/privacy-policy-publishing.md) 完成构建产物和响应头验收。
3. 验证 `https://sm.shadow.wang/privacy` 显示品牌首屏、中英文内容、语言锚点和移动端布局。

## v1.3.4 - 2026-08-10

离线英语发音、CSP 和开发环境兼容性修复版本。

- 下载过程中按已接收字节动态显示百分比；服务端没有返回总大小时显示动态下载状态，并支持随时取消。
- 下载期间提前预热 Piper 引擎，减少下载完成后停在“合成中…”或短暂显示“发音未响应”的情况。
- 收口下载、引擎加载和合成失败状态，按钮不再停留在“合成中…”或“发音未响应”。
- 补充 `media-src 'self' blob:`，允许播放浏览器本地生成的音频；CSP 仍不允许 `unsafe-eval`。
- 修复 Vite 开发环境加载 `/piper-tts-web.js?import` 返回 500 的问题。
- 本地 `npm run verify` 通过，单元测试 66/66；Piper 开发资源、下载失败、引擎预热和系统语音回退 E2E 均通过。

### 部署清单

1. 合并 PR #30 到 `main`，由 Vercel 自动部署前端。
2. 在生产响应头确认 `script-src 'self' 'wasm-unsafe-eval'`，并确认 `connect-src` 与 `media-src` 均包含 `blob:`。
3. 在已下载语音包的设备点击“听发音”，验证系统语音无响应时能自动切换 Piper；同时回归无 GMS Android 首次下载、百分比/动态进度、取消和离线发音。
4. 本地开发重启 `npm run dev` 后，确认 `/piper-tts-web.js?import` 返回 200，再验证本地 Piper 发音。

---

## v1.3.3 - 2026-08-09

离线英语发音稳定性修复版本。

- 系统语音列表可用但实际播放无响应时，自动取消卡住的系统语音并回退到本地 Piper。
- 系统语音报错或抛异常时同样进入本地回退。
- 已缓存离线语音包时直接开始合成，不再重复停留在下载弹窗。
- 本地 `npm run verify` 通过，单元测试 65/65。

### 部署清单

1. 合并 PR #26 到 `main`，由 Vercel 自动部署前端。
2. 在已下载语音包的设备点击“听发音”，验证系统语音无响应时能自动切换 Piper；同时回归无 GMS Android 首次下载和离线发音。

---

## v1.3.2 - 2026-08-09

离线英语发音下载与 macOS CSP 兼容性修复版本。

- 修复 macOS Chrome 中 Piper 离线发音被 CSP 阻断的问题：允许 `blob:` 和 `wasm-unsafe-eval`，继续禁止 `unsafe-eval`。
- 下载语音包时按流式读取动态更新进度；没有 `Content-Length` 时显示动态下载状态，并可随时取消。
- 下载失败、CSP 阻断或合成超时会结束“合成中…”状态并给出可重试提示。
- 补充标准 `mobile-web-app-capable` 元标签。
- 发布前验证：`npm run verify` 通过，单元测试 65/65，离线语音失败路径 E2E 1/1 通过。

### 部署清单

1. 合并本分支 PR 到 `main`，由 Vercel 自动部署前端。
2. 在生产响应头确认 `script-src 'self' 'wasm-unsafe-eval'`，并确认 `connect-src` 包含 `blob:`。
3. 在 MacBook Chrome 验证取消弹窗后再次“听发音”、刷新页面后首次合成，以及无 GMS Android 的下载进度、取消和离线发音。

---

## v1.3.1 - 2026-08-09

夜间模式可读性修复版本。

- 增加系统暗色主题和浏览器 `color-scheme` 声明，修复 Android/Chrome 夜间强制着色导致的页面发灰、卡片过暗和文字对比不足。
- 统一首页、学习控件、指南、语音弹窗和账户弹窗的深色表面与强调色。
- 新增 3 条夜间模式 Chromium E2E 测试；本地离线 E2E 23/23、云端 mock E2E 24/24 通过。
- 固定构建链间接依赖 `nanoid` 到 `3.3.18`，消除高危审计告警。

### 部署清单

1. 合并 `codex/fix/dark-mode` 到 `main`，Vercel 自动部署前端。
2. 在暗色系统/Android Chrome 验证首页、学习模块和账户弹窗的文字对比度。

---

## v1.3.0 - 2026-08-05

国产 Android（无 GMS）英语发音兜底版本。

- 新增本地 Piper 语音合成兜底：系统没有英语语音时，首次点“听发音”会提示下载影伴内置的离线语音包（约 90MB，一次性，可离线使用，不上传录音），在浏览器本地合成发音。
- 系统有英语语音时仍优先走系统 TTS，其他设备不受影响。
- 移除 `README.preview.html` 的 git 跟踪（本地文件保留）。
- 修复：审计清理迁移兼容无 pg_cron 环境；修正 pgTAP 数据库测试 `plan` 数（47→48）。
- 依赖致谢：`piper-tts-web` / `rhasspy/piper` / `ONNX Runtime Web` / `rhasspy/piper-voices`（均 MIT）。

### 部署清单

1. 合并 `codex/piper-tts` 到 `main`，Vercel 自动部署前端。
2. 在国产 Android 设备验证首次点“听发音”的下载确认、进度与本地发音；确认后模型已缓存可离线使用。

---

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

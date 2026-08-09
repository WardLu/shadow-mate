# Release Notes

## v1.3.3 - 2026-08-10

离线英语发音稳定性修复版本。

- 系统语音列表可用但实际播放无响应时，自动取消卡住的系统语音并回退到本地 Piper。
- 系统语音报错或抛异常时同样进入本地回退。
- 已缓存离线语音包时直接开始合成，不再重复停留在下载弹窗。
- `npm run verify`、GitHub CI、CodeQL 和 Vercel Preview 均通过。

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

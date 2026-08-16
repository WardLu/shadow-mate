# Git / Release 防线报告：Growth Loop MVP 发布候选

> 对象：`feat/growth-loop-release-candidate`（基于 main 基线，含 W2/W4/W5 与集成分支，公开仓库 shadow-mate）。
> 结论：公开仓库防线通过，未发现密钥、内部计划或内部运维材料进入公开内容。

## 1. Git 防线（公开仓库提交内容）

- **分支与提交范围**：本候选相对 `main` 的改动集中在功能源码（`src/*`）、测试（`tests/*`）、迁移提案（`supabase/migrations/`）、公开文档（README/CHANGELOG/RELEASE_NOTES/docs）。提交 `b30c660`、`1797c46`、`7391eb8` 均为发布候选配套修改。
- **密钥/凭据扫描（git grep 全量跟踪文件）**：无真实 secret。命中项均为良性：
  - `README.md:155`、`docs/architecture.md:77`：明确“绝不把 secret key / service_role key 放进仓库”的警示文案。
  - `supabase/functions/delete-account/index.ts:42`：服务端 Edge Function 通过 `readSecret("SUPABASE_SECRET_KEYS", ...)` 从环境变量读取，非硬编码。
  - `supabase/config.toml`：注释掉的占位项；`s3_secret_key = "env(S3_SECRET_KEY)"` 为 env 引用。
  - RLS 迁移中对 `service_role` 的最小列级 GRANT 为预期安全设计。
- **内部材料扫描**：无 `/Users/wardlu`、`Obsidian`、`07-工程架构`、`08-测试范围` 等内部路径或内部计划/复盘文档进入公开仓库。唯一“复盘”命中（`src/learning-growth-loop.js:8`）是孩子积分项的描述文案（“需要和家长一起复盘”），非内部复盘记录。`CONTRIBUTING.md:52` 明确要求内部计划与发布闸门不得放入公开目录。
- **个人邮箱/手机号**：仅公开联系邮箱 `wardlu@126.com`（`security:check` 白名单内）；无手机号、家庭真实身份或用户数据。
- **大二进制清理**：废弃的 `public/piper/en_US-lessac-high.onnx.part-*`（约 114MB）与 `public/worker/*` 已从仓库删除（相对 main 显示为删除），避免大型二进制进入公开仓库；保留的 vendored 资源仅为必要 WASM/数据文件。
- **未跟踪文件管控**：本任务生成的内部运维材料 `migration-runbook-growth-loop.md` 与截图 `home.png` 保持未提交，不进入公开仓库。

## 2. Release 防线（构建产物与第三方许可）

- **构建产物扫描**：`dist/` 中无 `/Users/wardlu`、`Obsidian`、`service_role` 泄露、连接串等内部或敏感内容；客户端构建仅含 publishable 配置。
- **第三方许可**：`THIRD_PARTY_NOTICES.md` 在库且最新（2026-08-13），覆盖运行时 npm 依赖（`@supabase/supabase-js`、`@vercel/analytics`、`lucide`，均 MIT/ISC）与 vendored 浏览器语音资源（`piper-tts-web`、ONNX Runtime Web、`piper_phonemize`、eSpeak NG 等，含上游地址与许可证）。
- **发布闸门（release:check）**：已通过 —— `release-gate.config.json` 校验 artifactPaths（`dist`）、vendoredPaths（`piper-tts-web.js`、`ort-wasm`、`piper_phonemize`）、生产响应头要求（CSP/HSTS/X-Frame-Options、禁止 `unsafe-inline`）与部署清单存在性；生产响应头实测因无 `RELEASE_URL` 跳过（见云测记录）。
- **CI 防线**：`npm run verify` 全量通过，包含 `public:check`（公开范围/密钥/最终产物）与 `security:check`（邮箱白名单/敏感项），并随 PR 触发 GitHub Actions CI + CodeQL。

## 3. 未覆盖项

- 生产 URL（`RELEASE_URL`）未配置，生产响应头与真实部署验证未执行（环境阻塞，非跳过）。
- 真实云端烟测未执行（无生产凭据），作为环境阻塞记录。

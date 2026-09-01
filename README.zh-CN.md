# 影伴 Shadow Mate

<p align="center">
  <img src="./public/icons/icon-192.png" width="88" alt="影伴应用图标">
</p>

<p align="center">
  <strong>把每天的学习，变成看得见的成长。</strong><br>
  面向家庭的儿童学习打卡 PWA：学习、记录、同步，一处完成。
</p>

<p align="center">
  <code>v1.3.11</code> · <a href="./LICENSE">MIT License</a> · Vite + Vanilla JavaScript + Supabase
</p>

<p align="center">
  <a href="./README.md">English</a> · 简体中文 ·
  <a href="https://sm.shadow.wang/"><strong>立即使用</strong></a> ·
  <a href="./docs/user-guide.md">使用指南</a> ·
  <a href="./RELEASE_NOTES.zh-CN.md">中文发布说明</a>
</p>

## 它能做什么

影伴围绕家庭的日常学习设计：

- 语文、数学、英语、绘本四个学习模块。
- 每日打卡、成长记录和独立的行为积分日历。
- 一个家长管理多个学习者，每个孩子使用独立的学习记录。
- 邮箱验证码和 Shadow 系列共享邮箱密码登录。
- 未登录也可离线学习，登录后可选择同步到云端。
- 使用版本控制和冲突保护支持跨设备恢复。
- 适配手机、平板和电脑，并支持安装为 PWA。
- 没有可用英语系统语音的设备可使用浏览器本地 Piper 兜底发音。

## 快速开始

\`\`\`bash
npm ci
npm run dev
\`\`\`

打开 Vite 输出的本地地址。不要直接用浏览器打开 \`index.html\`，因为 \`file://\` 无法正常加载浏览器模块。

本地隐私页地址为 \`http://localhost:5173/privacy\`。

## 本地开发边界

共享本地 Supabase、Mailpit、数据库测试和 Edge Functions 使用统一入口：

\`\`\`bash
npm run local-dev
\`\`\`

Mailpit 地址为 \`http://127.0.0.1:54324\`。Feature worktree 直接启动 Vite 时不会自动启动 Mailpit，也不会自动切换到本地 Supabase，必须显式配置 loopback 地址。

非生产和 Preview 环境禁止连接生产 Supabase。不要把生产凭据或 service-role key 放进仓库。

兼容旧入口时使用：

\`\`\`bash
npm run supabase:local:start
npm run supabase:local:functions:serve
\`\`\`

不要在仓库根目录直接运行裸的 \`supabase start\` 代替统一本地入口。

## 验证

\`\`\`bash
npm run check
npm run build
npm run test:fast
npm run test:ui
\`\`\`

合并或发布前运行 \`npm run test:full\`。数据库、认证、同步、安全和发布改动需要补充对应检查。

## 数据与安全边界

- 本机学习状态保存在浏览器中，并按当前学习者隔离。
- 云端状态以版本化 JSON 快照保存，并由家庭边界和 Supabase RLS 保护。
- 如果无法确认孩子切换后的完整作用域，应用会进入 fail-closed 状态，暂停本机和云端写入。
- 删除家庭只删除 Shadow Mate 关联的家庭数据，不删除共享 Auth 身份。
- 本仓库的迁移目录用于提案和隔离测试副本；生产迁移由 Shadow Portal 控制面管理。不要在本仓库执行生产 \`db push\`、\`migration repair\` 或 linked SQL。

## 文档

| 文档 | 用途 |
| --- | --- |
| [English README](README.md) | 英文默认项目说明 |
| [使用指南](docs/user-guide.md) | 登录、家庭空间、打卡、同步、发音和安装 |
| [架构文档](docs/architecture.md) | 数据模型、同步、RLS、迁移和发布边界 |
| [English Release Notes](RELEASE_NOTES.md) | 英文版本变更说明 |
| [中文 Release Notes](RELEASE_NOTES.zh-CN.md) | 中文版本变更说明 |
| [Release Notes 模板](docs/release-notes-template.zh-CN.md) | 发布说明写作规则和结构 |

## 许可证

代码采用 [MIT License](LICENSE)。第三方内容、模型和商标归各自权利人所有；影伴品牌边界见 [TRADEMARKS.md](TRADEMARKS.md)。

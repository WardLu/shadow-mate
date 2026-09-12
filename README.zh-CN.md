# 影伴 Shadow Mate

<p align="center">
  <img src="./public/icons/icon-192.png" width="88" alt="影伴应用图标">
</p>

<p align="center">
  <strong>把每天的学习，变成看得见的成长。</strong><br>
  面向家庭的儿童学习打卡 PWA：学习、记录、同步，一处完成。
</p>

<p align="center">
  <code>v1.5.2</code> · <a href="./LICENSE">MIT License</a> · Vite + Vanilla JavaScript + Supabase
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="https://sm.shadow.wang/"><strong>立即使用</strong></a> · <a href="https://shadow.wang/zh/products/shadow-mate"><strong>Shadow Lab 官方详情</strong></a> · <a href="./docs/user-guide.md">使用指南</a> · <a href="./docs/README.md">文档导航</a> · <a href="./RELEASE_NOTES.zh-CN.md">中文发布说明</a>
</p>

## 先看产品

影伴围绕家长和孩子的真实日常设计：今天学了什么、哪些任务完成了、连续坚持了几天，都可以在同一个轻量界面里留下记录。

<p align="center">
  <img src="./assets/readme/home.png" width="100%" alt="影伴首页：四个学习模块和今日成长数据">
</p>

<p align="center"><sub>首页示例：四个学习模块统一显示当天完成状态；截图使用本地演示数据，不包含真实家庭信息。</sub></p>

## 它能做什么

- **四个学习模块**：语文、数学、英语、绘本；每个模块内部的任务可以独立打卡和取消。
- **统一学习入口**：先从左侧“学习”进入，再选择语文、数学、英语或绘本；积分、成长、指南和设置仍是独立的一级页面。
- **成长与约定兑现**：近 30 天按模块汇总学习成果；约定奖励在未登录单机即可即时兑换与兑现，登录后自动同步云端账本防多端并发。
- **积分日历**：行为积分单独记录，与学习模块分开，支持按日期查看和补记。
- **家庭空间**：一个家长管理多个学习者，切换孩子后加载对应的学习记录。
- **共享账号登录**：支持邮箱验证码和邮箱密码；可设置、修改或找回适用于 Shadow 系列产品的共享密码。
- **防重复操作**：提交、同步、删除和打卡等操作会拦截快速连点，避免重复创建或重复变更。
- **离线优先**：未登录即可使用；登录后将本机记录同步到云端，并保留本机离线能力。
- **跨设备恢复**：使用版本号进行乐观并发控制，尽量避免多设备同时操作时互相覆盖。

## 真实界面展示

### 成长日历：看见坚持，而不是堆积任务数

<p align="center">
  <img src="./assets/readme/growth-calendar.png" width="100%" alt="影伴成长日历：日期格显示已完成模块数和图例">
</p>

成长日历的口径很明确：语文的识字、古诗、写字是三个独立任务，但同一天只计作 1 个语文模块；绘本是第 4 个学习模块。因此日期格里的 `4/4` 表示四个学习模块全部完成，不是四条任务记录。

### 积分日历：把行为反馈和学习进度分开

<p align="center">
  <img src="./assets/readme/points-calendar.png" width="100%" alt="影伴积分日历：按日期显示无积分、加分、扣分和混合状态">
</p>

积分日历使用独立的颜色图例：无积分、有加分、有扣分、同一天同时有加分和扣分；黄色边框表示当前选中的日期。它不会改变成长日历的四模块统计。

## 统计口径

| 页面 | 统计对象 | 日期状态 |
| --- | --- | --- |
| 首页 | 当天完成的学习模块 | `已完成/4` |
| 成长 | 最近 30 天的学习模块完成数 | `0/4` 到 `4/4`，黄色边框表示今天 |
| 积分 | 当月行为积分记录 | 无积分、加分、扣分、混合积分；黄色边框表示当前选中日期 |

## 快速开始

### 使用应用

```bash
npm ci
npm run dev
```

打开 Vite 输出的本地地址。不要通过 `file://` 直接打开 `index.html`，浏览器模块需要开发服务器。

本地隐私页为 [http://localhost:5173/privacy](http://localhost:5173/privacy)，与主应用共用 Vite 开发服务器。

### 验证项目

```bash
npm run check
npm run build
npm run test:fast
npm run test:ui
```

需要数据库测试时，先启动 Docker Desktop：

```bash
npm run local-dev
npm run local-dev -- plan --projects shadow-mate --json
```

## 本地开发边界

中央本地入口协调共享 Supabase、Mailpit、数据库测试和 Edge Functions，复用已运行且身份匹配的资源，仅启动缺失资源：

```bash
npm run local-dev
```

共享本地 Supabase API 仅限本机使用，Mailpit 位于 [http://127.0.0.1:54324](http://127.0.0.1:54324)。功能工作区直接启动 Vite 不会自动启动 Mailpit 或切换数据库，需要显式设置 loopback Supabase URL 和 publishable key。

非生产和 Preview 来源默认禁止连接生产 Supabase；只有明确授权的临时验证覆盖项才能允许远程生产访问。生产凭据和 service-role key 不得进入仓库。

需要分步排查时仍可使用兼容入口，不应与中央 Edge generation 同时启动：

```bash
npm run supabase:local:start
npm run supabase:local:functions:serve
```

兼容入口通过同级 merchant-admin 和 Shadow Portal 控制面校验的来源准备本地 schema 与函数覆盖层。不要在本仓库根目录运行裸 `supabase start` 代替共享入口。前台函数服务随其终端关闭而停止。

本地数据库 lint：

```bash
cd ../shadow-size/merchant-admin
npx supabase db lint --local --schema public --level warning --fail-on error
```

日常按变更范围选择检查；发布候选运行 `npm run test:full`。`test:fast` 包含静态检查与全部单元测试，真实 Supabase E2E 需要相应环境。覆盖率门槛以测试配置为准。

## 工作方式

```text
浏览器本机状态
      │
      ├─ 未登录：离线学习、打卡、积分和绘本记录
      │
      └─ 登录家庭空间
              │
              ├─ 按学习者隔离记录
              ├─ 按版本号合并多设备状态
              └─ 通过 RLS 和项目边界保护云端数据
```

- 本机学习状态保存在浏览器 `localStorage`，当前学习者单独保存。
- 云端状态以完整 JSONB 快照保存，使用版本号处理并发冲突，减少离线场景的迁移和回归风险。
- 如果孩子切换或本机事务无法确认完整作用域，影伴会进入 fail-closed 安全状态，暂停本机和云端写入；该保护会跨刷新和重新打开浏览器保留，只有账号面板中明确执行“清除本机数据”或删除本机账号的流程才会解除。
- 清除本机数据时会先保持 fail-closed，只有 localStorage 与 Growth Loop IndexedDB 都清理成功后才解除保护；任一步失败都会保留标记并提示重试。
- 家庭、学习者和学习状态按家庭边界隔离；删除家庭时只作用于当前产品和当前家庭，不触碰其他项目身份。
- 家庭空间支持导出家庭 JSON 数据、删除家庭数据；当前共享 Supabase 项目中的服务端流程只删除影伴自己的关联数据，不删除共享 Auth 身份。完整身份删除仅在专用、隔离的 Supabase 项目中启用。

## 项目结构

```text
src/app.js                 页面渲染、交互和本机状态
vite.config.js              Vite 开发环境兼容处理（当前仍包含 Piper 过渡资源）
src/learning-state.js      学习状态机与四个模块的打卡分组
src/cloud.js               验证码/密码登录、家庭空间、同步、导出与删除
src/action-lock.js         全局快速连点拦截与异步操作单次执行锁
src/icons.js               Lucide 图标渲染与图标 hydration
supabase/migrations/       已按控制面登记来源恢复的本地 schema / 隔离 CI 测试副本
supabase/functions/        账号级服务端删除
tests/unit/                纯函数与学习状态机测试
tests/e2e/                 离线、云端和数据生命周期测试
```

## Supabase 与安全边界

浏览器仅使用 publishable key；数据隔离由 Supabase RLS、家庭成员关系和产品 ID 共同执行。secret 或 service-role key 不得进入浏览器代码。

本仓库包含迁移提案和隔离 CI 测试副本。共享生产迁移由 Shadow Portal 控制面管理，不得从本仓库执行生产 `db push`、`migration repair`、`--include-all`、linked SQL 或手工编辑 `schema_migrations`。

共享本地开发契约会校验 Supabase 配置和迁移来源；本地验证不授予生产迁移权限。

## 当前边界

影伴当前仓库版本为 v1.5.2，生产地址为 [sm.shadow.wang](https://sm.shadow.wang/)。它是面向家庭的开源 PWA，不包含广告；当前通过 [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy) 记录匿名、聚合的页面访问数据，也没有儿童独立账号体系。数据范围和删除方式见 [隐私说明](PRIVACY.md)，安全问题请按 [安全政策](SECURITY.md) 私下报告。

## 中英文发音

固定课程语音在发布准备阶段由腾讯云合成，并通过 `voice.shadow.wang` 提供不可变 MP3 文件。中文使用智柯（`101030`），英文使用 WeJack（`101050`）。播放无需下载本地模型，也不会调用腾讯云合成接口；影伴不采集麦克风录音。

当前工作区清单共 634 条：98 张识字卡；32 个写字条目的 256 条音频（中文发音、英文发音、字意、图片说明、两个词语、例句和书写提示）；80 条古诗音频；65 个英语单词；104 条数学片段；31 条引导语。随机口算按两个数字、运算符和“等于几”组合朗读；每日内容在已覆盖的完整字库与词库中轮换。新增或修改文案后需要重新预热。浏览器按标准 HTTP 规则缓存音频，离线可用性取决于缓存是否仍被保留。

CDN 播放失败时尝试匹配语言的系统语音；语音列表为空时按请求语言尝试浏览器默认语音，不保证设备具备相应能力。2026-09-09，用户已通过局域网开发服务确认小米手机夸克浏览器发音可用；此结果仅代表该设备与浏览器组合，不代表所有移动浏览器或生产部署。生成与校验命令见[语音维护说明](docs/architecture.md#speech-catalog-maintenance)。

## 致谢

当前固定课程使用腾讯云预生成音频。以下已停用的本地语音资源暂时保留，用于回滚历史和手动清理旧浏览器缓存；当前播放流程不会自动下载或启用它们。相关来源和许可证见 [第三方许可清单](THIRD_PARTY_NOTICES.md)：

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)（Apache-2.0）：浏览器 WebAssembly TTS 运行时
- [matcha-icefall-zh-en](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/matcha-icefall-zh-en.html)：统一中英双语模型

以下 Piper 项目仅作为历史兼容与旧缓存迁移记录保留：

- [piper-tts-web](https://github.com/Poket-Jony/piper-tts-web)（MIT）：浏览器端 Piper 语音引擎封装
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT）：为 Chaowen 中文模型生成拼音音素
- [rhasspy/piper](https://github.com/rhasspy/piper)（MIT）：轻量神经网络语音合成
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）：本地推理运行时
- [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)：英语 `en_US-ljspeech-medium` 和中文 `zh_CN-chaowen-medium` 语音模型（经 `voice.shadow.wang` CDN 分发）

第三方资源的来源、版本指纹和许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [文档索引](docs/README.md) | 架构、工程、发布与合规完整索引 |
| [English README](README.md) | 完整英文产品与开发指南 |
| [使用指南](docs/user-guide.md) | 登录、家庭空间、打卡、同步、语音和安装 |
| [Logo 使用说明](docs/logo-usage.md) | Shadow Mate Logo 使用规范 |
| [英文发布说明](RELEASE_NOTES.md) | 英文用户变更说明 |
| [中文发布说明](RELEASE_NOTES.zh-CN.md) | 中文用户变更说明 |
| [第三方许可](THIRD_PARTY_NOTICES.md) | 库与资源的来源、版本及许可 |
| [隐私](PRIVACY.md) · [安全](SECURITY.md) | 数据处理与漏洞披露政策 |
| [商标政策](TRADEMARKS.md) · [变更记录](CHANGELOG.md) | 品牌使用边界与版本历史 |

## 联系我

如果你对 B 端产品、AI 产品开发、供应链数字化或 Shadow 系列产品感兴趣，可以通过以下方式联系我：

- **X（Twitter）**：[@Gollumgulu](https://x.com/Gollumgulu)
- **微信公众号**：Ward 的 AI 产品实战

  <p align="center">
    <img src="./assets/readme/wechat-public-account.png" width="180" alt="微信公众号：Ward 的 AI 产品实战">
  </p>

- **小红书 / 微博 / 抖音**：全网同名「Ward 的 AI 产品实战」——[小红书](https://xhslink.cn/m/4W1NWyRrxv5) · [微博](https://weibo.com/u/8344390431) · [抖音](https://v.douyin.com/1y06PMohfoE/)
- **产品主页**：[Shadow Lab](https://www.shadow.wang/)
- **Email**：[wardlu@126.com](mailto:wardlu@126.com)

> **可接 1v1 咨询和项目陪跑，欢迎联系。**
>
> 产品诊断 · AI 实施 · 工作流 / Skill / 系统定制

## License

代码采用 [MIT License](LICENSE)。仓库中提到的第三方书名、品牌、视频平台和内容链接仍归各自权利人所有；MIT License 不授予第三方内容、模型或商标的使用权。Shadow Mate 品牌边界见 [TRADEMARKS.md](TRADEMARKS.md)。

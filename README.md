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
  <a href="https://sm.shadow.wang/"><strong>立即使用</strong></a>　·　<a href="./docs/user-guide.md">使用指南</a>
</p>

## 先看产品

影伴围绕家长和孩子的真实日常设计：今天学了什么、哪些任务完成了、连续坚持了几天，都可以在同一个轻量界面里留下记录。

<p align="center">
  <img src="./assets/readme/home.png" width="100%" alt="影伴首页：四个学习模块和今日成长数据">
</p>

<p align="center"><sub>首页示例：四个学习模块统一显示当天完成状态；截图使用本地演示数据，不包含真实家庭信息。</sub></p>

## 它能做什么

- **四个学习模块**：语文、数学、英语、绘本；每个模块内部的任务可以独立打卡和取消。
- **成长记录**：近 30 天按学习模块统计完成情况，用 `已完成/4` 直接说明当天进度。
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

```powershell
npm.cmd ci
npm.cmd run dev
```

打开终端输出的本地地址即可。不要直接双击 `index.html`，因为浏览器在 `file://` 协议下无法正常加载 ES Module。

隐私页本地入口为 `http://localhost:5173/privacy`；它与主应用共用 Vite 开发服务器，但会直接展示独立的双语隐私 HTML。

### 验证项目

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run test:fast
npm.cmd run test:ui
```

需要本地数据库测试时，先启动 Docker Desktop：

```powershell
npm run local-dev
npm run local-dev -- plan --projects shadow-mate --json
```

日常开发优先使用中央多项目入口：它会预选 Shadow Mate，并只补齐当前缺少的
shared_test、Schema、Edge generation 和 5173 产品进程；已运行且身份匹配的资源会复用。
`supabase:local:start` 与 `supabase:local:functions:serve` 仍保留为一版兼容排查入口，
不应与中央 Edge generation 同时启动。

仅需兼容分步入口时：

```powershell
npm run supabase:local:start
npm run test:db
```

`supabase:local:start` 会转到同级 `shadow-size/merchant-admin`，启动共享本地 Supabase，并按 Shadow Portal 控制面的 SHA-256 校验结果加载 Shadow Mate 的 `learning_*` 业务 schema。控制面历史快照只会应用到 `127.0.0.1:54322`，不会复制到生产迁移目录，也不会连接生产数据库。

如果要验收登录、找回密码或其他 Edge Function，再开一个终端运行：

```powershell
npm run supabase:local:functions:serve
```

该命令会准备共享函数覆盖层并以前台方式运行本地函数服务；关闭该终端就会停止函数服务。

如果要对共享本地数据库执行 lint，请在 merchant-admin 目录运行：

```powershell
cd ../shadow-size/merchant-admin
npx supabase db lint --local --schema public --level warning --fail-on error
```

`test:coverage` 覆盖核心纯函数、学习状态机和防重复操作锁，语句、分支、函数和行覆盖率门槛均为 80%。`test:e2e` 覆盖离线导航、打卡、积分、日历、家庭空间、重复点击保护、邮箱验证码/密码登录、找回密码、数据生命周期和云端冲突限次重试；真实 Supabase E2E 需要额外配置环境变量。

日常开发按改动范围选择最小充分的检查：页面改动运行目标 UI 测试，数据库/认证/同步改动补充对应集成测试；合并或发布前运行 `npm.cmd run test:full`。`test:fast` 是静态检查加全部 unit test，不是 changed-only 测试。

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

当前部署配置位于 `src/config.js`，浏览器端只使用 publishable key。真正的数据隔离由 Supabase RLS、家庭成员关系和产品 ID 共同完成；绝不能把 secret key 或 `service_role` key 放进仓库。

### 共享 Supabase 与迁移边界

影伴接入共享 Supabase 后，日常本地验收通过中央 `npm run local-dev`，由同级
`shadow-size/merchant-admin` 启动共享本地实例，并加载经 Shadow Portal 控制面校验的
Shadow Mate `learning_*` schema。需要仅排查数据库或兼容 Edge 时，才使用上面的两个旧 npm
wrapper；当前两个 Shadow Mate Edge Function 不依赖应用级共享 helper，但保留
`supabase/functions/_shared/README.md` 作为受控空 shared bundle，供中央 Edge generation
做来源校验和增量重建。

仓库中的 `supabase/migrations/` 仍用于保存与代码同步的迁移提案和隔离 CI 测试副本，不是共享生产库的唯一发布目录。共享生产迁移的 canonical 文件、审批、发布和台账由 `shadow-portal/supabase/control-plane` 管理；不要在本仓库直接执行生产 `db push`、`migration repair` 或 linked SQL。

当前本地 Growth Loop 9 条迁移已按控制面登记来源恢复并逐条核验 SHA-256：8 条来自 `origin/feat/growth-loop-integration`，期初积分迁移来自 `origin/main`。这只恢复本地 Schema 来源，不代表产品仓库获得生产迁移发布权限。

`supabase/config.toml` 的独立端口和迁移配置仅供 CI/隔离测试使用。不要在影伴仓库根目录直接运行裸 `supabase start` 来代替共享本地启动。

数据库迁移提案包括：

- 项目登记和共享多租户兼容性
- 家庭、成员、学习者和学习状态表
- 产品约束、年级兼容性和索引
- 家庭删除生命周期、Auth 身份删除和服务端执行权限

详细设计见 [架构文档](docs/architecture.md)，数据范围见 [隐私说明](https://sm.shadow.wang/privacy)，安全问题请按 [安全政策](SECURITY.md) 私下报告。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [使用指南](docs/user-guide.md) | 家长登录、家庭空间、打卡、日历、同步、语音和安装 |
| [架构文档](docs/architecture.md) | 数据模型、同步策略、RLS、迁移和发布闸门 |
| [Logo 使用说明](docs/logo-usage.md) | 绿色版、霓虹版与功能子标的适用场景 |
| [商标使用政策](TRADEMARKS.md) | Shadow Mate、影伴和 Shadow Nexus 的品牌使用边界 |
| [第三方许可清单](THIRD_PARTY_NOTICES.md) | npm、Piper、模型和 vendored 资源的来源与许可状态 |
| [Changelog](CHANGELOG.md) | 详细变更记录 |
| [Release Notes](RELEASE_NOTES.md) | 版本发布说明 |

## 当前边界

影伴当前仓库版本为 v1.3.11，生产地址为 [sm.shadow.wang](https://sm.shadow.wang/)。它是面向家庭的开源 PWA，不包含广告；当前通过 [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy) 记录匿名、聚合的页面访问数据，也没有儿童独立账号体系。数据范围和删除方式见 [隐私说明](https://sm.shadow.wang/privacy)，安全问题请按 [安全政策](SECURITY.md) 私下报告。

### 英语发音

“听发音”优先使用设备提供的英语系统语音。MacBook 等通常有可用系统语音的设备，听到的是系统 TTS；没有英语系统语音的国产 Android（尤其是无 GMS 设备）会切换到浏览器本地 Piper，首次使用会从 `voice.shadow.wang` CDN 下载约 63.5MB 的 `en_US-ljspeech-medium` 离线语音包并缓存到浏览器。两类设备使用的引擎不同，因此音色和听感可能不同；Piper 下载完成后可离线合成，且不会上传录音。

## 致谢

影伴的“听发音”当前优先使用设备系统英语语音；系统没有可用语音、语音无响应或播放失败时，使用浏览器本地 Piper 合成兜底。系统 TTS 是否联网取决于设备和浏览器的语音引擎；影伴不采集麦克风录音。相关开源项目和许可证见 [第三方许可清单](THIRD_PARTY_NOTICES.md)：

- [piper-tts-web](https://github.com/Poket-Jony/piper-tts-web)（MIT）：浏览器端 Piper 语音引擎封装
- [rhasspy/piper](https://github.com/rhasspy/piper)（MIT）：轻量神经网络语音合成
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）：本地推理运行时
- [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)：英语语音模型 `en_US-ljspeech-medium`（经 `voice.shadow.wang` CDN 分发）

第三方资源的来源、版本指纹和许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 联系我

如果你对 B 端产品、AI 产品开发、供应链数字化或 Shadow 系列产品感兴趣，可以通过以下方式联系我：

- **X（Twitter）**：[@Gollumgulu](https://x.com/Gollumgulu)
- **微信公众号**：Ward 的 AI 产品实战

  <p align="center">
    <img src="./assets/readme/wechat-public-account.png" width="180" alt="微信公众号：Ward 的 AI 产品实战">
  </p>

- **小红书 / 微博 / 抖音**：全网同名「Ward 的 AI 产品实战」——[小红书](https://xhslink.cn/m/4W1NWyRrxv5) · [微博](https://weibo.com/u/8344390431) · [抖音](https://v.douyin.com/1y06PMohfoE/)
- **产品主页**：[Shadow Nexus](https://www.shadow.wang/)
- **Email**：[wardlu@126.com](mailto:wardlu@126.com)

> **可接 1v1 咨询和项目陪跑，欢迎联系。**
>
> 产品诊断 · AI 实施 · 工作流 / Skill / 系统定制

## License

代码采用 MIT License。仓库中提到的第三方书名、品牌、视频平台和内容链接仍归各自权利人所有；MIT License 不授予第三方内容、模型或商标的使用权。Shadow Mate 品牌边界见 [TRADEMARKS.md](TRADEMARKS.md)。

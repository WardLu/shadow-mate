# 影伴 Shadow Mate

<p align="center">
  <img src="./public/icons/icon-192.png" width="88" alt="影伴应用图标">
</p>

<p align="center">
  <strong>把每天的学习，变成看得见的成长。</strong><br>
  面向家庭的儿童学习打卡 PWA：学习、记录、同步，一处完成。
</p>

<p align="center">
  <code>v1.0.1</code> · <a href="./LICENSE">MIT License</a> · Vite + Vanilla JavaScript + Supabase
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

### 验证项目

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run test:unit
npm.cmd run test:e2e
```

需要本地数据库测试时，先启动 Docker Desktop：

```powershell
supabase start
npm.cmd run test:db
supabase db lint --local --schema public --level warning --fail-on error
```

`test:coverage` 覆盖核心纯函数和学习状态机，语句、分支、函数和行覆盖率门槛均为 80%。`test:e2e` 覆盖离线导航、打卡、积分、日历、家庭空间和数据生命周期；真实 Supabase E2E 需要额外配置环境变量。

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
- 家庭、学习者和学习状态按家庭边界隔离；删除家庭时只作用于当前产品和当前家庭，不触碰其他项目身份。
- 家庭空间支持导出家庭 JSON 数据、删除家庭数据；当前共享 Supabase 项目中的服务端流程只删除影伴自己的关联数据，不删除共享 Auth 身份。完整身份删除仅在专用、隔离的 Supabase 项目中启用。

## 项目结构

```text
src/app.js                 页面渲染、交互和本机状态
src/learning-state.js      学习状态机与四个模块的打卡分组
src/cloud.js               登录、家庭空间、同步、导出与删除
src/icons.js               Lucide 图标渲染与图标 hydration
supabase/migrations/       家庭数据、RLS、生命周期和删除权限
supabase/functions/        账号级服务端删除
tests/unit/                纯函数与学习状态机测试
tests/e2e/                 离线、云端和数据生命周期测试
```

## Supabase 与安全边界

当前部署配置位于 `src/config.js`，浏览器端只使用 publishable key。真正的数据隔离由 Supabase RLS、家庭成员关系和产品 ID 共同完成；绝不能把 secret key 或 `service_role` key 放进仓库。

数据库迁移位于 `supabase/migrations/`，包括：

- 项目登记和共享多租户兼容性
- 家庭、成员、学习者和学习状态表
- 产品约束、年级兼容性和索引
- 家庭删除生命周期、Auth 身份删除和服务端执行权限

详细设计见 [架构文档](docs/architecture.md)，数据范围见 [隐私说明](PRIVACY.md)，安全问题请按 [安全政策](SECURITY.md) 私下报告。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [使用指南](docs/user-guide.md) | 家长登录、家庭空间、打卡、日历、同步、语音和安装 |
| [架构文档](docs/architecture.md) | 数据模型、同步策略、RLS、迁移和发布闸门 |
| [学习者数据生命周期](docs/learner-data-lifecycle.md) | 学习者、家庭数据和删除边界 |
| [Auth 配置](docs/auth-setup.md) | Supabase Auth 服务端配置 |
| [安全基线](docs/security-baseline.md) | 安全检查与发布前闸门 |
| [TODO](TODO.md) | 当前待办与已知问题 |
| [Roadmap](ROADMAP.md) | 已完成阶段与后续方向 |
| [Changelog](CHANGELOG.md) | 详细变更记录 |
| [Release Notes](RELEASE_NOTES.md) | 版本发布说明 |

## 当前边界

影伴 v1.0.1 已部署到 [sm.shadow.wang](https://sm.shadow.wang/)。它目前是面向家庭的开源 PWA，不包含广告、第三方追踪或儿童独立账号体系；公开运营前仍需完成儿童隐私政策、家长同意流程、内容版权审核、备份和事故响应等运营工作，详见 [隐私说明](PRIVACY.md) 与 [安全政策](SECURITY.md)。

## License

代码采用 MIT License。仓库中提到的第三方书名、品牌、视频平台和内容链接仍归各自权利人所有；MIT License 不授予第三方内容或商标的使用权。

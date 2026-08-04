# Shadow Mate Logo 使用说明

本文档是 Shadow Mate Logo 的使用边界。当前项目同时保留产品版和 Shadow Nexus 门户版两套视觉，但二者不能混用。

## 当前结论

| 场景 | 使用版本 | 主文件 | 说明 |
| --- | --- | --- | --- |
| Shadow Mate 应用、PWA、README、产品截图 | 绿色适配版 05「陪伴轨道」 | [`public/brand_assets/shadow-mate.svg`](../public/brand_assets/shadow-mate.svg) | 默认版本，适配浅色绿色产品界面 |
| Shadow Mate 应用图标 PNG | 绿色适配版 05「陪伴轨道」 | [`public/icons/icon-512.png`](../public/icons/icon-512.png) | 用于 PWA、Apple Touch Icon 和兼容性场景 |
| Shadow Nexus Portal、深色品牌页、产品矩阵 | 霓虹版 05「陪伴轨道」 | [`assets/logo-candidates/shadow-family/05-companion-orbit.svg`](../assets/logo-candidates/shadow-family/05-companion-orbit.svg) | 只用于深色背景和 Shadow 母品牌场景 |
| 功能页或活动页 | 06 / 07 / 08 子标 | [`assets/logo-candidates/shadow-family/`](../assets/logo-candidates/shadow-family/) | 不替代 Shadow Mate 主 Logo |

## 绿色适配版：Shadow Mate 默认 Logo

绿色版服务于 Shadow Mate 产品本身，使用产品界面的绿色、浅色背景和成长黄：

- **绿色主体**：对应学习进度、完成状态和稳定的家庭节奏。
- **浅色人物**：代表家长与孩子共同参与学习。
- **黄色中心节点**：代表陪伴、连接和当天的成长反馈。
- **虚线轨道**：代表持续记录，而不是一次性的任务完成。

绿色版适合：

- 应用顶部 Logo、favicon 和 PWA 图标；
- README Hero、产品截图和项目文档；
- `sm.shadow.wang` 产品页；
- 家庭空间、成长日历、学习报告等浅色产品界面。

绿色版不应放在深色背景上强行使用；如果需要深色品牌展示，应使用下面的霓虹版。

## 霓虹版：Shadow Nexus Portal Logo

霓虹版沿用 Shadow Nexus 的深色几何、青蓝到靛紫渐变和发光节点：

- 适合 Shadow Portal、Shadow Nexus 产品矩阵和深色品牌展示；
- 适合深色背景、深色卡片和品牌介绍页；
- 不用于 Shadow Mate 的浅色产品截图、PWA 图标或 README 主 Hero；
- 不应与绿色产品界面的进度条、成长日历和完成状态混排。

## 功能子标

- **06「四层学习切片」**：语文、数学、英语、绘本四个模块的结构示意，适合产品架构图和后台模块页。
- **07「每日检查点」**：成长日历、每日打卡和成长报告相关页面。
- **08「开放书页」**：绘本、阅读和学习内容相关页面。

这些子标用于解释功能，不承担产品主品牌识别任务。对外介绍 Shadow Mate 时，优先使用绿色版 05。

## 技术要求

- 优先使用 SVG，保证 Logo 在 README、网页和文档中清晰缩放。
- PWA 和系统图标继续提供 PNG：`192x192`、`512x512` 与 `maskable`。
- 绿色版使用浅色不透明画布，避免透明角在深色预览器中显示成黑色。
- 轨道虚线必须声明 `fill="none"`，避免 SVG 默认填充开放路径产生黑色楔形。
- 不要把霓虹版复制到 `public/icons/` 或替换 Shadow Mate 的应用图标。

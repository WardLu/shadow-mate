# Shadow Mate 文档索引

欢迎查阅 Shadow Mate（影伴）的项目文档。本文档目录集中整理了面向用户、开发者与架构师的公开设计文档、系统架构与合规资产。

---

## 目录导航

### 1. 📖 产品与使用指南 (Product & User Guides)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [用户使用指南 (User Guide)](user-guide.md) | 家长登录、家庭空间、打卡、日历、同步、语音及 PWA 安装指引 | 最终用户 / 家长 |
| [隐私说明 (Privacy)](../PRIVACY.md) | 数据最小化原则、家长同意记录与删除流程 | 最终用户 / 家长 |
| [Logo 使用规范 (Logo Usage)](logo-usage.md) | 绿色版、霓虹版与功能子标的适用场景 | 设计 / 品牌 |

---

### 2. 🏛️ 系统架构与技术规范 (Architecture & Engineering)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [系统架构与数据模型 (Architecture)](architecture.md) | 模块职责、学习者作用域切换、Web Audio 声音引擎、Local-first 兑现闭环与数据隔离 | 开发者 / 架构师 |

---

### 3. 🚀 发布与协作 (Release & Collaboration)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [中文发布说明 (Release Notes)](../RELEASE_NOTES.zh-CN.md) | 每个已发布版本的用户可见变更 | 全员 |
| [变更日志 (Changelog)](../CHANGELOG.md) | 按版本记录的工程变更明细 | 开发者 / 发布 |
| [贡献指南 (Contributing)](../CONTRIBUTING.md) | 环境要求、测试入口与提交规范 | 贡献者 |

Vercel 项目设置与 `vercel.json` 均关闭 Git 自动部署。GitHub Release 工作流只更新 `production` 分支指针；生产发布只通过 `npm run release:production`（即 `bash scripts/release/deploy-production.sh`）执行。

---

### 4. ⚖️ 开源许可与第三方合规 (Licenses & Compliance)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [硬笔楷书字体授权 (Font License)](licenses/ruimeijia-zhangqingping-font.md) | 瑞美加张清平硬笔楷书商用许可与首发证明 | 审计 / 开发者 |
| [第三方许可清单 (Root Notice)](../THIRD_PARTY_NOTICES.md) | npm 依赖、WASM 运行时与语音模型的授权汇总 | 全员 |
| [商标使用政策 (Root Trademarks)](../TRADEMARKS.md) | Shadow Mate、影伴和 Shadow Lab 的品牌使用边界 | 全员 |
| [安全政策 (Security)](../SECURITY.md) | 漏洞私下报告渠道与响应约定 | 全员 |

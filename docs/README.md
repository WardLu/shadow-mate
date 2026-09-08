# Shadow Mate 文档索引

欢迎查阅 Shadow Mate（影伴）的项目文档。本文档目录集中整理了面向用户、开发者与架构师的公开设计文档、技术规范与发布资产。

---

## 目录导航

### 1. 📖 产品与使用指南 (Product & User Guides)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [用户使用指南 (User Guide)](user-guide.md) | 家长登录、家庭空间、打卡、日历、同步、语音及 PWA 安装指引 | 最终用户 / 家长 |
| [产品方向与定位 (Product Direction)](product-direction.md) | 面向家庭的成长工作台定位、核心价值与第一性原理 | 团队 / 开发者 |
| [Logo 使用规范 (Logo Usage)](logo-usage.md) | 绿色版、霓虹版与功能子标的适用场景 | 设计 / 品牌 |
| [隐私政策发布指南 (Privacy Policy Publishing)](privacy-policy-publishing.md) | 隐私说明发布要求与合规核验流程 | 合规 / 发布者 |

---

### 2. 🏛️ 系统架构与工程规范 (Architecture & Engineering)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [系统架构与数据模型 (Architecture)](architecture.md) | 整体技术栈、客户端状态、Supabase 边界与数据隔离模型 | 开发者 / 架构师 |
| [分支集成与回灌策略 (Branch Integration Policy)](branch-integration-policy.md) | `main`、`preview`、`production` 分支职责及自动化基线门禁 | 开发者 / 协作者 |
| [架构决策记录 (ADR)](adr/0001-one-preschool-system-three-stage-packs.md) | 幼儿启蒙学习包三阶段架构决策 (ADR-0001) | 开发者 / 架构师 |

---

### 3. 🚀 发布管理与版本资产 (Release Management)

| 文档 | 说明 | 适用对象 |
| :--- | :--- | :--- |
| [发布闭环与部署快照 (Release Closure)](release-closure.md) | 生产部署核验快照与 Release Watcher 承接约定 | 发布运维 |
| [Release Notes 英文模板](release-notes-template.md) | 面向最终用户的版本更新说明撰写模板 (EN) | 维护者 |
| [Release Notes 中文模板](release-notes-template.zh-CN.md) | 面向最终用户的版本更新说明撰写模板 (ZH-CN) | 维护者 |
| [版本配置影响记录 (Releases)](releases/1.5.0/CONFIGURATION_IMPACT.json) | 各正式版本的配置影响台账与发布审查记录（1.3.12 / 1.4.0 / 1.5.0） | 维护者 / 审计 |

---

### 4. ⚖️ 开源许可与第三方合规 (Licenses & Compliance)

| 文档 | 说明 |
| :--- | :--- |
| [硬笔楷书字体授权 (Font License)](licenses/ruimeijia-zhangqingping-font.md) | 瑞美加张清平硬笔楷书商用许可与首发证明 |
| [第三方许可清单 (Root Notice)](../THIRD_PARTY_NOTICES.md) | npm 依赖、WASM 运行时与语音模型的授权汇总 |
| [商标使用政策 (Root Trademarks)](../TRADEMARKS.md) | Shadow Mate、影伴和 Shadow Nexus 的品牌使用边界 |

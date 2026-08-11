# Shadow Mate 商业化边界

状态：公共 Core 边界与服务契约准备完成；Billing、生产 Entitlement 和私有 Services 尚未接入

本文件把开源项目与未来官方服务分开。目标不是把公共版本砍成 Demo，而是让一个家庭可以完整使用 Shadow Mate Core，同时让官方服务通过托管、智能和内容创造商业价值。

## 1. 当前决策

| 层 | 归属 | 说明 |
| --- | --- | --- |
| Shadow Mate Core | Public / MIT | 家庭、学习者、任务、积分、奖励、基础游戏化、离线和自托管能力 |
| Shadow Mate Cloud Free | Official managed service | 当前继续免费；价值是官方托管、同步、升级、备份和运维 |
| Shadow Mate Services | Private / future | Billing、Entitlement、Quota、AI、Premium Content 和运营后台 |

当前不创建私有仓库、不修改 LICENSE、不接入支付，也不在浏览器中放入 API secret、商业 Prompt 或 Premium 内容。

## 2. Public Core 可以知道什么

Core 只消费能力快照，不直接读取套餐、订阅、支付、积分额度或商业数据库：

```json
{
  "contractVersion": 1,
  "capabilities": {
    "cloud_sync": { "enabled": true, "remaining": null, "resetAt": null },
    "core_incentives": { "enabled": true, "remaining": null, "resetAt": null },
    "ai_task_fun": { "enabled": false, "remaining": null, "resetAt": null },
    "ai_activity_generator": { "enabled": false, "remaining": null, "resetAt": null },
    "weekly_growth_plan": { "enabled": false, "remaining": null, "resetAt": null },
    "advanced_growth_report": { "enabled": false, "remaining": null, "resetAt": null },
    "premium_content": { "enabled": false, "remaining": null, "resetAt": null },
    "extra_storage": { "enabled": false, "remaining": null, "resetAt": null }
  }
}
```

契约规则：

- `contractVersion` 当前为 `1`；变更时必须升级版本并兼容旧客户端；
- `enabled` 只有严格的布尔 `true` 才表示可用；
- `remaining` 只能是非负整数或 `null`；
- `resetAt` 只能是可解析的时间字符串或 `null`；
- 未知 Capability 必须被 Core 忽略；
- 客户端只负责展示和交互提示，不能把 UI 判断当成安全边界。

公共实现位于 [`src/commercialization-contract.js`](../src/commercialization-contract.js)，只做快照归一化，不连接支付或远程服务。

## 3. 私有服务边界

未来的 `shadow-mate-services` 可以包含：

- `entitlements`：订阅、套餐、额度、促销和 Capability 计算；
- `ai`：Prompt、模型路由、儿童内容安全、评测、成本控制和个性化策略；
- `content`：Premium Growth Packs、内容编辑、审核、版权和发布；
- `analytics`：聚合后的产品指标，不把儿童个人数据直接用于公开分析；
- `billing`：支付、发票、Webhook 签名验证和退款。

Core 不应出现大量 `if (plan === "pro")`，也不应直接查询 `subscriptions`、`credits` 或支付表。受信服务必须在服务器端执行 Entitlement、Quota、Rate Limit 和内容授权。

## 4. Provider 方向

### ActivityGenerator

公共 Core 只定义请求和结果形状。请求可以包含当前任务、家长输入、年龄/年级、兴趣、目标、可用时间和语言；默认不包含真实姓名、邮箱、精确位置或儿童照片。

结果应是可编辑的亲子活动：标题、情境、步骤、预计时长、完成提示和建议积分。建议积分不能绕过家长确认直接写入账本。

### ContentProvider

公共 Core 可以加载公开或自托管内容；Premium 内容只返回受信服务确认过的内容引用。Premium 内容不能随 PWA 静态资源一起发布，也不能依赖 CSS 隐藏实现授权。

## 5. 商业化前置闸门

以下事项完成前，不应正式销售 Pro 或 Premium Content：

- Piper 模型权利链，以及 `piper_phonemize` WASM/eSpeak NG GPL 依赖的商业分发决策（Lessac 已替换为 ljspeech，但法律清权仍未完成）；
- 第三方依赖和 vendored 文件的来源、版本、许可证及 notices 可追溯；
- 儿童隐私、可验证家长同意、数据保留、删除、撤回和事故响应流程；当前工程控制见 [儿童隐私与家长同意审核](child-privacy-and-consent.md)，不等于法律清权；
- 真实服务端 Entitlement、Quota、支付 Webhook 签名和审计日志；
- 商标、CLA 和商业主体/IP 归属的法律审核，见 [IP 法律审核记录](ip-legal-review.md)。

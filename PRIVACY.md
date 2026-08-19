# 影伴隐私说明 / Shadow Mate Privacy Policy

当前版本：`privacy-v2`

生效日期：2026 年 8 月 20 日 / August 20, 2026

线上展示版：[sm.shadow.wang/privacy](https://sm.shadow.wang/privacy)

仓库根目录的 `privacy-policy.html` 是中英文线上发布源文件。本文件描述同一数据边界；两者必须同步更新。

## 中文

影伴面向家庭和未成年学习者，默认遵循数据最小化原则。本说明描述当前 Dogfooding 和小规模内测版本的技术行为。

### 收集和保存的数据

- 家长用于登录的邮箱，由 Supabase Auth 处理。
- 家庭空间名称。
- 学习者显示名称和年级。建议使用昵称，不填写真实姓名。
- 打卡、积分、书架、阅读日志、奖励和兑换等学习状态。
- 私有后端活动事件：产品标识、随机事件 ID、内部家庭和学习者 ID、协议允许的事件类型、事件发生和服务端接收时间、家庭时区、客户端版本、操作用户 ID，以及少量有类型和长度限制的枚举、布尔值或计数诊断字段。事件类型仅用于家庭启用、学习者创建、核心激活、有效成长行为、留存达标、奖励兑现、同步失败和本地朗读失败。

后端活动事件只用于内测漏斗、留存和连续使用统计，以及同步和本地朗读故障诊断。它们不接受自由文本、完整错误堆栈、页面 URL、邮箱、儿童显示名称、学习内容或语音文本；业务事实仍以积分、奖励和兑换等业务表为准。

当前版本不要求儿童提供邮箱、手机号、生日、学校、地址、精确位置或照片，也不包含广告。

### Vercel Analytics 与后端活动事件

应用通过 `@vercel/analytics` 使用 Vercel Web Analytics 记录匿名、聚合的页面访问数据。当前不向 Vercel Analytics 发送自定义事件，也不把学习状态、邮箱或儿童显示名称作为 Analytics 自定义字段发送。Vercel 页面访问数据可能包含时间、页面 URL、来源、设备、浏览器、操作系统和粗略地理位置；详情见 [Vercel Web Analytics Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy)。

“不向 Vercel Analytics 发送自定义事件”不表示影伴后端完全不记录事件。上节所述后端活动事件保存在 Shadow Mate 的私有 Supabase schema 中，与 Vercel Analytics 分开处理和保留。

当前版本的本地 Piper 朗读不把文本发送到影伴服务器。影伴不采集麦克风录音。

### 家长同意和学习者档案

学习者不是独立登录账号。创建第一个学习者或添加学习者前，登录用户必须确认自己是家长或监护人，并阅读本说明。系统会记录家庭 ID、认证用户 ID、同意类型 `learner_data_processing`、隐私说明版本和数据库生成的同意时间。客户端不能修改同意时间戳，也不能在没有有效同意记录时通过公开 API 创建新的学习者档案。

`privacy-v2` 明确披露私有后端活动事件、180 天保留期和导出边界。新同意记录使用 `privacy-v2`。已有 `privacy-v1` 记录继续作为有效的历史同意，不改写原始同意时间，也不要求仅因本次说明更新而重新确认。

### 数据存放、隔离和访问

- 离线学习状态保存在当前设备的浏览器 `localStorage` 中；登录会话保存在 `sessionStorage` 中。
- 登录后，家庭和学习状态同步到项目配置的 Supabase 数据库。
- 学习数据按家庭隔离。匿名访问没有学习表权限；登录用户仍必须通过 `project_id = 'shadow-mate'`、家庭成员关系和 RLS 才能读取或修改记录。
- 后端活动事件和内测批次记录位于私有 schema。浏览器、普通登录用户和家庭成员不能直接读取这些表或执行聚合/清理函数；活动事件只能由 owner/guardian 通过受控 RPC 写入协议允许的字段，受信运维角色才能读取或清理。

本机数据通常会保留到用户清除网站数据、使用隐私/无痕窗口、浏览器或系统自动清理，或更换访问域名。`localStorage` 是离线缓存，不应作为唯一备份；登录并同步后，云端家庭记录才是跨设备恢复来源。

### 删除、导出和保留

- “清除本机数据”只删除当前设备的离线学习记录并退出登录，不删除云端记录。
- 家庭 JSON 导出是可移植的家庭业务数据副本，包含家庭 ID/名称、学习者档案和状态、同意记录，以及 Growth Loop 的积分项目、学习者绑定、奖励、积分流水和兑换记录。
- 导出不包含 Supabase Auth 身份或邮箱、会话/设备数据、Vercel Analytics 数据、私有后端原始活动事件 `private.learning_activity_events`，也不包含私有内测批次记录 `private.learning_beta_batches`。这些 server-only 记录不属于可移植的家庭业务历史。
- 原始后端活动事件从服务端 `received_at` 起保留 180 天；超过 180 天的记录由受信清理任务删除。家庭或学习者删除时，关联活动事件会通过数据库外键级联删除，不等待保留期结束。
- 内测批次记录随家庭删除级联删除。家庭所有者使用“删除全部家庭数据”时，家庭业务数据、同意记录、关联活动事件和内测批次记录都由同一家庭删除路径覆盖。
- 共享 Supabase 项目中的家庭数据删除不会删除 Supabase Auth 身份；用户仍可使用同一邮箱重新登录。身份删除只在专用、隔离且经过服务端授权的账号删除流程中启用。
- 当前没有独立的“撤回同意但保留家庭”自助流程。

### 安全问题

不要在公开 Issue 中提交个人数据或安全漏洞。请使用仓库的私密漏洞报告功能，流程见 [SECURITY.md](SECURITY.md)。

## English

Shadow Mate is designed for families and learners who may be minors. We apply data minimization by default. This policy describes the current Dogfooding and small-scale beta implementation.

### Data We Collect and Store

- A parent's sign-in email, handled by Supabase Auth.
- The household space name.
- A learner display name and grade. We recommend a nickname rather than a real name.
- Learning state such as check-ins, points, bookshelf and reading logs, rewards, and redemptions.
- Private backend activity events: product identifier, random event ID, internal household and learner identifiers, an allowlisted event type, occurrence and server receipt timestamps, household timezone, client version, actor user ID, and a small typed and length-bounded set of enum, boolean, or count diagnostic fields. Event types are limited to household activation, learner creation, core activation, effective growth activity, retention qualification, reward redemption, sync failure, and local text-to-speech failure.

Backend activity events are used only for beta funnel, retention, and sustained-use metrics, and for sync and local text-to-speech diagnostics. They do not accept free text, full error stacks, page URLs, email addresses, learner display names, learning content, or speech text. Product facts remain in the point, reward, and redemption records.

The current version does not require a child to provide an email address, phone number, birthday, school, address, precise location, or photo. It does not contain advertising.

### Vercel Analytics and Backend Activity Events

The app uses Vercel Web Analytics for anonymous, aggregated page-visit data. It currently sends no custom events to Vercel Analytics and does not send learning state, email addresses, or learner display names as custom Analytics fields. Vercel page-visit data may include time, page URL, referrer, device, browser, operating system, and approximate location. See [Vercel Web Analytics Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy).

“No custom events sent to Vercel Analytics” does not mean the Shadow Mate backend records no events. The private backend activity events described above are stored in Shadow Mate's private Supabase schema and have separate access and retention rules.

The local Piper text-to-speech feature does not send text to Shadow Mate servers. Shadow Mate does not record microphone audio.

### Parental Consent and Learner Profiles

A learner is not an independent login account. Before creating or adding a learner, the signed-in user must confirm that they are the child's parent or guardian and read this policy. The system stores the household ID, authenticated user ID, consent type `learner_data_processing`, policy version, and a database-generated consent timestamp. The client cannot change the timestamp, and the public API cannot create a learner profile without a valid consent record.

`privacy-v2` expressly documents private backend activity events, their 180-day retention, and the export boundary. New consent records use `privacy-v2`. Existing `privacy-v1` records remain valid historical consent; their original timestamps are not rewritten, and this policy update alone does not require a new confirmation.

### Storage, Isolation, and Access

- Offline learning state is stored in the current browser's `localStorage`; the sign-in session uses `sessionStorage`.
- After sign-in, household and learning state sync to the configured Supabase database.
- Learning data is isolated by household. Anonymous users have no learning-table access. Signed-in users must still pass `project_id = 'shadow-mate'`, household membership, and RLS checks.
- Backend activity events and beta batch records are in a private schema. Browsers, ordinary authenticated users, and household members cannot directly read those tables or execute aggregation or cleanup functions. An owner or guardian may write only allowlisted event fields through a guarded RPC; trusted operations roles may read or purge them.

Local data normally remains until site data is cleared, a private/incognito session is used, the browser or operating system cleans it up, or the domain changes. `localStorage` is an offline cache and should not be the only backup. After synchronization, the cloud household record is the source for cross-device recovery.

### Deletion, Export, and Retention

- “Clear local data” removes only offline records on the current device and signs the user out; it does not delete cloud records.
- The household JSON export is a portable copy of household business data. It includes household ID/name, learner profiles and state, consent records, and Growth Loop point items, learner bindings, rewards, point ledger, and redemption records.
- The export excludes the Supabase Auth identity or email, session/device data, Vercel Analytics data, raw private backend activity events in `private.learning_activity_events`, and private beta batch records in `private.learning_beta_batches`. Those server-only records are not portable household business history.
- Raw backend activity events are retained for 180 days from server `received_at`; trusted cleanup deletes records older than 180 days. Deleting a household or learner cascades to its activity events without waiting for the retention period.
- Beta batch records cascade when the household is deleted. “Delete all household data” covers household business data, consent records, related activity events, and beta batch records through the same household deletion path.
- Deleting household data in the shared Supabase project does not delete the Supabase Auth identity. Identity deletion is available only in a dedicated, isolated, server-authorized account deletion flow.
- There is currently no self-service flow to withdraw consent while keeping the household.

### Security Issues

Do not submit personal data or security vulnerabilities in public issues. Use the repository's private vulnerability reporting process described in [SECURITY.md](SECURITY.md).

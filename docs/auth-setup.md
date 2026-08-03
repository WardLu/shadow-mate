# Supabase Auth 配置指南

影伴使用共享多租户 Supabase 项目（`dutepjyocxcvecmsrtfp`）。以下配置在 Supabase Dashboard 完成，不在代码仓库中。

## Site URL

`https://shadow.wang`

共享项目的主域名。当 emailRedirectTo 不在白名单时作为回退地址。

## Redirect URLs

在 Dashboard > Authentication > URL Configuration 中配置，每行一个：

```
https://*.shadow.wang
https://shadow.wang
https://*-wardlus-projects.vercel.app
https://shadow-mate.vercel.app
https://wiznote-to-obsidian.vercel.app
https://shadow-shift-api.vercel.app
https://legal-five-fawn.vercel.app
http://localhost:5173
http://localhost:3000
```

> 注意：Supabase Management API 的 `uri_allow_list` 字段会吞掉换行符，无法通过 API 设置多行 URL。必须通过 Dashboard 配置。

## 邮件模板

首次使用邮箱验证码且用户尚未注册时，Supabase 会发送 **Confirm signup**；已有用户会发送 **Magic Link**；找回密码会发送 **Reset password / Recovery**。三套模板必须保持同一套多项目品牌规则。

仓库已将三套本地模板固定在：

- `supabase/templates/confirmation.html`
- `supabase/templates/magic_link.html`
- `supabase/templates/recovery.html`

Confirm signup 与 Magic Link 提供验证码和应用内验证链接；Recovery 使用 Supabase 官方 `{{ .ConfirmationURL }}` 完成一次性密码恢复。三套模板都使用 `{{ .RedirectTo }}` 区分来源：

- `{{ .Token }}`：验证码，前端通过 `verifyOtp({ email, token, type: "email" })` 校验
- 基于 `{{ .TokenHash }}` 的应用内验证按钮，避免邮件客户端预取 `{{ .ConfirmationURL }}` 导致链接提前失效
- `{{ .RedirectTo }}`：按发起认证请求的产品回跳域名识别品牌。当前映射为：`https://sm.shadow.wang` → `影伴 Shadow Mate`，`https://sc.shadow.wang` / `https://sbc.shadow.wang` → `影匣 Shadow Card`，`https://ss.shadow.wang` → `影裁 Shadow Size`；未知来源回退为 `Shadow Nexus`，主题使用短品牌名以满足 Supabase 255 字符限制。各产品调用 `resetPasswordForEmail` 时应传产品根域名作为 `redirectTo`。
- `{{ .Data.product_id }}` / `{{ .Data.product_name }}`：作为域名识别之外的产品元数据回退；缺失时回退到 `Shadow Nexus`

生产环境的 **Confirm signup** 和 **Magic Link** 已同步；新增 Recovery 模板在本次改动发布时仍需通过 Supabase Management API 或 Dashboard 单独同步。托管邮件模板不属于数据库迁移，提交代码不会自动改变线上模板。

密码流程使用 Supabase 官方接口：`signInWithPassword`、`resetPasswordForEmail`、`PASSWORD_RECOVERY` 和 `updateUser`。不得自建公开密码重置令牌表，不得在浏览器或业务表中保存密码，也不得使用 `user_metadata` 判断授权。

> 注意：邮件模板和发件人仍是 Supabase 项目级配置。正文和主题使用本次请求的 `RedirectTo` 区分来源，不依赖已有用户的 `user_metadata`，因此同一共享 Auth 项目中已经在其他产品注册过的用户也能按当前产品显示；发件人显示名仍无法按单封邮件动态切换。如果同一邮箱已经在多个产品间共用，最可靠的长期方案仍是为产品拆分 Auth 项目。

## SMTP / 发件人

- 发件人名称：`Shadow Nexus`
- 发件人地址：`noreply@shadow.wang`
- SMTP 主机：`smtp.resend.com:465`

发件人名称和地址是项目级共享配置，影响所有使用此 Supabase 项目的产品的登录邮件。

## Deployment Protection

已关闭 SSO Protection（Vercel Dashboard > Project > Settings > Deployment Protection）。

影伴是公开 PWA，Preview 和 Production 均需直接访问。如需恢复保护，在 Vercel 项目设置中重新启用。

## Account deletion isolation

The current shared project deliberately rejects Auth identity deletion from the `delete-account` Edge Function. Shadow Mate's product-data deletion remains available, while identity deletion requires the isolated-project configuration below.

To enable complete account deletion, deploy Shadow Mate against a dedicated Supabase project whose `public.projects` registry contains only `shadow-mate`, then set these Edge Function secrets/configuration values:

```text
SHADOW_MATE_AUTH_PROJECT_ISOLATED=true
SHADOW_MATE_AUTH_PROJECT_REF=<dedicated-project-ref>
```

Set `VITE_SUPABASE_AUTH_ACCOUNT_DELETION=1` only for that isolated frontend deployment. The server function revokes sessions, deletes only Shadow Mate-owned household rows, and then deletes the Auth identity with the secret key. Never put the secret key in browser environment variables.

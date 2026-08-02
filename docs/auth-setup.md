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

首次使用邮箱登录且用户尚未注册时，Supabase 会发送 **Confirm signup**；已有用户会发送 **Magic Link**。两套模板必须保持同一套品牌和验证方式，不能只修改 Magic Link。

仓库已将两套本地模板固定在：

- `supabase/templates/confirmation.html`
- `supabase/templates/magic_link.html`

两套模板都提供：

- `{{ .Token }}`：验证码，前端通过 `verifyOtp({ email, token, type: "email" })` 校验
- 基于 `{{ .TokenHash }}` 的应用内验证按钮，避免邮件客户端预取 `{{ .ConfirmationURL }}` 导致链接提前失效
- `{{ .RedirectTo }}`：按发起认证请求的产品回跳域名优先识别产品。当前映射为：`https://sm.shadow.wang` → `影伴 Shadow Mate`，`https://sc.shadow.wang` / `https://sbc.shadow.wang` → `影匣 Shadow Card`，`https://ss.shadow.wang` → `影裁 Shadow Size`
- `{{ .Data.product_id }}` / `{{ .Data.product_name }}`：作为域名识别之外的产品元数据回退；缺失时回退到 `Shadow Nexus`

生产环境需要在 Dashboard > Authentication > Email Templates 中分别更新 **Confirm signup** 和 **Magic Link**。托管 Supabase 的邮件模板不属于数据库迁移，不能仅靠提交代码同步。

> 注意：邮件模板和发件人仍是 Supabase 项目级配置。正文和主题可以使用 `RedirectTo` 区分本次请求来源，因此已有用户也能按产品显示；发件人显示名仍无法按单封邮件动态切换。如果同一邮箱已经在多个产品间共用，最可靠的长期方案仍是为产品拆分 Auth 项目。

## SMTP / 发件人

- 发件人名称：`Shadow Nexus`
- 发件人地址：`noreply@shadow.wang`
- SMTP 主机：`smtp.resend.com:465`

发件人名称和地址是项目级共享配置，影响所有使用此 Supabase 项目的产品的登录邮件。

## Deployment Protection

已关闭 SSO Protection（Vercel Dashboard > Project > Settings > Deployment Protection）。

影伴是公开 PWA，Preview 和 Production 均需直接访问。如需恢复保护，在 Vercel 项目设置中重新启用。

## Account deletion isolation

The current `dutepjyocxcvecmsrtfp` project is shared by multiple products, so the `delete-account` Edge Function deliberately returns `auth_identity_deletion_not_isolated` and cannot delete a Supabase Auth identity there. Shadow Mate's product-data deletion remains available.

To enable complete account deletion, deploy Shadow Mate against a dedicated Supabase project whose `public.projects` registry contains only `shadow-mate`, then set these Edge Function secrets/configuration values:

```text
SHADOW_MATE_AUTH_PROJECT_ISOLATED=true
SHADOW_MATE_AUTH_PROJECT_REF=<dedicated-project-ref>
```

Set `VITE_SUPABASE_AUTH_ACCOUNT_DELETION=1` only for that isolated frontend deployment. The server function revokes sessions, deletes only Shadow Mate-owned household rows, and then deletes the Auth identity with the secret key. Never put the secret key in browser environment variables.

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

Magic Link 模板（Dashboard > Authentication > Email Templates > Magic Link）：

- 标题：`影伴 Shadow Mate 登录验证`
- 正文：中文 HTML，含绿色「点击登录」按钮，引用 `{{ .ConfirmationURL }}`

> 注意：`{{ .Data.product_name }}` 在 Supabase Cloud 中不生效。产品名称目前硬编码在模板中。共享项目的其他产品如需自定义名称，需在此处修改。

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

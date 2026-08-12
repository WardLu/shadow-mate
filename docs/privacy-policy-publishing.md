# 隐私页发布操作

线上地址：[sm.shadow.wang/privacy](https://sm.shadow.wang/privacy)。发布源文件是仓库根目录的 `privacy-policy.html`，Storage 对象路径是 `legal/shadow-mate/privacy-policy.html`。

## 一次性发布

该流程不把 `SUPABASE_SERVICE_ROLE_KEY` 带到本机。Supabase Edge Function 在服务端读取默认的 `SUPABASE_SECRET_KEYS`（兼容旧版 `SUPABASE_SERVICE_ROLE_KEY`），本机只使用一个临时发布令牌。

1. 在 Supabase Edge Function Secrets 中生成并保存随机值，名称为 `PRIVACY_POLICY_PUBLISH_TOKEN`。不要把值写进仓库。
2. 部署发布函数：

   ```bash
   supabase functions deploy publish-privacy-policy
   ```

3. 在受控终端执行发布：

   ```bash
   PRIVACY_POLICY_PUBLISH_TOKEN='同一个临时令牌' npm run privacy:publish
   ```

4. 用脚本输出的哈希核对 Storage 对象，再部署包含 `vercel.json` 路由的应用版本。
5. 验证 `https://sm.shadow.wang/privacy` 返回最新 HTML 后，删除 Edge Function，并从 Supabase Secrets 中删除 `PRIVACY_POLICY_PUBLISH_TOKEN`：

   ```bash
   supabase functions delete publish-privacy-policy
   supabase secrets unset PRIVACY_POLICY_PUBLISH_TOKEN
   ```

如果只是修订文字，保持 `privacy-v1`；如果收集范围、同意机制或处理目的发生实质变化，必须升级版本并按隐私同意数据库迁移流程处理，不能只覆盖 HTML。

# 隐私页发布操作

线上地址：[sm.shadow.wang/privacy](https://sm.shadow.wang/privacy)。发布源文件是仓库根目录的 `privacy-policy.html`，样式文件是 `public/privacy-policy.css`。

隐私页是独立 HTML，不依赖主应用的 JavaScript。构建时 Vite 会把 HTML 输出为 `dist/privacy.html`，并由 Vercel 将 `/privacy` 和 `/privacy/` rewrite 到这个静态文件。页面内的影伴品牌标识使用内嵌 SVG，返回应用入口使用当前站点的相对根路径，因此本地、Preview、生产环境都会回到各自环境。

Supabase Storage 会出于安全原因把 HTML 文件按纯文本返回，不能把 Storage 对象作为浏览器渲染页面的生产源。

## 本地访问

Vite 开发服务器和 Preview 服务器都提供以下本地路由：

```text
http://localhost:5173/privacy
http://localhost:5173/privacy/
```

不要用 `file://` 双击 HTML 代替本地路由验收。

## 发布和验收

1. 修改根目录的 `privacy-policy.html` 或 `public/privacy-policy.css`。
2. 执行构建和产物检查：

   ```bash
   npm run build
   node scripts/check-build.mjs
   ```

3. 提交 PR，合并到 `main`，由 Vercel 部署。
4. 部署后检查两条入口都返回 HTML：

   ```bash
   curl -sS -I https://sm.shadow.wang/privacy
   curl -sS -I https://sm.shadow.wang/privacy/
   ```

   响应头应包含 `content-type: text/html`，页面应显示中文标题、品牌首屏、中英文内容和移动端布局。

如果只是修订视觉样式或不改变含义的文字，可以保持当前隐私版本；如果收集范围、同意机制、处理目的、保留期或导出边界发生实质变化，必须升级版本并按隐私同意数据库迁移流程处理，不能只覆盖 HTML。

## privacy-v2 迁移说明

`privacy-v2` 于 2026-08-20 增加私有后端活动事件、180 天保留期和 server-only 导出边界说明。数据库提案 `20260820120000_growth_loop_beta_batches.sql` 将允许版本扩展为 `privacy-v1` / `privacy-v2`，并同步更新创建同意和学习者的 RLS 条件：

- 新客户端只写入 `privacy-v2`。
- 已有 `privacy-v1` 记录保留原始版本和时间戳，并继续满足学习者创建前的有效同意检查。
- 客户端读取两个受支持版本，不能把历史家庭误判为未同意，也不自动补写或改写同意记录。
- 任何进入共享 Supabase 的 canonical migration 仍必须由 Shadow Portal 控制面审批和执行；产品仓库只提交 proposal。

# Shadow Mate

An open-source AI learning companion for K12 students.

Your child's first AI learning partner.

## Lucas 学习台

一个面向家庭的儿童学习打卡 PWA。它保留原始单页版的语文、数学、英语、绘本、积分和成长模块，同时增加：

- 平板、电脑、手机共用同一网址
- PWA 安装与离线使用
- 家长邮箱免密码登录
- 一个家庭管理多个学习者
- Supabase 云端同步与跨设备冲突保护
- GitHub 开源、Vercel 静态部署

## 本地运行

项目没有本地依赖；Supabase JS 使用固定版本的 ESM 构建。

```powershell
python -m http.server 4173
```

打开 `http://localhost:4173`。不要直接双击 `index.html`，浏览器在 `file://` 协议下无法正常加载 ES Module。

静态检查与构建：

```powershell
npm.cmd run check
npm.cmd run build
```

构建结果在 `dist/`。

## Supabase

当前部署配置位于 `public/config.js`。其中使用的是 Supabase publishable key；该密钥本来就会随浏览器代码公开，真正的数据隔离由 RLS 完成。绝不能把 secret key 或 `service_role` key 放进此仓库。

数据库迁移位于：

- `supabase/migrations/20260731173000_learning_family_state.sql`
- `supabase/migrations/20260731174500_learning_indexes.sql`

详细设计、旧方案评审和发布策略见 [架构文档](docs/architecture.md)。

## 数据迁移

旧版数据仍保留在浏览器的 `lucas_workbench_v1` localStorage 中。首次登录并选择学习者时：

1. 如果云端尚无状态，自动上传本机数据。
2. 如果两端都有数据，按打卡、积分、书架和阅读日志合并。
3. 云端使用版本号做乐观并发控制；发生冲突时重新拉取、合并并重试。
4. 本机数据不会在迁移后删除，仍可离线使用。

## 开源边界

代码采用 MIT License。仓库中提到的第三方书名、品牌、视频平台和内容链接仍归各自权利人所有；MIT License 不授予第三方内容或商标的使用权。对外运营前应完成内容授权、隐私政策、儿童数据合规和支付条款审查。

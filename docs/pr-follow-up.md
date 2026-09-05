# PR 跟进记录

本页记录 2026-09-05 的 PR 收口结果。合并状态不代表生产已部署；后续功能进度以关联 issue 为准。

| PR | 结果 | 证据与后续 |
| --- | --- | --- |
| [#102](https://github.com/WardLu/shadow-mate/pull/102) | 已合并 | `8bcc95f205558e9c9ecb392f3a40dd0a14b1470d`；密码找回保留操作级错误提示，其他认证流程默认提示不变。 |
| [#53](https://github.com/WardLu/shadow-mate/pull/53) | 已合并 | `8b978762cbb255d4e3a29ff7cf971bcd4158fd08`；Supabase JS 升级到 2.112.4。合并前及合并后托管 CI 通过。 |
| [#76](https://github.com/WardLu/shadow-mate/pull/76) | 已关闭，未直接合并 | 49 个提交中 45 个为核对时主线祖先，其余旧语音和缓存实现由当前方案取代。 |
| [#69](https://github.com/WardLu/shadow-mate/pull/69) | 已关闭，未合并 | 14 个提交中 11 个为核对时主线祖先；其余 3 个提交的 merge-base diff 涉及 31 个文件。剩余事项转入 [#103](https://github.com/WardLu/shadow-mate/issues/103)，原分支及提交保留。 |

## #69 剩余事项

基线为 `8b978762`，原 PR head 为 `3f44335bd8b331a86cecc29f68b6ba06ca7d9ed2`。以下尚未完成，不应标成“全部已被主线吸收”：

- 登录态打印缺少排除“第一单元”的对应断言；匿名打印断言已在主线。
- 页脚反馈邮件入口尚未进入主线，需确认目标邮箱仍适用。
- 主线已有 analytics helper，但应用事件接线与配套隐私声明尚未完整接入；后续应一起处理。
- 旧 release-manifest 提案需对照现行 Release Watcher 取舍，不能直接启用并行发布跟进流程。

旧打印、轮换与 Piper 配置由当前实现取代。完整文件范围、验收要求与来源提交见 #103。

## 验证与发布边界

#53 的失败由依赖升级后的错误形态变化触发，先前归类为 flaky 的判断已更正。#102 已完成双轴代理审查；#53 在包含修复后通过完整托管 CI。

- 合并后主线 [CI 33951907237](https://github.com/WardLu/shadow-mate/actions/runs/33951907237) 与 [CodeQL 33951907259](https://github.com/WardLu/shadow-mate/actions/runs/33951907259) 通过。
- 本地源码、构建与覆盖率检查通过（375 个单测）；本地数据库后半段因磁盘不足及容器镜像拉取失败未完成，不能称为本地完整等价 CI 通过。
- #102/#53 经本次用户授权使用管理员合并；这不是对仓库保护规则的永久修改。
- 此次 PR 收口没有执行新的生产发布；v1.4.0 的历史发布验收与本次主线改动分开记录。

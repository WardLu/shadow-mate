# 生产分支推进门禁

`npm run release:promote` 负责 main -> production 的受控分支编排；执行该命令前须已获得创建/合并推进 PR 的授权。生产部署或商店提交各自独立授权。计费问题、缺失 CI 或查询异常都不自动构成本地等价准入证据。

## 检查契约

1. 工作区干净且处于 main，fetch 成功后完整 HEAD 等于 origin/main；origin 与项目登记的 GitHub 仓库一致。所有 GitHub 查询和写入显式绑定 host/owner/repo。
2. `.github/workflows/ci.yml` 中 **CI / verify** 必须有同一完整 SHA 的 main push 成功证据。脚本进一步读取该 run 的 jobs，要求 **Enforce selected CI scope** 实际 completed/success；只看总 run 绿色、空 jobs、跳过 gate、过期或其他提交的结果均不通过。
3. 创建 PR 前及合并前，固定 production/main SHA 计算候选 merge tree，冲突或出现 main 之外内容立即拒绝。复用/创建的 PR 必须同仓、非草稿、OPEN，来源 main、目标 production、head 与候选一致。
4. PR 检查报错、缺失、失败、取消或未完成时停止。必需聚合门禁必须来自刚核验的 main push run，或经读取验证的同 head PR run；不能只因其他工作流成功而放行。
5. 合并前重查分支、CI、PR 身份与检查，普通合并绑定 `--match-head-commit`。无 `--skip-ci-wait`，不自动使用 `--admin`、`--auto` 或本地 fallback。
6. 回读 PR 为 MERGED、production 指向本次 merge commit、包含已验证 main 且树一致后才报告分支推进完成。命令退出码、入队或文件存在均不代替验收。

## 使用方式

```bash
# 预检不创建/合并 PR，不部署；fetch 会刷新本地远端引用
npm run release:promote -- --dry-run

# 须已获推进 PR 授权；所有证据满足后才尝试普通合并
npm run release:promote
```

本项目集成分支为 main，生产发布入口要求 production 工作区。推进命令不从 main 自动调用部署；旧 `--deploy` 的真实执行现已拒绝，避免分支推进后再进入必然不合规的发布环境。`--dry-run --deploy` 仅做只读预检。部署仍须独立授权，在干净、与远端一致的 production 工作区执行原 `scripts/release/deploy-production.sh` / `npm run release:production`。不会自动切分支、stash 或新造发布版本。

## 并发与未知结果

GitHub 的 head 匹配条件不原子锁定 PR base。最后一次读取后的远端 retarget/base 更新仍依赖服务端权限和串行控制；未核实该保护前不作为无人值守发布器使用。main 是可变引用，创建后发现 head 漂移会停止，可能留下待复核 PR，其正文不宣称新 head 已通过准入。

若平台已经受理入队或合并，停止只表示未确认完成，不证明远端动作已撤销。必须先只读核对 PR、远端分支和既有发布记录，不能原样重复写入。既有生产/控制面受保护流程不因本命令改变权限或豁免门禁。

## 本地回归

```bash
node --test tests/ci/*.test.mjs
```

使用本项目 CI 的 Node 22 运行时。回归直接加载真实推进模块，模拟外部 GitHub/部署调用，并使用一次性本地 Git 仓库验证候选树；不调用生产数据库、付费 API 或真实部署。测试和本地实现不代表托管 CI 已执行、远程分支已推进或生产已发布。

## 既有发布策略兼容范围

仓库仍有 `.github/workflows/release-to-production.yml`，其 Tag/Release 路径要求 production 严格快进；普通 PR merge commit 与该路径不天然兼容。本次未修改这个远程写入工作流，也未验证两条发布路径可以串联。选择实际发布路径时须先核对当前生产分支与目标 Tag 的祖先关系，不因本地门禁测试通过就叠加运行或强制推进。

# Release Notes 模板

Release Notes 面向最终用户，只描述用户可以感知的变化：新增功能、功能修改、问题修复、体验优化，以及必要的兼容性或迁移提示。

## 模板

```md
## Unreleased

### Added

- 新增……

### Changed

- 修改……

### Fixed

- 修复……

### Improved

- 优化……

### Compatibility

- 说明用户需要执行的操作、重新登录或迁移。

### Known issues

- 仅记录需要提前告知用户的问题。

## vX.Y.Z - YYYY-MM-DD

### Added

- ……

### Changed

- ……

### Fixed

- ……

### Improved

- ……

### Compatibility

- ……

### Known issues

- ……
```

## 规则

- 空分类直接删除。
- 描述用户可见结果，不描述内部实现。
- `Unreleased` 只保留尚未发布的变更；发布时移入对应版本段。
- GitHub Release 正文只包含对应版本段，不包含 `Unreleased`。
- 不写测试结果、覆盖率、CI、分支、Commit、Tag、部署清单、产物哈希、迁移回执或生产验收记录。
- 验证、部署、迁移和回滚证据放在内部发布记录、PR 或受保护的发布系统中。

## 命名

GitHub Release 标题只填写版本号，并且必须与 Git tag 完全一致：

```text
v1.3.12
```

禁止使用产品名、日期或其他前缀，例如 `Shadow Mate v1.3.12`、`Release v1.3.12`。

英文版本见 [release-notes-template.md](release-notes-template.md)。

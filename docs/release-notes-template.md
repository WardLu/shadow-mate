# Release Notes Template

Release Notes are user-facing. Describe only changes users can experience: new features, changes, fixes, improvements, and necessary compatibility or migration guidance.

## Template

```md
## Unreleased

### Added

- Add …

### Changed

- Change …

### Fixed

- Fix …

### Improved

- Improve …

### Compatibility

- Describe any user action, re-login, or migration required.

### Known issues

- List only user-impacting issues that should be disclosed in advance.

## vX.Y.Z - YYYY-MM-DD

### Added

- …

### Changed

- …

### Fixed

- …

### Improved

- …

### Compatibility

- …

### Known issues

- …
```

## Rules

- Remove empty categories.
- Describe the user-visible outcome, not the internal implementation.
- Keep `Unreleased` limited to changes that have not shipped; move them into the version section when releasing.
- GitHub Release notes must contain only the matching version section, never `Unreleased`.
- Do not include test results, coverage, CI status, branches, commits, tags, deployment checklists, artifact hashes, migration receipts, or production acceptance records.
- Keep verification, deployment, migration, and rollback evidence in internal release records, pull requests, or protected release systems.

## Naming

The GitHub Release title must contain only the version and match the Git tag exactly:

```text
v1.3.12
```

Do not use product names, dates, or other prefixes such as `Shadow Mate v1.3.12` or `Release v1.3.12`.

See [the Chinese version](release-notes-template.zh-CN.md).

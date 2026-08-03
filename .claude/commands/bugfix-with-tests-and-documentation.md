---
name: bugfix-with-tests-and-documentation
description: Workflow command scaffold for bugfix-with-tests-and-documentation in shadow-mate.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /bugfix-with-tests-and-documentation

Use this workflow when working on **bugfix-with-tests-and-documentation** in `shadow-mate`.

## Goal

Fixes a bug in backend logic, updates tests to cover the fix, and updates documentation and meta files to reflect the change.

## Common Files

- `src/app.js`
- `src/cloud.js`
- `src/lib.js`
- `tests/unit/*.test.js`
- `tests/e2e/*.spec.js`
- `CHANGELOG.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Fix bug in backend logic (src/*.js)
- Update or add relevant tests (tests/unit/, tests/e2e/)
- Update documentation and meta files (CHANGELOG.md, ROADMAP.md, TODO.md, docs/architecture.md, etc.)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
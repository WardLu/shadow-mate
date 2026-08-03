---
name: documentation-alignment-and-consistency
description: Workflow command scaffold for documentation-alignment-and-consistency in shadow-mate.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /documentation-alignment-and-consistency

Use this workflow when working on **documentation-alignment-and-consistency** in `shadow-mate`.

## Goal

Updates and aligns multiple documentation files to reflect new features, processes, or guidance, often in conjunction with meta files like CHANGELOG and ROADMAP.

## Common Files

- `docs/architecture.md`
- `docs/auth-setup.md`
- `docs/user-guide.md`
- `docs/security-baseline.md`
- `docs/test-scope.md`
- `CONTRIBUTING.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit multiple documentation files (docs/*.md, CONTRIBUTING.md, PRIVACY.md, etc.)
- Update meta files (CHANGELOG.md, ROADMAP.md, TODO.md, RELEASE_NOTES.md)
- Optionally update GitHub templates (.github/PULL_REQUEST_TEMPLATE.md)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
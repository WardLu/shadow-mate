---
name: update-auth-configuration-and-documentation
description: Workflow command scaffold for update-auth-configuration-and-documentation in shadow-mate.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /update-auth-configuration-and-documentation

Use this workflow when working on **update-auth-configuration-and-documentation** in `shadow-mate`.

## Goal

Updates authentication-related configuration and documentation, typically when modifying auth providers, limits, or templates.

## Common Files

- `supabase/config.toml`
- `docs/auth-setup.md`
- `supabase/templates/*.html`
- `docs/architecture.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit supabase/config.toml to update auth settings or provider limits
- Update docs/auth-setup.md to reflect changes in authentication configuration
- Optionally update or add email templates in supabase/templates/
- Optionally update related architecture documentation

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
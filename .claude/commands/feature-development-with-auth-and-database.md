---
name: feature-development-with-auth-and-database
description: Workflow command scaffold for feature-development-with-auth-and-database in shadow-mate.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-with-auth-and-database

Use this workflow when working on **feature-development-with-auth-and-database** in `shadow-mate`.

## Goal

Implements a new authentication or security-related feature, involving backend logic, database migrations, configuration, templates, tests, and documentation.

## Common Files

- `src/app.js`
- `src/cloud.js`
- `src/lib.js`
- `src/action-lock.js`
- `src/learning-state.js`
- `supabase/migrations/*.sql`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update or add backend logic in src/ (e.g., app.js, cloud.js, lib.js, action-lock.js, learning-state.js)
- Create or modify database migration files in supabase/migrations/
- Update Supabase configuration (supabase/config.toml)
- Add or update email templates (supabase/templates/)
- Update or add tests (tests/unit/, tests/e2e/, supabase/tests/)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
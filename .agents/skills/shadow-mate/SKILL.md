```markdown
# shadow-mate Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill provides guidance for contributing to the `shadow-mate` JavaScript codebase. It covers established coding conventions, commit patterns, and key workflows—especially around authentication configuration. The repository uses conventional commits, camelCase file naming, and relative imports. While no framework is detected, the project maintains organized documentation and configuration files, particularly for authentication.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.js`, `authProviderConfig.js`

### Import Style
- Use **relative imports** for modules within the project.
  ```js
  import { getUser } from './userUtils.js';
  ```

### Export Style
- Use **named exports** rather than default exports.
  ```js
  // In userUtils.js
  export function getUser(id) { /* ... */ }
  export function setUser(data) { /* ... */ }

  // In another file
  import { getUser, setUser } from './userUtils.js';
  ```

### Commit Patterns
- Follow **conventional commit** format.
- Use prefixes like `fix`.
- Keep commit messages concise (average ~45 characters).
  - Example: `fix: correct auth provider limit check`

## Workflows

### Update Auth Configuration and Documentation
**Trigger:** When you need to change authentication settings, templates, or provider limits.  
**Command:** `/update-auth-config`

1. **Edit the authentication configuration:**
   - Open `supabase/config.toml`.
   - Update relevant auth settings or provider limits.
   ```toml
   [auth]
   providers = ["email", "github"]
   max_signups = 100
   ```
2. **Update the documentation:**
   - Edit `docs/auth-setup.md` to reflect any changes made in the configuration.
   - Clearly describe new settings or provider changes.
3. **(Optional) Update or add email templates:**
   - Modify or add HTML files in `supabase/templates/` as needed.
   - Example: `supabase/templates/welcome.html`
4. **(Optional) Update architecture documentation:**
   - If the changes affect the overall architecture, update `docs/architecture.md` accordingly.
5. **Commit your changes:**
   - Use a conventional commit message.
   - Example: `fix: update auth provider limits in config`

## Testing Patterns

- Test files follow the pattern: `*.test.*`
  - Example: `authProvider.test.js`
- The specific testing framework is **unknown**—check existing test files for style and conventions.
- Place test files alongside the modules they test or in a dedicated test directory.

## Commands

| Command             | Purpose                                                            |
|---------------------|--------------------------------------------------------------------|
| /update-auth-config | Update authentication configuration and related documentation/files |
```

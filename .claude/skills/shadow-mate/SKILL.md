```markdown
# shadow-mate Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches the core development patterns, coding conventions, and collaborative workflows used in the `shadow-mate` JavaScript project. The repository focuses on backend logic, authentication, and security features, with a strong emphasis on documentation, testing, and process consistency. You'll learn how to contribute new features, fix bugs, and keep documentation aligned, following established conventions and step-by-step workflows.

## Coding Conventions

**File Naming**
- Use `camelCase` for JavaScript files.
  - Example: `actionLock.js`, `learningState.js`

**Import Style**
- Use relative imports.
  ```js
  import { doSomething } from './lib.js';
  ```

**Export Style**
- Use named exports.
  ```js
  // In lib.js
  export function doSomething() { ... }

  // In another file
  import { doSomething } from './lib.js';
  ```

**Commit Messages**
- Follow [Conventional Commits](https://www.conventionalcommits.org/) with prefixes:
  - `feat`: New feature
  - `fix`: Bug fix
  - `docs`: Documentation update
- Keep commit messages concise (average ~42 characters).
  - Example: `fix: handle token expiry in auth middleware`

## Workflows

### Feature Development with Auth and Database
**Trigger:** When adding a new authentication, security feature, or significant backend capability  
**Command:** `/new-auth-feature`

1. Update or add backend logic in `src/` (e.g., `app.js`, `cloud.js`, `lib.js`, `action-lock.js`, `learning-state.js`).
   ```js
   // src/actionLock.js
   export function lockAction(userId) { ... }
   ```
2. Create or modify database migration files in `supabase/migrations/`.
   ```sql
   -- supabase/migrations/20240401_add_user_tokens.sql
   ALTER TABLE users ADD COLUMN token VARCHAR(255);
   ```
3. Update Supabase configuration in `supabase/config.toml`.
4. Add or update email templates in `supabase/templates/`.
   ```html
   <!-- supabase/templates/welcome.html -->
   <p>Welcome, {{username}}!</p>
   ```
5. Update or add tests in `tests/unit/`, `tests/e2e/`, or `supabase/tests/`.
   ```js
   // tests/unit/actionLock.test.js
   import { lockAction } from '../../src/actionLock.js';
   test('locks action for user', () => { ... });
   ```
6. Update documentation in `docs/` (e.g., `architecture.md`, `auth-setup.md`, `security-baseline.md`, `user-guide.md`, `test-scope.md`).
7. Update project meta files (`CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `README.md`, `RELEASE_NOTES.md`).

---

### Documentation Alignment and Consistency
**Trigger:** When updating documentation for new features, process changes, or to enforce consistency  
**Command:** `/docs-update`

1. Edit documentation files in `docs/` (e.g., `architecture.md`, `auth-setup.md`, `user-guide.md`, `security-baseline.md`, `test-scope.md`).
2. Update meta files (`CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `RELEASE_NOTES.md`).
3. Optionally update GitHub templates (e.g., `.github/PULL_REQUEST_TEMPLATE.md`).

---

### Bugfix with Tests and Documentation
**Trigger:** When fixing a bug and ensuring it is tested and documented  
**Command:** `/bugfix`

1. Fix the bug in backend logic (`src/*.js`).
   ```js
   // src/lib.js
   export function sanitizeInput(input) {
     return input.replace(/[<>]/g, '');
   }
   ```
2. Update or add relevant tests in `tests/unit/` or `tests/e2e/`.
   ```js
   // tests/unit/lib.test.js
   import { sanitizeInput } from '../../src/lib.js';
   test('removes angle brackets', () => { ... });
   ```
3. Update documentation and meta files (`CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `docs/architecture.md`, etc.).

---

## Testing Patterns

- **Framework:** [Jest](https://jestjs.io/)
- **Test Files:** Use the pattern `*.test.js` for unit tests and `*.spec.js` for end-to-end tests.
- **Structure:**
  ```js
  // tests/unit/example.test.js
  import { myFunction } from '../../src/myModule.js';

  test('does something expected', () => {
    expect(myFunction()).toBe(true);
  });
  ```

## Commands

| Command            | Purpose                                                                 |
|--------------------|-------------------------------------------------------------------------|
| /new-auth-feature  | Start a new authentication or backend feature with database integration  |
| /docs-update       | Align and update documentation and meta files                            |
| /bugfix            | Fix a bug, update tests, and document the change                        |
```

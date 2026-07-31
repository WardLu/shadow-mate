```markdown
# shadow-mate Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `shadow-mate` JavaScript repository. You'll learn about file naming, import/export styles, commit practices, and how to write and run tests. This guide is ideal for contributors looking to maintain consistency and quality in the codebase.

## Coding Conventions

### File Naming
- Use **camelCase** for filenames.
  - Example: `shadowHelper.js`, `userSettings.js`

### Import Style
- Use **relative imports** for modules.
  - Example:
    ```javascript
    import { fetchData } from './apiUtils';
    ```

### Export Style
- Use **named exports**.
  - Example:
    ```javascript
    // In file: shadowHelper.js
    export function calculateShadow() { ... }
    export const SHADOW_DEPTH = 5;
    ```

### Commit Messages
- Freeform style, no strict prefixes.
- Average commit message length: ~33 characters.
  - Example: `fix shadow calculation bug`

## Workflows

### Add a New Module
**Trigger:** When you need to add new functionality.
**Command:** `/add-module`

1. Create a new file using camelCase naming (e.g., `newFeature.js`).
2. Write your code using named exports.
3. Import dependencies using relative paths.
4. Write a corresponding test file as `newFeature.test.js`.
5. Commit your changes with a clear, concise message.

### Update an Existing Module
**Trigger:** When you need to modify or refactor existing code.
**Command:** `/update-module`

1. Locate the relevant file (e.g., `existingFeature.js`).
2. Make your changes, maintaining named exports and relative imports.
3. Update or add tests in the corresponding `*.test.js` file.
4. Commit with a descriptive message.

### Run Tests
**Trigger:** To verify code correctness after changes.
**Command:** `/run-tests`

1. Identify test files matching the `*.test.*` pattern.
2. Use the project's preferred test runner (framework unknown; consult project docs or package.json).
3. Review test output and fix any failing tests.

## Testing Patterns

- Test files are named with the pattern `*.test.*` (e.g., `shadowHelper.test.js`).
- Testing framework is not specified; check project documentation or configuration files.
- Place tests alongside or near the modules they cover.
- Example test file structure:
  ```javascript
  // shadowHelper.test.js
  import { calculateShadow } from './shadowHelper';

  test('calculates correct shadow', () => {
    expect(calculateShadow(5)).toBe(25);
  });
  ```

## Commands
| Command         | Purpose                                 |
|-----------------|-----------------------------------------|
| /add-module     | Add a new module following conventions  |
| /update-module  | Update or refactor an existing module   |
| /run-tests      | Run all test files in the codebase      |
```

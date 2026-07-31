```markdown
# shadow-mate Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill covers the core development patterns and conventions used in the `shadow-mate` JavaScript codebase. It documents file naming, import/export styles, commit practices, and testing patterns. While no frameworks or automated workflows were detected, this guide provides best practices and command suggestions for consistent development.

## Coding Conventions

### File Naming
- **Style:** camelCase
- **Example:**  
  ```
  shadowUtils.js
  colorMixer.js
  ```

### Import Style
- **Style:** Absolute imports
- **Example:**
  ```javascript
  import { mixShadows } from 'utils/shadowUtils';
  ```

### Export Style
- **Style:** Named exports
- **Example:**
  ```javascript
  // In shadowUtils.js
  export function mixShadows(a, b) { ... }
  export const SHADOW_PRESETS = { ... };
  ```

### Commit Message Patterns
- **Type:** Freeform (no strict prefixes)
- **Average Length:** 37 characters
- **Example:**
  ```
  Add support for multiple shadow layers
  Fix bug in shadow offset calculation
  ```

## Workflows

### Adding a New Utility Function
**Trigger:** When you need to add a reusable function.
**Command:** `/add-utility`

1. Create a new file in camelCase, e.g., `newUtility.js`.
2. Write your function and export it using a named export.
   ```javascript
   export function newUtility(params) { ... }
   ```
3. Import the function where needed using an absolute path.
   ```javascript
   import { newUtility } from 'utils/newUtility';
   ```
4. Add or update tests in a corresponding `.test.js` file.

### Writing and Running Tests
**Trigger:** When you add or update code.
**Command:** `/run-tests`

1. Create or update test files matching the `*.test.*` pattern, e.g., `shadowUtils.test.js`.
2. Write test cases for your functions.
3. Run the test suite using your project's preferred method (test framework is unknown; check project documentation or package scripts).

### Committing Changes
**Trigger:** After making code changes.
**Command:** `/commit-changes`

1. Write a clear, concise commit message (no strict prefix required).
2. Keep messages around 37 characters for consistency.
   ```
   Improve shadow rendering performance
   ```

## Testing Patterns

- **File Pattern:** `*.test.*` (e.g., `shadowUtils.test.js`)
- **Framework:** Not specified; check for a test runner in project documentation.
- **Example Test File:**
  ```javascript
  import { mixShadows } from 'utils/shadowUtils';

  test('mixShadows combines two shadows', () => {
    expect(mixShadows('a', 'b')).toBe('a, b');
  });
  ```

## Commands
| Command         | Purpose                                 |
|-----------------|-----------------------------------------|
| /add-utility    | Add a new utility function              |
| /run-tests      | Run all test files                      |
| /commit-changes | Commit code changes with a message      |
```

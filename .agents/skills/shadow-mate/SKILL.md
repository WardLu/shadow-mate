```markdown
# shadow-mate Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill provides a comprehensive guide to contributing to the `shadow-mate` JavaScript codebase. It covers the project's coding conventions, file organization, import/export patterns, and testing practices. By following these patterns, contributors can ensure consistency and maintainability across the repository.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `shadowHelper.js`, `userProfileManager.js`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```javascript
    import { getShadow } from './shadowHelper';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```javascript
    // In shadowHelper.js
    export function getShadow(element) { ... }
    export const SHADOW_DEPTH = 3;
    ```

### Commit Messages
- Commit messages are **freeform** and typically concise (~35 characters).
  - Example: `fix shadow calculation for nested elements`

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new functionality  
**Command:** `/add-feature`

1. Create a new file using camelCase naming.
2. Write your feature using named exports.
3. Import any dependencies using relative paths.
4. Write corresponding tests in a `.test.js` file.
5. Commit your changes with a concise, descriptive message.

### Fixing a Bug
**Trigger:** When resolving a reported issue  
**Command:** `/fix-bug`

1. Locate the relevant file(s) using camelCase naming.
2. Apply your fix, maintaining code style.
3. Update or add tests to cover the bug scenario.
4. Commit with a clear message describing the fix.

### Writing Tests
**Trigger:** When adding or updating functionality  
**Command:** `/write-test`

1. Create or update a test file matching the pattern `*.test.js`.
2. Write tests to cover new or changed code.
3. Run tests using the project's test runner (framework unknown; check project docs or package.json).
4. Ensure all tests pass before committing.

## Testing Patterns

- Test files follow the pattern: `*.test.js`
- The testing framework is **unknown**; check for documentation or scripts in `package.json`.
- Place tests alongside implementation files or in a dedicated `tests` directory.
- Example test file name: `shadowHelper.test.js`

## Commands
| Command      | Purpose                                   |
|--------------|-------------------------------------------|
| /add-feature | Scaffold and implement a new feature      |
| /fix-bug     | Apply and test a bug fix                  |
| /write-test  | Create or update tests for your code      |
```

# Test scope and coverage gates

The project uses separate gates for separate seams instead of presenting one unit-test percentage as full application coverage:

- `npm.cmd run test:coverage` measures the deterministic state and utility seam in `src/lib.js` and `src/learning-state.js`. Statements, branches, functions, and lines must each be at least 80%.
- `npm.cmd run test:e2e` exercises the user-facing application seam in a real Chromium browser, including offline flows, authenticated profile loading, manual sync, optimistic-concurrency retry, and learner deletion with a deterministic Supabase API mock.
- `npm.cmd run test:db` exercises the database seam against local Supabase, including grants, RLS isolation, state-version conflicts, and the save function.

The unit coverage number must therefore be read as the pure-logic coverage gate, not as a claim that every DOM or network statement is covered by V8. UI and cloud behavior is accepted only when the browser suite covers the corresponding user journey, and database behavior is accepted only when the pgTAP suite passes.

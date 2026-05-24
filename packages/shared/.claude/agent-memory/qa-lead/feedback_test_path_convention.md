---
name: feedback-test-path-convention
description: Actual test file location is packages/shared/tests/ — story files may cite the wrong path
metadata:
  type: feedback
---

Story files for this project specify test evidence paths as `tests/unit/[system]/` (project-root-relative), but the actual test files are written to `packages/shared/tests/[system]/` (monorepo package-relative).

**Why:** The `packages/shared/` package is where the sim engine lives; test files colocate with the package they test. The story template was authored before the monorepo layout was fully settled.

**How to apply:** When verifying test evidence for a Logic story, check `packages/shared/tests/` first. If the story file cites `tests/unit/cascade-engine/foo.test.ts`, the actual file is at `packages/shared/tests/cascade-engine/foo.test.ts`. Flag the discrepancy in the sign-off notes but do not treat it as a blocking deviation — the tests exist and pass.

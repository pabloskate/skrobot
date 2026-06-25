# Architecture Review

Use this checklist for commits, PRs, or larger local changes. It is intentionally
short: the point is to catch drift before it becomes normal.

## Review Questions

1. Ownership: Which feature owns the behavior, route, data, or runtime concern?
2. Boundary: Did the change use public feature entry points instead of internals?
3. Boundary safety: Are auth, input parsing, secrets, external I/O, and response
   normalization handled at the public boundary?
4. Complexity: Did touched code become easier to trace, or is there a documented
   follow-up?
5. Verification: Which checks prove the behavior and the architecture?

## Ratchets

- Do not add cross-feature deep imports.
- Do not reintroduce a shared game package or native clone without an explicit
  architecture decision.
- Do not let `apps/mobile` grow alternate game screens; it is a WebView parity
  shell and must track `docs/native/PARITY_CHECKLIST.md`.
- Do not add business rules to route files.
- Do not add domain rules to `src/shared/`.
- Do not expose secrets, runtime bindings, or `platform/server` modules to client
  feature files.
- Do not scatter first-party `fetch('/api/...')` calls through leaf UI; add or use
  a feature-owned `api.ts`.
- Do not leave a large file harder to trace without extracting a cohesive helper
  or documenting a narrow follow-up.
- Do not let dated tech debt pass silently.
- Do not add a new app/package without documenting its ownership and making the
  root confidence pass cover at least its typecheck.

## ADR Triggers

Add a short architecture note in `docs/` when a change introduces:

- a new cross-feature workflow owner
- a new package/app boundary
- a new persistence pattern
- a new external integration
- a deliberate exception to import or route rules
- a migration path with temporary duplication

Keep notes brief: context, decision, consequences, and how to verify the decision
is still true.

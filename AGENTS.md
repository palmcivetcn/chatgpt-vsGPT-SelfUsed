# AGENTS.md

## Branch Workflow (Mandatory)

- Never make feature or fix changes directly on `main`.
- Always work on `dev` first in this same workspace (`git switch dev`), not in a local `.worktrees/dev`.
- Keep one local script source of truth at repo root: `ChatGPT-Glass-Engine-gpt-super.js`.
- Push iteration commits to `origin/dev` first.
- After every file modification, create a commit and push immediately to `origin/dev` . Do not accumulate unpushed changes.
- Verify before integration: run all local tests and ensure `git status` is clean.
- Merge `dev` into `main` only after verification passes and user confirms.
- If accidental changes are made on `main`, stop and migrate them to `dev` before continuing.


## Versioning Rules (Mandatory)

### Version format & mapping
- Script version is the userscript header field: `@version x.y.z` (SemVer).
- Git tag MUST be: `v{x.y.z}` (example: `@version 1.2.3` -> `v1.2.3`).

### Every script change requires a version bump
- Any change that affects the final released userscript output MUST bump `@version`.
- Specifically, if `chatgpt-glass-engine.user.js` content would change compared to last release, `@version` MUST change.
- If only docs/CI/etc change and the script output is unchanged, version bump is NOT required.

### Default bump policy: patch only
- For routine iterations, ONLY bump `z` (patch):
  - Allowed: `x.y.(z+1)`
  - Not allowed by default: changing `x` or `y`

### Minor/Major changes require explicit user instruction
- `y` (minor) and `x` (major) MAY ONLY be changed when the user explicitly specifies it.
- Without explicit user instruction, any attempt to bump `x` or `y` MUST be rejected and revised to a patch bump instead.
- Recommended reset rules when user explicitly requests:
  - Minor bump: `x.(y+1).0`
  - Major bump: `(x+1).0.0`

### Tag consistency requirement
- Any pushed tag MUST exactly match the script `@version` at the tagged commit.
- If mismatch is found (tag != `v{@version}`), STOP and fix before pushing tags.


## Tag Workflow (Mandatory)

- Tag must follow userscript `@version` with `v` prefix (example: `@version 1.2.3` -> `v1.2.3`).
- GitHub Release publication is NOT required by default.


## Minimal Commands

- Dev push: `git switch dev && git push origin dev`
- Merge to main: `git switch main && git merge --ff-only dev && git push origin main`
- Tag only (no release required): create/push tag from `main`.


## Practical Tag Checklist (Mandatory)

1) Ensure you are on `main` and up-to-date:
- `git switch main`
- `git pull --ff-only`

2) Confirm script `@version` is correct:
- If script changed since last release: bump version (default patch `z` only).
- If user explicitly requested minor/major: bump `y` or `x` accordingly.

3) Create and push tag from `main`:
- Tag name MUST be `v{@version}`.
- Push tag to origin.

4) Push tag to origin:
- No GitHub Release publication required by default.

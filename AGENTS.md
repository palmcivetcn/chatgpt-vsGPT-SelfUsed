# AGENTS.md

## Branch Workflow (Mandatory)

- Never make feature or fix changes directly on `main`.
- Always work on `dev` in this same workspace (`git switch dev`), not in a local `.worktrees/dev`.
- Keep one local script source of truth: `ChatGPT Glass Engine gpt super-8.0.0.user.js` at repo root.
- Push iteration commits to `origin/dev`.
- Merge `dev` into `main` only after verification and user confirmation.
- If accidental changes are made on `main`, stop and migrate them to `dev` before continuing.

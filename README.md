# ChatGPT Glass Engine (Self Used)

A glassmorphism long-chat optimizer for ChatGPT: virtual scrolling, health indicators, degradation monitoring (status/IP/PoW), auto reply avoidance, and token estimation.

## Features
- Virtual scrolling with soft/hard modes
- Health traffic-light and memory/DOM stats
- Degradation monitor (status/IP/PoW)
- Auto pause during replies and idle-aware optimization
- Token estimation

## Install
- Use Tampermonkey (or similar) and import the userscript.
- Script file: `ChatGPT-Glass-Engine-gpt-super.js`

## Auto Update
- Userscript metadata `@downloadURL` and `@updateURL` points to:
  `https://raw.githubusercontent.com/palmcivetcn/chatgpt-vsGPT-SelfUsed/main/ChatGPT-Glass-Engine-gpt-super.js`
- Auto update checks follow the raw `main` script path directly.
- Release asset `chatgpt-glass-engine.user.js` is still uploaded as a backup channel for manual download/rollback.

## Versioning
- Source of truth: `@version` in the userscript header.
- Format: `vX.Y.Z`
- X (major): user-decided only
- Y (minor): feature add/remove/modify
- Z (patch): bugfixes or metadata-only changes
- **Every push must update `@version`**

## Branching
- `dev`: continuous iteration (never deleted)
- local flow: use the same workspace and push to `origin/dev` (do not keep a local `.worktrees/dev`)
- local files: keep only one script source at repo root (`ChatGPT-Glass-Engine-gpt-super.js`)
- `main`: stable releases after approval

## Release Tags
- Tag name: `v<@version>`
- Tags are created after merging `dev` into `main`

## License
- Licensed under the [MIT License](./LICENSE).
- This project is a secondary modification based on [3150214587/chatgpt-virtual-scrollGPT-](https://github.com/3150214587/chatgpt-virtual-scrollGPT-) (MIT).

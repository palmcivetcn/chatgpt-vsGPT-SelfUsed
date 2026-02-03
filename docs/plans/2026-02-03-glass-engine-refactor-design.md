# Glass Engine Refactor Design (Single-File Userscript)

## Overview
This design refactors the current ChatGPT Glass Engine userscript into a single-file, module-structured architecture optimized for performance, stability, and UI responsiveness while preserving all existing features. The refactor enforces strict structured JSON logging (timestamp, level, message, context) and integrates an inline Pino browser build to satisfy the logging-library constraint without external dependencies. The result is a maintainable, extensible script that keeps liquid-glass UI styling intact and improves long-chat scrolling, monitor accuracy, and overall responsiveness.

## Goals
- Improve long-chat scroll performance and reduce layout thrash.
- Increase stability and accuracy of Service/IP/PoW monitoring.
- Reduce UI latency for panel open/close, controls, and drag.
- Preserve all existing features and user-visible behaviors unless explicitly improved.
- Keep a single-file Tampermonkey script (no build step, no external deps).
- Standardize structured JSON logging with prod-safe behavior.

## Non-Goals
- Introduce multi-file build pipelines or external package installs.
- Change the glassmorphism visual language.
- Remove any existing functionality.

## Constraints
- Tampermonkey v5.4.1, single-file userscript only.
- Logging must use an established library (Pino) and be JSON-only.
- Production must disable debug logging.
- No logging of sensitive fields (password/token/secret).

## Architecture (Single-File Modular Layout)
The script remains a single file but is segmented into strict module blocks with a unified namespace. Each module exposes a minimal API, and modules interact via an event bus and action layer to prevent direct coupling.

Modules:
1. Core/Config: constants, thresholds, I18N, environment flags.
2. State/Store: centralized runtime state and caches.
3. Logger: inline Pino browser build + sanitization wrapper.
4. Scheduler: unified RAF/idle/interval scheduling and gates.
5. Virtualization Engine: soft/hard virtualization + margin planner.
6. Degradation Monitor: network hooks + parsing + caching.
7. UI Layer: render and bind, read store, dispatch actions.

## Data Flow
Single directional flow: Store -> Actions -> Effects -> Store -> UI.
- Actions are pure intent, Effects run DOM/network side effects.
- The UI never mutates global state directly.
- Event Bus emits state-change signals to reduce repeated direct calls.

## Scheduling Strategy
- RAF: for UI redraws and virtualization pass.
- Idle: heavy tasks (token estimation, hard slice batches).
- Interval: only for essential monitor refresh.
- Gates: single `shouldRun()` gate for chat-busy, Ctrl+F, hidden tab.

## Logging Strategy
- Inline Pino browser build embedded in script with license preserved.
- Wrapper logger enforces fields: timestamp, level, message, context.
- Sanitization strips keys matching `/password|token|secret/i`.
- Prod disables debug level at logger construction.
- No console logging outside logger API.

## Virtualization Engine Refactor
- Separate measurement phase from DOM mutation to avoid layout thrash.
- Soft observer rebuild only when margin/root changes.
- Hard virtualization uses time-sliced batches scheduled via idle/timeout.
- Margin planner and cache invalidation centralized in store.

## Degradation Monitor Refactor
- Hook install is idempotent and centralized.
- PoW source priority: header > requirements endpoint > JSON bodies.
- Unified freshness TTL per signal with stale guard.
- Failure does not overwrite previously good data.

## UI/Interaction Refactor
- Panel, buttons, and drag use a single action dispatch layer.
- UI updates are diffed and scheduled via RAF to avoid jitter.
- Glassmorphism tokens consolidated into CSS variables.

## Error Handling
- Recoverable errors: log warn, fallback to cached values.
- Non-recoverable: log error, surface degraded UI state.
- Strict guard rails to prevent re-entrant hooks and duplicate timers.

## Testing & Self-Check
- Provide `CGPT_VS.selfCheck()` to run a minimal diagnostic sequence:
  - logger output validity
  - scheduler gates
  - virtualization pass
  - monitor fetch fallback
- Results logged via structured JSON only.

## Implementation Order
1. Logger (inline Pino + wrapper)
2. Scheduler (centralized gating + timers)
3. Store + Actions
4. Virtualization Engine
5. Monitor
6. UI
7. Self-check + docs

## Risks
- Inline Pino increases file size; mitigated via minimal browser build.
- Large refactor may introduce regressions; mitigated by staged testing and selfCheck.

## Rollout
- Maintain a feature flag for the new scheduler and logger in early iterations.
- Provide a manual toggle to disable optimization if unexpected behavior appears.

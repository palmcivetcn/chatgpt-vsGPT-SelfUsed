# Idle-Optimized Virtualization Design

## Goal
Make ultra-long ChatGPT conversations feel "no-friction" by deferring heavy virtualization work to idle windows, while keeping the existing soft/hard virtualization model and three mode profiles (performance/balanced/conservative).

## Architecture
Introduce an idle-aware scheduling layer that gates expensive passes (full scans, hard slicing) behind true idle conditions, while preserving a safe maintenance path. The design adds:
- A small idle decision helper (pure function) for testability.
- An in-engine gate that uses chat status, input activity, and recent scroll time.
- A maximum deferral window that triggers a maintenance pass only after idle resumes (never during active input/scroll).

## Key Decisions
- **Idle-only for heavy passes:** Hard virtualization and full scans only run when not chat-busy, not typing, and not actively scrolling.
- **Maintenance only after idle resumes:** If deferral exceeds a max window, a light maintenance pass is allowed only when the user is idle again. Maintenance never runs during input or scroll.
- **Mode differentiation preserved:** Existing mode profiles continue to govern thresholds and margins; idle gating is additive, not a replacement.
- **Visible idle deferral:** UI pause reason includes input/scroll deferral to explain why optimization is waiting.

## Data Flow
1. Capture activity signals:
   - chatBusy (streaming or reply in progress)
   - input activity window (typing grace)
   - recent scroll activity
2. Evaluate idle gate:
   - blocked if chatBusy or input active or scrolling
   - record block reason (chat / input / scroll)
   - if deferral exceeds window, allow maintenance only after idle resumes
3. Scheduling:
   - If blocked: defer heavy pass.
   - If idle: run normal virtualize flow and, if allowed, a maintenance soft sync.

## Edge Handling
- `performance.memory` unavailable -> DOM-based pressure remains primary.
- Ctrl+F pauses stay intact.
- Idle gate uses hysteresis and cooldown to avoid churn.

## Validation
- Ensure typing/streaming stays smooth (no hard passes).
- Ensure scroll stays responsive (hard passes only after idle).
- Validate very long conversations do not balloon DOM indefinitely.
- Self-check simulates idle gate transitions (blocked → idle → maintenance).

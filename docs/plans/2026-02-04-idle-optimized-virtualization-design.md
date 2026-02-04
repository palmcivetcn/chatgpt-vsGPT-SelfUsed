# Idle-Optimized Virtualization Design

## Goal
Make ultra-long ChatGPT conversations feel "no-friction" by deferring heavy virtualization work to idle windows, while keeping the existing soft/hard virtualization model and three mode profiles (performance/balanced/conservative).

## Architecture
Introduce an idle-aware scheduling layer that gates expensive passes (full scans, hard slicing) behind "idle" conditions, while preserving light, low-cost maintenance. The design adds:
- A small idle decision helper (pure function) for testability.
- An in-engine gate that uses chat status, input activity, and recent scroll time.
- A maximum deferral window that enables light maintenance if the user stays active too long.

## Key Decisions
- **Idle-only for heavy passes:** Hard virtualization and full scans only run when not chat-busy, not typing, and not actively scrolling.
- **Light maintenance safety valve:** If deferral exceeds a max window and the chat is not busy, allow a light maintenance pass (soft sync) to avoid unbounded DOM growth.
- **Mode differentiation preserved:** Existing mode profiles continue to govern thresholds and margins; idle gating is additive, not a replacement.

## Data Flow
1. Capture activity signals:
   - chatBusy (streaming or reply in progress)
   - input activity window (typing grace)
   - recent scroll activity
2. Evaluate idle gate:
   - blocked if chatBusy or input active
   - heavy blocked if also scrolling
   - allow maintenance if blocked too long and chat is not busy
3. Scheduling:
   - If blocked: defer heavy pass; optionally schedule soft maintenance.
   - If idle: run normal virtualize flow.

## Edge Handling
- `performance.memory` unavailable -> DOM-based pressure remains primary.
- Ctrl+F pauses stay intact.
- Idle gate uses hysteresis and cooldown to avoid churn.

## Validation
- Ensure typing/streaming stays smooth (no hard passes).
- Ensure scroll stays responsive (hard passes only after idle).
- Validate very long conversations do not balloon DOM indefinitely.

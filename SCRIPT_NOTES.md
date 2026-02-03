# ChatGPT Glass Engine Notes

## Structure Overview
- Environment Guard & Session: top-frame checks, route filtering, single-load flags, session start timestamp.
- Tunables & Constants: timing, thresholds, and monitor refresh cadence.
- I18N & Labels: UI strings and compact labels for the top status bar.
- Storage Keys & DOM IDs: localStorage keys and injected element IDs.
- Runtime State: in-memory state for virtualization, monitoring, and UI.
- Logging & Diagnostics: in-memory log buffer, export helpers, and console control.
- Degradation Monitor: network hooks, status/IP/PoW parsing, and refresh scheduling.
- Health Scoring & Telemetry: severity aggregation and throttled health logging.
- Virtualization & Interaction: soft/hard virtualization, input guards, scroll/resize hooks.
- UI Render & Bindings: style injection, panel rendering, event bindings, and UI refresh.
- Route Guards & Boot: re-attach on navigation and safe startup.

## Changelog
- 2026-02-02
  - Added log export button and txt export with highlights and session scope.
  - Reduced background refresh/scan cadence for lighter footprint.
  - Added compact labels for the top status bar (service/IP/PoW).
  - Prevented top bar jitter when panel opens.
  - Keep last known PoW visible even when stale (muted color indicates staleness).
  - Added region markers and targeted inline comments.
  - Auto-hard now releases after DOM stays below a safe threshold.
  - Hard/soft mode is shown in the virtualization line (auto hard is labeled).
  - Hard virtualization batches DOM writes to reduce layout thrash and lag.
  - Added PoW probe on manual refresh to reduce "unknown" cases.
  - Added a DP-based margin planner that adapts to turns + mode.
  - Auto-hard thresholds now scale with turns and mode.
  - Updated IP risk tiers and display fields (labels + probability ranges).
  - Added session cache for service/IP/PoW so UI keeps last known values across UI rebuilds.
  - Added optimization status tag in the top bar (idle vs optimizing).
  - Time-sliced hard virtualization with requestIdleCallback to reduce jank on long chats.
  - Turns/remaining estimate now updates using a short TTL cache to avoid delayed display.
  - Optimizing indicator now reflects actual work (and clears on idle).
  - Hard-slice budget now front-loads work, then tapers to small slices with a minimum batch size.
  - Top mini tags now include short labels (service/IP/PoW/opt) and stronger color accents.
  - IP quality display no longer shows probability inline; probability stays in tooltip only.
  - Service description in zh now uses “轻微波动/严重波动/官方服务可能宕机”，避免与标签重复。
  - Top status lights updated to liquid-glass styling (stronger rim + sheen).
  - Degradation monitor layout restored: description left, tag right.
  - Added a mood filler panel in the left column to occupy empty space.
  - Mood quote now fetches daily from uapis.cn and caches by local date.

## Notes
- PoW is sourced from response headers/body of OpenAI requests; it updates opportunistically.
- When PoW is stale, the UI keeps the last value but uses a muted color.
- For debugging, use `CGPT_VS.exportLogs()` to download a snapshot.

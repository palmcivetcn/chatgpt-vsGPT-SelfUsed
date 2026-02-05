# Idle-Optimized Virtualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add idle-only heavy virtualization and a safe light-maintenance fallback so long conversations stay smooth without disrupting active chats.

**Architecture:** Introduce a pure idle-gate helper (Node-testable) and integrate it into `scheduleVirtualize` and `syncSoftNodes` to defer heavy passes during chat/input/scroll activity while permitting light maintenance after a max deferral window.

**Tech Stack:** Tampermonkey userscript, plain JavaScript, Node.js (for minimal tests).

### Task 1: Add Failing Tests for Idle Gate Decisions

**Files:**
- Create: `tests/idle-gate.test.js`

**Step 1: Write the failing test**

```js
const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT Glass Engine gpt super-8.0.0.user.js');
} catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.evaluateIdleGate === 'function', 'evaluateIdleGate export is missing');

const now = 10000;
const base = {
  now,
  chatBusy: false,
  inputBusy: false,
  scrollBusy: false,
  deferSince: 0,
  maintenanceAt: 0,
  maxDeferMs: 8000,
  maintenanceCooldownMs: 2000
};

let res = mod.evaluateIdleGate(base);
assert.equal(res.blocked, false);
assert.equal(res.allowMaintenance, false);

res = mod.evaluateIdleGate({ ...base, inputBusy: true });
assert.equal(res.blocked, true);
assert.equal(res.allowMaintenance, false);

res = mod.evaluateIdleGate({ ...base, inputBusy: true, deferSince: 1000, now: 10000 });
assert.equal(res.allowMaintenance, true);
```

**Step 2: Run test to verify it fails**

Run: `node tests/idle-gate.test.js`  
Expected: FAIL with `evaluateIdleGate export is missing`

---

### Task 2: Implement Idle Gate Helper + Node Guard

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write minimal implementation**

Add a pure helper at top-level:
- `evaluateIdleGate({ now, chatBusy, inputBusy, scrollBusy, deferSince, maintenanceAt, maxDeferMs, maintenanceCooldownMs })`
- Returns `{ blocked, chatBlocked, inputBlocked, scrollBlocked, allowMaintenance, deferSince, maintenanceAt }`

Add a Node guard so tests can `require()` the userscript without running the browser IIFE:
- `const __CGPT_BROWSER__ = typeof window !== 'undefined' && typeof document !== 'undefined';`
- Wrap the IIFE in `if (__CGPT_BROWSER__) { ... }`
- Export `evaluateIdleGate` when `module.exports` is present.

**Step 2: Run test to verify it passes**

Run: `node tests/idle-gate.test.js`  
Expected: PASS with no output

**Step 3: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js" tests/idle-gate.test.js
git commit -m "test: add idle gate helper and exports"
```

---

### Task 3: Integrate Idle Gate Into Virtualization Scheduling

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Modify: `tests/idle-gate.test.js`

**Step 1: Write additional failing test**

Add coverage for:
- chat-busy always blocks maintenance
- cooldown prevents repeated maintenance

```js
const now2 = 20000;
res = mod.evaluateIdleGate({
  ...base,
  now: now2,
  chatBusy: true,
  inputBusy: true,
  deferSince: 1000
});
assert.equal(res.allowMaintenance, false);

res = mod.evaluateIdleGate({
  ...base,
  now: 16000,
  inputBusy: true,
  deferSince: 2000,
  maintenanceAt: 15000,
  maintenanceCooldownMs: 3000
});
assert.equal(res.allowMaintenance, false);
```

**Step 2: Run test to verify it fails**

Run: `node tests/idle-gate.test.js`  
Expected: FAIL on new assertions

**Step 3: Implement integration**

Add new state and constants:
- `let idleDeferSince = 0;`
- `let idleMaintenanceAt = 0;`
- `const IDLE_OPTIMIZE_SCROLL_IDLE_MS = ...`
- `const IDLE_OPTIMIZE_MAX_DEFER_MS = ...`
- `const IDLE_OPTIMIZE_MAINTENANCE_COOLDOWN_MS = ...`

Add a small in-engine wrapper (inside the IIFE) that:
- Computes `chatBusy` via `updateChatBusy(false)`
- Computes `inputBusy` via `shouldYieldToInput(now)`
- Computes `scrollBusy` via recent `lastScrollAt`
- Calls `evaluateIdleGate(...)` and updates `idleDeferSince` / `idleMaintenanceAt`

Integrate into:
- `scheduleVirtualize`: if blocked, set `virtualizeDeferred` and schedule a deferred retry; if `allowMaintenance`, run `scheduleSoftSync('idle.maintenance')`.
- `syncSoftNodes`: if blocked and not `allowMaintenance`, set `softSyncDeferred = true`, call `scheduleDeferredVirtualize(...)`, return early.
- When idle resumes, flush `softSyncDeferred` via `scheduleSoftSync('idle.resume')`.

**Step 4: Run test to verify it passes**

Run: `node tests/idle-gate.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js" tests/idle-gate.test.js
git commit -m "feat: defer heavy virtualization until idle"
```

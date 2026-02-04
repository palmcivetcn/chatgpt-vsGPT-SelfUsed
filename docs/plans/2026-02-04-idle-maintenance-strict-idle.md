# Idle Maintenance Strict Idle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure maintenance only runs after idle resumes (never during input/scroll) and surface idle deferral in the UI, with a self-check that simulates gate transitions.

**Architecture:** Tighten `evaluateIdleGate` so maintenance is only allowed when idle resumes after a long deferral, wire `scheduleVirtualize` to trigger maintenance on idle, and add a small idle-deferral pause reason surfaced in the panel. Add a self-check that simulates blocked → idle → maintenance transitions.

**Tech Stack:** Tampermonkey userscript, plain JavaScript, Node.js tests.

### Task 1: Update Idle Gate Tests (Strict Idle Semantics)

**Files:**
- Modify: `tests/idle-gate.test.js`

**Step 1: Write the failing test**

```js
// Replace the existing "allowMaintenance while blocked" expectation.
res = mod.evaluateIdleGate({ ...base, inputBusy: true, deferSince: 1000, now: 10000 });
assert.equal(res.allowMaintenance, false);

// New: allow maintenance only after idle resumes.
res = mod.evaluateIdleGate({
  ...base,
  now: 10000,
  inputBusy: false,
  scrollBusy: false,
  deferSince: 1000
});
assert.equal(res.allowMaintenance, true);
assert.equal(res.deferSince, 0);

// New: cooldown blocks maintenance even on idle.
res = mod.evaluateIdleGate({
  ...base,
  now: 16000,
  inputBusy: false,
  scrollBusy: false,
  deferSince: 2000,
  maintenanceAt: 15000,
  maintenanceCooldownMs: 3000
});
assert.equal(res.allowMaintenance, false);
```

**Step 2: Run test to verify it fails**

Run: `node tests/idle-gate.test.js`  
Expected: FAIL on new assertions

**Step 3: Commit**

```bash
git add tests/idle-gate.test.js
git commit -m "test: tighten idle gate maintenance semantics"
```

---

### Task 2: Implement Strict Idle Maintenance Logic

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js` (evaluateIdleGate)

**Step 1: Write minimal implementation**

```js
function evaluateIdleGate({ ... }) {
  // when blocked -> set deferSince, allowMaintenance=false
  // when idle -> compute allowMaintenance based on deferred duration + cooldown
  // always clear deferSince when idle
}
```

**Step 2: Run test to verify it passes**

Run: `node tests/idle-gate.test.js`  
Expected: PASS

**Step 3: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "feat: only allow maintenance after idle resumes"
```

---

### Task 3: Idle Deferral UI + Self-Check

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

Add a pure helper and tests:

```js
assert.equal(mod.evaluatePauseReason({
  virtualizationEnabled: true,
  ctrlFFreeze: false,
  autoPauseOnChat: true,
  chatBusy: false,
  idleBlockedReason: 'input'
}), 'input');
```

**Step 2: Run test to verify it fails**

Run: `node tests/idle-gate.test.js`  
Expected: FAIL with "evaluatePauseReason export is missing"

**Step 3: Write minimal implementation**

Add:
- `evaluatePauseReason(...)` pure helper (exported)
- `idleGateBlockedReason` runtime state
- `getIdleGateState` updates idle block reason
- `getPauseReason` uses `evaluatePauseReason`
- I18N + `pauseReasonLabel` / `pauseReasonText` for input/scroll
- Move maintenance trigger to idle path in `scheduleVirtualize`
- Add `SelfCheck.register('idleGate.transition', ...)` simulating blocked → idle → maintenance

**Step 4: Run test to verify it passes**

Run: `node tests/idle-gate.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js" tests/idle-gate.test.js
git commit -m "feat: show idle deferral + self-check gate transitions"
```

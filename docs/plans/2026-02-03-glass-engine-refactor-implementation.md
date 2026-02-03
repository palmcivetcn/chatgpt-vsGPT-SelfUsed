# Glass Engine Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the single-file userscript into clear modules with improved performance, stability, and UI responsiveness while enforcing structured JSON logging via inline Pino.

**Architecture:** Single-file modular layout with explicit Core/Config, Store, Logger, Scheduler, Virtualization, Monitor, and UI blocks. Modules communicate through actions and a lightweight event bus, with centralized scheduling and gating.

**Tech Stack:** Tampermonkey userscript (no build), vanilla JS, inline Pino browser bundle, CSS glassmorphism.

**Notes:**
- Repository is not a git repo; commit steps are included but should be skipped unless git is initialized.
- Execution should use @superpowers:test-driven-development and @superpowers:executing-plans.
- All tests are self-checks run via `CGPT_VS.selfCheck()` in the browser console.

### Task 1: Add SelfCheck Harness (TDD scaffold)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
const SelfCheck = (() => {
  const tests = [];
  const register = (name, fn) => tests.push({ name, fn });
  const run = () => {
    throw new Error('SelfCheck not implemented');
  };
  return { register, run };
})();

SelfCheck.register('logger.schema', () => ({ ok: false, detail: 'logger not wired' }));
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: Throws `SelfCheck not implemented`

**Step 3: Write minimal implementation**

```js
const SelfCheck = (() => {
  const tests = [];
  const register = (name, fn) => tests.push({ name, fn });
  const run = () => {
    const results = tests.map((t) => {
      try {
        const out = t.fn();
        const ok = !!(out && out.ok);
        return { name: t.name, ok, detail: out && out.detail ? String(out.detail) : '' };
      } catch (err) {
        return { name: t.name, ok: false, detail: err && err.message ? err.message : String(err) };
      }
    });
    const ok = results.every((r) => r.ok);
    return { ok, results };
  };
  return { register, run };
})();
```

**Step 4: Run test to verify it still fails**

Run: `CGPT_VS.selfCheck()`
Expected: `{ ok: false, results: [...] }` with `logger.schema` failing

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "test: add self-check harness scaffold"
```

### Task 2: Inline Pino + Logger Wrapper (schema + sanitization)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('logger.schema', () => {
  const entry = Logger.__selfTest();
  const hasAll = !!(entry && entry.timestamp && entry.level && entry.message && entry.context);
  return { ok: hasAll, detail: hasAll ? '' : 'missing fields' };
});

SelfCheck.register('logger.sanitize', () => {
  const entry = Logger.__selfTest({ token: 'secret', password: 'x' });
  const ok = entry.context && entry.context.token === '[REDACTED]' && entry.context.password === '[REDACTED]';
  return { ok, detail: ok ? '' : 'sensitive data not redacted' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `logger.schema` and `logger.sanitize` fail

**Step 3: Write minimal implementation**

```js
// BEGIN PINO BROWSER BUNDLE
// Paste the official Pino browser bundle here (with license header preserved).
// END PINO BROWSER BUNDLE

const Logger = (() => {
  const SENSITIVE_RE = /password|token|secret/i;
  const sanitizeContext = (ctx) => {
    if (!ctx || typeof ctx !== 'object') return {};
    const out = {};
    Object.keys(ctx).forEach((k) => {
      out[k] = SENSITIVE_RE.test(k) ? '[REDACTED]' : ctx[k];
    });
    return out;
  };

  const logger = pino({
    level: (LOG_ENV === 'prod') ? 'info' : 'debug',
    browser: { asObject: true }
  });

  const format = (level, message, context) => ({
    timestamp: new Date().toISOString(),
    level,
    message: String(message || ''),
    context: sanitizeContext(context || {})
  });

  const log = (level, message, context) => {
    const payload = format(level, message, context);
    logger[level](payload);
    return payload;
  };

  const api = {
    debug: (m, c) => log('debug', m, c),
    info: (m, c) => log('info', m, c),
    warn: (m, c) => log('warn', m, c),
    error: (m, c) => log('error', m, c),
    __selfTest: (ctx) => format('info', 'selftest', ctx)
  };

  return api;
})();
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `logger.schema` and `logger.sanitize` pass

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "feat: inline pino logger with schema and sanitization"
```

### Task 3: Scheduler Module (centralized gating + timers)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('scheduler.gate', () => {
  const ok = Scheduler.shouldRun({ hidden: true, chatBusy: true, paused: true }) === false;
  return { ok, detail: ok ? '' : 'gate should block' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `scheduler.gate` fails

**Step 3: Write minimal implementation**

```js
const Scheduler = (() => {
  const timers = new Set();
  const shouldRun = (state) => {
    if (!state) return true;
    if (state.hidden || state.chatBusy || state.paused) return false;
    return true;
  };
  const setTimeoutSafe = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.add(id);
    return id;
  };
  const clearAll = () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  };
  return { shouldRun, setTimeoutSafe, clearAll };
})();
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `scheduler.gate` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "feat: add centralized scheduler gate"
```

### Task 4: Store + Actions Skeleton (single source of truth)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('store.update', () => {
  const store = createStore({ a: 1 });
  store.set({ a: 2 });
  return { ok: store.get().a === 2, detail: 'store did not update' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `store.update` fails

**Step 3: Write minimal implementation**

```js
const createStore = (initial) => {
  let state = { ...initial };
  const listeners = new Set();
  const get = () => ({ ...state });
  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn(get()));
  };
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  return { get, set, subscribe };
};
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `store.update` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "feat: add centralized store"
```

### Task 5: Virtualization Engine Refactor (measure/apply split)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('virt.marginPlanner', () => {
  const out = planMarginsDP(100, 'balanced', { soft: 2, hard: 4 });
  const ok = out && out.soft >= 1 && out.hard >= out.soft + 1;
  return { ok, detail: ok ? '' : 'planner output invalid' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `virt.marginPlanner` fails

**Step 3: Write minimal implementation**

```js
// Move virtualization helpers into a Virtualization module.
// Split into measure phase (rects, bounds) and apply phase (DOM writes).
// Ensure apply occurs after all reads, preserving existing behavior.
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `virt.marginPlanner` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "refactor: modularize virtualization engine"
```

### Task 6: Degradation Monitor Refactor (hooks + freshness)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('monitor.pow', () => {
  const data = { pow: { difficulty: '0x1a2b' } };
  const info = findPowDataInJson(data);
  const ok = info && info.difficulty === '0x1a2b';
  return { ok, detail: ok ? '' : 'pow parse failed' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `monitor.pow` fails

**Step 3: Write minimal implementation**

```js
// Move monitor logic into a Monitor module.
// Ensure hook installation is idempotent and freshness guards are applied
// before overwriting cached values.
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `monitor.pow` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "refactor: modularize degradation monitor"
```

### Task 7: UI Update Pipeline (RAF merge + action dispatch)

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('ui.format', () => {
  const ui = formatUIState({ mode: 'balanced', dom: 1000 });
  const ok = ui && ui.modeLabel === 'Balanced';
  return { ok, detail: ok ? '' : 'ui state format failed' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `ui.format` fails

**Step 3: Write minimal implementation**

```js
const formatUIState = (state) => ({
  modeLabel: (state.mode === 'balanced') ? 'Balanced' : 'Performance'
});
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `ui.format` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "refactor: centralize UI formatting"
```

### Task 8: Boot Wiring + Cleanup

**Files:**
- Modify: `ChatGPT Glass Engine gpt super-8.0.0.user.js`
- Test: `ChatGPT Glass Engine gpt super-8.0.0.user.js`

**Step 1: Write the failing test**

```js
SelfCheck.register('boot.exports', () => {
  const ok = PAGE_WIN.CGPT_VS && typeof PAGE_WIN.CGPT_VS.selfCheck === 'function';
  return { ok, detail: ok ? '' : 'CGPT_VS.selfCheck missing' };
});
```

**Step 2: Run test to verify it fails**

Run: `CGPT_VS.selfCheck()`
Expected: `boot.exports` fails

**Step 3: Write minimal implementation**

```js
PAGE_WIN.CGPT_VS.selfCheck = () => SelfCheck.run();
```

**Step 4: Run test to verify it passes**

Run: `CGPT_VS.selfCheck()`
Expected: `boot.exports` passes

**Step 5: Commit**

```bash
git add "ChatGPT Glass Engine gpt super-8.0.0.user.js"
git commit -m "chore: expose selfCheck on CGPT_VS"
```

---

Plan complete and saved to `docs/plans/2026-02-03-glass-engine-refactor-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?

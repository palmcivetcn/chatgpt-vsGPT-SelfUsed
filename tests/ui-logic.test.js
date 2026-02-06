const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT Glass Engine gpt super.js');
} catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveUiRefreshDecision === 'function', 'resolveUiRefreshDecision export is missing');
assert.ok(mod && typeof mod.resolveWorstHealthLevel === 'function', 'resolveWorstHealthLevel export is missing');

let res = mod.resolveUiRefreshDecision({
  now: 2000,
  force: false,
  open: false,
  busy: false,
  uiCacheAt: 0,
  lastUiFullAt: 0,
  sessionStartedAt: 1500,
  initLightUiMs: 1200,
  fullRefreshOpenMs: 900,
  fullRefreshClosedMs: 2600,
  fullRefreshBusyMs: 2000
});

assert.equal(res.fullInterval, 2600);
assert.equal(res.doFull, true);
assert.equal(res.lightInit, true);

res = mod.resolveUiRefreshDecision({
  now: 10000,
  force: false,
  open: true,
  busy: false,
  uiCacheAt: 5000,
  lastUiFullAt: 9500,
  sessionStartedAt: 1000,
  initLightUiMs: 1200,
  fullRefreshOpenMs: 900,
  fullRefreshClosedMs: 2600,
  fullRefreshBusyMs: 2000
});

assert.equal(res.fullInterval, 900);
assert.equal(res.doFull, false);
assert.equal(res.lightInit, false);

res = mod.resolveUiRefreshDecision({
  now: 12000,
  force: false,
  open: false,
  busy: true,
  uiCacheAt: 6000,
  lastUiFullAt: 9800,
  sessionStartedAt: 1000,
  initLightUiMs: 1200,
  fullRefreshOpenMs: 900,
  fullRefreshClosedMs: 2600,
  fullRefreshBusyMs: 2000
});

assert.equal(res.fullInterval, 2000);
assert.equal(res.doFull, true);
assert.equal(res.lightInit, false);

assert.equal(mod.resolveWorstHealthLevel({
  virtualizationEnabled: false,
  memLevel: 'ok',
  domLevel: 'ok',
  degradedSeverity: 'bad'
}), 'off');

assert.equal(mod.resolveWorstHealthLevel({
  virtualizationEnabled: true,
  memLevel: 'ok',
  domLevel: 'ok',
  degradedSeverity: 'warn'
}), 'warn');

assert.equal(mod.resolveWorstHealthLevel({
  virtualizationEnabled: true,
  memLevel: 'warn',
  domLevel: 'ok',
  degradedSeverity: 'ok'
}), 'warn');

assert.equal(mod.resolveWorstHealthLevel({
  virtualizationEnabled: true,
  memLevel: 'ok',
  domLevel: 'bad',
  degradedSeverity: 'ok'
}), 'bad');

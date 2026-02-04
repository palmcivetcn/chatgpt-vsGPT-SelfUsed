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

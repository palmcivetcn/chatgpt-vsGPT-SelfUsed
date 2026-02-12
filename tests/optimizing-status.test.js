const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveOptimizingStatus === 'function', 'resolveOptimizingStatus export is missing');

let out = mod.resolveOptimizingStatus({
  virtualizationEnabled: true,
  ctrlFFreeze: false,
  autoPauseOnChat: true,
  chatBusy: false,
  gateReady: false,
  hardSliceActive: false,
  optimizeActive: false,
  lastWorkAt: 980,
  optimizeBusyUntil: 0,
  optimizeHoldMs: 120,
  now: 1000
});
assert.equal(out.optimizing, false, 'below threshold should not be optimizing only due recent maintenance');

out = mod.resolveOptimizingStatus({
  virtualizationEnabled: true,
  ctrlFFreeze: false,
  autoPauseOnChat: true,
  chatBusy: false,
  gateReady: true,
  hardSliceActive: false,
  optimizeActive: false,
  lastWorkAt: 980,
  optimizeBusyUntil: 0,
  optimizeHoldMs: 120,
  now: 1000
});
assert.equal(out.optimizing, true, 'when gate is ready, recent optimize work can be shown');
assert.equal(out.nextBusyUntil, 0);

out = mod.resolveOptimizingStatus({
  virtualizationEnabled: true,
  ctrlFFreeze: false,
  autoPauseOnChat: true,
  chatBusy: false,
  gateReady: false,
  hardSliceActive: true,
  optimizeActive: false,
  lastWorkAt: 0,
  optimizeBusyUntil: 0,
  optimizeHoldMs: 120,
  now: 1000
});
assert.equal(out.optimizing, true, 'hard slice should be treated as optimizing');
assert.equal(out.nextBusyUntil, 1120);

const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveKeepCoopMode === 'function', 'resolveKeepCoopMode export is missing');

let out = mod.resolveKeepCoopMode({
  now: 1000,
  enabled: true,
  keepDetected: false,
  turns: 400,
  domNodes: 5000,
  active: true,
  coolSince: 0,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, false);

out = mod.resolveKeepCoopMode({
  now: 2000,
  enabled: true,
  keepDetected: true,
  turns: 220,
  domNodes: 1200,
  active: false,
  coolSince: 0,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, true);
assert.equal(out.shouldEnter, true);

out = mod.resolveKeepCoopMode({
  now: 3000,
  enabled: true,
  keepDetected: true,
  turns: 170,
  domNodes: 2500,
  active: false,
  coolSince: 0,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, false);

out = mod.resolveKeepCoopMode({
  now: 10000,
  enabled: true,
  keepDetected: true,
  turns: 120,
  domNodes: 2000,
  active: true,
  coolSince: 0,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, true);
assert.equal(out.nextCoolSince, 10000);

out = mod.resolveKeepCoopMode({
  now: 18000,
  enabled: true,
  keepDetected: true,
  turns: 120,
  domNodes: 2000,
  active: true,
  coolSince: 10000,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, true);
assert.equal(out.nextCoolSince, 10000);

out = mod.resolveKeepCoopMode({
  now: 21001,
  enabled: true,
  keepDetected: true,
  turns: 120,
  domNodes: 2000,
  active: true,
  coolSince: 10000,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, false);
assert.equal(out.shouldExit, true);

out = mod.resolveKeepCoopMode({
  now: 22000,
  enabled: true,
  keepDetected: true,
  turns: 260,
  domNodes: 2800,
  active: true,
  coolSince: 12000,
  enterTurns: 180,
  enterDomNodes: 2600,
  exitTurns: 150,
  exitDomNodes: 2200,
  exitHoldMs: 10000
});
assert.equal(out.active, true);
assert.equal(out.nextCoolSince, 0);

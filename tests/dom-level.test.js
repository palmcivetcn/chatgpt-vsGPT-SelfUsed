const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveDomLevel === 'function', 'resolveDomLevel export is missing');

assert.equal(mod.resolveDomLevel(NaN).level, 'na');
assert.equal(mod.resolveDomLevel(6800).level, 'ok');
assert.equal(mod.resolveDomLevel(15015).level, 'warn');
assert.equal(mod.resolveDomLevel(22000).level, 'bad');

const custom = mod.resolveDomLevel(10000, { domOk: 5000, domWarn: 9000, domBad: 12000 });
assert.equal(custom.level, 'warn');

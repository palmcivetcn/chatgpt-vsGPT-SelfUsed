const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveOptimizeTagState === 'function', 'resolveOptimizeTagState export is missing');

let out = mod.resolveOptimizeTagState({
  lang: 'zh',
  yielding: true,
  optimizing: true,
  virtualizationEnabled: true,
  virtualizedCount: 99
});
assert.equal(out.status, 'yielding');
assert.equal(out.label, '避让中');

out = mod.resolveOptimizeTagState({
  lang: 'en',
  yielding: false,
  optimizing: true,
  virtualizationEnabled: true,
  virtualizedCount: 99
});
assert.equal(out.status, 'optimizing');
assert.equal(out.label, 'Optimizing');

out = mod.resolveOptimizeTagState({
  lang: 'zh',
  yielding: false,
  optimizing: false,
  virtualizationEnabled: true,
  virtualizedCount: 77
});
assert.equal(out.status, 'optimized');
assert.equal(out.label, '已优化');
assert.ok(out.tip.includes('77'));

out = mod.resolveOptimizeTagState({
  lang: 'en',
  yielding: false,
  optimizing: false,
  virtualizationEnabled: true,
  virtualizedCount: 0
});
assert.equal(out.status, 'idle');
assert.equal(out.label, 'Idle');

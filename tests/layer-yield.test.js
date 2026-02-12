const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveLayerYieldMode === 'function', 'resolveLayerYieldMode export is missing');
assert.ok(mod && typeof mod.resolveLayerYieldZIndex === 'function', 'resolveLayerYieldZIndex export is missing');

assert.equal(mod.resolveLayerYieldMode({
  scope: 'dual',
  keepActive: true,
  genericActive: true
}), 'keep');

assert.equal(mod.resolveLayerYieldMode({
  scope: 'dual',
  keepActive: false,
  genericActive: true
}), 'generic');

assert.equal(mod.resolveLayerYieldMode({
  scope: 'keep-only',
  keepActive: false,
  genericActive: true
}), 'none');

assert.equal(mod.resolveLayerYieldMode({
  scope: 'generic-only',
  keepActive: true,
  genericActive: true
}), 'generic');

assert.equal(mod.resolveLayerYieldZIndex({
  overlayZIndices: [3000, 3100],
  fallbackZIndex: 2900,
  minZIndex: 1
}), 2999);

assert.equal(mod.resolveLayerYieldZIndex({
  overlayZIndices: ['auto', NaN, null],
  fallbackZIndex: 2900,
  minZIndex: 1
}), 2900);

assert.equal(mod.resolveLayerYieldZIndex({
  overlayZIndices: [1],
  fallbackZIndex: 2900,
  minZIndex: 1
}), 1);

assert.equal(mod.resolveLayerYieldZIndex({
  overlayZIndices: [],
  fallbackZIndex: 0,
  minZIndex: 5
}), 5);

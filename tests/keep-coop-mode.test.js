const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '..', 'ChatGPT-Glass-Engine-gpt-super.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const mod = require('../ChatGPT-Glass-Engine-gpt-super.js');

assert.ok(mod && typeof mod === 'object', 'module export is missing');
assert.equal(typeof mod.resolveKeepCoopMode, 'undefined', 'resolveKeepCoopMode should be removed');

[
  'cgpt_vs_keep_coop_enabled',
  'cgpt-vs-keep-coop',
  'setKeepCoopEnabled',
  'getKeepCoopState',
  'resolveKeepCoopMode'
].forEach((token) => {
  assert.equal(script.includes(token), false, `token should be removed: ${token}`);
});

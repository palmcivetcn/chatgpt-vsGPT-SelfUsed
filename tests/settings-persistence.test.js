const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '..', 'ChatGPT Glass Engine gpt super.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const mod = require('../ChatGPT Glass Engine gpt super.js');

const nameMatch = script.match(/^\/\/ @name\s+(.+)$/m);
assert.ok(nameMatch, '@name is missing');
assert.equal(nameMatch[1].trim(), 'ChatGPT Glass Engine super', '@name must stay stable to avoid reset on update');

const namespaceMatch = script.match(/^\/\/ @namespace\s+(.+)$/m);
assert.ok(namespaceMatch, '@namespace is missing');
assert.equal(namespaceMatch[1].trim(), 'local.chatgpt.optimizer', '@namespace must stay stable to avoid reset on update');

assert.match(script, /^\/\/ @grant\s+GM_getValue$/m, 'GM_getValue grant is missing');
assert.match(script, /^\/\/ @grant\s+GM_setValue$/m, 'GM_setValue grant is missing');

assert.ok(mod && typeof mod.resolvePersistedRaw === 'function', 'resolvePersistedRaw export is missing');

let picked = mod.resolvePersistedRaw({
  gmValue: '1',
  localValue: '0'
});
assert.equal(picked.value, '1');
assert.equal(picked.source, 'gm');

picked = mod.resolvePersistedRaw({
  gmValue: null,
  localValue: '0'
});
assert.equal(picked.value, '0');
assert.equal(picked.source, 'local');

picked = mod.resolvePersistedRaw({
  gmValue: undefined,
  localValue: null
});
assert.equal(picked.value, null);
assert.equal(picked.source, 'none');

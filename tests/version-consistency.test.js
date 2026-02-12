const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '..', 'ChatGPT-Glass-Engine-gpt-super.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const headerVersionMatch = script.match(/^\/\/ @version\s+([0-9]+\.[0-9]+\.[0-9]+)$/m);
assert.ok(headerVersionMatch, '@version must exist and follow x.y.z');

const runtimeVersionMatch = script.match(/const SCRIPT_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)';/);
assert.ok(runtimeVersionMatch, 'SCRIPT_VERSION must exist and follow x.y.z');

assert.equal(
  runtimeVersionMatch[1],
  headerVersionMatch[1],
  'SCRIPT_VERSION must match userscript @version'
);

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '..', 'ChatGPT Glass Engine gpt super.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const expectedUrl = 'https://github.com/palmcivetcn/chatgpt-vsGPT-SelfUsed/releases/latest/download/chatgpt-glass-engine.user.js';

const downloadMatch = script.match(/^\/\/ @downloadURL\s+(.+)$/m);
assert.ok(downloadMatch, '@downloadURL is missing');
assert.equal(downloadMatch[1].trim(), expectedUrl, '@downloadURL must point to latest release asset');

const updateMatch = script.match(/^\/\/ @updateURL\s+(.+)$/m);
assert.ok(updateMatch, '@updateURL is missing');
assert.equal(updateMatch[1].trim(), expectedUrl, '@updateURL must point to latest release asset');

const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'release-userscript-asset.yml');
assert.ok(fs.existsSync(workflowPath), 'release asset upload workflow is missing');

const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /on:\s*\n\s*release:/, 'workflow must trigger on release');
assert.match(workflow, /gh release upload/, 'workflow must upload userscript asset to release');
assert.match(workflow, /chatgpt-glass-engine\.user\.js/, 'workflow must upload a stable userscript asset name');

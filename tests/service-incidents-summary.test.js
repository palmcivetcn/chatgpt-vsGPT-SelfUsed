const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.compactSingleLineText === 'function', 'compactSingleLineText export is missing');
assert.ok(mod && typeof mod.summarizeStatusIncidents === 'function', 'summarizeStatusIncidents export is missing');

const compact = mod.compactSingleLineText('  High   errors   with image generation   ', 24);
assert.equal(compact.includes('  '), false, 'text should be normalized to one line');
assert.ok(compact.length <= 24, 'text should be clipped to max length');

const summaryZh = mod.summarizeStatusIncidents([
  { name: 'High errors with image generation', status: 'monitoring' },
  { name: 'Login degraded in some regions', status: 'identified' },
  { name: 'Legacy issue', status: 'investigating' },
  { name: 'already fixed', status: 'resolved' }
], { lang: 'zh', maxItems: 2, maxNameLength: 24 });

assert.equal(summaryZh.count, 3);
assert.equal(summaryZh.lines.length, 3);
assert.ok(summaryZh.lines[0].includes('监控中'));
assert.ok(summaryZh.lines[1].includes('已定位'));
assert.ok(summaryZh.lines[2].includes('另有 1 条'));

const summaryEn = mod.summarizeStatusIncidents([
  { name: 'Done', status: 'resolved' }
], { lang: 'en' });

assert.equal(summaryEn.count, 0);
assert.equal(summaryEn.lines.length, 0);

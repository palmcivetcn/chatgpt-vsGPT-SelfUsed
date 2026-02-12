const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.buildStructuredLogExport === 'function', 'buildStructuredLogExport export is missing');

const doc = mod.buildStructuredLogExport({
  generatedAtIso: '2026-02-11T16:00:00.000Z',
  generatedAtLocal: '2026-02-12 00:00:00',
  reason: 'ui',
  session: {
    id: 'abc123',
    version: '8.0.0'
  },
  runtime: {
    mode: 'balanced'
  },
  events: [
    { seq: 1, level: 'info', event: 'boot.start' }
  ]
});

assert.equal(doc.schema.name, 'cgpt_glass_log_export');
assert.equal(doc.schema.format, 'json');
assert.equal(doc.meta.reason, 'ui');
assert.equal(doc.session.id, 'abc123');
assert.equal(doc.runtime.mode, 'balanced');
assert.equal(Array.isArray(doc.events), true);
assert.equal(doc.events.length, 1);

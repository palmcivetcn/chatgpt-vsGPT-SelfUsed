const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT-Glass-Engine-gpt-super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveServicePollIntervalMs === 'function', 'resolveServicePollIntervalMs export is missing');
assert.ok(mod && typeof mod.shouldRefreshIpQuality === 'function', 'shouldRefreshIpQuality export is missing');
assert.ok(mod && typeof mod.resolveDegradedOverallSeverity === 'function', 'resolveDegradedOverallSeverity export is missing');

assert.equal(
  mod.resolveServicePollIntervalMs({ indicator: 'none', okMs: 900000, degradedMs: 360000 }),
  900000
);
assert.equal(
  mod.resolveServicePollIntervalMs({ indicator: 'minor', okMs: 900000, degradedMs: 360000 }),
  360000
);

assert.equal(
  mod.shouldRefreshIpQuality({
    force: false,
    ip: '1.1.1.1',
    qualityIp: '1.1.1.1',
    qualityLabel: 'Low risk',
    qualityScore: 12
  }),
  false
);
assert.equal(
  mod.shouldRefreshIpQuality({
    force: false,
    ip: '1.1.1.1',
    qualityIp: '1.1.1.1',
    qualityLabel: '',
    qualityScore: null
  }),
  true
);
assert.equal(
  mod.shouldRefreshIpQuality({
    force: false,
    ip: '2.2.2.2',
    qualityIp: '1.1.1.1',
    qualityLabel: 'Low risk',
    qualityScore: 12
  }),
  true
);

assert.equal(
  mod.resolveDegradedOverallSeverity({ serviceSev: 'bad', ipSev: 'na', powSev: 'na' }),
  'bad'
);
assert.equal(
  mod.resolveDegradedOverallSeverity({ serviceSev: 'na', ipSev: 'bad', powSev: 'na' }),
  'warn'
);
assert.equal(
  mod.resolveDegradedOverallSeverity({ serviceSev: 'na', ipSev: 'bad', powSev: 'bad' }),
  'bad'
);
assert.equal(
  mod.resolveDegradedOverallSeverity({ serviceSev: 'warn', ipSev: 'na', powSev: 'na' }),
  'warn'
);
assert.equal(
  mod.resolveDegradedOverallSeverity({ serviceSev: 'na', ipSev: 'na', powSev: 'na' }),
  'na'
);

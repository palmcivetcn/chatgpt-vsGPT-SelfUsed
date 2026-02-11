const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT Glass Engine gpt super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.resolveConversationRouteInfo === 'function', 'resolveConversationRouteInfo export is missing');
assert.ok(mod && typeof mod.resolveRouteAutoScrollDecision === 'function', 'resolveRouteAutoScrollDecision export is missing');

let route = mod.resolveConversationRouteInfo({
  url: 'https://chatgpt.com/c/abcdef12-3456-7890-abcd-ef1234567890'
});
assert.equal(route.isConversation, true);
assert.equal(route.conversationId, 'abcdef12-3456-7890-abcd-ef1234567890');
assert.equal(route.routeKey, 'c:abcdef12-3456-7890-abcd-ef1234567890');

route = mod.resolveConversationRouteInfo({
  url: 'https://chatgpt.com/'
});
assert.equal(route.isConversation, false);
assert.equal(route.routeKey, '/');

let decision = mod.resolveRouteAutoScrollDecision({
  previousRouteKey: 'c:old',
  nextRouteKey: 'c:new',
  now: 2000,
  lastAutoScrollAt: 0,
  minIntervalMs: 900
});
assert.equal(decision.changed, true);
assert.equal(decision.throttled, false);
assert.equal(decision.shouldAutoScroll, true);

decision = mod.resolveRouteAutoScrollDecision({
  previousRouteKey: 'c:old',
  nextRouteKey: 'c:new',
  now: 2500,
  lastAutoScrollAt: 2300,
  minIntervalMs: 400
});
assert.equal(decision.changed, true);
assert.equal(decision.throttled, true);
assert.equal(decision.shouldAutoScroll, false);

decision = mod.resolveRouteAutoScrollDecision({
  previousRouteKey: 'c:same',
  nextRouteKey: 'c:same',
  now: 3000,
  lastAutoScrollAt: 0,
  minIntervalMs: 400
});
assert.equal(decision.changed, false);
assert.equal(decision.shouldAutoScroll, false);

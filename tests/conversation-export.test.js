const assert = require('assert');

let mod = null;
try {
  mod = require('../ChatGPT Glass Engine gpt super.js');
}
catch (err) {
  mod = null;
}

assert.ok(mod && typeof mod.buildConversationExportMarkdown === 'function', 'buildConversationExportMarkdown export is missing');

let text = mod.buildConversationExportMarkdown({
  title: 'Demo Chat',
  url: 'https://chatgpt.com/c/abcd1234-efgh-5678',
  exportedAtLocal: '2026-02-11 12:00:00',
  exportedAtIso: '2026-02-11T12:00:00.000Z',
  scriptVersion: '8.0.0',
  turns: [
    { role: 'user', text: '你好' },
    { role: 'assistant', text: '你好，我在。' }
  ]
});

assert.match(text, /^# Demo Chat/m);
assert.match(text, /- URL: https:\/\/chatgpt\.com\/c\/abcd1234-efgh-5678/m);
assert.match(text, /- ScriptVersion: 8\.0\.0/m);
assert.match(text, /- Turns: 2/m);
assert.match(text, /## 1\. User/m);
assert.match(text, /## 2\. Assistant/m);
assert.match(text, /你好，我在。/m);

text = mod.buildConversationExportMarkdown({
  title: '',
  turns: []
});

assert.match(text, /^# ChatGPT Conversation/m);
assert.match(text, /_No conversation content captured\._/m);

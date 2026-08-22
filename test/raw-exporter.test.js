const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'chatgpt-raw-exporter.user.js'), 'utf8');
const executable = source.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

test('raw exporter stays payload-only and fail-closed', () => {
    assert.doesNotThrow(() => new Function(executable));
    assert.match(source, /\/backend-api\/conversation\//);
    assert.match(source, /const ACCOUNTS_ENDPOINT =/);
    assert.match(source, /fetch\(ACCOUNTS_ENDPOINT/);
    assert.match(source, /ChatGPT-Account-Id/);
    assert.match(source, /does not contain a conversation mapping\. Nothing was downloaded/);
    assert.doesNotMatch(source, /scrollTop|scrollHeight|conversation-turn/);
});

test('raw exporter integrates with the conversation menu instead of a floating control', () => {
    assert.match(source, /Export Raw JSON/);
    assert.match(source, /data-chatgpt-raw-exporter-item/);
    assert.match(source, /\[role="menu"\]/);
    assert.match(source, /data-chat-exporter-item/);
    assert.match(source, /MutationObserver/);
    assert.doesNotMatch(source, /position:fixed/);
    assert.doesNotMatch(source, /setInterval\(syncButton/);
});

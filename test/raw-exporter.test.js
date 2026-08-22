const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rawSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'raw-json-export.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'chatgpt-exporter.user.js'), 'utf8');
const buildSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-exporters.js'), 'utf8');

test('raw exporter stays payload-only and fail-closed', () => {
    assert.doesNotThrow(() => new Function(rawSource));
    assert.match(rawSource, /\/backend-api\/conversation\//);
    assert.match(rawSource, /const ACCOUNTS_ENDPOINT =/);
    assert.match(rawSource, /fetch\(ACCOUNTS_ENDPOINT/);
    assert.match(rawSource, /ChatGPT-Account-Id/);
    assert.match(rawSource, /does not contain a conversation mapping\. Nothing was downloaded/);
    assert.doesNotMatch(rawSource, /scrollTop|scrollHeight|conversation-turn/);
});

test('raw exporter integrates with the conversation menu instead of a floating control', () => {
    assert.match(rawSource, /Export Raw JSON/);
    assert.match(rawSource, /data-chatgpt-raw-exporter-item/);
    assert.match(rawSource, /\[role="menu"\]/);
    assert.match(rawSource, /data-chat-exporter-item/);
    assert.match(rawSource, /MutationObserver/);
    assert.doesNotMatch(rawSource, /position:fixed/);
    assert.doesNotMatch(rawSource, /setInterval\(syncButton/);
});

test('integrated app bundles the existing exporter and raw JSON source', () => {
    assert.match(appSource, /@name\s+ChatGPT Chat Exporter/);
    assert.match(appSource, /src\/extraction-engine\.js/);
    assert.match(appSource, /src\/progress-overlay\.js/);
    assert.match(appSource, /src\/userscript-ui\.js/);
    assert.match(appSource, /src\/raw-json-export\.js/);
    assert.match(appSource, /ChatExporterUi\.install/);
    assert.match(buildSource, /\['chatgpt-exporter\.user\.js', integratedUserscript\(\)\]/);
});

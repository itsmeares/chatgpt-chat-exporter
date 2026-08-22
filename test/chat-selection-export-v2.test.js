const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'src', 'chat-selection-export-v2.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const exporter = require('../src/chat-selection-export-v2.js');

test('normalizer marks embedded project conversations as project scoped', () => {
    const item = exporter.internals.normalizeConversationItem({
        id: 'conversation-1',
        title: 'Project chat',
        gizmo_id: 'g-p-1234567890abcdef1234567890abcdef'
    });

    assert.equal(item.scope, 'project');
    assert.equal(item.projectId, 'g-p-1234567890abcdef1234567890abcdef');
});

test('catalog implementation gives authoritative project membership precedence', () => {
    assert.match(source, /projectByConversation\.get\(item\.id\)/);
    assert.match(source, /if \(projectVersion\) continue/);
    assert.match(source, /projectItems, \.\.\.personalItems/);
});

test('conversation requests retry transient 429 and 5xx responses across account candidates', () => {
    assert.match(source, /status === 429 \|\| \(status >= 500 && status <= 599\)/);
    assert.match(source, /for \(const accountId of candidates\)/);
    assert.match(source, /for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
    assert.match(source, /failed after account retries/);
});

test('parallel workers do not mutate a shared auth context', () => {
    assert.doesNotMatch(source, /context = \{ token: result\.token, accountId: result\.accountId \}/);
    assert.match(source, /accountId: item\.accountId \|\| catalogContext\.accountId/);
});

test('selective export reports the exact conversations that failed', () => {
    assert.match(source, /failures\.push\(`\$\{item\.title \|\| item\.id\}: \$\{error\.message\}`\)/);
    assert.match(source, /Export was incomplete; \$\{failures\.length\} conversation\(s\) failed/);
});
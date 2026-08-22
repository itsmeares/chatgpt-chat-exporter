const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = path.join(__dirname, '..', 'src', 'chat-selection-export.js');
const source = fs.readFileSync(modulePath, 'utf8');
const exporter = require(modulePath);

test('selection exporter lists personal chats with API pagination', () => {
    assert.match(source, /\/backend-api\/conversations\?offset=\$\{offset\}&limit=\$\{limit\}&order=updated/);
    assert.match(source, /limit = 100/);
    assert.match(source, /has_more/);
});

test('selection exporter discovers projects independently of rendered sidebar', () => {
    assert.match(source, /\/backend-api\/gizmos\/snorlax\/sidebar/);
    assert.match(source, /conversations_per_gizmo/);
    assert.match(source, /internals\.listProjectConversations/);
});

test('selected conversation exports are payload based and fail closed', () => {
    assert.match(source, /core\(\)\.fetchConversation/);
    assert.match(source, /core\(\)\.payloadToMarkdown/);
    assert.match(source, /Export was incomplete/);
    assert.doesNotMatch(source, /scrollIntoView|scrollTop|findScrollContainer/);
});

test('multiple selected chats use a ZIP and bounded parallel fetching', () => {
    assert.match(source, /Math\.min\(3,/);
    assert.match(source, /new root\.JSZip\(\)/);
    assert.match(source, /ChatGPT_\$\{label\}_Markdown_/);
});

test('project home ids are parsed from project URLs', () => {
    assert.equal(exporter.projectIdFromLocation(), '');
    assert.match(source, /\\\/g\\\/\(g-p-\[a-z0-9\]\{32\}\)/i);
    assert.match(source, /Export Project Markdown ZIP/);
    assert.match(source, /Select chats to export/);
});

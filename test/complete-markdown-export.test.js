const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const exporter = require('../src/complete-markdown-export.js');

function message(id, role, text, parent, options = {}) {
    return {
        id,
        parent,
        children: [],
        message: {
            id,
            author: { role },
            create_time: options.createTime || 1,
            content: {
                content_type: options.contentType || 'text',
                parts: [text]
            },
            metadata: options.metadata || {}
        }
    };
}

function fixturePayload() {
    const mapping = {
        root: { id: 'root', parent: null, children: ['u1'], message: null },
        u1: message('u1', 'user', 'first user message', 'root', { createTime: 10 }),
        progress: message('progress', 'assistant', 'Checked the server state.', 'u1', { createTime: 11 }),
        a1: message('a1', 'assistant', 'first assistant answer', 'progress', { createTime: 12 }),
        oldA1: message('oldA1', 'assistant', 'discarded regenerated answer', 'u1', { createTime: 11.5 }),
        u2: message('u2', 'user', 'last user message', 'a1', { createTime: 13 }),
        a2: message('a2', 'assistant', 'last assistant answer', 'u2', { createTime: 14 })
    };

    mapping.root.children = ['u1'];
    mapping.u1.children = ['progress', 'oldA1'];
    mapping.progress.children = ['a1'];
    mapping.a1.children = ['u2'];
    mapping.oldA1.children = [];
    mapping.u2.children = ['a2'];
    mapping.a2.children = [];

    return {
        title: 'Long Project Chat',
        conversation_id: '12345678-aaaa-bbbb-cccc-1234567890ab',
        current_node: 'a2',
        gizmo_id: 'g-p-testproject',
        mapping
    };
}

test('active payload walk follows only the current conversation branch', () => {
    const payload = fixturePayload();
    const ids = exporter.activePayloadMessages(payload).map(entry => entry.nodeId);
    assert.deepEqual(ids, ['u1', 'progress', 'a1', 'u2', 'a2']);
    assert.equal(ids.includes('oldA1'), false);
});

test('main payload messages keep user turns and final assistant responses', () => {
    const payload = fixturePayload();
    const entries = exporter.activePayloadMessages(payload);
    const ids = exporter.mainPayloadMessages(entries).map(entry => entry.nodeId);
    assert.deepEqual(ids, ['u1', 'a1', 'u2', 'a2']);
});

test('payload markdown is complete, ordered, and excludes discarded branches', () => {
    const markdown = exporter.payloadToMarkdown(fixturePayload(), {
        date: '2026-08-22',
        includeReasoning: true
    });

    assert.match(markdown, /^# Long Project Chat/m);
    assert.match(markdown, /first user message/);
    assert.match(markdown, /first assistant answer/);
    assert.match(markdown, /last user message/);
    assert.match(markdown, /last assistant answer/);
    assert.match(markdown, /Reasoning \/ progress:[\s\S]*Checked the server state\./);
    assert.doesNotMatch(markdown, /discarded regenerated answer/);

    assert.ok(markdown.indexOf('first user message') < markdown.indexOf('first assistant answer'));
    assert.ok(markdown.indexOf('first assistant answer') < markdown.indexOf('last user message'));
    assert.ok(markdown.indexOf('last user message') < markdown.indexOf('last assistant answer'));
});

test('project exporter uses cursor pagination and fails closed', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'complete-markdown-export.js'), 'utf8');
    assert.match(source, /\/backend-api\/gizmos\/\$\{encodeURIComponent\(gizmoId\)\}\/conversations\?cursor=/);
    assert.match(source, /Project export was incomplete/);
    assert.match(source, /No incomplete ZIP was downloaded/);
    assert.doesNotMatch(source, /scrollIntoView|scrollTop|findScrollContainer/);
});

test('integrated app overrides Markdown and packages complete bulk export modules', () => {
    const userscript = fs.readFileSync(path.join(__dirname, '..', 'chatgpt-exporter.user.js'), 'utf8');
    assert.match(userscript, /@version\s+1\.2\.0/);
    assert.match(userscript, /jszip\/3\.10\.1\/jszip\.min\.js#sha256=/);
    assert.match(userscript, /src\/complete-markdown-export\.js/);
    assert.match(userscript, /src\/chat-selection-export-v2\.js/);
    assert.match(userscript, /exportMarkdown:\s*\(\) => globalThis\.ChatGptCompleteMarkdownExporter\.exportCurrent\(\)/);
});

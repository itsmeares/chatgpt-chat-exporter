(function initCompleteMarkdownExporter(root, factory) {
    const api = factory(root || globalThis);

    if (root) {
        root.ChatGptCompleteMarkdownExporter = api;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildCompleteMarkdownExporter(root) {
    'use strict';

    const SESSION_ENDPOINT = '/api/auth/session';
    const ACCOUNTS_ENDPOINT = '/backend-api/accounts/check/v4-2023-04-27';
    const MENU_SELECTOR = '[role="menu"], [data-radix-menu-content]';
    const PROJECT_ITEM_ATTRIBUTE = 'data-chatgpt-project-markdown-exporter-item';
    const UPSTREAM_EXPORT_ITEM_ATTRIBUTE = 'data-chat-exporter-item';
    const RAW_ITEM_ATTRIBUTE = 'data-chatgpt-raw-exporter-item';
    const AUTH_CODES = new Set([
        'conversation_inaccessible',
        'account_deactivated',
        'unauthorized',
        'invalid_token',
        'token_expired'
    ]);
    const PAYLOAD_CITATION_MARKER = /\uE200[^\uE200\uE201]*\uE201/g;
    const PAYLOAD_PRIVATE_USE = /[\uE200-\uE20F]/g;

    let currentExport = null;
    let projectExport = null;

    function sleep(ms) {
        return new Promise(resolve => (root.setTimeout || setTimeout)(resolve, ms));
    }

    function conversationId() {
        const path = root.location?.pathname || '';
        const match = path.match(/(?:^|\/)c\/([^/]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function readJson(response) {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    function authHeaders(token, accountId = '') {
        const headers = { Authorization: `Bearer ${token}` };
        if (accountId) headers['ChatGPT-Account-Id'] = accountId;
        return headers;
    }

    function isAuthFailure(response, body) {
        if (!response) return false;
        if (response.status === 401 || response.status === 403) return true;
        if (response.status !== 404) return false;

        const detail = body?.detail;
        const code = String(detail?.code || body?.error_code || '').toLowerCase();
        if (AUTH_CODES.has(code)) return true;

        const message = String(typeof detail === 'string' ? detail : detail?.message || body?.message || '');
        return /log ?in|sign ?in|unauthori[sz]ed|not authenticated/i.test(message);
    }

    async function accessToken() {
        const response = await root.fetch(SESSION_ENDPOINT, {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Session request failed: HTTP ${response.status}`);

        const session = await readJson(response);
        if (!session?.accessToken) {
            throw new Error('No ChatGPT access token found. Refresh the page and sign in again.');
        }
        return session.accessToken;
    }

    async function accountIds(token) {
        const response = await root.fetch(ACCOUNTS_ENDPOINT, {
            credentials: 'include',
            cache: 'no-store',
            headers: authHeaders(token)
        });
        if (!response.ok) return [];

        const payload = await readJson(response);
        const accounts = payload?.accounts && typeof payload.accounts === 'object' ? payload.accounts : {};
        return [...new Set(Object.values(accounts)
            .map(entry => entry?.account?.account_id)
            .filter(id => typeof id === 'string' && id))];
    }

    async function attemptJson(endpoint, token, accountId = '') {
        const response = await root.fetch(endpoint, {
            credentials: 'include',
            cache: 'no-store',
            headers: authHeaders(token, accountId)
        });
        const body = await readJson(response);
        return { response, body, accountId };
    }

    async function fetchJson(endpoint, context = {}) {
        const token = context.token || await accessToken();
        const candidates = [];
        const addCandidate = id => {
            if (typeof id !== 'string') return;
            if (candidates.includes(id)) return;
            candidates.push(id);
        };

        addCandidate(context.accountId || '');
        addCandidate('');

        let result = null;
        for (const accountId of candidates) {
            result = await attemptJson(endpoint, token, accountId);
            if (result.response.ok && result.body) {
                return { body: result.body, token, accountId };
            }
            if (!isAuthFailure(result.response, result.body)) {
                throw new Error(`ChatGPT request failed: HTTP ${result.response.status}`);
            }
        }

        for (const accountId of await accountIds(token)) {
            if (candidates.includes(accountId)) continue;
            result = await attemptJson(endpoint, token, accountId);
            if (result.response.ok && result.body) {
                return { body: result.body, token, accountId };
            }
            if (!isAuthFailure(result.response, result.body)) {
                throw new Error(`ChatGPT request failed: HTTP ${result.response.status}`);
            }
        }

        const status = result?.response?.status || 'unknown';
        throw new Error(`ChatGPT request was not authorized: HTTP ${status}`);
    }

    async function fetchConversation(id, context = {}) {
        if (!id) throw new Error('Conversation id is missing.');
        const result = await fetchJson(`/backend-api/conversation/${encodeURIComponent(id)}`, context);
        if (!result.body?.mapping || typeof result.body.mapping !== 'object') {
            throw new Error(`Conversation ${id} has no conversation mapping.`);
        }
        return result;
    }

    function stripPayloadMarkers(value) {
        return String(value ?? '')
            .replace(PAYLOAD_CITATION_MARKER, '')
            .replace(PAYLOAD_PRIVATE_USE, '');
    }

    function normalizeWhitespace(value) {
        return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function escapeMarkdownLinkText(value) {
        return String(value ?? '').replace(/([\\\[\]])/g, '\\$1');
    }

    function escapeMarkdownUrl(value) {
        return String(value ?? '').replace(/ /g, '%20').replace(/\)/g, '%29');
    }

    function unsafeHref(href) {
        return /^(?:javascript|data):/i.test(String(href || '').trim());
    }

    function hostnameOf(href) {
        try {
            return new URL(href).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }

    function payloadContentText(content) {
        if (!content || !Array.isArray(content.parts)) return '';
        return content.parts.map(part => {
            if (typeof part === 'string') return part;
            if (!part || typeof part !== 'object') return '';
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
            return '';
        }).filter(Boolean).join('\n\n').trim();
    }

    function activePayloadMessages(payload) {
        const mapping = payload?.mapping;
        if (!mapping || typeof mapping !== 'object') return [];

        const entries = [];
        const visited = new Set();
        let nodeId = typeof payload.current_node === 'string' ? payload.current_node : '';
        while (nodeId && !visited.has(nodeId)) {
            const node = mapping[nodeId];
            if (!node) break;
            visited.add(nodeId);
            entries.push({ nodeId, node, message: node.message });
            nodeId = typeof node.parent === 'string' ? node.parent : '';
        }

        if (entries.length > 0) return entries.reverse().filter(entry => entry.message);

        return Object.entries(mapping)
            .map(([id, node]) => ({ nodeId: id, node, message: node?.message }))
            .filter(entry => entry.message)
            .sort((left, right) => Number(left.message.create_time || 0) - Number(right.message.create_time || 0));
    }

    function isMainPayloadMessage(entry) {
        const message = entry?.message;
        const role = message?.author?.role;
        if (role !== 'user' && role !== 'assistant') return false;
        if (message.metadata?.is_visually_hidden_from_conversation) return false;

        const contentType = String(message.content?.content_type || '').toLowerCase();
        return !['thoughts', 'reasoning_recap', 'code', 'execution_output', 'tool_result'].includes(contentType);
    }

    function mainPayloadMessages(entries) {
        const eligible = entries.filter(isMainPayloadMessage);
        return eligible.filter((entry, index) => {
            if (entry.message?.author?.role !== 'assistant') return true;
            return eligible[index + 1]?.message?.author?.role !== 'assistant';
        });
    }

    function payloadReasoningRecaps(entries) {
        const recaps = new Map();
        const mainEntries = new Set(mainPayloadMessages(entries));
        let pending = [];

        const appendPending = value => {
            const text = stripPayloadMarkers(value).trim();
            if (text && !pending.includes(text)) pending.push(text);
        };

        for (const entry of entries) {
            const message = entry.message;
            const role = message?.author?.role;
            const contentType = String(message?.content?.content_type || '').toLowerCase();

            if (role === 'assistant' && contentType === 'reasoning_recap') {
                appendPending(payloadContentText(message.content));
                continue;
            }

            if (role === 'user') {
                pending = [];
                continue;
            }

            if (role === 'assistant' && isMainPayloadMessage(entry) && !mainEntries.has(entry)) {
                appendPending(payloadContentText(message.content));
                continue;
            }

            if (role === 'assistant' && mainEntries.has(entry) && pending.length > 0) {
                recaps.set(String(message.id || entry.nodeId), pending.join('\n\n'));
                pending = [];
            }
        }

        return recaps;
    }

    function payloadCitations(message) {
        const references = message?.metadata?.content_references;
        if (!Array.isArray(references)) return [];

        const seen = new Set();
        const citations = [];
        for (const reference of references) {
            for (const item of Array.isArray(reference?.items) ? reference.items : []) {
                const href = String(item?.url || '').trim();
                if (!href || unsafeHref(href) || seen.has(href)) continue;
                seen.add(href);
                citations.push({
                    href,
                    label: normalizeWhitespace(item?.title) || hostnameOf(href) || href
                });
            }
        }
        return citations;
    }

    function resolvePayloadCitations(text, message) {
        const references = message?.metadata?.content_references;
        let result = String(text ?? '');

        if (Array.isArray(references)) {
            for (const reference of references) {
                const marker = reference?.matched_text;
                if (typeof marker !== 'string' || !marker.trim() || !result.includes(marker)) continue;

                const item = (Array.isArray(reference.items) ? reference.items : [])
                    .find(candidate => candidate?.url && !unsafeHref(String(candidate.url)));
                if (!item) {
                    result = result.split(marker).join('');
                    continue;
                }

                const href = String(item.url);
                const label = normalizeWhitespace(item.title) || hostnameOf(href) || href;
                const link = ` ([${escapeMarkdownLinkText(label)}](${escapeMarkdownUrl(href)}))`;
                result = result.split(marker).join(link);
            }
        }

        return stripPayloadMarkers(result);
    }

    function payloadAttachmentLines(message) {
        const lines = [];
        const seen = new Set();
        const add = (kind, name, href = '') => {
            const label = String(name || (kind === 'image' ? 'Image attachment' : 'File attachment')).trim();
            const key = `${kind}:${label}:${href}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (href) {
                lines.push(`[${kind === 'image' ? 'Image' : 'File'}: ${escapeMarkdownLinkText(label)}](${escapeMarkdownUrl(href)})`);
            } else {
                lines.push(`[${kind === 'image' ? 'Image' : 'File'}: ${label}]`);
            }
        };

        for (const attachment of Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : []) {
            const mime = String(attachment?.mime_type || attachment?.content_type || '');
            const kind = /^image\//i.test(mime) ? 'image' : 'file';
            add(kind, attachment?.name || attachment?.filename || attachment?.id || attachment?.file_id);
        }

        for (const part of Array.isArray(message?.content?.parts) ? message.content.parts : []) {
            if (!part || typeof part !== 'object') continue;
            const mime = String(part.mime_type || part.content_type || part.metadata?.mime_type || '');
            const kind = /^image\//i.test(mime) || /image/i.test(String(part.content_type || '')) ? 'image' : 'file';
            const name = part.name || part.filename || part.metadata?.name || part.file_id || part.asset_pointer;
            if (name) add(kind, name);
        }

        const sandboxPattern = /sandbox:(\/mnt\/data\/[^\s)\]"'<>]+)/g;
        for (const match of payloadContentText(message?.content).matchAll(sandboxPattern)) {
            const sandboxPath = match[1].replace(/[.,;:!?*`]+$/, '');
            const name = sandboxPath.split('/').filter(Boolean).pop() || 'Generated file';
            add('file', name, `sandbox:${sandboxPath}`);
        }

        return lines;
    }

    function formatTimestamp(value) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric) || numeric <= 0) return '';
        const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
        if (Number.isNaN(date.getTime())) return '';
        try {
            return new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }).format(date);
        } catch {
            return date.toISOString();
        }
    }

    function exportDate() {
        return new Date().toISOString().slice(0, 10);
    }

    function renderReferences(message) {
        const citations = payloadCitations(message);
        if (citations.length === 0) return '';
        return `\n\n**References:**\n${citations.map((citation, index) =>
            `${index + 1}. [${escapeMarkdownLinkText(citation.label)}](${escapeMarkdownUrl(citation.href)})`).join('\n')}`;
    }

    function payloadToMarkdown(payload, options = {}) {
        const entries = activePayloadMessages(payload);
        const mainEntries = mainPayloadMessages(entries);
        if (mainEntries.length === 0) {
            throw new Error('ChatGPT conversation payload contains no visible user or assistant messages.');
        }

        const recaps = payloadReasoningRecaps(entries);
        const title = String(payload?.title || 'ChatGPT Conversation').trim() || 'ChatGPT Conversation';
        const lines = [
            `# ${title}`,
            '',
            `**Date:** ${options.date || exportDate()}`,
            '**Source:** chatgpt.com',
            '',
            '---',
            ''
        ];

        for (const entry of mainEntries) {
            const message = entry.message;
            const isUser = message.author?.role === 'user';
            const sender = isUser ? 'You' : 'ChatGPT';
            const timestamp = formatTimestamp(message.create_time);
            let body = resolvePayloadCitations(payloadContentText(message.content), message).trim();

            const attachments = payloadAttachmentLines(message);
            if (attachments.length > 0) {
                body = `${body}${body ? '\n\n' : ''}${attachments.join('\n\n')}`.trim();
            }

            const recap = recaps.get(String(message.id || entry.nodeId));
            if (!isUser && options.includeReasoning !== false && recap) {
                const safeRecap = stripPayloadMarkers(recap).trim();
                body = `<small><strong>Reasoning / progress:</strong><br>\n${safeRecap}</small>${body ? `\n\n${body}` : ''}`;
            }

            body = `${body}${renderReferences(message)}`.trim();
            if (!body) continue;

            lines.push(`### **${sender}**${timestamp ? ` · ${timestamp}` : ''}`, '', body, '', '---', '');
        }

        return `${lines.join('\n').trim()}\n`;
    }

    function safeFilename(value) {
        return String(value || 'ChatGPT Conversation')
            .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 120)
            .replace(/[. ]+$/, '') || 'ChatGPT Conversation';
    }

    function uniqueFilename(payload, used) {
        const id = String(payload?.conversation_id || payload?.id || '').slice(0, 8);
        const base = safeFilename(payload?.title || 'ChatGPT Conversation');
        let filename = `${base}${id ? `_${id}` : ''}.md`;
        let suffix = 2;
        while (used.has(filename.toLowerCase())) {
            filename = `${base}${id ? `_${id}` : ''}_${suffix++}.md`;
        }
        used.add(filename.toLowerCase());
        return filename;
    }

    function downloadBlob(blob, filename) {
        const url = root.URL.createObjectURL(blob);
        const anchor = root.document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        root.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        root.setTimeout(() => root.URL.revokeObjectURL(url), 2000);
    }

    function downloadMarkdown(markdown, payload) {
        const id = conversationId().slice(0, 8);
        const title = safeFilename(payload?.title || root.document?.title?.replace(/\s*[-–—|]\s*ChatGPT\s*$/i, ''));
        const filename = `${title}${id ? `_${id}` : ''}.md`;
        downloadBlob(new root.Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename);
        return filename;
    }

    async function exportCurrent() {
        if (currentExport) return currentExport;

        currentExport = (async () => {
            const id = conversationId();
            if (!id) throw new Error('Open a normal ChatGPT conversation first.');

            const { body } = await fetchConversation(id);
            const markdown = payloadToMarkdown(body, { includeReasoning: true });
            const filename = downloadMarkdown(markdown, body);
            console.log(`[ChatGPT Complete Markdown] Saved ${filename} from the complete conversation payload.`);
            return { payload: body, markdown, filename };
        })();

        try {
            return await currentExport;
        } catch (error) {
            console.error('[ChatGPT Complete Markdown] Export failed.', error);
            if (typeof root.alert === 'function') {
                root.alert(`Markdown export failed. No partial file was downloaded.\n\n${error.message}`);
            }
            throw error;
        } finally {
            currentExport = null;
        }
    }

    async function listProjectConversations(gizmoId, context) {
        const items = [];
        const seen = new Set();
        let cursor = '0';
        let activeContext = { ...context };

        do {
            const endpoint = `/backend-api/gizmos/${encodeURIComponent(gizmoId)}/conversations?cursor=${encodeURIComponent(cursor)}`;
            const result = await fetchJson(endpoint, activeContext);
            activeContext = { token: result.token, accountId: result.accountId };
            for (const item of Array.isArray(result.body?.items) ? result.body.items : []) {
                const id = String(item?.id || item?.conversation_id || '');
                if (!id || seen.has(id)) continue;
                seen.add(id);
                items.push({ ...item, id });
            }
            cursor = result.body?.cursor ? String(result.body.cursor) : '';
            if (cursor) await sleep(80);
        } while (cursor);

        return { items, context: activeContext };
    }

    function updateProjectItemLabels(label) {
        root.document?.querySelectorAll?.(`[${PROJECT_ITEM_ATTRIBUTE}]`).forEach(item => {
            replaceItemLabel(item, label);
        });
    }

    async function exportCurrentProject() {
        if (projectExport) return projectExport;

        projectExport = (async () => {
            if (typeof root.JSZip !== 'function') {
                throw new Error('JSZip is not available. Reinstall or update the integrated userscript.');
            }

            const id = conversationId();
            if (!id) throw new Error('Open a conversation inside the project you want to export.');

            updateProjectItemLabels('Reading project…');
            const current = await fetchConversation(id);
            const gizmoId = String(current.body?.gizmo_id || current.body?.conversation_template_id || '');
            if (!gizmoId || !gizmoId.startsWith('g-p-')) {
                throw new Error('This conversation is not inside a ChatGPT Project.');
            }

            const listed = await listProjectConversations(gizmoId, {
                token: current.token,
                accountId: current.accountId
            });
            if (listed.items.length === 0) {
                throw new Error('ChatGPT returned no conversations for this project.');
            }

            const zip = new root.JSZip();
            const used = new Set();
            let context = listed.context;
            const failures = [];

            for (let index = 0; index < listed.items.length; index++) {
                const item = listed.items[index];
                updateProjectItemLabels(`Exporting ${index + 1}/${listed.items.length}…`);
                try {
                    const result = item.id === id
                        ? current
                        : await fetchConversation(item.id, context);
                    context = { token: result.token, accountId: result.accountId };
                    if (String(result.body?.gizmo_id || result.body?.conversation_template_id || '') !== gizmoId) {
                        throw new Error('Conversation belongs to a different project.');
                    }
                    const markdown = payloadToMarkdown(result.body, { includeReasoning: true });
                    zip.file(uniqueFilename(result.body, used), markdown);
                } catch (error) {
                    failures.push(`${item.title || item.id}: ${error.message}`);
                }
                if (index + 1 < listed.items.length) await sleep(120);
            }

            if (failures.length > 0) {
                throw new Error(`Project export was incomplete; ${failures.length} conversation(s) failed:\n${failures.slice(0, 8).join('\n')}`);
            }

            updateProjectItemLabels('Building ZIP…');
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            const filename = `ChatGPT_Project_${safeFilename(gizmoId).slice(-20)}_Markdown_${exportDate()}.zip`;
            downloadBlob(blob, filename);
            console.log(`[ChatGPT Complete Markdown] Saved ${listed.items.length} complete project conversations to ${filename}.`);
            return { count: listed.items.length, filename, gizmoId };
        })();

        try {
            return await projectExport;
        } catch (error) {
            console.error('[ChatGPT Complete Markdown] Project export failed.', error);
            if (typeof root.alert === 'function') {
                root.alert(`Project Markdown export failed. No incomplete ZIP was downloaded.\n\n${error.message}`);
            }
            throw error;
        } finally {
            updateProjectItemLabels('Export Project Markdown ZIP');
            projectExport = null;
        }
    }

    function normalizeText(element) {
        return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element) {
        return Boolean(element && element.getClientRects().length);
    }

    function testId(element) {
        return (element?.getAttribute?.('data-testid') || element?.getAttribute?.('data-test-id') || '').toLowerCase();
    }

    function isShareItem(item) {
        return testId(item).includes('share') || normalizeText(item) === 'Share';
    }

    function findShareItem(menu) {
        return Array.from(menu.querySelectorAll('button, [role="menuitem"], a, div'))
            .find(isShareItem) || null;
    }

    function isSidebarMenu(menu) {
        const labelledBy = menu.getAttribute('aria-labelledby');
        const trigger = (labelledBy && root.document.getElementById(labelledBy))
            || root.document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]');
        return Boolean(trigger?.closest('nav, aside, [role="navigation"]'));
    }

    function findCloneTemplate(menu, shareItem) {
        const rawItem = menu.querySelector(`[${RAW_ITEM_ATTRIBUTE}]`);
        if (isVisible(rawItem)) return rawItem;
        const pdf = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="pdf"]`);
        if (isVisible(pdf)) return pdf;
        const markdown = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="markdown"]`);
        if (isVisible(markdown)) return markdown;
        if (isVisible(shareItem)) return shareItem;
        return Array.from(menu.querySelectorAll('[role="menuitem"]')).find(isVisible) || null;
    }

    function stripIdentity(item) {
        item.removeAttribute(UPSTREAM_EXPORT_ITEM_ATTRIBUTE);
        item.removeAttribute(RAW_ITEM_ATTRIBUTE);
        for (const attribute of ['data-state', 'id', 'aria-controls', 'aria-expanded', 'aria-haspopup', 'data-testid', 'data-test-id']) {
            item.removeAttribute(attribute);
        }
        item.querySelectorAll('[id], [data-testid], [data-test-id]').forEach(element => {
            element.removeAttribute('id');
            element.removeAttribute('data-testid');
            element.removeAttribute('data-test-id');
        });
    }

    function replaceItemLabel(item, label) {
        const walker = root.document.createTreeWalker(item, root.NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const trimmed = node.nodeValue.trim();
            if (!trimmed) continue;
            node.nodeValue = node.nodeValue.replace(trimmed, label);
            return;
        }
        const text = root.document.createElement('span');
        text.textContent = label;
        item.appendChild(text);
    }

    function replaceItemIcon(item) {
        const target = item.querySelector('svg');
        if (!target) return;
        while (target.firstChild) target.removeChild(target.firstChild);
        target.setAttribute('viewBox', '0 0 24 24');
        target.setAttribute('fill', 'none');
        target.setAttribute('stroke', 'currentColor');
        target.setAttribute('stroke-width', '2');
        target.setAttribute('stroke-linecap', 'round');
        target.setAttribute('stroke-linejoin', 'round');
        for (const d of ['M12 3v12', 'm7 11 5 5 5-5', 'M4 20h16']) {
            const path = root.document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            target.appendChild(path);
        }
    }

    function createProjectMenuItem(template) {
        const item = template.cloneNode(true);
        stripIdentity(item);
        item.setAttribute(PROJECT_ITEM_ATTRIBUTE, '');
        replaceItemLabel(item, 'Export Project Markdown ZIP');
        replaceItemIcon(item);
        item.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            if (item.getAttribute('aria-disabled') === 'true') return;
            item.setAttribute('aria-disabled', 'true');
            try {
                await exportCurrentProject();
            } finally {
                item.removeAttribute('aria-disabled');
                root.document.dispatchEvent(new root.KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true
                }));
            }
        });
        return item;
    }

    function findMenus(start) {
        const menus = [];
        if (start?.matches?.(MENU_SELECTOR)) menus.push(start);
        menus.push(...(start?.querySelectorAll?.(MENU_SELECTOR) || []));
        return menus;
    }

    function injectProjectMenuItem(start = root.document) {
        if (!conversationId() || !root.document) return;
        for (const menu of findMenus(start).filter(isVisible)) {
            if (menu.querySelector(`[${PROJECT_ITEM_ATTRIBUTE}]`)) continue;
            const shareItem = findShareItem(menu);
            if (!shareItem || isSidebarMenu(menu)) continue;
            const template = findCloneTemplate(menu, shareItem);
            if (!template) continue;

            const item = createProjectMenuItem(template);
            const rawItem = menu.querySelector(`[${RAW_ITEM_ATTRIBUTE}]`);
            const pdf = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="pdf"]`);
            const markdown = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="markdown"]`);
            const insertionPoint = rawItem || pdf || markdown || shareItem;
            insertionPoint.insertAdjacentElement('afterend', item);
        }
    }

    function startMenuIntegration() {
        if (!root.document || typeof root.MutationObserver !== 'function') return;
        injectProjectMenuItem(root.document);
        const observer = new root.MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') injectProjectMenuItem(record.target);
                for (const node of record.addedNodes) {
                    if (node.nodeType === root.Node.ELEMENT_NODE) injectProjectMenuItem(node);
                }
            }
        });
        observer.observe(root.document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style', 'data-state'],
            childList: true,
            subtree: true
        });
    }

    if (root.document) {
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', startMenuIntegration, { once: true });
        } else {
            startMenuIntegration();
        }
    }

    return {
        exportCurrent,
        exportCurrentProject,
        fetchConversation,
        payloadToMarkdown,
        activePayloadMessages,
        mainPayloadMessages,
        internals: {
            isMainPayloadMessage,
            payloadReasoningRecaps,
            listProjectConversations,
            safeFilename,
            uniqueFilename
        }
    };
});

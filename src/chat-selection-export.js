(function initChatSelectionExporter(root, factory) {
    const api = factory(root || globalThis);

    if (root) {
        root.ChatGptChatSelectionExporter = api;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildChatSelectionExporter(root) {
    'use strict';

    const SESSION_ENDPOINT = '/api/auth/session';
    const ACCOUNTS_ENDPOINT = '/backend-api/accounts/check/v4-2023-04-27';
    const PROJECTS_ENDPOINT = '/backend-api/gizmos/snorlax/sidebar';
    const MENU_SELECTOR = '[role="menu"], [data-radix-menu-content]';
    const SELECT_ITEM_ATTRIBUTE = 'data-chatgpt-select-markdown-exporter-item';
    const PROJECT_HOME_ITEM_ATTRIBUTE = 'data-chatgpt-project-home-markdown-exporter-item';
    const MODAL_HOST_ID = 'chatgpt-chat-selection-exporter-host';
    const AUTH_CODES = new Set([
        'conversation_inaccessible',
        'account_deactivated',
        'unauthorized',
        'invalid_token',
        'token_expired'
    ]);

    let catalogPromise = null;
    let exportPromise = null;

    function core() {
        const value = root.ChatGptCompleteMarkdownExporter;
        if (!value) throw new Error('Complete Markdown exporter is not loaded.');
        return value;
    }

    function sleep(ms) {
        return new Promise(resolve => (root.setTimeout || setTimeout)(resolve, ms));
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
        if (!session?.accessToken) throw new Error('No ChatGPT access token found. Refresh and sign in again.');
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
        const add = id => {
            const value = typeof id === 'string' ? id : '';
            if (!candidates.includes(value)) candidates.push(value);
        };
        add(context.accountId || '');
        add('');

        let result = null;
        for (const accountId of candidates) {
            result = await attemptJson(endpoint, token, accountId);
            if (result.response.ok && result.body) return { body: result.body, token, accountId };
            if (!isAuthFailure(result.response, result.body)) {
                throw new Error(`ChatGPT request failed: HTTP ${result.response.status}`);
            }
        }

        for (const accountId of await accountIds(token)) {
            if (candidates.includes(accountId)) continue;
            result = await attemptJson(endpoint, token, accountId);
            if (result.response.ok && result.body) return { body: result.body, token, accountId };
            if (!isAuthFailure(result.response, result.body)) {
                throw new Error(`ChatGPT request failed: HTTP ${result.response.status}`);
            }
        }

        throw new Error(`ChatGPT request was not authorized: HTTP ${result?.response?.status || 'unknown'}`);
    }

    function normalizeConversationItem(item, project = null) {
        const id = String(item?.id || item?.conversation_id || '');
        if (!id) return null;
        return {
            id,
            title: String(item?.title || 'Untitled conversation'),
            createTime: item?.create_time || item?.created_at || '',
            updateTime: item?.update_time || item?.updated_at || '',
            projectId: project?.id || String(item?.gizmo_id || item?.conversation_template_id || ''),
            projectName: project?.name || '',
            scope: project ? 'project' : 'personal'
        };
    }

    async function listPersonalConversations(context = {}) {
        const items = [];
        const seen = new Set();
        let offset = 0;
        let activeContext = { ...context };
        const limit = 100;

        while (true) {
            const endpoint = `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=false`;
            const result = await fetchJson(endpoint, activeContext);
            activeContext = { token: result.token, accountId: result.accountId };
            const page = Array.isArray(result.body?.items)
                ? result.body.items
                : Array.isArray(result.body?.conversations)
                    ? result.body.conversations
                    : [];

            let added = 0;
            for (const raw of page) {
                const item = normalizeConversationItem(raw);
                if (!item || seen.has(item.id)) continue;
                seen.add(item.id);
                items.push(item);
                added += 1;
            }

            const total = Number(result.body?.total);
            const hasMore = typeof result.body?.has_more === 'boolean'
                ? result.body.has_more
                : Number.isFinite(total)
                    ? offset + page.length < total
                    : page.length === limit;

            if (!hasMore || page.length === 0 || added === 0) break;
            offset += page.length;
            await sleep(40);
        }

        return { items, context: activeContext };
    }

    function projectFromSidebarItem(item) {
        const outer = item?.gizmo || item;
        const value = outer?.gizmo || outer;
        const id = String(value?.id || '');
        if (!/^g-p-[a-z0-9]+$/i.test(id)) return null;
        return {
            id,
            name: String(value?.display?.name || value?.name || id)
        };
    }

    async function listProjects(context = {}) {
        const projects = [];
        const seen = new Set();
        let cursor = '';
        let activeContext = { ...context };

        do {
            const params = new URLSearchParams({
                owned_only: 'true',
                conversations_per_gizmo: '0'
            });
            if (cursor) params.set('cursor', cursor);
            const result = await fetchJson(`${PROJECTS_ENDPOINT}?${params.toString()}`, activeContext);
            activeContext = { token: result.token, accountId: result.accountId };
            for (const raw of Array.isArray(result.body?.items) ? result.body.items : []) {
                const project = projectFromSidebarItem(raw);
                if (!project || seen.has(project.id)) continue;
                seen.add(project.id);
                projects.push(project);
            }
            cursor = result.body?.cursor ? String(result.body.cursor) : '';
            if (cursor) await sleep(50);
        } while (cursor);

        return { projects, context: activeContext };
    }

    async function buildCatalog(options = {}) {
        if (catalogPromise && !options.force) return catalogPromise;

        catalogPromise = (async () => {
            const personal = await listPersonalConversations();
            const projectsResult = await listProjects(personal.context);
            const all = [...personal.items];
            const seen = new Set(all.map(item => item.id));
            let context = projectsResult.context;

            for (const project of projectsResult.projects) {
                const listed = await core().internals.listProjectConversations(project.id, context);
                context = listed.context;
                for (const raw of listed.items) {
                    const item = normalizeConversationItem(raw, project);
                    if (!item || seen.has(item.id)) continue;
                    seen.add(item.id);
                    all.push(item);
                }
            }

            all.sort((left, right) => {
                const a = Date.parse(left.updateTime || left.createTime || 0) || 0;
                const b = Date.parse(right.updateTime || right.createTime || 0) || 0;
                return b - a;
            });

            return {
                items: all,
                projects: projectsResult.projects,
                context
            };
        })();

        try {
            return await catalogPromise;
        } finally {
            catalogPromise = null;
        }
    }

    function safeFilename(value) {
        return core().internals.safeFilename(value);
    }

    function uniqueFilename(payload, used) {
        return core().internals.uniqueFilename(payload, used);
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

    function timestampForFilename() {
        return new Date().toISOString().slice(0, 10);
    }

    async function exportItems(items, options = {}) {
        if (exportPromise) return exportPromise;

        exportPromise = (async () => {
            const unique = [];
            const seen = new Set();
            for (const item of items || []) {
                const id = String(item?.id || '');
                if (!id || seen.has(id)) continue;
                seen.add(id);
                unique.push(item);
            }
            if (unique.length === 0) throw new Error('Select at least one conversation.');

            if (typeof options.onProgress === 'function') options.onProgress(0, unique.length, 'Preparing…');

            const first = await core().fetchConversation(unique[0].id);
            let context = { token: first.token, accountId: first.accountId };
            const results = new Array(unique.length);
            results[0] = first.body;
            if (typeof options.onProgress === 'function') options.onProgress(1, unique.length, unique[0].title);

            let nextIndex = 1;
            let completed = 1;
            const failures = [];
            const workerCount = Math.min(3, Math.max(0, unique.length - 1));

            async function worker() {
                while (true) {
                    const index = nextIndex++;
                    if (index >= unique.length) return;
                    const item = unique[index];
                    try {
                        const result = await core().fetchConversation(item.id, context);
                        results[index] = result.body;
                        context = { token: result.token, accountId: result.accountId };
                    } catch (error) {
                        failures.push(`${item.title || item.id}: ${error.message}`);
                    }
                    completed += 1;
                    if (typeof options.onProgress === 'function') {
                        options.onProgress(completed, unique.length, item.title || item.id);
                    }
                }
            }

            await Promise.all(Array.from({ length: workerCount }, () => worker()));
            if (failures.length > 0) {
                throw new Error(`Export was incomplete; ${failures.length} conversation(s) failed:\n${failures.slice(0, 8).join('\n')}`);
            }

            if (unique.length === 1) {
                const payload = results[0];
                const markdown = core().payloadToMarkdown(payload, { includeReasoning: true });
                const id = String(payload?.conversation_id || payload?.id || unique[0].id).slice(0, 8);
                const filename = `${safeFilename(payload?.title || unique[0].title)}${id ? `_${id}` : ''}.md`;
                downloadBlob(new root.Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename);
                return { count: 1, filename };
            }

            if (typeof root.JSZip !== 'function') {
                throw new Error('JSZip is not available. Reinstall or update the integrated userscript.');
            }

            const zip = new root.JSZip();
            const used = new Set();
            for (const payload of results) {
                const markdown = core().payloadToMarkdown(payload, { includeReasoning: true });
                zip.file(uniqueFilename(payload, used), markdown);
            }

            if (typeof options.onProgress === 'function') options.onProgress(unique.length, unique.length, 'Building ZIP…');
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            const label = safeFilename(options.label || 'Selected_Chats').replace(/\s+/g, '_');
            const filename = `ChatGPT_${label}_Markdown_${timestampForFilename()}.zip`;
            downloadBlob(blob, filename);
            return { count: unique.length, filename };
        })();

        try {
            return await exportPromise;
        } finally {
            exportPromise = null;
        }
    }

    function projectIdFromLocation() {
        const path = String(root.location?.pathname || '');
        const match = path.match(/\/g\/(g-p-[a-z0-9]{32})(?:-[^/]*)?(?:\/|$)/i);
        return match ? match[1] : '';
    }

    async function exportProjectById(projectId, options = {}) {
        if (!projectId) throw new Error('Project id is missing.');
        const listed = await core().internals.listProjectConversations(projectId, {});
        if (listed.items.length === 0) throw new Error('ChatGPT returned no conversations for this project.');
        const items = listed.items.map(item => normalizeConversationItem(item, {
            id: projectId,
            name: options.projectName || projectId
        })).filter(Boolean);
        return exportItems(items, {
            label: options.projectName || `Project_${projectId.slice(-8)}`,
            onProgress: options.onProgress
        });
    }

    function formatWhen(value) {
        const date = new Date(value || 0);
        if (Number.isNaN(date.getTime())) return '';
        try {
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }).format(date);
        } catch {
            return date.toISOString().slice(0, 10);
        }
    }

    function modalTemplate() {
        return `
<style>
:host { all: initial; }
* { box-sizing: border-box; }
.overlay {
  position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
  background: rgba(0,0,0,.58); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f2f2f2;
}
.panel {
  width: min(820px, calc(100vw - 32px)); height: min(760px, calc(100vh - 32px));
  display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px; background: #212121; box-shadow: 0 24px 80px rgba(0,0,0,.45);
}
.header { padding: 20px 22px 14px; border-bottom: 1px solid rgba(255,255,255,.1); }
.title-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
h2 { margin:0; font-size:18px; font-weight:650; color:#fff; }
.close { border:0; background:transparent; color:#aaa; font-size:24px; cursor:pointer; padding:2px 8px; border-radius:8px; }
.close:hover { background:#303030; color:#fff; }
.controls { display:flex; gap:8px; margin-top:14px; }
.search { flex:1; min-width:0; border:1px solid #4a4a4a; border-radius:10px; padding:10px 12px; background:#171717; color:#fff; outline:none; }
.search:focus { border-color:#777; }
.small-btn { border:1px solid #4a4a4a; border-radius:10px; padding:9px 11px; background:#2a2a2a; color:#eee; cursor:pointer; white-space:nowrap; }
.small-btn:hover { background:#333; }
.status { padding:9px 22px; color:#aaa; font-size:12px; border-bottom:1px solid rgba(255,255,255,.06); }
.list { flex:1; overflow:auto; padding:8px 10px; }
.group { margin:8px 4px 14px; }
.group-title { position:sticky; top:-8px; z-index:1; padding:10px 8px 6px; background:#212121; color:#aaa; font-size:12px; font-weight:650; text-transform:uppercase; letter-spacing:.05em; }
.row { display:flex; align-items:flex-start; gap:11px; padding:10px 9px; border-radius:10px; cursor:pointer; }
.row:hover { background:#2b2b2b; }
.row input { margin-top:4px; width:16px; height:16px; accent-color:#fff; }
.meta { min-width:0; flex:1; }
.name { color:#f4f4f4; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sub { color:#888; font-size:12px; margin-top:3px; }
.footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; border-top:1px solid rgba(255,255,255,.1); }
.count { color:#aaa; font-size:13px; }
.export { border:0; border-radius:11px; padding:10px 16px; background:#f4f4f4; color:#111; font-weight:650; cursor:pointer; }
.export:disabled { opacity:.4; cursor:not-allowed; }
.empty { padding:48px 20px; text-align:center; color:#888; }
</style>
<div class="overlay" role="dialog" aria-modal="true" aria-label="Select chats to export">
  <div class="panel">
    <div class="header">
      <div class="title-row"><h2>Select chats to export</h2><button class="close" aria-label="Close">×</button></div>
      <div class="controls">
        <input class="search" type="search" placeholder="Search chats or projects…" />
        <button class="small-btn select-visible">Select visible</button>
        <button class="small-btn clear">Clear</button>
      </div>
    </div>
    <div class="status">Loading conversation list…</div>
    <div class="list"><div class="empty">Loading…</div></div>
    <div class="footer">
      <div class="count">0 selected</div>
      <button class="export" disabled>Export selected</button>
    </div>
  </div>
</div>`;
    }

    async function openSelector(options = {}) {
        if (!root.document) return;
        root.document.getElementById(MODAL_HOST_ID)?.remove();

        const host = root.document.createElement('div');
        host.id = MODAL_HOST_ID;
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = modalTemplate();
        root.document.body.appendChild(host);

        const overlay = shadow.querySelector('.overlay');
        const list = shadow.querySelector('.list');
        const status = shadow.querySelector('.status');
        const search = shadow.querySelector('.search');
        const count = shadow.querySelector('.count');
        const exportButton = shadow.querySelector('.export');
        const selected = new Set();
        let catalog = [];

        const close = () => host.remove();
        shadow.querySelector('.close').addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });
        root.document.addEventListener('keydown', function onKey(event) {
            if (event.key !== 'Escape' || !host.isConnected) return;
            root.document.removeEventListener('keydown', onKey);
            close();
        });

        function filteredItems() {
            const query = String(search.value || '').trim().toLowerCase();
            if (!query) return catalog;
            return catalog.filter(item => `${item.title} ${item.projectName}`.toLowerCase().includes(query));
        }

        function updateCount() {
            count.textContent = `${selected.size} selected`;
            exportButton.disabled = selected.size === 0 || Boolean(exportPromise);
        }

        function render() {
            const visible = filteredItems();
            list.replaceChildren();
            if (visible.length === 0) {
                const empty = root.document.createElement('div');
                empty.className = 'empty';
                empty.textContent = 'No matching conversations.';
                list.appendChild(empty);
                return;
            }

            const groups = new Map();
            for (const item of visible) {
                const key = item.projectName || 'Personal chats';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(item);
            }

            for (const [groupName, items] of groups) {
                const group = root.document.createElement('section');
                group.className = 'group';
                const title = root.document.createElement('div');
                title.className = 'group-title';
                title.textContent = `${groupName} · ${items.length}`;
                group.appendChild(title);

                for (const item of items) {
                    const row = root.document.createElement('label');
                    row.className = 'row';
                    row.dataset.id = item.id;
                    const checkbox = root.document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = selected.has(item.id);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) selected.add(item.id);
                        else selected.delete(item.id);
                        updateCount();
                    });

                    const meta = root.document.createElement('div');
                    meta.className = 'meta';
                    const name = root.document.createElement('div');
                    name.className = 'name';
                    name.textContent = item.title;
                    const sub = root.document.createElement('div');
                    sub.className = 'sub';
                    sub.textContent = formatWhen(item.updateTime || item.createTime);
                    meta.append(name, sub);
                    row.append(checkbox, meta);
                    group.appendChild(row);
                }
                list.appendChild(group);
            }
        }

        search.addEventListener('input', render);
        shadow.querySelector('.clear').addEventListener('click', () => {
            selected.clear();
            render();
            updateCount();
        });
        shadow.querySelector('.select-visible').addEventListener('click', () => {
            for (const item of filteredItems()) selected.add(item.id);
            render();
            updateCount();
        });

        exportButton.addEventListener('click', async () => {
            const chosen = catalog.filter(item => selected.has(item.id));
            exportButton.disabled = true;
            try {
                const result = await exportItems(chosen, {
                    label: chosen.length === 1 ? chosen[0].title : 'Selected_Chats',
                    onProgress(done, total, label) {
                        status.textContent = `${label} · ${done}/${total}`;
                    }
                });
                status.textContent = `Saved ${result.count} conversation${result.count === 1 ? '' : 's'}.`;
                root.setTimeout(close, 700);
            } catch (error) {
                console.error('[ChatGPT Chat Selection Export] Export failed.', error);
                status.textContent = `Export failed: ${error.message}`;
            } finally {
                updateCount();
            }
        });

        try {
            const result = await buildCatalog({ force: options.force === true });
            catalog = result.items;
            status.textContent = `${catalog.length} conversations loaded.`;
            render();
            updateCount();
            search.focus();
        } catch (error) {
            console.error('[ChatGPT Chat Selection Export] Failed to load catalog.', error);
            status.textContent = `Could not load conversations: ${error.message}`;
            list.innerHTML = '<div class="empty">Conversation list could not be loaded.</div>';
        }
    }

    function normalizeText(element) {
        return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element) {
        return Boolean(element && element.getClientRects().length);
    }

    function activeMenuTrigger(menu) {
        const labelledBy = menu.getAttribute('aria-labelledby');
        if (labelledBy) {
            const trigger = root.document.getElementById(labelledBy);
            if (trigger) return trigger;
        }
        return Array.from(root.document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]'))
            .filter(isVisible)
            .at(-1) || null;
    }

    function isMainMenu(menu) {
        const trigger = activeMenuTrigger(menu);
        return Boolean(trigger && trigger.closest('main'));
    }

    function cloneMenuItem(menu, label, attribute, handler) {
        const template = Array.from(menu.querySelectorAll('button, [role="menuitem"], a'))
            .find(isVisible);
        if (!template) return null;
        const item = template.cloneNode(true);
        for (const attr of ['id', 'data-testid', 'data-test-id', 'data-state', 'aria-controls', 'aria-expanded', 'aria-haspopup']) {
            item.removeAttribute(attr);
        }
        item.querySelectorAll('[id], [data-testid], [data-test-id]').forEach(node => {
            node.removeAttribute('id');
            node.removeAttribute('data-testid');
            node.removeAttribute('data-test-id');
        });
        item.setAttribute(attribute, '');

        const walker = root.document.createTreeWalker(item, root.NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const value = node.nodeValue.trim();
            if (!value) continue;
            node.nodeValue = node.nodeValue.replace(value, label);
            break;
        }
        if (!node) {
            const span = root.document.createElement('span');
            span.textContent = label;
            item.appendChild(span);
        }

        item.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            root.document.dispatchEvent(new root.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await handler();
        });
        return item;
    }

    function injectMenuItems() {
        if (!root.document) return;
        const projectId = projectIdFromLocation();
        const conversationOpen = /(?:^|\/)c\/[^/]+/.test(String(root.location?.pathname || ''));

        for (const menu of Array.from(root.document.querySelectorAll(MENU_SELECTOR)).filter(isVisible)) {
            if (!isMainMenu(menu)) continue;

            if ((conversationOpen || projectId) && !menu.querySelector(`[${SELECT_ITEM_ATTRIBUTE}]`)) {
                const selectItem = cloneMenuItem(menu, 'Select chats to export…', SELECT_ITEM_ATTRIBUTE, () => openSelector());
                if (selectItem) menu.insertBefore(selectItem, menu.firstElementChild);
            }

            if (projectId && !menu.querySelector(`[${PROJECT_HOME_ITEM_ATTRIBUTE}]`)) {
                const projectItem = cloneMenuItem(menu, 'Export Project Markdown ZIP', PROJECT_HOME_ITEM_ATTRIBUTE, async () => {
                    const label = normalizeText(root.document.querySelector('main h1, main h2')) || projectId;
                    try {
                        await exportProjectById(projectId, { projectName: label });
                    } catch (error) {
                        console.error('[ChatGPT Project Export] Export failed.', error);
                        if (typeof root.alert === 'function') {
                            root.alert(`Project Markdown export failed. No incomplete ZIP was downloaded.\n\n${error.message}`);
                        }
                    }
                });
                if (projectItem) menu.insertBefore(projectItem, menu.firstElementChild);
            }
        }
    }

    function startMenuIntegration() {
        if (!root.document || typeof root.MutationObserver !== 'function') return;
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            root.setTimeout(() => {
                scheduled = false;
                injectMenuItems();
            }, 0);
        };
        schedule();
        const observer = new root.MutationObserver(schedule);
        observer.observe(root.document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style', 'data-state', 'aria-expanded'],
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
        buildCatalog,
        openSelector,
        exportItems,
        exportProjectById,
        projectIdFromLocation,
        internals: {
            listPersonalConversations,
            listProjects,
            normalizeConversationItem,
            projectFromSidebarItem
        }
    };
});

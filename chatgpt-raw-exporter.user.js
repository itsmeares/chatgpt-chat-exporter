// ==UserScript==
// @name         ChatGPT Raw Conversation Exporter
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.2.0
// @description  Export the currently open ChatGPT conversation as raw JSON from ChatGPT's own backend record.
// @author       itsmeares
// @homepageURL  https://github.com/itsmeares/chatgpt-chat-exporter
// @supportURL   https://github.com/itsmeares/chatgpt-chat-exporter/issues
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://chat.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const LEGACY_BUTTON_ID = 'chatgpt-raw-exporter';
    const RAW_ITEM_ATTRIBUTE = 'data-chatgpt-raw-exporter-item';
    const UPSTREAM_EXPORT_ITEM_ATTRIBUTE = 'data-chat-exporter-item';
    const MENU_SELECTOR = '[role="menu"], [data-radix-menu-content]';
    const SESSION_ENDPOINT = '/api/auth/session';
    const ACCOUNTS_ENDPOINT = '/backend-api/accounts/check/v4-2023-04-27';
    const AUTH_CODES = new Set([
        'conversation_inaccessible',
        'account_deactivated',
        'unauthorized',
        'invalid_token',
        'token_expired'
    ]);

    function conversationId() {
        const match = location.pathname.match(/(?:^|\/)c\/([^/]+)/);
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
        if (response.status === 401 || response.status === 403) return true;
        if (response.status !== 404) return false;

        const detail = body?.detail;
        const code = String(detail?.code || body?.error_code || '').toLowerCase();
        if (AUTH_CODES.has(code)) return true;

        const message = String(typeof detail === 'string' ? detail : detail?.message || body?.message || '');
        return /log ?in|sign ?in|unauthori[sz]ed|not authenticated/i.test(message);
    }

    async function accessToken() {
        const response = await fetch(SESSION_ENDPOINT, {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Session request failed: HTTP ${response.status}`);

        const session = await readJson(response);
        if (!session?.accessToken) throw new Error('No ChatGPT access token found. Refresh the page and sign in again.');
        return session.accessToken;
    }

    async function accountIds(token) {
        const response = await fetch(ACCOUNTS_ENDPOINT, {
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

    async function attemptConversation(id, token, accountId = '') {
        const response = await fetch(`/backend-api/conversation/${encodeURIComponent(id)}`, {
            credentials: 'include',
            cache: 'no-store',
            headers: authHeaders(token, accountId)
        });
        const body = await readJson(response);
        return { response, body };
    }

    async function fetchRawConversation() {
        const id = conversationId();
        if (!id) throw new Error('Open a normal ChatGPT conversation first.');

        const token = await accessToken();
        let result = await attemptConversation(id, token);
        if (result.response.ok && result.body) return result.body;

        if (isAuthFailure(result.response, result.body)) {
            for (const accountId of await accountIds(token)) {
                result = await attemptConversation(id, token, accountId);
                if (result.response.ok && result.body) return result.body;
                if (!isAuthFailure(result.response, result.body)) break;
            }
        }

        throw new Error(`Conversation payload request failed: HTTP ${result.response.status}`);
    }

    function safeFilename(value) {
        return String(value || 'ChatGPT Conversation')
            .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 120)
            .replace(/[. ]+$/, '') || 'ChatGPT Conversation';
    }

    function downloadJson(payload) {
        const id = conversationId();
        const title = safeFilename(payload?.title || document.title.replace(/\s*[-–—|]\s*ChatGPT\s*$/i, ''));
        const filename = `${title}_${id.slice(0, 8)}.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return filename;
    }

    async function exportRaw() {
        const payload = await fetchRawConversation();
        if (!payload?.mapping || typeof payload.mapping !== 'object') {
            throw new Error('ChatGPT returned JSON, but it does not contain a conversation mapping. Nothing was downloaded.');
        }
        const filename = downloadJson(payload);
        console.log(`[ChatGPT Raw Exporter] Saved raw conversation payload to ${filename}`);
        return payload;
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
        const trigger = (labelledBy && document.getElementById(labelledBy))
            || document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]');
        return Boolean(trigger?.closest('nav, aside, [role="navigation"]'));
    }

    function findCloneTemplate(menu, shareItem) {
        const upstreamPdf = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="pdf"]`);
        if (isVisible(upstreamPdf)) return upstreamPdf;

        const upstreamMarkdown = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="markdown"]`);
        if (isVisible(upstreamMarkdown)) return upstreamMarkdown;
        if (isVisible(shareItem)) return shareItem;

        return Array.from(menu.querySelectorAll('[role="menuitem"]')).find(isVisible) || null;
    }

    function stripIdentity(item) {
        item.removeAttribute(UPSTREAM_EXPORT_ITEM_ATTRIBUTE);
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
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const trimmed = node.nodeValue.trim();
            if (!trimmed) continue;
            node.nodeValue = node.nodeValue.replace(trimmed, label);
            return;
        }
        const text = document.createElement('span');
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

        const left = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        left.setAttribute('d', 'M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2');
        const right = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        right.setAttribute('d', 'M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2');
        target.append(left, right);
    }

    function createRawMenuItem(template) {
        const item = template.cloneNode(true);
        stripIdentity(item);
        item.setAttribute(RAW_ITEM_ATTRIBUTE, '');
        replaceItemLabel(item, 'Export Raw JSON');
        replaceItemIcon(item);

        item.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            if (item.getAttribute('aria-disabled') === 'true') return;

            item.setAttribute('aria-disabled', 'true');
            replaceItemLabel(item, 'Exporting Raw JSON…');
            try {
                await exportRaw();
            } catch (error) {
                console.error('[ChatGPT Raw Exporter] Export failed.', error);
                alert(`Raw export failed.\n\n${error.message}`);
            } finally {
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true
                }));
            }
        });
        return item;
    }

    function findMenus(root) {
        const menus = [];
        if (root?.matches?.(MENU_SELECTOR)) menus.push(root);
        menus.push(...(root?.querySelectorAll?.(MENU_SELECTOR) || []));
        return menus;
    }

    function injectRawMenuItem(root = document) {
        if (!conversationId()) return;

        for (const menu of findMenus(root).filter(isVisible)) {
            if (menu.querySelector(`[${RAW_ITEM_ATTRIBUTE}]`)) continue;

            const shareItem = findShareItem(menu);
            if (!shareItem || isSidebarMenu(menu)) continue;

            const template = findCloneTemplate(menu, shareItem);
            if (!template) continue;

            const item = createRawMenuItem(template);
            const upstreamPdf = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="pdf"]`);
            const upstreamMarkdown = menu.querySelector(`[${UPSTREAM_EXPORT_ITEM_ATTRIBUTE}="markdown"]`);
            const insertionPoint = upstreamPdf || upstreamMarkdown || shareItem;
            insertionPoint.insertAdjacentElement('afterend', item);
        }
    }

    function startMenuIntegration() {
        document.getElementById(LEGACY_BUTTON_ID)?.remove();
        injectRawMenuItem(document);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') injectRawMenuItem(record.target);
                for (const node of record.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) injectRawMenuItem(node);
                }
            }
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style', 'data-state'],
            childList: true,
            subtree: true
        });
    }

    window.ChatGptRawExporter = { export: exportRaw, fetch: fetchRawConversation };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startMenuIntegration, { once: true });
    } else {
        startMenuIntegration();
    }
})();

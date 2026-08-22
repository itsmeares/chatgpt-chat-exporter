// ==UserScript==
// @name         ChatGPT Raw Conversation Exporter
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.1.0
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

    const BUTTON_ID = 'chatgpt-raw-exporter';
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

    function syncButton() {
        let button = document.getElementById(BUTTON_ID);
        if (!button && document.body) {
            button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = 'Raw JSON';
            button.title = 'Export the complete raw conversation JSON';
            button.style.cssText = [
                'position:fixed', 'right:20px', 'bottom:72px', 'z-index:99999',
                'padding:9px 12px', 'border:0', 'border-radius:999px',
                'background:#444', 'color:#fff', 'font:600 13px ui-sans-serif,system-ui,sans-serif',
                'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.25)'
            ].join(';');
            button.addEventListener('click', async () => {
                if (button.disabled) return;
                button.disabled = true;
                button.textContent = 'Exporting…';
                try {
                    await exportRaw();
                    button.textContent = 'Saved';
                } catch (error) {
                    console.error('[ChatGPT Raw Exporter] Export failed.', error);
                    alert(`Raw export failed.\n\n${error.message}`);
                    button.textContent = 'Failed';
                } finally {
                    setTimeout(() => {
                        button.disabled = false;
                        button.textContent = 'Raw JSON';
                    }, 1200);
                }
            });
            document.body.appendChild(button);
        }
        if (button) button.style.display = conversationId() ? 'block' : 'none';
    }

    window.ChatGptRawExporter = { export: exportRaw, fetch: fetchRawConversation };
    syncButton();
    setInterval(syncButton, 1000);
})();

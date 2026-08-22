// ==UserScript==
// @name         ChatGPT Chat Exporter - Complete Markdown Live Test
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.0.2
// @description  Temporary isolated live-test build for complete Markdown and Project ZIP export.
// @author       rashidazarang, itsmeares
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/feat/complete-markdown-bulk-export/src/complete-markdown-export.js
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const TEST_ITEM = 'data-chatgpt-complete-markdown-test-item';
    const MENU_SELECTOR = '[role="menu"], [data-radix-menu-content]';

    const visible = element => Boolean(element && element.getClientRects().length);
    const text = element => String(element?.textContent || '').replace(/\s+/g, ' ').trim();

    function isSidebarMenu(menu) {
        const labelledBy = menu.getAttribute('aria-labelledby');
        const trigger = (labelledBy && document.getElementById(labelledBy))
            || document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]');
        return Boolean(trigger?.closest('nav, aside, [role="navigation"]'));
    }

    function exportRow(menu) {
        return Array.from(menu.querySelectorAll('button, [role="menuitem"], a'))
            .find(item => visible(item) && text(item) === 'Export to Markdown') || null;
    }

    function relabel(item, label) {
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const value = node.nodeValue.trim();
            if (!value) continue;
            node.nodeValue = node.nodeValue.replace(value, label);
            return;
        }
    }

    function inject(root = document) {
        const menus = [];
        if (root?.matches?.(MENU_SELECTOR)) menus.push(root);
        menus.push(...(root?.querySelectorAll?.(MENU_SELECTOR) || []));

        for (const menu of menus.filter(visible)) {
            if (isSidebarMenu(menu) || menu.querySelector(`[${TEST_ITEM}]`)) continue;
            const markdown = exportRow(menu);
            if (!markdown) continue;

            const item = markdown.cloneNode(true);
            item.setAttribute(TEST_ITEM, '');
            for (const attr of ['id', 'data-testid', 'data-test-id', 'data-chat-exporter-item', 'aria-controls', 'aria-expanded', 'aria-haspopup', 'data-state']) {
                item.removeAttribute(attr);
            }
            item.querySelectorAll('[id], [data-testid], [data-test-id]').forEach(node => {
                node.removeAttribute('id');
                node.removeAttribute('data-testid');
                node.removeAttribute('data-test-id');
            });
            relabel(item, 'Export Complete Markdown (TEST)');

            item.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                if (item.getAttribute('aria-disabled') === 'true') return;
                item.setAttribute('aria-disabled', 'true');
                relabel(item, 'Exporting Complete Markdown…');
                try {
                    await globalThis.ChatGptCompleteMarkdownExporter.exportCurrent();
                } finally {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            });

            markdown.insertAdjacentElement('afterend', item);
        }
    }

    inject(document);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'attributes') inject(record.target);
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) inject(node);
            }
        }
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'style', 'data-state'],
        childList: true,
        subtree: true
    });
})();

// ==UserScript==
// @name         ChatGPT Chat Exporter - Complete Markdown Live Test
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.0.4
// @description  Temporary isolated live-test build for complete Markdown and Project ZIP export.
// @author       rashidazarang, itsmeares
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/1354bba4311bd3385a6c4bb07ea92582ff392fd8/src/complete-markdown-export.js
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const TEST_ITEM = 'data-chatgpt-complete-markdown-test-item';
    const PROJECT_ITEM = 'data-chatgpt-project-markdown-exporter-item';
    const MENU_SELECTOR = '[role="menu"], [data-radix-menu-content]';

    const visible = element => Boolean(element && element.getClientRects().length);

    function relabel(item, label) {
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const value = node.nodeValue.trim();
            if (!value) continue;
            node.nodeValue = node.nodeValue.replace(value, label);
            return;
        }
        const span = document.createElement('span');
        span.textContent = label;
        item.appendChild(span);
    }

    function stripIdentity(item) {
        for (const attr of [
            'id', 'data-testid', 'data-test-id', 'data-chat-exporter-item',
            PROJECT_ITEM, 'aria-controls', 'aria-expanded', 'aria-haspopup', 'data-state'
        ]) {
            item.removeAttribute(attr);
        }
        item.querySelectorAll('[id], [data-testid], [data-test-id]').forEach(node => {
            node.removeAttribute('id');
            node.removeAttribute('data-testid');
            node.removeAttribute('data-test-id');
        });
    }

    function inject() {
        const menus = Array.from(document.querySelectorAll(MENU_SELECTOR)).filter(visible);

        for (const menu of menus) {
            if (menu.querySelector(`[${TEST_ITEM}]`)) continue;

            const projectItem = menu.querySelector(`[${PROJECT_ITEM}]`);
            if (!visible(projectItem)) continue;

            const item = projectItem.cloneNode(true);
            stripIdentity(item);
            item.setAttribute(TEST_ITEM, '');
            relabel(item, 'Export Complete Markdown (TEST)');

            item.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                if (item.getAttribute('aria-disabled') === 'true') return;

                item.setAttribute('aria-disabled', 'true');
                relabel(item, 'Exporting Complete Markdown…');
                try {
                    await globalThis.ChatGptCompleteMarkdownExporter.exportCurrent();
                } catch (error) {
                    // exportCurrent already shows a fail-closed user-facing error.
                } finally {
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Escape',
                        bubbles: true
                    }));
                }
            });

            projectItem.insertAdjacentElement('beforebegin', item);
        }
    }

    let scheduled = false;
    function scheduleInject() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            inject();
        }, 0);
    }

    scheduleInject();
    const observer = new MutationObserver(() => scheduleInject());
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'style', 'data-state'],
        childList: true,
        subtree: true
    });
})();

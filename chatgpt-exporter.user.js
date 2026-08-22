// ==UserScript==
// @name         ChatGPT Chat Exporter
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      1.2.0
// @description  Export complete ChatGPT Markdown, selected chats, Project ZIPs, PDF, or raw JSON.
// @author       rashidazarang, itsmeares
// @homepageURL  https://github.com/itsmeares/chatgpt-chat-exporter
// @supportURL   https://github.com/itsmeares/chatgpt-chat-exporter/issues
// @downloadURL  https://github.com/itsmeares/chatgpt-chat-exporter/raw/master/chatgpt-exporter.user.js
// @updateURL    https://github.com/itsmeares/chatgpt-chat-exporter/raw/master/chatgpt-exporter.user.js
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/extraction-engine.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/progress-overlay.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/userscript-ui.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/raw-json-export.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/complete-markdown-export.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/chat-selection-export-v2.js
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    globalThis.ChatExporterUi.install({
        engine: globalThis.ChatExporterEngine,
        progress: globalThis.ChatExporterProgress,
        exportMarkdown: () => globalThis.ChatGptCompleteMarkdownExporter.exportCurrent()
    });
})();

// ==UserScript==
// @name         ChatGPT Chat Exporter - Complete Markdown Live Test
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.0.1
// @description  Temporary pinned live-test build for complete Markdown and Project ZIP export.
// @author       rashidazarang, itsmeares
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/e7c8ba3bc5ede7b9cf1d2656bb5932ce4abaca6a/src/extraction-engine.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/e7c8ba3bc5ede7b9cf1d2656bb5932ce4abaca6a/src/progress-overlay.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/e7c8ba3bc5ede7b9cf1d2656bb5932ce4abaca6a/src/userscript-ui.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/e7c8ba3bc5ede7b9cf1d2656bb5932ce4abaca6a/src/raw-json-export.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/e7c8ba3bc5ede7b9cf1d2656bb5932ce4abaca6a/src/complete-markdown-export.js
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    globalThis.ChatExporterUi.install({
        engine: globalThis.ChatExporterEngine,
        progress: globalThis.ChatExporterProgress,
        exportMarkdown: () => globalThis.ChatGptCompleteMarkdownExporter.exportCurrent().catch(() => {})
    });
})();

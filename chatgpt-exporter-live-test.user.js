// ==UserScript==
// @name         ChatGPT Chat Exporter - Integrated Live Test
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      0.0.1
// @description  Temporary live-test build for the integrated Markdown, PDF, and raw JSON exporter.
// @author       rashidazarang, itsmeares
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/9a422157c09fb4322e315652a8c0a0a8506e59b9/src/extraction-engine.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/9a422157c09fb4322e315652a8c0a0a8506e59b9/src/progress-overlay.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/9a422157c09fb4322e315652a8c0a0a8506e59b9/src/userscript-ui.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/9a422157c09fb4322e315652a8c0a0a8506e59b9/src/raw-json-export.js
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    globalThis.ChatExporterUi.install({
        engine: globalThis.ChatExporterEngine,
        progress: globalThis.ChatExporterProgress
    });
})();

// ==UserScript==
// @name         ChatGPT Chat Exporter
// @namespace    https://github.com/itsmeares/chatgpt-chat-exporter
// @version      1.1.0
// @description  Export ChatGPT conversations to Markdown, PDF, or complete raw JSON from the native conversation menu.
// @author       rashidazarang, itsmeares
// @homepageURL  https://github.com/itsmeares/chatgpt-chat-exporter
// @supportURL   https://github.com/itsmeares/chatgpt-chat-exporter/issues
// @downloadURL  https://github.com/itsmeares/chatgpt-chat-exporter/raw/master/chatgpt-exporter.user.js
// @updateURL    https://github.com/itsmeares/chatgpt-chat-exporter/raw/master/chatgpt-exporter.user.js
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chatgpt.com/c/*
// @match        https://chat.com/*
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/extraction-engine.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/progress-overlay.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/userscript-ui.js
// @require      https://raw.githubusercontent.com/itsmeares/chatgpt-chat-exporter/master/src/raw-json-export.js
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

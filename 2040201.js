// ==UserScript==
// @name         Amazon → Google Sheets
// @namespace    local.amazon.sheet
// @version      1.5.4
// @description  Cross-browser Amazon → Google Sheets collector with self-update and local Apps Script configuration
// @match        https://www.amazon.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/2603602/40401/refs/heads/main/2040201.js
// @downloadURL  https://raw.githubusercontent.com/2603602/40401/refs/heads/main/2040201.js
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      m.media-amazon.com
// ==/UserScript==

(function () {
    'use strict';

    const GOOGLE_SCRIPT_URL_KEY = 'googleScriptUrl';
    const AUTH_TOKEN_KEY = 'authToken';

    function isValidGoogleScriptUrl(url) {
        return url.startsWith('https://script.google.com/macros/s/') && url.endsWith('/exec');
    }

    function changeGoogleScriptUrl() {
        const currentUrl = (GM_getValue(GOOGLE_SCRIPT_URL_KEY, '') || '').trim();
        const enteredUrl = (window.prompt(
            'Amazon → Google Sheets\\n\\nPaste your deployed Google Apps Script Web App URL ending in /exec:',
            currentUrl
        ) || '').trim();
        if (!enteredUrl) return;
        if (!isValidGoogleScriptUrl(enteredUrl)) {
            window.alert('Invalid Google Apps Script URL. Expected https://script.google.com/macros/s/.../exec');
            return;
        }
        GM_setValue(GOOGLE_SCRIPT_URL_KEY, enteredUrl);
        window.alert('Google Apps Script URL saved.');
    }

    function getAuthToken() {
        const savedToken = (GM_getValue(AUTH_TOKEN_KEY, '') || '').trim();
        if (savedToken) return savedToken;
        const enteredToken = (window.prompt(
            'Amazon → Google Sheets\n\nPaste your authentication token:'
        ) || '').trim();
        if (!enteredToken) return '';
        GM_setValue(AUTH_TOKEN_KEY, enteredToken);
        return enteredToken;
    }

    function changeAuthToken() {
        const enteredToken = (window.prompt(
            'Amazon → Google Sheets\\n\\nPaste the new authentication token:'
        ) || '').trim();
        if (!enteredToken) return;
        GM_setValue(AUTH_TOKEN_KEY, enteredToken);
        window.alert('Authentication token saved.');
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Change Apps Script URL', changeGoogleScriptUrl);
        GM_registerMenuCommand('Change authentication token', changeAuthToken);
    }

    function getGoogleScriptUrl() {
        const savedUrl = (GM_getValue(GOOGLE_SCRIPT_URL_KEY, '') || '').trim();

        if (savedUrl) {
            return savedUrl;
        }

        const enteredUrl = (window.prompt(
            'Amazon → Google Sheets\n\nPaste your deployed Google Apps Script Web App URL ending in /exec:'
        ) || '').trim();

        if (!enteredUrl) {
            return '';
        }

        if (!isValidGoogleScriptUrl(enteredUrl)) {
            window.alert('Invalid Google Apps Script URL. Expected https://script.google.com/macros/s/.../exec');
            return '';
        }

        GM_setValue(GOOGLE_SCRIPT_URL_KEY, enteredUrl);
        return enteredUrl;
    }

    const BUTTON_CLASS = 'amazon-sheet-add-btn';
    const CARD_SELECTOR = '[data-component-type="s-search-result"]';

    function getSourceQuery() {
        return new URLSearchParams(window.location.search).get('k') || '';
    }

    function getProductData(card) {
        const titleEl = card.querySelector('h2 span');

        // Select only the main product image. Mobile Amazon result cards can
        // contain additional service/thumbnail images, including SVG icons.
        const imageEl = card.querySelector(
            '[data-cy="image-container"] [data-component-type="s-product-image"] img.s-image'
        );

        const imageUrl =
            imageEl?.currentSrc ||
            imageEl?.src ||
            '';

        const validImageUrl =
            imageUrl &&
            imageUrl.includes('m.media-amazon.com/images/I/') &&
            !imageUrl.toLowerCase().includes('.svg')
                ? imageUrl
                : '';

        const asin =
            card.getAttribute('data-asin') ||
            card.querySelector('[data-asin]')?.getAttribute('data-asin') ||
            '';

        return {
            asin,
            title: titleEl?.textContent?.trim() || '',
            url: asin ? `https://www.amazon.com/dp/${asin}` : '',
            image: validImageUrl,
            sourceQuery: getSourceQuery(),
            sourceUrl: window.location.href
        };
    }

    function setButtonState(button, state) {
        const states = {
            idle:      { text: '+ Add',          disabled: false, opacity: '1',    cursor: 'pointer' },
            sending:   { text: 'Sending...',     disabled: true,  opacity: '0.7',  cursor: 'default' },
            added:     { text: '✓ Added',         disabled: true,  opacity: '0.65', cursor: 'default' },
            duplicate: { text: '✓ Already added', disabled: true, opacity: '0.65', cursor: 'default' },
            error:     { text: '✕ Error',         disabled: false, opacity: '1',    cursor: 'pointer' }
        };

        const cfg = states[state] || states.idle;
        button.textContent = cfg.text;
        button.disabled = cfg.disabled;
        button.style.opacity = cfg.opacity;
        button.style.cursor = cfg.cursor;
    }

    function downloadViaBlob(data) {
        fetch(data.image)
            .then(response => {
                if (!response.ok) throw new Error(`Image fetch failed: HTTP ${response.status}`);
                return response.blob();
            })
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `goodsbrell-${data.asin}.jpg`;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            })
            .catch(error => console.error('Blob image download error:', error));
    }

    function downloadProductImage(data) {
        if (!data.image || !data.asin) {
            console.error('Image download skipped: missing image URL or ASIN', data);
            return;
        }

        let settled = false;

        const fallbackTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            downloadViaBlob(data);
        }, 3000);

        try {
            GM_download({
                url: data.image,
                name: `goodsbrell-${data.asin}.jpg`,
                saveAs: false,
                onload: () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fallbackTimer);
                    console.log(`Image saved: goodsbrell-${data.asin}.jpg`);
                },
                onerror: error => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fallbackTimer);
                    console.warn('GM_download failed; using Blob fallback:', error);
                    downloadViaBlob(data);
                }
            });
        } catch (error) {
            if (settled) return;
            settled = true;
            clearTimeout(fallbackTimer);
            console.warn('GM_download unavailable; using Blob fallback:', error);
            downloadViaBlob(data);
        }
    }

    function parseHeaders(rawHeaders) {
        const headers = {};
        if (!rawHeaders) return headers;

        rawHeaders.split(/\r?\n/).forEach((line) => {
            const separator = line.indexOf(':');
            if (separator <= 0) return;

            const name = line.slice(0, separator).trim().toLowerCase();
            const value = line.slice(separator + 1).trim();

            if (name) headers[name] = value;
        });

        return headers;
    }

    function handleGoogleResult(result, data, button) {
        if (!result || result.success !== true) {
            console.error('Google Sheets error:', result?.error || result);
            setButtonState(button, 'error');
            return;
        }

        if (result.duplicate === true) {
            setButtonState(button, 'duplicate');
            return;
        }

        downloadProductImage(data);
        setButtonState(button, 'added');
    }

    function parseGoogleJson(response, data, button) {
        try {
            const text =
                typeof response.responseText === 'string'
                    ? response.responseText
                    : '';

            const result = JSON.parse(text);
            handleGoogleResult(result, data, button);
        } catch (error) {
            console.error(
                'Invalid Google Sheets response:',
                response.status,
                response.finalUrl,
                response.responseText,
                error
            );
            setButtonState(button, 'error');
        }
    }

    function fetchRedirectResult(location, data, button) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: location,
            redirect: 'follow',

            onload: function (response) {
                if (response.status >= 200 && response.status < 300) {
                    parseGoogleJson(response, data, button);
                    return;
                }

                console.error(
                    'Google Sheets redirect response error:',
                    response.status,
                    response.finalUrl
                );
                setButtonState(button, 'error');
            },

            onerror: function (error) {
                console.error('Google Sheets redirect network error:', error);
                setButtonState(button, 'error');
            }
        });
    }

    function sendToGoogleSheets(data, button) {
        const googleScriptUrl = getGoogleScriptUrl();

        if (!googleScriptUrl) {
            console.error('Google Apps Script URL is not configured.');
            setButtonState(button, 'error');
            return;
        }

        const authToken = getAuthToken();

        if (!authToken) {
            console.error('Authentication token is not configured.');
            setButtonState(button, 'error');
            return;
        }

        const requestData = { ...data, token: authToken };

        setButtonState(button, 'sending');

        GM_xmlhttpRequest({
            method: 'POST',
            url: googleScriptUrl,

            // Google Apps Script ContentService returns its body through
            // a one-time script.googleusercontent.com redirect.
            // We handle that redirect explicitly so a browser cannot
            // accidentally replay the POST against the redirect target.
            redirect: 'manual',

            headers: {
                'Content-Type': 'application/json'
            },

            data: JSON.stringify(requestData),

            onload: function (response) {
                // Some environments may expose a direct successful response.
                if (response.status >= 200 && response.status < 300) {
                    parseGoogleJson(response, data, button);
                    return;
                }

                // Normal Apps Script ContentService path:
                // POST executes doPost(), then returns a redirect to the
                // one-time URL containing the JSON response.
                if (
                    response.status === 301 ||
                    response.status === 302 ||
                    response.status === 303 ||
                    response.status === 307 ||
                    response.status === 308
                ) {
                    const headers = parseHeaders(response.responseHeaders);
                    const location = headers.location;

                    if (!location) {
                        console.error(
                            'Google Sheets redirect received without Location header:',
                            response.status,
                            response.responseHeaders
                        );
                        setButtonState(button, 'error');
                        return;
                    }

                    // Important: retrieve the ContentService result with GET.
                    // Do not replay the original POST against googleusercontent.
                    fetchRedirectResult(location, data, button);
                    return;
                }

                console.error(
                    'Google Sheets HTTP error:',
                    response.status,
                    response.finalUrl,
                    response.responseText
                );
                setButtonState(button, 'error');
            },

            onerror: function (error) {
                console.error('Google Sheets network error:', error);
                setButtonState(button, 'error');
            }
        });
    }

    function addButtonToCard(card) {
        if (card.querySelector(`.${BUTTON_CLASS}`)) return;

        const data = getProductData(card);
        if (!data.asin || !data.title || !data.image) return;

        const button = document.createElement('button');
        button.className = BUTTON_CLASS;
        setButtonState(button, 'idle');

        Object.assign(button.style, {
            display: 'inline-block',
            marginTop: '10px',
            padding: '6px 12px',
            border: '1px solid #888',
            borderRadius: '6px',
            background: '#fff',
            fontSize: '13px',
            fontWeight: '600'
        });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const currentData = getProductData(card);

            if (!currentData.asin || !currentData.title || !currentData.image) {
                console.error('Product data is incomplete:', currentData);
                setButtonState(button, 'error');
                return;
            }

            sendToGoogleSheets(currentData, button);
        });

        const target =
            card.querySelector('[data-cy="delivery-recipe"]') ||
            card.querySelector('[data-cy="price-recipe"]') ||
            card.querySelector('[data-cy="title-recipe"]') ||
            card;

        target.insertAdjacentElement('afterend', button);
    }

    function scanProducts() {
        document.querySelectorAll(CARD_SELECTOR).forEach(addButtonToCard);
    }

    let scanScheduled = false;

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;

        requestAnimationFrame(() => {
            scanScheduled = false;
            scanProducts();
        });
    }

    scanProducts();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

// ==UserScript==
// @name         Amazon → Google Sheets
// @namespace    local.amazon.sheet
// @version      1.6.2
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

    /*
     * Amazon research and product collector.
     *
     * Responsibilities:
     * - show Research Queue grouped by Event and Micro-theme;
     * - open Amazon searches with selectable sorting;
     * - toggle Viewed without forcing navigation;
     * - save selected Amazon products to Google Sheets.
     *
     * Common manual edits:
     * - RESEARCH_UI: panel size and position;
     * - RESEARCH_LABELS: visible labels;
     * - AMAZON_SORTS: search sorting links.
     */


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


    // =========================================================
    // Research Queue configuration
    // =========================================================

    const RESEARCH_UI = {
        launcherId: 'amazon-research-launcher',
        panelId: 'amazon-research-panel',
        panelWidth: '390px',
        panelMaxHeight: '72vh',
        right: '12px',
        bottom: '12px',
        fullscreenPadding: '12px'
    };

    const RESEARCH_LABELS = {
        launcher: 'Research',
        loading: 'Loading…',
        emptyQueue: 'Research Queue is empty',
        currentPage: 'YOU ARE HERE',
        best: 'Best',
        reviews: 'Reviews',
        featured: 'Featured',
        newest: 'Newest',
        priceLow: 'Price ↑',
        priceHigh: 'Price ↓',
        fullscreen: '⛶',
        exitFullscreen: '🗗',
        expandAll: 'Expand all',
        collapseAll: 'Collapse all',
        minimizePanel: '−'
    };

    const AMAZON_SORTS = [
        {
            id: 'best',
            label: RESEARCH_LABELS.best,
            value: 'exact-aware-popularity-rank'
        },
        {
            id: 'reviews',
            label: RESEARCH_LABELS.reviews,
            value: 'review-rank'
        },
        {
            id: 'featured',
            label: RESEARCH_LABELS.featured,
            value: ''
        },
        {
            id: 'newest',
            label: RESEARCH_LABELS.newest,
            value: 'date-desc-rank'
        },
        {
            id: 'priceLow',
            label: RESEARCH_LABELS.priceLow,
            value: 'price-asc-rank'
        },
        {
            id: 'priceHigh',
            label: RESEARCH_LABELS.priceHigh,
            value: 'price-desc-rank'
        }
    ];

    let researchTasks = [];
    let isResearchPanelOpen = false;
    let isResearchPanelFullscreen = false;

    // =========================================================
    // Research Queue data
    // =========================================================

    function normalizeSearchKeyword(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function getCurrentAmazonSearchState() {
        const currentUrl = new URL(window.location.href);

        return {
            keyword: normalizeSearchKeyword(
                currentUrl.searchParams.get('k') || ''
            ),
            sort: currentUrl.searchParams.get('s') || ''
        };
    }

    function buildAmazonSearchUrl(task, sortValue) {
        const hasOverride = String(task.urlOverride || '').trim() !== '';
        let searchUrl;

        if (hasOverride) {
            searchUrl = new URL(task.urlOverride, 'https://www.amazon.com/');
        } else {
            searchUrl = new URL('https://www.amazon.com/s');
            searchUrl.searchParams.set('k', task.seedKeyword || '');
        }

        if (sortValue) {
            searchUrl.searchParams.set('s', sortValue);
        } else {
            searchUrl.searchParams.delete('s');
        }

        return searchUrl.toString();
    }

    function requestResearchAction(action, payload, onSuccess, onError) {
        const googleScriptUrl = getGoogleScriptUrl();

        if (!googleScriptUrl) {
            return;
        }

        const authToken = getAuthToken();

        if (!authToken) {
            return;
        }

        const requestData = {
            action: action,
            token: authToken
        };

        Object.keys(payload || {}).forEach(function (key) {
            requestData[key] = payload[key];
        });

        function handleResponse(response) {
            try {
                const responseText =
                    typeof response.responseText === 'string'
                        ? response.responseText
                        : '';

                const result = JSON.parse(responseText);

                if (result.success === true) {
                    if (typeof onSuccess === 'function') {
                        onSuccess(result);
                    }
                    return;
                }

                const message =
                    result.error ||
                    'Google Apps Script could not complete the Research Queue action.';

                console.error('Research Queue error:', message);

                if (typeof onError === 'function') {
                    onError(message);
                }
            } catch (error) {
                console.error(
                    'Google Apps Script returned an invalid Research Queue response:',
                    response.responseText,
                    error
                );

                if (typeof onError === 'function') {
                    onError('Invalid Research Queue response.');
                }
            }
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: googleScriptUrl,
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(requestData),

            onload: function (response) {
                const isDirectSuccess =
                    response.status >= 200 &&
                    response.status < 300;

                if (isDirectSuccess) {
                    handleResponse(response);
                    return;
                }

                const isRedirect = [
                    301,
                    302,
                    303,
                    307,
                    308
                ].includes(response.status);

                if (!isRedirect) {
                    const message =
                        'Could not complete the Research Queue request. HTTP ' +
                        response.status;

                    console.error(message, response.responseText);

                    if (typeof onError === 'function') {
                        onError(message);
                    }
                    return;
                }

                const headers = parseHeaders(response.responseHeaders);
                const redirectLocation = headers.location;

                if (!redirectLocation) {
                    const message =
                        'Research Queue redirect did not include a Location header.';

                    console.error(message);

                    if (typeof onError === 'function') {
                        onError(message);
                    }
                    return;
                }

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: redirectLocation,
                    redirect: 'follow',
                    onload: handleResponse,

                    onerror: function (error) {
                        console.error(
                            'Could not read the Research Queue redirect response:',
                            error
                        );

                        if (typeof onError === 'function') {
                            onError(
                                'Could not read the Research Queue response.'
                            );
                        }
                    }
                });
            },

            onerror: function (error) {
                console.error(
                    'Could not connect to Google Apps Script for Research Queue:',
                    error
                );

                if (typeof onError === 'function') {
                    onError('Could not connect to Research Queue.');
                }
            }
        });
    }

    function loadResearchQueue(onLoaded, onFinished) {
        requestResearchAction(
            'getResearchQueue',
            {},
            function (result) {
                researchTasks = Array.isArray(result.tasks)
                    ? result.tasks
                    : [];

                updateResearchLauncher();
                renderResearchPanel();

                if (typeof onLoaded === 'function') {
                    onLoaded(researchTasks);
                }

                if (typeof onFinished === 'function') {
                    onFinished();
                }
            },
            function (message) {
                renderResearchPanelMessage(message);

                if (typeof onFinished === 'function') {
                    onFinished();
                }
            }
        );
    }

    function setResearchTaskViewed(task, shouldBeViewed, checkbox) {
        checkbox.disabled = true;

        requestResearchAction(
            'setResearchViewed',
            {
                row: task.row,
                seedKeyword: task.seedKeyword,
                viewed: shouldBeViewed
            },
            function () {
                task.viewed = shouldBeViewed;
                checkbox.checked = shouldBeViewed;
                checkbox.disabled = false;

                updateResearchLauncher();
                renderResearchPanel();
            },
            function () {
                checkbox.checked = task.viewed === true;
                checkbox.disabled = false;
            }
        );
    }

    // =========================================================
    // Research Queue grouping
    // =========================================================

    function groupResearchTasksByEventAndTheme(tasks) {
        const events = [];

        tasks.forEach(function (task) {
            let eventGroup = events.find(function (item) {
                return item.name === task.event;
            });

            if (!eventGroup) {
                eventGroup = {
                    name: task.event || 'Unspecified event',
                    microThemes: []
                };
                events.push(eventGroup);
            }

            let microThemeGroup = eventGroup.microThemes.find(function (item) {
                return item.name === task.microTheme;
            });

            if (!microThemeGroup) {
                microThemeGroup = {
                    name: task.microTheme || 'Unspecified micro-theme',
                    tasks: []
                };
                eventGroup.microThemes.push(microThemeGroup);
            }

            microThemeGroup.tasks.push(task);
        });

        return events;
    }

    function getMicroThemeProgress(tasks) {
        const viewedCount = tasks.filter(function (task) {
            return task.viewed === true;
        }).length;

        return {
            viewed: viewedCount,
            total: tasks.length
        };
    }

    function doesTaskMatchCurrentPage(task) {
        const currentState = getCurrentAmazonSearchState();
        const taskKeyword = normalizeSearchKeyword(task.seedKeyword);

        return (
            taskKeyword !== '' &&
            taskKeyword === currentState.keyword
        );
    }

    function isSortCurrent(task, sortValue) {
        if (!doesTaskMatchCurrentPage(task)) {
            return false;
        }

        const currentState = getCurrentAmazonSearchState();

        return currentState.sort === sortValue;
    }

    // =========================================================
    // Research Queue UI
    // =========================================================

    function applyResearchButtonStyle(button) {
        Object.assign(button.style, {
            border: '1px solid #888',
            borderRadius: '6px',
            background: '#fff',
            color: '#111',
            padding: '5px 8px',
            cursor: 'pointer',
            fontSize: '12px'
        });
    }

    function createResearchLauncher() {
        let launcher = document.getElementById(RESEARCH_UI.launcherId);

        if (launcher) {
            return launcher;
        }

        launcher = document.createElement('button');
        launcher.id = RESEARCH_UI.launcherId;
        launcher.type = 'button';

        Object.assign(launcher.style, {
            position: 'fixed',
            right: RESEARCH_UI.right,
            bottom: RESEARCH_UI.bottom,
            zIndex: '2147483647',
            border: '1px solid #777',
            borderRadius: '8px',
            background: '#fff',
            color: '#111',
            padding: '8px 12px',
            boxShadow: '0 2px 10px rgba(0,0,0,.18)',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer'
        });

        launcher.addEventListener('click', function () {
            isResearchPanelOpen = !isResearchPanelOpen;
            renderResearchPanel();
        });

        document.body.appendChild(launcher);

        return launcher;
    }

    function updateResearchLauncher() {
        const launcher = createResearchLauncher();

        const totalCount = researchTasks.length;
        const viewedCount = researchTasks.filter(function (task) {
            return task.viewed === true;
        }).length;

        if (totalCount === 0) {
            launcher.textContent = RESEARCH_LABELS.launcher;
            return;
        }

        launcher.textContent =
            RESEARCH_LABELS.launcher +
            ' ' +
            viewedCount +
            '/' +
            totalCount;
    }

    function createResearchPanel() {
        let panel = document.getElementById(RESEARCH_UI.panelId);

        if (panel) {
            return panel;
        }

        panel = document.createElement('div');
        panel.id = RESEARCH_UI.panelId;

        Object.assign(panel.style, {
            position: 'fixed',
            right: RESEARCH_UI.right,
            bottom: '54px',
            zIndex: '2147483647',
            width: 'min(' + RESEARCH_UI.panelWidth + ', calc(100vw - 24px))',
            maxHeight: RESEARCH_UI.panelMaxHeight,
            overflowY: 'auto',
            background: '#fff',
            color: '#111',
            border: '1px solid #888',
            borderRadius: '10px',
            boxShadow: '0 3px 16px rgba(0,0,0,.22)',
            padding: '10px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            lineHeight: '1.35'
        });

        document.body.appendChild(panel);

        return panel;
    }

    function renderResearchPanelMessage(message) {
        const panel = createResearchPanel();

        panel.innerHTML = '';
        panel.style.display = isResearchPanelOpen ? 'block' : 'none';

        if (!isResearchPanelOpen) {
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.padding = '8px';

        panel.appendChild(messageElement);
    }

    function createSortLink(task, sortOption) {
        const sortLink = document.createElement('a');
        sortLink.textContent = sortOption.label;
        sortLink.href = buildAmazonSearchUrl(task, sortOption.value);

        Object.assign(sortLink.style, {
            display: 'inline-block',
            marginRight: '8px',
            marginTop: '4px',
            fontSize: '11px',
            textDecoration: 'none',
            color: '#2162a1'
        });

        if (isSortCurrent(task, sortOption.value)) {
            sortLink.style.fontWeight = '700';
            sortLink.style.textDecoration = 'underline';
        }

        return sortLink;
    }

    function createResearchTaskRow(task) {
        const row = document.createElement('div');

        Object.assign(row.style, {
            padding: '7px 0',
            borderTop: '1px solid #eee'
        });

        const firstLine = document.createElement('div');

        Object.assign(firstLine.style, {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '7px'
        });

        const viewedCheckbox = document.createElement('input');
        viewedCheckbox.type = 'checkbox';
        viewedCheckbox.checked = task.viewed === true;
        viewedCheckbox.title = 'Viewed';

        viewedCheckbox.addEventListener('change', function () {
            setResearchTaskViewed(
                task,
                viewedCheckbox.checked,
                viewedCheckbox
            );
        });

        const keywordArea = document.createElement('div');
        keywordArea.style.flex = '1';
        keywordArea.style.minWidth = '0';

        const keywordLine = document.createElement('div');

        const keywordLink = document.createElement('a');
        keywordLink.textContent =
            task.seedKeyword ||
            task.productRole ||
            'Open Amazon search';

        keywordLink.href = buildAmazonSearchUrl(
            task,
            'exact-aware-popularity-rank'
        );

        Object.assign(keywordLink.style, {
            color: '#111',
            fontWeight: '600',
            textDecoration: 'none',
            overflowWrap: 'anywhere'
        });

        keywordLine.appendChild(keywordLink);

        if (doesTaskMatchCurrentPage(task)) {
            const currentBadge = document.createElement('span');
            currentBadge.textContent = ' · ' + RESEARCH_LABELS.currentPage;

            Object.assign(currentBadge.style, {
                fontSize: '10px',
                fontWeight: '700',
                color: '#067d62'
            });

            keywordLine.appendChild(currentBadge);
            row.style.background = '#f7fbf9';
        }

        const productRole = document.createElement('div');
        productRole.textContent = task.productRole || '';

        Object.assign(productRole.style, {
            marginTop: '2px',
            color: '#666',
            fontSize: '11px'
        });

        const sortLinks = document.createElement('div');

        AMAZON_SORTS.forEach(function (sortOption) {
            sortLinks.appendChild(
                createSortLink(task, sortOption)
            );
        });

        keywordArea.appendChild(keywordLine);

        if (task.productRole) {
            keywordArea.appendChild(productRole);
        }

        keywordArea.appendChild(sortLinks);

        firstLine.appendChild(viewedCheckbox);
        firstLine.appendChild(keywordArea);
        row.appendChild(firstLine);

        return row;
    }

    function shouldMicroThemeStartOpen(tasks, isFirstIncompleteTheme) {
        const containsCurrentPage = tasks.some(function (task) {
            return doesTaskMatchCurrentPage(task);
        });

        if (containsCurrentPage) {
            return true;
        }

        return isFirstIncompleteTheme;
    }

    function renderMicroThemeGroup(
        parent,
        microThemeGroup,
        isFirstIncompleteTheme
    ) {
        const details = document.createElement('details');
        const progress = getMicroThemeProgress(microThemeGroup.tasks);

        details.open = shouldMicroThemeStartOpen(
            microThemeGroup.tasks,
            isFirstIncompleteTheme
        );

        const summary = document.createElement('summary');

        Object.assign(summary.style, {
            cursor: 'pointer',
            fontWeight: '700',
            padding: '7px 2px'
        });

        summary.textContent =
            microThemeGroup.name +
            ' — ' +
            progress.viewed +
            '/' +
            progress.total +
            ' viewed';

        details.appendChild(summary);

        microThemeGroup.tasks.forEach(function (task) {
            details.appendChild(
                createResearchTaskRow(task)
            );
        });

        parent.appendChild(details);
    }

    function renderEventGroup(parent, eventGroup) {
        const eventTitle = document.createElement('div');
        eventTitle.textContent = eventGroup.name;

        Object.assign(eventTitle.style, {
            fontSize: '14px',
            fontWeight: '700',
            padding: '8px 2px 4px',
            borderBottom: '1px solid #ddd'
        });

        parent.appendChild(eventTitle);

        let firstIncompleteThemeUsed = false;

        eventGroup.microThemes.forEach(function (microThemeGroup) {
            const progress = getMicroThemeProgress(microThemeGroup.tasks);
            const isIncomplete = progress.viewed < progress.total;
            const isFirstIncompleteTheme =
                isIncomplete &&
                firstIncompleteThemeUsed === false;

            if (isFirstIncompleteTheme) {
                firstIncompleteThemeUsed = true;
            }

            renderMicroThemeGroup(
                parent,
                microThemeGroup,
                isFirstIncompleteTheme
            );
        });
    }

    function setResearchPanelLoading(isLoading) {
        const panel = createResearchPanel();

        if (isLoading) {
            panel.style.pointerEvents = 'none';
            panel.style.opacity = '0.62';
            panel.setAttribute('aria-busy', 'true');
            return;
        }

        panel.style.pointerEvents = 'auto';
        panel.style.opacity = '1';
        panel.removeAttribute('aria-busy');
    }

    function applyResearchPanelSize(panel) {
        if (isResearchPanelFullscreen) {
            panel.style.top = RESEARCH_UI.fullscreenPadding;
            panel.style.left = RESEARCH_UI.fullscreenPadding;
            panel.style.right = RESEARCH_UI.fullscreenPadding;
            panel.style.bottom = RESEARCH_UI.fullscreenPadding;
            panel.style.width = 'auto';
            panel.style.maxHeight = 'none';
            panel.style.height = 'auto';
            return;
        }

        panel.style.top = 'auto';
        panel.style.left = 'auto';
        panel.style.right = RESEARCH_UI.right;
        panel.style.bottom = '54px';
        panel.style.width =
            'min(' +
            RESEARCH_UI.panelWidth +
            ', calc(100vw - 24px))';
        panel.style.maxHeight = RESEARCH_UI.panelMaxHeight;
        panel.style.height = 'auto';
    }

    function toggleResearchPanelFullscreen() {
        isResearchPanelFullscreen = !isResearchPanelFullscreen;
        renderResearchPanel();
    }

    function setAllMicroThemesExpanded(shouldExpand) {
        const panel = createResearchPanel();
        const detailElements = panel.querySelectorAll('details');

        detailElements.forEach(function (detailsElement) {
            detailsElement.open = shouldExpand;
        });
    }

    function renderResearchPanel() {
        const launcher = createResearchLauncher();
        const panel = createResearchPanel();

        updateResearchLauncher();

        panel.style.display = isResearchPanelOpen
            ? 'block'
            : 'none';

        applyResearchPanelSize(panel);

        if (!isResearchPanelOpen) {
            return;
        }

        panel.innerHTML = '';

        const header = document.createElement('div');

        Object.assign(header.style, {
            position: 'sticky',
            top: '0',
            zIndex: '5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            margin: '-10px -10px 6px',
            padding: '10px',
            background: '#fff',
            borderBottom: '1px solid #ddd'
        });

        const title = document.createElement('strong');
        title.textContent = 'Research Queue';

        const controls = document.createElement('div');

        Object.assign(controls.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
        });

        const expandAllButton = document.createElement('button');
        expandAllButton.type = 'button';
        expandAllButton.textContent = RESEARCH_LABELS.expandAll;
        expandAllButton.title = 'Expand all micro-themes';
        applyResearchButtonStyle(expandAllButton);

        expandAllButton.addEventListener('click', function () {
            setAllMicroThemesExpanded(true);
        });

        const collapseAllButton = document.createElement('button');
        collapseAllButton.type = 'button';
        collapseAllButton.textContent = RESEARCH_LABELS.collapseAll;
        collapseAllButton.title = 'Collapse all micro-themes';
        applyResearchButtonStyle(collapseAllButton);

        collapseAllButton.addEventListener('click', function () {
            setAllMicroThemesExpanded(false);
        });

        const fullscreenButton = document.createElement('button');
        fullscreenButton.type = 'button';
        fullscreenButton.textContent = isResearchPanelFullscreen
            ? RESEARCH_LABELS.exitFullscreen
            : RESEARCH_LABELS.fullscreen;
        fullscreenButton.title = isResearchPanelFullscreen
            ? 'Exit fullscreen'
            : 'Open fullscreen';
        applyResearchButtonStyle(fullscreenButton);

        fullscreenButton.addEventListener('click', function () {
            toggleResearchPanelFullscreen();
        });

        const minimizeButton = document.createElement('button');
        minimizeButton.type = 'button';
        minimizeButton.textContent = RESEARCH_LABELS.minimizePanel;
        minimizeButton.title = 'Collapse panel';
        applyResearchButtonStyle(minimizeButton);

        minimizeButton.addEventListener('click', function () {
            isResearchPanelOpen = false;
            renderResearchPanel();
        });

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.textContent = '↻';
        refreshButton.title = 'Reload Research Queue';
        applyResearchButtonStyle(refreshButton);

        refreshButton.addEventListener('click', function () {
            refreshButton.disabled = true;
            refreshButton.textContent = '…';
            setResearchPanelLoading(true);

            loadResearchQueue(
                null,
                function () {
                    setResearchPanelLoading(false);

                    const currentRefreshButton = document.querySelector(
                        '#' + RESEARCH_UI.panelId + ' button[title="Reload Research Queue"]'
                    );

                    if (currentRefreshButton) {
                        currentRefreshButton.disabled = false;
                        currentRefreshButton.textContent = '↻';
                    }
                }
            );
        });

        controls.appendChild(expandAllButton);
        controls.appendChild(collapseAllButton);
        controls.appendChild(fullscreenButton);
        controls.appendChild(refreshButton);
        controls.appendChild(minimizeButton);

        header.appendChild(title);
        header.appendChild(controls);
        panel.appendChild(header);

        if (researchTasks.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.textContent = RESEARCH_LABELS.emptyQueue;
            emptyState.style.padding = '8px 2px';

            panel.appendChild(emptyState);
            return;
        }

        const eventGroups = groupResearchTasksByEventAndTheme(
            researchTasks
        );

        eventGroups.forEach(function (eventGroup) {
            renderEventGroup(panel, eventGroup);
        });
    }

    function initializeResearchQueue() {
        createResearchLauncher();
        updateResearchLauncher();

        loadResearchQueue();
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
    initializeResearchQueue();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

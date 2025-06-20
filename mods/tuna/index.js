// ==UserScript==
// @name         Tuna browser script
// @namespace    univrsal
// @version      1.0.29
// @description  Get song information from web players
// @author       univrsal
// @match        *://open.spotify.com/*
// @match        *://soundcloud.com/*
// @match        *://music.yandex.com/*
// @match        *://music.yandex.ru/*
// @match        *://www.deezer.com/*
// @match        *://play.pretzel.rocks/*
// @match        *://*.youtube.com/*
// @match        *://app.plex.tv/*
// @grant        unsafeWindow
// @license      GPLv2
// ==/UserScript==

(function () {
    'use strict';
    console.log("Loading tuna browser script");

    // Configuration
    const config = {
        port: 1608,
        secondaryPort: 9255,
        refreshRateMs: 1000,
        cooldownMs: 10000,
        maxFailures: 3
    };

    // State management
    const state = {
        failureCount: 0,
        cooldown: 0,
        lastState: {},
        lastUpdate: 0,
        requestQueue: [],
        isSending: false
    };

    // Request queue processor
    async function processQueue() {
        if (state.isSending || state.requestQueue.length === 0) return;
        
        state.isSending = true;
        const request = state.requestQueue.shift();
        
        try {
            await sendRequest(request.url, request.data);
            state.lastUpdate = Date.now();
            state.failureCount = 0;
        } catch (error) {
            console.error('Request failed:', error);
            state.failureCount++;
            if (state.failureCount >= config.maxFailures) {
                state.cooldown = config.cooldownMs;
                state.failureCount = 0;
                console.log('Entering cooldown due to multiple failures');
            }
        } finally {
            state.isSending = false;
            processQueue();
        }
    }

    // Improved request function with timeout
    function sendRequest(url, data) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 5000; // 5 second timeout
            
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('Content-Type', 'application/json');
            
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.response);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            
            xhr.onerror = function() {
                reject(new Error('Network error'));
            };
            
            xhr.ontimeout = function() {
                reject(new Error('Request timeout'));
            };
            
            xhr.send(JSON.stringify(data));
        });
    }

    // Debounced post function with queue
    function post(data) {
        if (data.status && data.status !== "playing" && state.lastState.status === data.status) {
            return;
        }
        
        state.lastState = data;
        
        const postData = {
            data,
            hostname: window.location.hostname,
            date: Date.now()
        };
        
        // Add requests to queue
        state.requestQueue.push({
            url: `http://localhost:${config.port}/`,
            data: postData
        });
        
        state.requestQueue.push({
            url: `http://localhost:${config.secondaryPort}/`,
            data: postData
        });
        
        processQueue();
    }

    // Query helper with error handling
    function query(target, fun, alt = null) {
        try {
            const element = document.evaluate(
                target, 
                document, 
                null, 
                XPathResult.FIRST_ORDERED_NODE_TYPE, 
                null
            ).singleNodeValue;
            
            return element ? fun(element) : alt;
        } catch (error) {
            console.error('Query error:', error);
            return alt;
        }
    }

    function timestampToMs(ts) {
        if (!ts) return 0;
        
        const splits = ts.split(':').map(Number);
        if (splits.length === 2) {
            return splits[0] * 60000 + splits[1] * 1000;
        } else if (splits.length === 3) {
            return splits[0] * 3600000 + splits[1] * 60000 + splits[2] * 1000;
        }
        return 0;
    }

    // Throttled and improved data collection
    function collectData() {
        if (state.cooldown > 0) {
            state.cooldown -= config.refreshRateMs;
            return;
        }

        try {
            const now = Date.now();
            if (now - state.lastUpdate < config.refreshRateMs) {
                return;
            }

            const status = query(
                '/html/body/div[3]/div/div/section/div[2]/div[1]/div/button[2]', 
                e => e.getAttribute('data-test-id') === "PAUSE_BUTTON" ? "playing" : "stopped", 
                'unknown'
            );

            const cover = query(
                '/html/body/div[3]/div/div/section/div[1]/div[1]/div[1]/img', 
                e => e.srcset ? e.srcset.split(',').pop().trim().split(/\s+/)[0] : e.src
            );

            const title = query(
                '/html/body/div[3]/div/div/section/div[1]/div[1]/div[2]/div/div/div[2]/a/span', 
                e => e.textContent.trim()
            );

            if (!title) return;

            const artists = [
                query(
                    '/html/body/div[3]/div/div/section/div[1]/div[1]/div[2]/div/div/div[2]', 
                    e => e.textContent.trim()
                )
            ].filter(Boolean);

            const progress = query(
                '/html/body/div[3]/div/div/section/div[2]/div[2]/span[1]', 
                e => timestampToMs(e.textContent)
            );

            const duration = query(
                '/html/body/div[3]/div/div/section/div[2]/div[2]/span[2]', 
                e => timestampToMs(e.textContent)
            );

            post({ 
                cover, 
                title, 
                artists, 
                status, 
                progress: progress || 0, 
                duration: duration || 0, 
                album_url: "" 
            });

        } catch (error) {
            console.error('Data collection error:', error);
        }
    }

    // Initialize with proper timing
    let isInitialized = false;
    function initialize() {
        if (isInitialized) return;
        
        // Start with a small delay to let page load
        setTimeout(() => {
            setInterval(collectData, config.refreshRateMs);
            isInitialized = true;
            console.log('Tuna script initialized');
        }, 2000);
    }

    // Start when DOM is ready
    if (document.readyState === 'complete') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
})();
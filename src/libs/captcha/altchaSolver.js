// altchaSolver.js (ES Module)

'use strict';

const DEFAULT_CHALLENGE_URL = 'https://api.moomoo.io/verify';
const DEFAULT_MAX_WORKERS = 8;
const MAX_WORKERS = 16;

const WORKER_SOURCE = [
    "'use strict';",
    "(function () {",
    "    var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;",
    "    if (!encoder) {",
    "        self.postMessage({ worker: true, error: 'TextEncoder is not supported' });",
    "        return;",
    "    }",
    "    function toHex(buffer) {",
    "        var view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);",
    "        var hex = '';",
    "        for (var i = 0; i < view.length; i += 1) {",
    "            hex += view[i].toString(16).padStart(2, '0');",
    "        }",
    "        return hex;",
    "    }",
    "    function toIV(value, size) {",
    "        var length = typeof size === 'number' && size > 0 ? size : 12;",
    "        var bytes = new Uint8Array(length);",
    "        var current = value;",
    "        for (var i = 0; i < length; i += 1) {",
    "            bytes[i] = current % 256;",
    "            current = Math.floor(current / 256);",
    "        }",
    "        return bytes;",
    "    }",
    "    function decodeBase64(value) {",
    "        if (typeof atob !== 'function') {",
    "            throw new Error('Base64 decode is not available');",
    "        }",
    "        var binary = atob(value || '');",
    "        var length = binary.length;",
    "        var bytes = new Uint8Array(length);",
    "        for (var i = 0; i < length; i += 1) {",
    "            bytes[i] = binary.charCodeAt(i);",
    "        }",
    "        return bytes;",
    "    }",
    "    async function computeHash(salt, algorithm, candidate) {",
    "        if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {",
    "            throw new Error('Web Crypto API is unavailable');",
    "        }",
    "        var input = encoder.encode(String(salt || '') + String(candidate));",
    "        var digest = await crypto.subtle.digest(String(algorithm || 'SHA-256').toUpperCase(), input);",
    "        return toHex(new Uint8Array(digest));",
    "    }",
    "    function solvePow(payload, start, max) {",
    "        var controller = new AbortController();",
    "        var began = Date.now();",
    "        var target = String(payload.challenge || '').toLowerCase();",
    "        var salt = payload.salt || '';",
    "        var algorithm = payload.algorithm || 'SHA-256';",
    "        var promise = (async function () {",
    "            for (var i = start; i <= max; i += 1) {",
    "                if (controller.signal.aborted) {",
    "                    return null;",
    "                }",
    "                var hash = await computeHash(salt, algorithm, i);",
    "                if (hash === target) {",
    "                    return { number: i, took: Date.now() - began };",
    "                }",
    "            }",
    "            return null;",
    "        })();",
    "        return { promise: promise, controller: controller };",
    "    }",
    "    async function solveObfuscated(payload, start, max) {",
    "        if (typeof crypto === 'undefined' || !crypto.subtle) {",
    "            throw new Error('Web Crypto API is unavailable');",
    "        }",
    "        var controller = new AbortController();",
    "        var began = Date.now();",
    "        var cipherBytes = decodeBase64(payload.obfuscated || '');",
    "        var keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(payload.key || '')));",
    "        var cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);",
    "        var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;",
    "        var promise = (async function () {",
    "            for (var i = start; i <= max; i += 1) {",
    "                if (controller.signal.aborted) {",
    "                    return null;",
    "                }",
    "                try {",
    "                    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toIV(i) }, cryptoKey, cipherBytes);",
    "                    if (decrypted) {",
    "                        return { clearText: decoder ? decoder.decode(decrypted) : '', took: Date.now() - began };",
    "                    }",
    "                } catch (err) {",
    "                    // ignore and continue",
    "                }",
    "            }",
    "            return null;",
    "        })();",
    "        return { promise: promise, controller: controller };",
    "    }",
    "    var active = null;",
    "    self.onmessage = async function (event) {",
    "        var data = event && event.data ? event.data : {};",
    "        if (data.type === 'abort') {",
    "            if (active && active.controller) {",
    "                active.controller.abort();",
    "            }",
    "            active = null;",
    "            return;",
    "        }",
    "        if (data.type !== 'work') {",
    "            return;",
    "        }",
    "        var start = typeof data.start === 'number' ? data.start : 0;",
    "        var max = typeof data.max === 'number' ? data.max : 0;",
    "        var payload = data.payload || {};",
    "        try {",
    "            if (payload && typeof payload.obfuscated === 'string') {",
    "                active = await solveObfuscated(payload, start, max);",
    "            } else {",
    "                active = solvePow(payload, start, max);",
    "            }",
    "            var result = active ? await active.promise : null;",
    "            if (result && typeof result === 'object') {",
    "                result.worker = true;",
    "            }",
    "            self.postMessage(result);",
    "        } catch (error) {",
    "            self.postMessage({ worker: true, error: error && error.message ? error.message : String(error || 'ALTCHA worker error') });",
    "        }",
    "    };",
    "})();"
].join('\n');

function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function bufferToHex(buffer) {
    const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    let hex = '';
    for (let i = 0; i < view.length; i += 1) {
        hex += view[i].toString(16).padStart(2, '0');
    }
    return hex;
}

function toSecondsString(ms) {
    let seconds = ms / 1000;
    if (!isFinite(seconds)) {
        seconds = 0;
    }
    return seconds.toFixed(2);
}

function base64Encode(value) {
    if (typeof btoa === 'function') {
        return btoa(value);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(value, 'utf8').toString('base64');
    }
    throw new Error('Base64 encoder is not available.');
}

function base64Decode(value) {
    if (typeof atob === 'function') {
        const binary = atob(value || '');
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(value || '', 'base64'));
    }
    throw new Error('Base64 decoder is not available.');
}

function ivFromNumber(number, size) {
    const length = typeof size === 'number' && size > 0 ? size : 12;
    const bytes = new Uint8Array(length);
    let current = number;
    for (let i = 0; i < length; i += 1) {
        bytes[i] = current % 256;
        current = Math.floor(current / 256);
    }
    return bytes;
}

function hasWebCrypto() {
    return typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function';
}

function hasTextEncoder() {
    return typeof TextEncoder !== 'undefined';
}

function hasTextDecoder() {
    return typeof TextDecoder !== 'undefined';
}

async function solvePowSequential(payload, start, end, encoder) {
    const salt = String(payload.salt || '');
    const target = String(payload.challenge || '').toLowerCase();
    const algorithm = String(payload.algorithm || 'SHA-256').toUpperCase();
    const began = now();
    for (let i = start; i <= end; i += 1) {
        const encoded = encoder.encode(salt + String(i));
        const digest = await crypto.subtle.digest(algorithm, encoded);
        const hash = bufferToHex(new Uint8Array(digest));
        if (hash === target) {
            return { number: i, took: toSecondsString(now() - began) };
        }
    }
    return null;
}

async function solveObfuscatedSequential(payload, start, end, encoder) {
    const cipherBytes = base64Decode(payload.obfuscated || '');
    const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(payload.key || '')));
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const decoder = hasTextDecoder() ? new TextDecoder() : null;
    const began = now();
    for (let i = start; i <= end; i += 1) {
        try {
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivFromNumber(i) }, cryptoKey, cipherBytes);
            if (decrypted) {
                return { clearText: decoder ? decoder.decode(decrypted) : '', took: toSecondsString(now() - began) };
            }
        } catch (err) {
            // ignore and continue
        }
    }
    return null;
}

function extractMaxNumber(challenge) {
    if (!challenge) {
        return 0;
    }
    let raw = challenge.maxnumber;
    if (raw === undefined) {
        raw = challenge.maxNumber;
    }
    if (raw === undefined) {
        raw = challenge.max;
    }
    if (typeof raw !== 'number' || raw < 0) {
        return 0;
    }
    return Math.floor(raw);
}

function createPayload(challenge, result) {
    const took = result && typeof result.took === 'string' ? result.took : '0.00';
    const payload = {
        algorithm: challenge.algorithm || 'SHA-256',
        challenge: challenge.challenge,
        salt: challenge.salt,
        signature: Object.prototype.hasOwnProperty.call(challenge, 'signature') ? (challenge.signature || null) : null,
        number: result.number,
        took: took
    };
    if (result.clearText) {
        payload.clearText = result.clearText;
    }
    return base64Encode(JSON.stringify(payload));
}

export function createAltchaSolver(options) {
    options = options || {};
    let challengeUrl = options.challengeUrl || DEFAULT_CHALLENGE_URL;
    const credentials = options.credentials !== undefined ? options.credentials : 'include';
    const requestedWorkers = typeof options.maxWorkers === 'number' && options.maxWorkers > 0 ? Math.floor(options.maxWorkers) : DEFAULT_MAX_WORKERS;
    const workerLimit = Math.max(1, Math.min(MAX_WORKERS, requestedWorkers));
    const supportsWorkers = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    let workerUrl = null;

    function ensureWorkerUrl() {
        if (workerUrl) {
            return workerUrl;
        }
        if (!supportsWorkers) {
            return null;
        }
        try {
            const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
            workerUrl = URL.createObjectURL(blob);
        } catch (err) {
            workerUrl = null;
        }
        return workerUrl;
    }

    function revokeWorkerUrl() {
        if (workerUrl) {
            try {
                URL.revokeObjectURL(workerUrl);
            } catch (err) {
                // ignore revoke errors
            }
            workerUrl = null;
        }
    }

    function fetchChallenge() {
        return fetch(challengeUrl, { credentials: credentials }).then(function (res) {
            if (!res || !res.ok) {
                throw new Error('Failed to fetch ALTCHA challenge: ' + (res ? res.status : 'network error'));
            }
            return res.json();
        });
    }

    function solveWithWorkers(challenge) {
        const url = ensureWorkerUrl();
        if (!url) {
            return Promise.reject(new Error('ALTCHA workers are not supported in this environment.'));
        }
        if (!hasWebCrypto() || !hasTextEncoder()) {
            return Promise.reject(new Error('Required browser features for ALTCHA are unavailable.'));
        }
        const maxNumber = extractMaxNumber(challenge);
        const rangeSize = maxNumber + 1;
        const workerCount = Math.max(1, Math.min(workerLimit, rangeSize));
        const segmentSize = Math.max(1, Math.ceil(rangeSize / workerCount));
        let payload;
        if (challenge && typeof challenge.obfuscated === 'string') {
            payload = { obfuscated: challenge.obfuscated, key: challenge.key || '' };
        } else {
            payload = {
                algorithm: challenge.algorithm || 'SHA-256',
                challenge: challenge.challenge || '',
                salt: challenge.salt || ''
            };
        }
        const startTime = now();
        return new Promise(function (resolve, reject) {
            let solved = false;
            let completed = 0;
            const workers = [];

            function cleanup() {
                for (let i = 0; i < workers.length; i += 1) {
                    try {
                        workers[i].terminate();
                    } catch (err) {
                        // ignore terminate errors
                    }
                }
                workers.length = 0;
            }

            function handleSuccess(result) {
                if (solved) {
                    return;
                }
                solved = true;
                cleanup();
                if (!result || typeof result.number !== 'number') {
                    reject(new Error('ALTCHA solver failed to produce a number.'));
                    return;
                }
                const tookString = typeof result.took === 'number' ? toSecondsString(result.took) : (typeof result.took === 'string' ? result.took : toSecondsString(now() - startTime));
                resolve({ number: result.number, took: tookString, clearText: result.clearText });
            }

            function handleFailure(error) {
                if (solved) {
                    return;
                }
                solved = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error || 'ALTCHA worker error')));
            }

            for (let index = 0; index < workerCount; index += 1) {
                (function (workerIndex) {
                    const start = workerIndex * segmentSize;
                    const end = Math.min(maxNumber, start + segmentSize - 1);
                    if (start > end) {
                        completed += 1;
                        if (completed === workerCount && !solved) {
                            handleFailure(new Error('ALTCHA solver exhausted all ranges without success.'));
                        }
                        return;
                    }
                    let worker;
                    try {
                        worker = new Worker(url);
                    } catch (err) {
                        handleFailure(err);
                        return;
                    }
                    workers.push(worker);
                    worker.onmessage = function (event) {
                        const data = event ? event.data : null;
                        if (data && data.error) {
                            handleFailure(new Error(String(data.error)));
                            return;
                        }
                        if (data && typeof data.number === 'number') {
                            handleSuccess(data);
                            return;
                        }
                        completed += 1;
                        if (!solved && completed === workerCount) {
                            handleFailure(new Error('ALTCHA solver did not find a valid number.'));
                        }
                    };
                    worker.onerror = function (event) {
                        handleFailure(event && event.message ? new Error(event.message) : new Error('ALTCHA worker error'));
                    };
                    try {
                        worker.postMessage({ type: 'work', payload: payload, start: start, max: end });
                    } catch (err) {
                        handleFailure(err);
                    }
                })(index);
            }
        });
    }

    function solveSequential(challenge) {
        if (!hasWebCrypto() || !hasTextEncoder()) {
            return Promise.reject(new Error('Required browser features for ALTCHA are unavailable.'));
        }
        const encoder = new TextEncoder();
        const maxNumber = extractMaxNumber(challenge);
        if (challenge && typeof challenge.obfuscated === 'string') {
            return solveObfuscatedSequential({ obfuscated: challenge.obfuscated, key: challenge.key || '' }, 0, maxNumber, encoder);
        }
        return solvePowSequential({
            algorithm: challenge.algorithm || 'SHA-256',
            challenge: challenge.challenge || '',
            salt: challenge.salt || ''
        }, 0, maxNumber, encoder);
    }

    async function solveChallenge(challenge) {
        try {
            const workerResult = await solveWithWorkers(challenge);
            if (workerResult && typeof workerResult.number === 'number') {
                return workerResult;
            }
            throw new Error('ALTCHA worker returned an invalid result.');
        } catch (workerError) {
            const sequentialResult = await solveSequential(challenge);
            if (sequentialResult && typeof sequentialResult.number === 'number') {
                return sequentialResult;
            }
            throw workerError;
        }
    }

    async function generateToken() {
        const challenge = await fetchChallenge();
        const result = await solveChallenge(challenge);
        if (!result || typeof result.number !== 'number') {
            throw new Error('ALTCHA solver failed to obtain a valid solution.');
        }
        const payload = createPayload(challenge, result);
        return 'alt:' + payload;
    }

    return {
        getChallenge: fetchChallenge,
        solve: solveChallenge,
        generateToken: generateToken,
        dispose: revokeWorkerUrl
    };
}
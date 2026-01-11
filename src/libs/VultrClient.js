/**
 * vultrClient.js
 */
export const PING_ENDPOINT = '/ping';
export const PING_TIMEOUT_MS = 100;
export const MAX_PING_SAMPLES = 10;
export const PING_UPDATE_INTERVAL_MS = 5000;
export const SERVER_LIST_VERSION = '1.26';

export function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

export function normalizeGameEntry(game, fallbackCapacity) {
    const normalized = Object.assign({}, game);

    const playerCount = isFiniteNumber(normalized.playerCount) ? normalized.playerCount : 0;
    const capacitySource = isFiniteNumber(normalized.playerCapacity)
        ? normalized.playerCapacity
        : (isFiniteNumber(normalized.maxPlayers) ? normalized.maxPlayers : fallbackCapacity);

    normalized.playerCount = playerCount;
    normalized.playerCapacity = isFiniteNumber(capacitySource) ? capacitySource : fallbackCapacity;
    normalized.isPrivate = !!normalized.isPrivate;

    return normalized;
}

export function normalizeDomain(domain) {
    if (!domain) {
        return 'moomoo.io';
    }
    return String(domain).replace(/^\.+/, '').toLowerCase();
}

export function detectApiPrefix(hostname) {
    if (typeof hostname !== 'string') {
        return 'api';
    }

    var host = hostname.toLowerCase();

    if (/sandbox\d*\.moomoo\.io$/.test(host) || host === 'sandbox.moomoo.io') {
        return 'api-sandbox';
    }

    if (/dev\d*\.moomoo\.io$/.test(host) || host === 'dev.moomoo.io') {
        return 'api-dev';
    }

    return 'api';
}

export function resolveApiBase(baseDomain) {
    var domain = normalizeDomain(baseDomain);
    var prefix = 'api';
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        prefix = detectApiPrefix(window.location.hostname);
    }

    return 'https://' + prefix + '.' + domain;
}

const concat = (x, y) => x.concat(y);
const flatMap = (f, xs) => xs.map(f).reduce(concat, []);
if (typeof Array.prototype.flatMap !== 'function') {
    Array.prototype.flatMap = function (f) {
        return flatMap(f, this);
    };
}

export default function VultrClient(baseUrl, devPort, lobbySize, lobbySpread, rawIPs) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
        window.location.hostname = '127.0.0.1';
    }

    this.debugLog = false;

    this.baseUrl = baseUrl;
    this.apiBase = resolveApiBase(baseUrl);
    this.lobbySize = lobbySize;
    this.devPort = devPort;
    this.lobbySpread = lobbySpread;
    this.rawIPs = !!rawIPs;

    this.server = undefined;
    this.gameIndex = undefined;
    this.password = undefined;

    this.callback = undefined;
    this.errorCallback = undefined;

    this.connected = false;
    this.switchingServers = false;

    this.servers = {};
    this.defaultSelection = null;

    this._pingInterval = null;
    this._serverLoadPromise = null;
}

VultrClient.prototype.regionInfo = {
    0: {
        name: 'Local',
        latitude: 0,
        longitude: 0
    },
    'vultr:1': {
        name: 'New Jersey',
        latitude: 40.1393329,
        longitude: -75.8521818
    },
    'vultr:2': {
        name: 'Chicago',
        latitude: 41.8339037,
        longitude: -87.872238
    },
    'vultr:3': {
        name: 'Dallas',
        latitude: 32.8208751,
        longitude: -96.8714229
    },
    'vultr:4': {
        name: 'Seattle',
        latitude: 47.6149942,
        longitude: -122.4759879
    },
    'vultr:5': {
        name: 'Los Angeles',
        latitude: 34.0207504,
        longitude: -118.691914
    },
    'vultr:6': {
        name: 'Atlanta',
        latitude: 33.7676334,
        longitude: -84.5610332
    },
    'vultr:7': {
        name: 'Amsterdam',
        latitude: 52.3745287,
        longitude: 4.7581878
    },
    'vultr:8': {
        name: 'London',
        latitude: 51.5283063,
        longitude: -0.382486
    },
    'vultr:9': {
        name: 'Frankfurt',
        latitude: 50.1211273,
        longitude: 8.496137
    },
    'vultr:12': {
        name: 'Silicon Valley',
        latitude: 37.4024714,
        longitude: -122.3219752
    },
    'vultr:19': {
        name: 'Sydney',
        latitude: -33.8479715,
        longitude: 150.651084
    },
    'vultr:24': {
        name: 'Paris',
        latitude: 48.8588376,
        longitude: 2.2773454
    },
    'vultr:25': {
        name: 'Tokyo',
        latitude: 35.6732615,
        longitude: 139.569959
    },
    'vultr:39': {
        name: 'Miami',
        latitude: 25.7823071,
        longitude: -80.3012156
    },
    'vultr:40': {
        name: 'Singapore',
        latitude: 1.3147268,
        longitude: 103.7065876
    }
};

VultrClient.prototype.start = async function (serverOverride, callback, errorCallback) {
    if (typeof serverOverride === 'function') {
        errorCallback = callback;
        callback = serverOverride;
        serverOverride = undefined;
    }

    this.callback = callback;
    this.errorCallback = errorCallback;
    this.connected = false;

    try {
        await this.loadServers();
    } catch (error) {
        this.log('Failed to load server data', error);
        if (this.errorCallback) {
            this.errorCallback(error && error.message ? error.message : 'Failed to load servers');
        }
        return;
    }

    const parsed = this.parseServerQuery(serverOverride);
    let selection;
    if (parsed.length) {
        selection = {
            region: parsed[0],
            identifier: parsed[1],
            gameIndex: parsed[2],
            password: parsed[3]
        };
        this.log('Found server in query.');
    } else if (this.defaultSelection) {
        selection = this.defaultSelection;
    } else {
        selection = this.findDefaultSelection();
    }

    if (!selection) {
        if (this.errorCallback) {
            this.errorCallback('Unable to find server');
        }
        return;
    }

    this.password = selection.password || undefined;
    this.connect(selection.region, selection.identifier, selection.gameIndex || 0);
};

VultrClient.prototype.loadServers = async function () {
    if (this._serverLoadPromise) {
        return this._serverLoadPromise;
    }

    const request = this.fetchServerList().then((data) => {
        const list = Array.isArray(data) ? data : (data && data.servers);
        if (!Array.isArray(list)) {
            throw new Error('Invalid server data format');
        }
        return this.processServers(list);
    }).catch((error) => {
        this._serverLoadPromise = null;
        throw error;
    });

    this._serverLoadPromise = request;
    return request;
};

VultrClient.prototype.getServerListUrl = function () {
    return this.apiBase + '/servers?v=' + SERVER_LIST_VERSION;
};

VultrClient.prototype.fetchServerList = function () {
    const url = this.getServerListUrl();
    return fetch(url).then(function (response) {
        if (!response.ok) {
            throw new Error('Failed to load server list: ' + response.status);
        }
        return response.json();
    });
};

VultrClient.prototype.processServers = function (serverList) {
    if (this._pingInterval) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
    }

    const grouped = {};
    for (let i = 0; i < serverList.length; i++) {
        const raw = serverList[i];
        if (!raw) continue;

        const server = Object.assign({}, raw);
        server.region = this.normalizeRegion(server.region);

        const rawGames = Array.isArray(server.games) ? server.games : [];
        const normalizedGames = rawGames.map((game) => normalizeGameEntry(game, this.lobbySize));

        if (normalizedGames.length === 0 && isFiniteNumber(server.playerCapacity) && isFiniteNumber(server.playerCount)) {
            server.games = [];
        } else {
            server.games = normalizedGames;
            const totals = normalizedGames.reduce((accumulator, game) => {
                accumulator.count += game.playerCount;
                accumulator.capacity += game.playerCapacity;
                return accumulator;
            }, { count: 0, capacity: 0 });

            server.playerCount = isFiniteNumber(server.playerCount) ? server.playerCount : totals.count;
            server.playerCapacity = isFiniteNumber(server.playerCapacity) ? server.playerCapacity : totals.capacity;
        }

        if (typeof server.index !== 'number' && typeof server.name === 'string') {
            const parsedIndex = parseInt(server.name, 10);
            if (!isNaN(parsedIndex)) {
                server.index = parsedIndex;
            }
        }

        server.pings = Array.isArray(server.pings) ? server.pings.slice() : [];
        server.ping = isFiniteNumber(server.ping) ? server.ping : undefined;

        const regionServers = grouped[server.region] || (grouped[server.region] = []);
        regionServers.push(server);
    }

    const regions = Object.keys(grouped);
    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        grouped[region].sort(function (a, b) {
            return (b.playerCount || 0) - (a.playerCount || 0);
        });
    }

    this.servers = grouped;

    const finalizeSelection = () => {
        Object.keys(this.servers).forEach((region) => {
            this.servers[region].forEach((server) => {
                server.selected = false;
            });
        });

        let parsed = this.parseServerQuery();
        let selection;
        if (parsed.length) {
            const server = this.findServer(parsed[0], parsed[1]);
            if (server) {
                server.selected = true;
                selection = {
                    region: parsed[0],
                    identifier: parsed[1],
                    gameIndex: parsed[2],
                    password: parsed[3]
                };
            }
        }
        if (!selection) {
            selection = this.findDefaultSelection();
            if (selection) {
                const server = this.findServer(selection.region, selection.identifier);
                if (server) {
                    server.selected = true;
                }
                try {
                    const href = this.generateHref(selection.region, selection.identifier, selection.gameIndex, selection.password || this.password);
                    window.history.replaceState(document.title, document.title, href);
                } catch (error) {
                    this.log('Failed to update history with default server', error);
                }
            }
        }
        this.defaultSelection = selection || null;
    };

    const runPingCycle = () => {
        return this.updatePings().catch(() => {}).then(() => {
            finalizeSelection();
        });
    };

    runPingCycle();

    if (typeof fetch === 'function') {
        this._pingInterval = setInterval(runPingCycle, PING_UPDATE_INTERVAL_MS);
    }

    return Promise.resolve();
};

VultrClient.prototype.updatePings = async function () {
    if (!this.servers) {
        return;
    }
    const regions = Object.keys(this.servers);
    await Promise.all(regions.map((region) => this.pingRegion(region)));
    this.defaultSelection = this.findDefaultSelection();
};

VultrClient.prototype.pingRegion = async function (region) {
    const servers = this.servers[region];
    if (!Array.isArray(servers) || servers.length === 0) {
        return;
    }
    const target = servers[0];
    if (!target) {
        return;
    }
    await this.pingServer(target);
};

VultrClient.prototype.pingServer = async function (server) {
    if (typeof fetch !== 'function') {
        return;
    }

    const address = this.serverAddress(server, { forceSecure: true });
    if (!address) {
        return;
    }

    const url = 'https://' + address + PING_ENDPOINT;
    const start = Date.now();

    await Promise.race([
        fetch(url, { method: 'GET', mode: 'cors' }).catch(() => {}),
        new Promise(function (resolve) {
            setTimeout(resolve, PING_TIMEOUT_MS);
        })
    ]).catch(() => {});

    const elapsed = Date.now() - start;
    if (!isFinite(elapsed) || elapsed <= 0) {
        return;
    }

    server.pings = server.pings || [];
    server.pings.push(elapsed);
    if (server.pings.length > MAX_PING_SAMPLES) {
        server.pings.shift();
    }
    server.ping = Math.floor(server.pings.reduce(function (sum, value) {
        return sum + value;
    }, 0) / server.pings.length);
};

VultrClient.prototype.flattenServers = function () {
    const grouped = this.servers || {};
    const regions = Object.keys(grouped);
    var flattened = [];
    for (var i = 0; i < regions.length; i++) {
        const list = grouped[regions[i]];
        if (Array.isArray(list)) {
            flattened = flattened.concat(list);
        }
    }
    return flattened;
};

VultrClient.prototype.findDefaultSelection = function () {
    const servers = this.flattenServers();
    if (servers.length === 0) {
        return null;
    }

    const available = servers.filter(function (server) {
        return !(typeof server.playerCapacity === 'number' && server.playerCount >= server.playerCapacity);
    });
    const pool = available.length ? available : servers;

    pool.sort(function (a, b) {
        const pingA = typeof a.ping === 'number' ? a.ping : Infinity;
        const pingB = typeof b.ping === 'number' ? b.ping : Infinity;
        if (pingA !== pingB) {
            return pingA - pingB;
        }
        return (b.playerCount || 0) - (a.playerCount || 0);
    });

    const candidate = pool[0];
    if (!candidate) {
        return null;
    }

    const selection = this.seekServer(candidate.region);
    if (!selection) {
        return null;
    }

    return {
        region: selection[0],
        identifier: selection[1],
        gameIndex: selection[2],
        password: this.password
    };
};

VultrClient.prototype.parseServerQuery = function (serverOverride) {
    const params = new URLSearchParams(location.search); 

    if (serverOverride && typeof serverOverride === 'object') {
        const region = this.normalizeRegion(serverOverride.region || serverOverride[0]);
        const identifier = serverOverride.identifier != null ? serverOverride.identifier : serverOverride[1];
        const gameIndex = serverOverride.gameIndex != null ? serverOverride.gameIndex : parseInt(serverOverride[2], 10) || 0;
        const password = serverOverride.password != null ? serverOverride.password : (serverOverride[3] != null ? serverOverride[3] : params.get('password'));
        if (region == null || identifier == null) {
            return [];
        }
        return [region, identifier, gameIndex, password];
    }

    const raw = typeof serverOverride === 'string' && serverOverride.length ? serverOverride : params.get('server');
    if (typeof raw !== 'string') {
        return [];
    }

    const split = raw.split(':');
    if (split.length < 2) {
        if (this.errorCallback) {
            this.errorCallback('Invalid server parameter in ' + raw);
        }
        return [];
    }

    const region = this.normalizeRegion(split[0]);
    let identifier = split[1];
    let gameIndex = 0;

    if (split.length >= 3) {
        const parsedIndex = parseInt(split[1], 10);
        const parsedGame = parseInt(split[2], 10);

        if (!isNaN(parsedIndex)) {
            identifier = parsedIndex;
        }
        if (!isNaN(parsedGame)) {
            gameIndex = parsedGame;
        } else if (typeof split[2] === 'string' && split[2].length > 0) {
            const fallbackGame = parseInt(split[2].split('-').pop(), 10);
            if (!isNaN(fallbackGame)) {
                gameIndex = fallbackGame;
            }
        }
    }

    const password = params.get('password');
    return [region, identifier, gameIndex, password];
};

VultrClient.prototype.normalizeRegion = function (region) {
    if (region == null) {
        return region;
    }
    if (region === 0 || region === '0') {
        return 0;
    }
    if (typeof region !== 'string') {
        return region;
    }
    if (region.startsWith('vultr:') || region.startsWith('do:')) {
        return region;
    }

    const candidates = ['vultr:' + region, 'do:' + region];
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if ((this.servers && this.servers[candidate]) || this.regionInfo[candidate]) {
            return candidate;
        }
    }
    return region;
};

VultrClient.prototype.findServer = function (region, identifier) {
    const serverList = this.servers[region];
    if (!Array.isArray(serverList)) {
        if (this.errorCallback) {
            this.errorCallback('No server list for region ' + region);
        }
        return undefined;
    }

    for (let i = 0; i < serverList.length; i++) {
        const server = serverList[i];
        if (server.index != null && String(server.index) === String(identifier)) {
            return server;
        }
        if (server.name != null && String(server.name) === String(identifier)) {
            return server;
        }
    }

    console.warn('Could not find server in region ' + region + ' with identifier ' + identifier + '.');
    return undefined;
};

VultrClient.prototype.seekServer = function (region, isPrivate, gameMode) {
    if (gameMode == null) {
        gameMode = 'random';
    }
    if (isPrivate == null) {
        isPrivate = false;
    }

    if (!this.servers || !Array.isArray(this.servers[region])) {
        if (this.errorCallback) {
            this.errorCallback('No server list for region ' + region);
        }
        return null;
    }

    const gameModeList = ['random'];
    const lobbySize = this.lobbySize;
    const lobbySpread = this.lobbySpread;

    const options = this.servers[region].flatMap(function (server) { 
        let localIndex = 0;
        const hasGameList = Array.isArray(server.games) && server.games.length > 0;
        const games = hasGameList ? server.games : [{
            playerCount: server.playerCount,
            playerCapacity: server.playerCapacity,
            isPrivate: server.isPrivate,
            fallback: true
        }];
        const totalGames = games.length;
        return games.map(function (game) {
            const currentIndex = localIndex++;
            return {
                region: server.region,
                index: (server.index || 0) * Math.max(totalGames, 1) + currentIndex,
                serverIndex: server.index,
                serverName: server.name,
                gameIndex: currentIndex,
                gameCount: totalGames,
                playerCount: isFiniteNumber(game.playerCount) ? game.playerCount : 0,
                playerCapacity: isFiniteNumber(game.playerCapacity) ? game.playerCapacity : lobbySize,
                isPrivate: !!game.isPrivate
            };
        });
    }).filter(function (entry) {
        return !entry.isPrivate;
    }).filter(function (entry) {
        if (isPrivate) {
            return entry.playerCount === 0 && entry.gameIndex >= entry.gameCount / 2;
        }
        return true;
    }).filter(function (entry) {
        if (gameMode === 'random') {
            return true;
        }
        return gameModeList[entry.index % gameModeList.length].key === gameMode;
    }).sort(function (a, b) {
        return b.playerCount - a.playerCount;
    });

    let filteredOptions = options;

    if (isPrivate) {
        filteredOptions = filteredOptions.filter(function (entry) {
            return entry.playerCount === 0 && entry.gameIndex >= entry.gameCount / 2;
        });
    } else {
        const openOptions = filteredOptions.filter(function (entry) {
            if (!isFiniteNumber(entry.playerCapacity)) {
                return entry.playerCount < lobbySize;
            }
            return entry.playerCount < entry.playerCapacity;
        });

        if (openOptions.length > 0) {
            filteredOptions = openOptions;
        }
    }

    if (isPrivate) {
        filteredOptions = filteredOptions.reverse();
    }

    if (filteredOptions.length === 0) {
        if (this.errorCallback) {
            this.errorCallback('No open servers.');
        }
        return null;
    }

    const spread = Math.min(lobbySpread, filteredOptions.length);
    let selectionIndex = Math.floor(Math.random() * spread);
    selectionIndex = Math.min(selectionIndex, filteredOptions.length - 1);

    const selected = filteredOptions[selectionIndex];
    const regionKey = selected.region;
    const identifier = selected.serverIndex != null ? selected.serverIndex : selected.serverName;
    const gameIndex = selected.gameIndex;

    this.log('Found server.');

    return [regionKey, identifier, gameIndex];
};

VultrClient.prototype.connect = function (region, identifier, gameIndex) {
    if (this.connected) {
        return;
    }

    const server = this.findServer(region, identifier);
    if (!server) {
        return;
    }

    this.log('Connecting to server', server, 'with game index', gameIndex);

    if (Array.isArray(server.games) && server.games[gameIndex]) {
        const targetGame = server.games[gameIndex];
        if (isFiniteNumber(targetGame.playerCapacity) && targetGame.playerCount >= targetGame.playerCapacity) { 
            if (this.errorCallback) {
                this.errorCallback('Server is already full.');
            }
            return;
        }
    }

    try {
        const href = this.generateHref(region, identifier, gameIndex, this.password);
        window.history.replaceState(document.title, document.title, href);
    } catch (error) {
        this.log('Failed to update history state', error);
    }

    this.server = server;
    this.gameIndex = gameIndex;
    this.connected = true;

    const address = this.serverAddress(server);
    const port = this.serverPort(server);
    this.log('Calling callback with address', address, 'on port', port, 'with game index', gameIndex);

    if (this.callback) {
        this.callback(address, port, gameIndex);
    }
};

VultrClient.prototype.switchServer = function (region, identifier, gameIndex, password) {
    this.switchingServers = true;
    const href = this.generateHref(region, identifier, gameIndex, password);
    window.location.href = href;
};

VultrClient.prototype.generateHref = function (region, identifier, gameIndex, password) {
    const normalizedRegion = this.normalizeRegion(region);
    const strippedRegion = this.stripRegion(normalizedRegion);
    const base = window.location.href.split('?')[0]; 
    let href = base + '?server=' + strippedRegion + ':' + identifier;
    if (typeof gameIndex === 'number' && !isNaN(gameIndex)) {
        href += ':' + gameIndex;
    }
    if (password) {
        href += '&password=' + encodeURIComponent(password);
    }
    return href;
};

VultrClient.prototype.serverAddress = function (server, options) {
    options = options || {};
    const forceSecure = !!options.forceSecure;

    if (!server) {
        return null;
    }

    if (server.region === 0 || server.region === '0') {
        return window.location.hostname;
    }

    if (this.rawIPs && server.ip) {
        if (forceSecure) {
            return 'ip_' + this.ipToHex(server.ip) + '.' + this.baseUrl;
        }
        return server.ip;
    }

    if (server.key && server.region) {
        return server.key + '.' + this.stripRegion(server.region) + '.' + this.baseUrl;
    }

    if (server.ip) {
        const encoded = server.ip.indexOf('.') >= 0 ? this.ipToHex(server.ip) : server.ip;
        return 'ip_' + encoded + '.' + this.baseUrl;
    }

    if (server.host) {
        return server.host;
    }

    if (server.region) {
        return this.stripRegion(server.region) + '.' + this.baseUrl;
    }

    return this.baseUrl;
};

VultrClient.prototype.serverPort = function (server) {
    if (!server) {
        return null;
    }

    if (server.port != null) {
        return server.port;
    }

    if (server.region === 0 || server.region === '0') {
        return this.devPort;
    }

    return location.protocol && location.protocol.startsWith('https') ? 443 : 80;
};

VultrClient.prototype.ipToHex = function (ip) {
    return ip.split('.').map(function (component) {
        return ('00' + parseInt(component, 10).toString(16)).substr(-2);
    }).join('').toLowerCase();
};

/*
VultrClient.prototype.hashIP = function (ip) {
    return md5(this.ipToHex(ip));
};
*/

VultrClient.prototype.log = function () {
    if (this.debugLog) {
        return console.log.apply(console, arguments);
    }
    if (console.verbose) {
        return console.verbose.apply(console, arguments);
    }
};

VultrClient.prototype.stripRegion = function (region) {
    if (typeof region === 'string') {
        if (region.startsWith('vultr:')) {
            return region.slice(6);
        }
        if (region.startsWith('do:')) {
            return region.slice(3);
        }
    }
    return region;
};

if (typeof window !== 'undefined') {
    window.testVultrClient = function () {
        var assertIndex = 1;

        function assert(actual, expected) {
            actual = '' + actual;
            expected = '' + expected;
            if (actual === expected) {
                console.log('Assert ' + assertIndex + ' passed.');
            } else {
                console.warn('Assert ' + assertIndex + ' failed. Expected ' + expected + ', got ' + actual + '.');
            }
            assertIndex++;
        }

        function generateServerList(regions) {
            var servers = [];
            for (var region in regions) {
                if (!regions.hasOwnProperty(region)) continue;
                var regionServers = regions[region];
                for (var i = 0; i < regionServers.length; i++) {
                    servers.push({
                        ip: region + ':' + i,
                        region: region,
                        index: i,
                        games: regionServers[i].map(function (players) {
                            return {
                                playerCount: players,
                                playerCapacity: 100,
                                isPrivate: false
                            };
                        })
                    });
                }
            }
            return servers;
        }

        var maxPlayers = 5;
        var client = new VultrClient('test.io', -1, maxPlayers, 1, false); 
        client.processServers(generateServerList({
            0: [[0], [0]],
            1: [[4], [5]]
        }));

        client.servers = {
            0: [{
                region: 0,
                index: 0,
                games: [{ playerCount: 0, playerCapacity: maxPlayers }]
            }],
            1: [{
                region: 1,
                index: 0,
                games: [{ playerCount: 4, playerCapacity: maxPlayers }]
            }],
            2: [{
                region: 2,
                index: 0,
                games: [{ playerCount: maxPlayers, playerCapacity: maxPlayers + 5 }]
            }]
        };

        assert(client.seekServer(0)[0], 0);
        assert(client.seekServer(1)[0], 1);
        assert(client.seekServer(2)[0], 2);

        console.log('Tests passed.');
    };
}
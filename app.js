'use strict';

window.loadedScript = true;
var isProd = location.hostname !== "localhost" && location.hostname !== "127.0.0.1" && !location.hostname.startsWith("192.168.");
var requiresCaptcha = isProd;
var altchaToken = null;
var altchaTokenPromise = null;
var altchaSolver = null;
var altchaRetryTimer = null;
import {
    createAltchaSolver
} from "./src/libs/captcha/altchaSolver.js";
import MainScript from "./sys/mainSystem.js"
import io from "./src/libs/io-client.js"
import UTILS from "./src/libs/utils.js"
import {
    animText,
    TextManager
} from "./src/libs/animText.js";
import config from "./src/config.js"
import PACKETS from "./src/data/packetList.js";
import GameObject from "./src/data/gameObject.js"
import items from "./src/data/items.js"
import ObjectManager from "./src/data/objectManager.js"
import Player from "./src/data/player.js"
import store from "./src/data/store.js"
import Projectile from "./src/data/projectile.js"
import ProjectileManager from "./src/data/projectileManager.js"
import VultrClient from "./src/libs/VultrClient.js"

var textManager = new TextManager();
var SERVER_PACKETS = PACKETS.SERVER;
var CLIENT_PACKETS = PACKETS.CLIENT;

var vultrClient = new VultrClient("moomoo.io", 3000, config.maxPlayers, 5, false);
vultrClient.debugLog = false;

var connected = false;
var startedConnecting = false;

function connectSocketIfReady() {
    if (connected || startedConnecting) {
        return;
    }

    if (requiresCaptcha) {
        if (!captchaReady || !altchaToken) {
            return;
        }
    }

    startedConnecting = true;

    var token = null;
    if (requiresCaptcha && altchaToken) {
        token = altchaToken;
    }

    connectSocket(token);
}

function connectSocket(token) {
    vultrClient.start(function(address, port, gameIndex) {

        var protocol = isProd ? "wss" : "ws";
        var wsAddress = protocol + "://" + address;
        if (port) {
            var shouldAppendPort = (protocol === "wss" && port !== 443) || (protocol === "ws" && port !== 80);
            if (shouldAppendPort) {
                wsAddress += ":" + port;
            }
        }

        var queryParams = [];
        if (token) {
            queryParams.push("token=" + encodeURIComponent(token));
        }
        if (queryParams.length) {
            wsAddress += "/?" + queryParams.join("&");
        }

        io.connect(wsAddress, function(error) {
            pingSocket();
            setInterval(() => pingSocket(), 2500);

            if (error) {
                disconnect(error);
            } else {
                connected = true;
                startGame();
            }
        }, {
            [SERVER_PACKETS.INIT_DATA]: setInitData,
            [SERVER_PACKETS.DISCONNECT]: disconnect,
            [SERVER_PACKETS.SETUP_GAME]: setupGame,
            [SERVER_PACKETS.ADD_PLAYER]: addPlayer,
            [SERVER_PACKETS.REMOVE_PLAYER]: removePlayer,
            [SERVER_PACKETS.UPDATE_PLAYERS]: updatePlayers,
            [SERVER_PACKETS.UPDATE_LEADERBOARD]: updateLeaderboard,
            [SERVER_PACKETS.LOAD_GAME_OBJECT]: loadGameObject,
            [SERVER_PACKETS.LOAD_AI]: loadAI,
            [SERVER_PACKETS.ANIMATE_AI]: animateAI,
            [SERVER_PACKETS.GATHER_ANIMATION]: playerHitAnimation,
            [SERVER_PACKETS.WIGGLE_GAME_OBJECT]: wiggleGameObject,
            [SERVER_PACKETS.SHOOT_TURRET]: shootTurret,
            [SERVER_PACKETS.UPDATE_PLAYER_VALUE]: updatePlayerValue,
            [SERVER_PACKETS.UPDATE_HEALTH]: updateHealth,
            [SERVER_PACKETS.KILL_PLAYER]: killPlayer,
            [SERVER_PACKETS.KILL_OBJECT]: killObject,
            [SERVER_PACKETS.KILL_OBJECTS]: killObjects,
            [SERVER_PACKETS.UPDATE_ITEM_COUNTS]: updateItemCounts,
            [SERVER_PACKETS.UPDATE_AGE]: updateAge,
            [SERVER_PACKETS.UPDATE_UPGRADES]: updateUpgrades,
            [SERVER_PACKETS.UPDATE_ITEMS]: updateItems,
            [SERVER_PACKETS.ADD_PROJECTILE]: addProjectile,
            [SERVER_PACKETS.REMOVE_PROJECTILE]: remProjectile,
            [SERVER_PACKETS.SERVER_SHUTDOWN_NOTICE]: serverShutdownNotice,
            [SERVER_PACKETS.ADD_ALLIANCE]: addAlliance,
            [SERVER_PACKETS.DELETE_ALLIANCE]: deleteAlliance,
            [SERVER_PACKETS.ALLIANCE_NOTIFICATION]: allianceNotification,
            [SERVER_PACKETS.SET_PLAYER_TEAM]: setPlayerTeam,
            [SERVER_PACKETS.SET_ALLIANCE_PLAYERS]: setAlliancePlayers,
            [SERVER_PACKETS.UPDATE_STORE_ITEMS]: updateStoreItems,
            [SERVER_PACKETS.RECEIVE_CHAT]: receiveChat,
            [SERVER_PACKETS.UPDATE_MINIMAP]: updateMinimap,
            [SERVER_PACKETS.SHOW_TEXT]: showText,
            [SERVER_PACKETS.PING_MAP]: pingMap,
            [SERVER_PACKETS.PING_RESPONSE]: pingSocketResponse
        });

        setupServerStatus();

        setTimeout(() => updateServerList(), 3 * 1000);
    }, function(error) {
        console.error("Vultr error:", error);
        alert("Error:\n" + error);
        disconnect("disconnected");
    });
}

function socketReady() {
    return (io.connected);
}

function clearAltchaRetryTimer() {
    if (altchaRetryTimer) {
        clearTimeout(altchaRetryTimer);
        altchaRetryTimer = null;
    }
}

function scheduleAltchaRetry(delay) {
    clearAltchaRetryTimer();
    altchaRetryTimer = setTimeout(function() {
        altchaRetryTimer = null;
        setupAltchaSolver();
    }, delay);
}

function requestAltchaToken() {
    if (!requiresCaptcha) {
        captchaReady = true;
        altchaToken = null;
        return Promise.resolve(null);
    }

    if (!altchaSolver) {
        return Promise.reject(new Error("ALTCHA solver unavailable"));
    }

    if (altchaTokenPromise) {
        return altchaTokenPromise;
    }

    captchaReady = false;
    altchaToken = null;
    if (enterGameButton) {
        enterGameButton.classList.add("disabled");
    }

    altchaTokenPromise = altchaSolver.generateToken().then(function(token) {
        altchaTokenPromise = null;
        altchaToken = token;
        captchaReady = true;
        clearAltchaRetryTimer();
        if (enterGameButton) {
            enterGameButton.classList.remove("disabled");
        }
        return token;
    }).catch(function(error) {
        altchaTokenPromise = null;
        throw error;
    });

    return altchaTokenPromise;
}

function setupAltchaSolver() {
    if (!requiresCaptcha) {
        captchaReady = true;
        connectSocketIfReady();
        return;
    }

    requestAltchaToken().then(function() {
        connectSocketIfReady();
    }).catch(function(error) {
        console.warn("Failed to generate ALTCHA token:", error);
        scheduleAltchaRetry(3000);
    });
}

function joinParty() {
    var currentKey = serverBrowser.value;
    var key = prompt("party key", currentKey);
    if (key) {
        window.onbeforeunload = undefined; // Don't ask to leave
        window.location.href = "/?server=" + key;
    }
}

var mathPI = Math.PI;
var mathPI2 = mathPI * 2;
var mathPI3 = mathPI * 3;
Math.lerpAngle = function(value1, value2, amount) {
    var difference = Math.abs(value2 - value1);
    if (difference > mathPI) {
        if (value1 > value2) {
            value2 += mathPI2;
        } else {
            value1 += mathPI2;
        }
    }
    var value = (value2 + ((value1 - value2) * amount));
    if (value >= 0 && value <= mathPI2)
        return value;
    return (value % mathPI2);
}

CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    if (r < 0)
        r = 0;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
}

var canStore;
if (typeof(Storage) !== "undefined") {
    canStore = true;
}

function saveVal(name, val) {
    if (canStore)
        localStorage.setItem(name, val);
}

function deleteVal(name) {
    if (canStore)
        localStorage.removeItem(name);
}

function getSavedVal(name) {
    if (canStore)
        return localStorage.getItem(name);
    return null;
}

window.checkTerms = function(yes) {
    if (yes) {
        saveVal("consent", 1);
    } else $("#consentShake").effect("shake");
};

var moofoll = getSavedVal("moofoll");

function follmoo() {
    if (!moofoll) {
        moofoll = true;
        saveVal("moofoll", 1);
    }
}
var useNativeResolution;
var showPing;
var playSound;
var pixelDensity = 1;
var delta, now, lastSent;
var lastUpdate = Date.now();
var keys, attackState;
var ais = [];
var players = [];
var alliances = [];
var gameObjects = [];
var projectiles = [];
var projectileManager = new ProjectileManager(Projectile, projectiles, players, ais, objectManager, items, config, UTILS);
import AiManager from "./src/data/aiManager.js"
import AI from "./src/data/ai.js"
var aiManager = new AiManager(ais, AI, players, items, null, config, UTILS);
var player, playerSID, tmpObj;
var macro = {}
var waterMult = 1;
var waterPlus = 0;
var mouseX = 0;
var mouseY = 0;
var controllingTouch = {
    id: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
};
var attackingTouch = {
    id: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
};
var camX, camY;
var tmpDir;
var skinColor = 0;
var maxScreenWidth = config.maxScreenWidth;
var maxScreenHeight = config.maxScreenHeight;
var screenWidth, screenHeight;
var inGame = false;
var adContainer = document.getElementById("ad-container");
var mainMenu = document.getElementById("mainMenu");
var enterGameButton = document.getElementById("enterGame");
var promoImageButton = document.getElementById("promoImg");
var partyButton = document.getElementById("partyButton");
var joinPartyButton = document.getElementById("joinPartyButton");
var settingsButton = document.getElementById("settingsButton");
var settingsButtonTitle = settingsButton.getElementsByTagName("span")[0];
var allianceButton = document.getElementById("allianceButton");
var storeButton = document.getElementById("storeButton");
var chatButton = document.getElementById("chatButton");
var gameCanvas = document.getElementById("gameCanvas");
var mainContext = gameCanvas.getContext("2d");
var serverBrowser = document.getElementById("serverBrowser");
var nativeResolutionCheckbox = document.getElementById("nativeResolution");
var showPingCheckbox = document.getElementById("showPing");
var playMusicCheckbox = document.getElementById("playMusic");
var pingDisplay = document.getElementById("pingDisplay");
var shutdownDisplay = document.getElementById("shutdownDisplay");
var menuCardHolder = document.getElementById("menuCardHolder");
var guideCard = document.getElementById("guideCard");
var loadingText = document.getElementById("loadingText");
var gameUI = document.getElementById("gameUI");
var actionBar = document.getElementById("actionBar");
var scoreDisplay = document.getElementById("scoreDisplay");
var foodDisplay = document.getElementById("foodDisplay");
var woodDisplay = document.getElementById("woodDisplay");
var stoneDisplay = document.getElementById("stoneDisplay");
var killCounter = document.getElementById("killCounter");
var leaderboardData = document.getElementById("leaderboardData");
var nameInput = document.getElementById("nameInput");
var itemInfoHolder = document.getElementById("itemInfoHolder");
var ageText = document.getElementById("ageText");
var ageBarBody = document.getElementById("ageBarBody");
var upgradeHolder = document.getElementById("upgradeHolder");
var upgradeCounter = document.getElementById("upgradeCounter");
var allianceMenu = document.getElementById("allianceMenu");
var allianceHolder = document.getElementById("allianceHolder");
var allianceManager = document.getElementById("allianceManager");
var mapDisplay = document.getElementById("mapDisplay");
var diedText = document.getElementById("diedText");
var skinColorHolder = document.getElementById("skinColorHolder");
var mapContext = mapDisplay.getContext("2d");
mapDisplay.width = 300;
mapDisplay.height = 300;
var storeMenu = document.getElementById("storeMenu");
var storeHolder = document.getElementById("storeHolder");
var noticationDisplay = document.getElementById("noticationDisplay");
var hats = store.hats;
var accessories = store.accessories;
var objectManager = new ObjectManager(GameObject, gameObjects, UTILS, config);
var outlineColor = "#525252";
var darkOutlineColor = "#3d3f42";
var outlineWidth = 5.5;
document.getElementById("promoImgHolder").remove();

altchaSolver = createAltchaSolver({
    challengeUrl: "https://api.moomoo.io/verify",
    credentials: "include",
    maxWorkers: 16
});

if (requiresCaptcha && enterGameButton) {
    enterGameButton.classList.add("disabled");
}

function setInitData(data) {
    alliances = data.teams;
}

var featuredYoutuber = document.getElementById('featuredYoutube');
var youtuberList = [{
    name: "Corrupt X",
    link: "https://www.youtube.com/channel/UC0UH2LfQvBSeH24bmtbmITw"
}, {
    name: "Tweak Big",
    link: "https://www.youtube.com/channel/UCbwvzJ38AndDTkoX8sD9YOw"
}, {
    name: "Arena Closer",
    link: "https://www.youtube.com/channel/UCazucVSJqW-kiHMIhQhD-QQ"
}, {
    name: "Godenot",
    link: "https://www.youtube.com/user/SirGodenot"
}, {
    name: "RajNoobTV",
    link: "https://www.youtube.com/channel/UCVLo9brXBWrCttMaGzvm0-Q"
}, {
    name: "TomNotTom",
    link: "https://www.youtube.com/channel/UC7z97RgHFJRcv2niXgArBDw"
}, {
    name: "Nation",
    link: "https://www.youtube.com/channel/UCSl-MBn3qzjrIvLNESQRk-g"
}, {
    name: "Pidyohago",
    link: "https://www.youtube.com/channel/UC04p8Mg8nDaDx04A9is2B8Q"
}, {
    name: "Enigma",
    link: "https://www.youtube.com/channel/UC5HhLbs3sReHo8Bb9NDdFrg"
}, {
    name: "Bauer",
    link: "https://www.youtube.com/channel/UCwU2TbJx3xTSlPqg-Ix3R1g"
}, {
    name: "iStealth",
    link: "https://www.youtube.com/channel/UCGrvlEOsQFViZbyFDE6t69A"
}, {
    name: "SICKmania",
    link: "https://www.youtube.com/channel/UCvVI98ezn4TpX5wDMZjMa3g"
}, {
    name: "LightThief",
    link: "https://www.youtube.com/channel/UCj6C_tiDeATiKd3GX127XoQ"
}, {
    name: "Fortish",
    link: "https://www.youtube.com/channel/UCou6CLU-szZA3Tb340TB9_Q"
}, {
    name: "巧克力",
    link: "https://www.youtube.com/channel/UCgL6J6oL8F69vm-GcPScmwg"
}, {
    name: "i Febag",
    link: "https://www.youtube.com/channel/UCiU6WZwiKbsnt5xmwr0OFbg"
}, {
    name: "GoneGaming",
    link: "https://www.youtube.com/channel/UCOcQthRanYcwYY0XVyVeK0g"
}];
var tmpYoutuber = youtuberList[UTILS.randInt(0, youtuberList.length - 1)];
// featuredYoutuber.innerHTML = "<a target='_blank' class='ytLink' href='" + tmpYoutuber.link + "'><i class='material-icons' style='vertical-align: top;'>&#xE064;</i> " + tmpYoutuber.name + "</a>";


var inWindow = true;
var didLoad = false;
var captchaReady = !requiresCaptcha;
window.onblur = function() {
    inWindow = false;
};
window.onfocus = function() {
    inWindow = true;
    if (player && player.alive) {
        resetMoveDir();
    }
};
window.onload = function() {
    didLoad = true;
    console.log("onload")
    setupAltchaSolver();
    connectSocketIfReady();

    if (requiresCaptcha) {
        setTimeout(function() {
            if (!startedConnecting) {
                alert("Captcha failed to load");
                window.location.reload();
            }
        }, 20 * 1000);
    }
};
gameCanvas.oncontextmenu = function() {
    return false;
};

function disconnect(reason) {
    connected = false;
    startedConnecting = false;
    io.close();
    showLoadingText(reason);
}

function showLoadingText(text) {
    mainMenu.style.display = "block";
    gameUI.style.display = "none";
    menuCardHolder.style.display = "none";
    diedText.style.display = "none";
    loadingText.style.display = "block";
    loadingText.innerHTML = text +
        "<a href='javascript:window.location.href=window.location.href' class='ytLink'>reload</a>";
}

function bindEvents() {
    UTILS.hookTouchEvents(enterGameButton);
    enterGameButton.addEventListener("click", function() {
        enterGame();
    })
    promoImageButton.onclick = UTILS.checkTrusted(function() {
        openLink('https://krunker.io/?play=SquidGame_KB');
    });
    UTILS.hookTouchEvents(promoImageButton);
    joinPartyButton.onclick = UTILS.checkTrusted(function() {
        setTimeout(function() {
            joinParty();
        }, 10);
    });
    UTILS.hookTouchEvents(joinPartyButton);
    settingsButton.onclick = UTILS.checkTrusted(function() {
        toggleSettings();
    });
    UTILS.hookTouchEvents(settingsButton);
    allianceButton.onclick = UTILS.checkTrusted(function() {
        toggleAllianceMenu();
    });
    UTILS.hookTouchEvents(allianceButton);
    storeButton.onclick = UTILS.checkTrusted(function() {
        toggleStoreMenu();
    });
    UTILS.hookTouchEvents(storeButton);
    chatButton.onclick = UTILS.checkTrusted(function() {
        toggleChat();
    });
    UTILS.hookTouchEvents(chatButton);
    mapDisplay.onclick = UTILS.checkTrusted(function() {
        sendMapPing();
    });
    UTILS.hookTouchEvents(mapDisplay);
}

var gamesPerServer = 1;

function setupServerStatus() {
    var tmpHTML = "";

    var overallTotal = 0;
    var regionCounter = 0;
    for (var region in vultrClient.servers) {
        var serverList = vultrClient.servers[region];

        var totalPlayers = 0;
        for (var i = 0; i < serverList.length; i++) {
            for (var j = 0; j < serverList[i].games.length; j++) {
                totalPlayers += serverList[i].games[j].playerCount;
            }
        }
        overallTotal += totalPlayers;

        var regionName = vultrClient.regionInfo[region]?.name;
        tmpHTML += "<option disabled>" + regionName + " - " + totalPlayers + " players</option>"

        for (var serverIndex = 0; serverIndex < serverList.length; serverIndex++) {
            var server = serverList[serverIndex];

            for (var gameIndex = 0; gameIndex < server.games.length; gameIndex++) {
                var game = server.games[gameIndex];
                var adjustedIndex = server.index * gamesPerServer + gameIndex + 1;
                var isSelected = vultrClient.server && vultrClient.server.region === server.region && vultrClient.server.index === server.index && vultrClient.gameIndex == gameIndex;
                var serverLabel = regionName + " " + adjustedIndex + " [" + Math.min(game.playerCount, config.maxPlayers) + "/" + config.maxPlayers + "]";


                let serverID = vultrClient.stripRegion(region) + ":" + serverIndex + ":" + gameIndex;
                if (isSelected) partyButton.getElementsByTagName("span")[0].innerText = serverID;
                let selected = isSelected ? "selected" : "";
                tmpHTML += "<option value='" + serverID + "' " + selected + ">" + serverLabel + "</option>";
            }
        }

        tmpHTML += "<option disabled></option>";

        regionCounter++;
    }

    tmpHTML += "<option disabled>All Servers - " + overallTotal + " players</option>";

    serverBrowser.innerHTML = tmpHTML;

    var altServerText;
    var altServerURL;
    if (location.hostname == "sandbox.moomoo.io") {
        altServerText = "Back to MooMoo";
        altServerURL = "//moomoo.io/";
    } else {
        altServerText = "Try the sandbox";
        altServerURL = "//sandbox.moomoo.io/";
    }
    document.getElementById("altServer").innerHTML = "<a href='" + altServerURL + "'>" + altServerText + "<i class='material-icons' style='font-size:10px;vertical-align:middle'>arrow_forward_ios</i></a>";
}

function updateServerList() {
    vultrClient.fetchServerList().then(function(data) {
        window.vultr = data;
        var list = Array.isArray(data) ? data : (data && data.servers);
        if (!Array.isArray(list)) {
            throw new Error("Invalid server data format");
        }
        return vultrClient.processServers(list);
    }).then(function() {
        setupServerStatus();
    }).catch(function(error) {
        console.error("Failed to load server data:", error);
    });
}

serverBrowser.addEventListener("change", UTILS.checkTrusted(function() {
    let parts = serverBrowser.value.split(":");
    vultrClient.switchServer(parts[0], parts[1], parts[2]);
}));

function showItemInfo(item, isWeapon, isStoreItem) {
    if (player && item) {
        UTILS.removeAllChildren(itemInfoHolder);
        itemInfoHolder.classList.add("visible");

        UTILS.generateElement({
            id: "itemInfoName",
            text: UTILS.capitalizeFirst(item.name),
            parent: itemInfoHolder
        });
        UTILS.generateElement({
            id: "itemInfoDesc",
            text: item.desc,
            parent: itemInfoHolder
        });
        if (isStoreItem) {

        } else if (isWeapon) {
            UTILS.generateElement({
                class: "itemInfoReq",
                text: !item.type ? "primary" : "secondary",
                parent: itemInfoHolder
            });
        } else {
            for (var i = 0; i < item.req.length; i += 2) {
                UTILS.generateElement({
                    class: "itemInfoReq",
                    html: item.req[i] + "<span class='itemInfoReqVal'> x" + item.req[i + 1] + "</span>",
                    parent: itemInfoHolder
                });
            }
            if (item.group.limit) {
                UTILS.generateElement({
                    class: "itemInfoLmt",
                    text: (player.itemCounts[item.group.id] || 0) + "/" + ((config.isSandbox && item.group.sandboxLimit) || item.group.limit),
                    parent: itemInfoHolder
                });
            }
        }
    } else {
        itemInfoHolder.classList.remove("visible");

    }
}

var allianceNotifications = [];
var alliancePlayers = [];

function allianceNotification(sid, name) {
    allianceNotifications.push({
        sid: sid,
        name: name
    });
    updateNotifications();
}

function updateNotifications() {
    if (allianceNotifications[0]) {
        var tmpN = allianceNotifications[0];
        UTILS.removeAllChildren(noticationDisplay);
        noticationDisplay.style.display = "block";
        UTILS.generateElement({
            class: "notificationText",
            text: tmpN.name,
            parent: noticationDisplay
        });
        UTILS.generateElement({
            class: "notifButton",
            html: "<i class='material-icons' style='font-size:28px;color:#cc5151;'>&#xE14C;</i>",
            parent: noticationDisplay,
            onclick: function() {
                aJoinReq(0);
            },
            hookTouch: true
        });
        UTILS.generateElement({
            class: "notifButton",
            html: "<i class='material-icons' style='font-size:28px;color:#8ecc51;'>&#xE876;</i>",
            parent: noticationDisplay,
            onclick: function() {
                aJoinReq(1);
            },
            hookTouch: true
        });
    } else {
        noticationDisplay.style.display = "none";
    }
}

function addAlliance(data) {
    alliances.push(data);
    if (allianceMenu.style.display == "block")
        showAllianceMenu();
}

function setPlayerTeam(team, isOwner) {
    if (player) {
        player.team = team;
        player.isOwner = isOwner;
        if (allianceMenu.style.display == "block")
            showAllianceMenu();
    }
}

function setAlliancePlayers(data) {
    alliancePlayers = data;
    if (allianceMenu.style.display == "block")
        showAllianceMenu();
}

function deleteAlliance(sid) {
    for (var i = alliances.length - 1; i >= 0; i--) {
        if (alliances[i].sid == sid)
            alliances.splice(i, 1);
    }
    if (allianceMenu.style.display == "block")
        showAllianceMenu();
}

function toggleAllianceMenu() {
    resetMoveDir();
    if (allianceMenu.style.display != "block") {
        showAllianceMenu();
    } else {
        allianceMenu.style.display = "none";
    }
}

function showAllianceMenu() {
    if (player && player.alive) {
        closeChat();
        storeMenu.style.display = "none";
        allianceMenu.style.display = "block";
        UTILS.removeAllChildren(allianceHolder);
        if (player.team) {
            for (var i = 0; i < alliancePlayers.length; i += 2) {
                (function(i) {
                    var tmp = UTILS.generateElement({
                        class: "allianceItem",
                        style: "color:" + (alliancePlayers[i] == player.sid ? "#fff" : "rgba(255,255,255,0.6)"),
                        text: alliancePlayers[i + 1],
                        parent: allianceHolder
                    });
                    if (player.isOwner && alliancePlayers[i] != player.sid) {
                        UTILS.generateElement({
                            class: "joinAlBtn",
                            text: "Kick",
                            onclick: function() {
                                kickFromClan(alliancePlayers[i]);
                            },
                            hookTouch: true,
                            parent: tmp
                        });
                    }
                })(i);
            }
        } else {
            if (alliances.length) {
                for (var i = 0; i < alliances.length; ++i) {
                    (function(i) {
                        var tmp = UTILS.generateElement({
                            class: "allianceItem",
                            style: "color:" + (alliances[i].sid == player.team ? "#fff" : "rgba(255,255,255,0.6)"),
                            text: alliances[i].sid,
                            parent: allianceHolder
                        });
                        UTILS.generateElement({
                            class: "joinAlBtn",
                            text: "Join",
                            onclick: function() {
                                sendJoin(i);
                            },
                            hookTouch: true,
                            parent: tmp
                        });
                    })(i);
                }
            } else {
                UTILS.generateElement({
                    class: "allianceItem",
                    text: "No Tribes Yet",
                    parent: allianceHolder
                });
            }
        }
        UTILS.removeAllChildren(allianceManager);
        if (player.team) {
            UTILS.generateElement({
                class: "allianceButtonM",
                style: "width: 360px",
                text: player.isOwner ? "Delete Tribe" : "Leave Tribe",
                onclick: function() {
                    leaveAlliance()
                },
                hookTouch: true,
                parent: allianceManager
            });
        } else {
            UTILS.generateElement({
                tag: "input",
                type: "text",
                id: "allianceInput",
                maxLength: 7,
                placeholder: "unique name",
                ontouchstart: function(ev) {
                    ev.preventDefault();
                    var newValue = prompt("unique name", ev.currentTarget.value);
                    ev.currentTarget.value = newValue.slice(0, 7);
                },
                parent: allianceManager
            });
            UTILS.generateElement({
                tag: "div",
                class: "allianceButtonM",
                style: "width: 140px;",
                text: "Create",
                onclick: function() {
                    createAlliance();
                },
                hookTouch: true,
                parent: allianceManager
            });
        }
    }
}


function aJoinReq(join) {
    io.send(CLIENT_PACKETS.RESPOND_ALLIANCE_REQUEST, allianceNotifications[0].sid, join);
    allianceNotifications.splice(0, 1);
    updateNotifications();
}

function kickFromClan(sid) {
    io.send(CLIENT_PACKETS.KICK_ALLIANCE_MEMBER, sid);
}

function sendJoin(index) {
    io.send(CLIENT_PACKETS.REQUEST_ALLIANCE_JOIN, alliances[index].sid);
}

function createAlliance() {
    io.send(CLIENT_PACKETS.CREATE_ALLIANCE, document.getElementById("allianceInput").value);
}

function leaveAlliance() {
    allianceNotifications = [];
    updateNotifications();
    io.send(CLIENT_PACKETS.LEAVE_ALLIANCE);
}

class Autobuy {
    constructor(items) {
        this.items = items;
    }

    buyNext() {
        for (const [id, type] of this.items) {
            const find = type === 0 ? findID(hats, id) : findID(accessories, id);
            const isOwned = type === 0 ? player.skins[id] : player.tails[id];
            if (!find || isOwned) continue;

            if (player.points >= find.price) {
                io.send(CLIENT_PACKETS.STORE_ACTION, 1, id, type);
                return;
            }
            return;
        }
    }
}

var autoBuy = new Autobuy([
    [11, 1],
    [40, 0],
    [6, 0],
    [7, 0],
    [31, 0],
    [15, 0],
    [19, 1],
    [22, 0],
    [53, 0],
    [12, 0],
    [20, 0],
    [10, 0],
    [56, 0],
    [21, 1],
    [11, 0],
    [26, 0],
    [18, 1],
    [13, 1]
])
var lastDeath;
var minimapData;
var mapMarker;
var mapPings = [];
var tmpPing;

function MapPing() {
    this.init = function(x, y) {
        this.scale = 0;
        this.x = x;
        this.y = y;
        this.active = true;
    };
    this.update = function(ctxt, delta) {
        if (this.active) {
            this.scale += 0.05 * delta;
            if (this.scale >= config.mapPingScale) {
                this.active = false;
            } else {
                ctxt.globalAlpha = (1 - Math.max(0, this.scale / config.mapPingScale));
                ctxt.beginPath();
                ctxt.arc((this.x / config.mapScale) * mapDisplay.width, (this.y / config.mapScale) *
                    mapDisplay.width, this.scale, 0, 2 * Math.PI);
                ctxt.stroke();
            }
        }
    };
}

function pingMap(x, y) {
    for (var i = 0; i < mapPings.length; ++i) {
        if (!mapPings[i].active) {
            tmpPing = mapPings[i];
            break;
        }
    }
    if (!tmpPing) {
        tmpPing = new MapPing();
        mapPings.push(tmpPing);
    }
    tmpPing.init(x, y);
}

function updateMapMarker() {
    if (!mapMarker)
        mapMarker = {};
    mapMarker.x = player.x;
    mapMarker.y = player.y;
}

function updateMinimap(data) {
    minimapData = data;
}

function renderMinimap(delta) {
    if (player && player.alive) {
        mapContext.clearRect(0, 0, mapDisplay.width, mapDisplay.height);

        mapContext.strokeStyle = "#fff";
        mapContext.lineWidth = 4;
        for (var i = 0; i < mapPings.length; ++i) {
            tmpPing = mapPings[i];
            tmpPing.update(mapContext, delta);
        }

        mapContext.globalAlpha = 1;
        mapContext.fillStyle = "#fff";
        renderCircle((player.x / config.mapScale) * mapDisplay.width,
            (player.y / config.mapScale) * mapDisplay.height, 7, mapContext, true);
        mapContext.fillStyle = "rgba(255,255,255,0.35)";
        if (player.team && minimapData) {
            for (var i = 0; i < minimapData.length;) {
                renderCircle((minimapData[i] / config.mapScale) * mapDisplay.width,
                    (minimapData[i + 1] / config.mapScale) * mapDisplay.height, 7, mapContext, true);
                i += 2;
            }
        }

        if (lastDeath) {
            mapContext.fillStyle = "#fc5553";
            mapContext.font = "34px Hammersmith One";
            mapContext.textBaseline = "middle";
            mapContext.textAlign = "center";
            mapContext.fillText("x", (lastDeath.x / config.mapScale) * mapDisplay.width,
                (lastDeath.y / config.mapScale) * mapDisplay.height);
        }

        if (mapMarker) {
            mapContext.fillStyle = "#fff";
            mapContext.font = "34px Hammersmith One";
            mapContext.textBaseline = "middle";
            mapContext.textAlign = "center";
            mapContext.fillText("x", (mapMarker.x / config.mapScale) * mapDisplay.width,
                (mapMarker.y / config.mapScale) * mapDisplay.height);
        }
    }
}

var currentStoreIndex = 0;
var playerItems = {};

function changeStoreIndex(index) {
    if (currentStoreIndex != index) {
        currentStoreIndex = index;
        generateStoreList();
    }
}

function toggleStoreMenu() {
    if (storeMenu.style.display != "block") {
        storeMenu.style.display = "block";
        allianceMenu.style.display = "none";
        closeChat();
        generateStoreList();
    } else {
        storeMenu.style.display = "none";
    }
}

function updateStoreItems(type, id, index) {
    if (index) {
        if (!type)
            player.tails[id] = 1;
        else
            player.tailIndex = id;
    } else {
        if (!type)
            player.skins[id] = 1;
        else
            player.skinIndex = id;
    }
    if (storeMenu.style.display == "block")
        generateStoreList();
}

function generateStoreList() {
    if (player) {
        UTILS.removeAllChildren(storeHolder);
        var index = currentStoreIndex;
        var tmpArray = index ? accessories : hats;
        for (var i = 0; i < tmpArray.length; ++i) {
            if (!tmpArray[i].dontSell) {
                (function(i) {
                    var tmp = UTILS.generateElement({
                        id: "storeDisplay" + i,
                        class: "storeItem",
                        onmouseout: function() {
                            showItemInfo();
                        },
                        onmouseover: function() {
                            showItemInfo(tmpArray[i], false, true);
                        },
                        parent: storeHolder
                    });
                    UTILS.hookTouchEvents(tmp, true);
                    UTILS.generateElement({
                        tag: "img",
                        class: "hatPreview",
                        src: "../img/" + (index ? "accessories/access_" : "hats/hat_") + tmpArray[i].id + (tmpArray[i].topSprite ? "_p" : "") + ".png",
                        parent: tmp
                    });
                    UTILS.generateElement({
                        tag: "span",
                        text: tmpArray[i].name,
                        parent: tmp
                    });
                    if (index ? (!player.tails[tmpArray[i].id]) : (!player.skins[tmpArray[i].id])) {
                        UTILS.generateElement({
                            class: "joinAlBtn",
                            style: "margin-top: 5px",
                            text: "Buy",
                            onclick: function() {
                                storeBuy(tmpArray[i].id, index);
                            },
                            hookTouch: true,
                            parent: tmp
                        });
                        UTILS.generateElement({
                            tag: "span",
                            class: "itemPrice",
                            text: tmpArray[i].price,
                            parent: tmp
                        })
                    } else if ((index ? player.tailIndex : player.skinIndex) == tmpArray[i].id) {
                        UTILS.generateElement({
                            class: "joinAlBtn",
                            style: "margin-top: 5px",
                            text: "Unequip",
                            onclick: function() {
                                storeEquip(0, index);
                            },
                            hookTouch: true,
                            parent: tmp
                        });
                    } else {
                        UTILS.generateElement({
                            class: "joinAlBtn",
                            style: "margin-top: 5px",
                            text: "Equip",
                            onclick: function() {
                                storeEquip(tmpArray[i].id, index);
                            },
                            hookTouch: true,
                            parent: tmp
                        });
                    }
                })(i);
            }
        }
    }
}

function storeEquip(id, index) {
    io.send(CLIENT_PACKETS.STORE_ACTION, 0, id, index);
}

function storeBuy(id, index) {
    io.send(CLIENT_PACKETS.STORE_ACTION, 1, id, index);
}

function hideAllWindows() {
    storeMenu.style.display = "none";
    allianceMenu.style.display = "none";
    closeChat();
}

function prepareUI() {

    var savedNativeValue = getSavedVal("native_resolution");
    if (!savedNativeValue) {
        setUseNativeResolution(typeof cordova !== "undefined"); // Only default to native if on mobile
    } else {
        setUseNativeResolution(savedNativeValue == "true");
    }

    showPing = getSavedVal("show_ping") == "true";
    pingDisplay.hidden = !showPing;

    playSound = getSavedVal("moo_moosic") || 0;

    setInterval(function() {
        if (window.cordova) {
            document.getElementById("downloadButtonContainer").classList.add("cordova");
            document.getElementById("mobileDownloadButtonContainer").classList.add("cordova");
        }
    }, 1000);

    updateSkinColorPicker();

    UTILS.removeAllChildren(actionBar);
    for (var i = 0; i < (items.weapons.length + items.list.length); ++i) {
        (function(i) {
            UTILS.generateElement({
                id: "actionBarItem" + i,
                class: "actionBarItem",
                style: "display:none",
                onmouseout: function() {
                    showItemInfo();
                },
                parent: actionBar
            });
        })(i);
    }
    for (var i = 0; i < (items.list.length + items.weapons.length); ++i) {
        (function(i) {
            var tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = tmpCanvas.height = 66;
            var tmpContext = tmpCanvas.getContext('2d');
            tmpContext.translate((tmpCanvas.width / 2), (tmpCanvas.height / 2));
            tmpContext.imageSmoothingEnabled = false;
            tmpContext.webkitImageSmoothingEnabled = false;
            tmpContext.mozImageSmoothingEnabled = false;
            if (items.weapons[i]) {
                tmpContext.rotate((Math.PI / 4) + Math.PI);
                var tmpSprite = new Image();
                toolSprites[items.weapons[i].src] = tmpSprite;
                tmpSprite.onload = function() {
                    this.isLoaded = true;
                    var tmpPad = 1 / (this.height / this.width);
                    var tmpMlt = (items.weapons[i].iPad || 1);
                    tmpContext.drawImage(this, -(tmpCanvas.width * tmpMlt * config.iconPad * tmpPad) / 2, -(tmpCanvas.height * tmpMlt * config.iconPad) / 2,
                        tmpCanvas.width * tmpMlt * tmpPad * config.iconPad, tmpCanvas.height * tmpMlt * config.iconPad);
                    tmpContext.fillStyle = "rgba(0, 0, 70, 0.1)";
                    tmpContext.globalCompositeOperation = "source-atop";
                    tmpContext.fillRect(-tmpCanvas.width / 2, -tmpCanvas.height / 2, tmpCanvas.width, tmpCanvas.height);
                    document.getElementById('actionBarItem' + i).style.backgroundImage = "url(" + tmpCanvas.toDataURL() + ")";
                };
                tmpSprite.src = ".././img/weapons/" + items.weapons[i].src + ".png";
                var tmpUnit = document.getElementById('actionBarItem' + i);
                tmpUnit.onmouseover = UTILS.checkTrusted(function() {
                    showItemInfo(items.weapons[i], true);
                });
                tmpUnit.onclick = UTILS.checkTrusted(function() {
                    selectToBuild(i, true);
                });
                UTILS.hookTouchEvents(tmpUnit);
            } else {
                var tmpSprite = getItemSprite(items.list[i - items.weapons.length], true);
                var tmpScale = Math.min(tmpCanvas.width - config.iconPadding, tmpSprite.width);
                tmpContext.globalAlpha = 1;
                tmpContext.drawImage(tmpSprite, -tmpScale / 2, -tmpScale / 2, tmpScale, tmpScale);
                tmpContext.fillStyle = "rgba(0, 0, 70, 0.1)";
                tmpContext.globalCompositeOperation = "source-atop";
                tmpContext.fillRect(-tmpScale / 2, -tmpScale / 2, tmpScale, tmpScale);
                document.getElementById('actionBarItem' + i).style.backgroundImage = "url(" + tmpCanvas.toDataURL() + ")";
                var tmpUnit = document.getElementById('actionBarItem' + i);
                tmpUnit.onmouseover = UTILS.checkTrusted(function() {
                    showItemInfo(items.list[i - items.weapons.length]);
                });
                tmpUnit.onclick = UTILS.checkTrusted(function() {
                    selectToBuild(i - items.weapons.length);
                });
                UTILS.hookTouchEvents(tmpUnit);
            }
        })(i);
    }

    nameInput.ontouchstart = UTILS.checkTrusted(function(e) {
        e.preventDefault();
        var newValue = prompt("enter name", e.currentTarget.value);
        e.currentTarget.value = newValue.slice(0, 15);
    });

    nativeResolutionCheckbox.checked = useNativeResolution;
    nativeResolutionCheckbox.onchange = UTILS.checkTrusted(function(e) {
        setUseNativeResolution(e.target.checked);
    });
    showPingCheckbox.checked = showPing;
    showPingCheckbox.onchange = UTILS.checkTrusted(function(e) {
        showPing = showPingCheckbox.checked;
        pingDisplay.hidden = !showPing;
        saveVal("show_ping", showPing ? "true" : "false");
    });


}

function updateItems(data, wpn) {
    if (data) {
        if (wpn) player.weapons = data;
        else player.items = data;
    }
    for (var i = 0; i < items.list.length; ++i) {
        var tmpI = (items.weapons.length + i);
        document.getElementById("actionBarItem" + tmpI).style.display = (player.items.indexOf(items.list[i].id) >= 0) ? "inline-block" : "none";
    }
    for (var i = 0; i < items.weapons.length; ++i) {
        document.getElementById("actionBarItem" + i).style.display =
            (player.weapons[items.weapons[i].type] == items.weapons[i].id) ? "inline-block" : "none";
    }
}

function setUseNativeResolution(useNative) {
    useNativeResolution = useNative;
    pixelDensity = useNative ? (window.devicePixelRatio || 1) : 1;
    nativeResolutionCheckbox.checked = useNative;
    saveVal("native_resolution", useNative.toString());
    resize();
}

function updateGuide() {
    if (usingTouch) {
        guideCard.classList.add("touch");
    } else {
        guideCard.classList.remove("touch");
    }
}

function toggleSettings() {
    if (guideCard.classList.contains("showing")) {
        guideCard.classList.remove("showing");
        settingsButtonTitle.innerText = "Settings";
    } else {
        guideCard.classList.add("showing");
        settingsButtonTitle.innerText = "Close";
    }
}

function updateSkinColorPicker() {
    var tmpHTML = "";
    for (var i = 0; i < config.skinColors.length; ++i) {
        if (i == skinColor) {
            tmpHTML += ("<div class='skinColorItem activeSkin' style='background-color:" +
                config.skinColors[i] + "' onclick='selectSkinColor(" + i + ")'></div>");
        } else {
            tmpHTML += ("<div class='skinColorItem' style='background-color:" +
                config.skinColors[i] + "' onclick='selectSkinColor(" + i + ")'></div>");
        }
    }
    skinColorHolder.innerHTML = tmpHTML;
}

function selectSkinColor(index) {
    skinColor = index;
    updateSkinColorPicker();
}

var chatBox = document.getElementById("chatBox");
var chatHolder = document.getElementById("chatHolder");

function toggleChat() {
    if (!usingTouch) {
        if (chatHolder.style.display == "block") {
            if (chatBox.value) {
                sendChat(chatBox.value);
            }
            closeChat();
        } else {
            storeMenu.style.display = "none";
            allianceMenu.style.display = "none";
            chatHolder.style.display = "block";
            chatBox.focus();
            resetMoveDir();
        }
    } else {
        setTimeout(function() { // Timeout lets the `hookTouchEvents` function exit
            var chatMessage = prompt("chat message");
            if (chatMessage) {
                sendChat(chatMessage);
            }
        }, 1);
    }
    chatBox.value = "";
}

function sendChat(message) {
    io.send(CLIENT_PACKETS.SEND_CHAT, message.slice(0, 30));
}

function closeChat() {
    chatBox.value = "";
    chatHolder.style.display = "none";
}

var profanityList = ["cunt", "whore", "fuck", "shit", "faggot", "nigger",
    "nigga", "dick", "vagina", "minge", "cock", "rape", "cum", "sex",
    "tits", "penis", "clit", "pussy", "meatcurtain", "jizz", "prune",
    "douche", "wanker", "damn", "bitch", "dick", "fag", "bastard"
];

function checkProfanityString(text) {
    var tmpString;
    for (var i = 0; i < profanityList.length; ++i) {
        if (text.indexOf(profanityList[i]) > -1) {
            tmpString = "";
            for (var y = 0; y < profanityList[i].length; ++y) {
                tmpString += tmpString.length ? "o" : "M";
            }
            var re = new RegExp(profanityList[i], 'g');
            text = text.replace(re, tmpString);
        }
    }
    return text;
}

function receiveChat(sid, message) {
    var tmpPlayer = findPlayerBySID(sid);
    if (tmpPlayer) {
        tmpPlayer.chatMessage = checkProfanityString(message);
        tmpPlayer.chatCountdown = config.chatCountdown;
    }
}

window.addEventListener('resize', UTILS.checkTrusted(resize));

function resize() {
    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;
    var scaleFillNative = Math.max(screenWidth / maxScreenWidth, screenHeight / maxScreenHeight) * pixelDensity;
    gameCanvas.width = screenWidth * pixelDensity;
    gameCanvas.height = screenHeight * pixelDensity;
    gameCanvas.style.width = screenWidth + "px";
    gameCanvas.style.height = screenHeight + "px";
    mainContext.setTransform(
        scaleFillNative, 0,
        0, scaleFillNative,
        (screenWidth * pixelDensity - (maxScreenWidth * scaleFillNative)) / 2,
        (screenHeight * pixelDensity - (maxScreenHeight * scaleFillNative)) / 2
    );
}
resize();

var usingTouch;
setUsingTouch(false);

function setUsingTouch(using) {
    usingTouch = using;
    updateGuide();





}
window.setUsingTouch = setUsingTouch;

gameCanvas.addEventListener('touchmove', UTILS.checkTrusted(touchMove), false);

function touchMove(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    setUsingTouch(true);
    for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        if (t.identifier == controllingTouch.id) {
            controllingTouch.currentX = t.pageX;
            controllingTouch.currentY = t.pageY;
            sendMoveDir();
        } else if (t.identifier == attackingTouch.id) {
            attackingTouch.currentX = t.pageX;
            attackingTouch.currentY = t.pageY;
            attackState = 1;
        }
    }
}
gameCanvas.addEventListener('touchstart', UTILS.checkTrusted(touchStart), false);

function touchStart(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    setUsingTouch(true);
    for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        if (t.pageX < document.body.scrollWidth / 2 && controllingTouch.id == -1) {
            controllingTouch.id = t.identifier;
            controllingTouch.startX = controllingTouch.currentX = t.pageX;
            controllingTouch.startY = controllingTouch.currentY = t.pageY;
            sendMoveDir();
        } else if (t.pageX > document.body.scrollWidth / 2 && attackingTouch.id == -1) {
            attackingTouch.id = t.identifier;
            attackingTouch.startX = attackingTouch.currentX = t.pageX;
            attackingTouch.startY = attackingTouch.currentY = t.pageY;
            if (player.buildIndex < 0) {
                attackState = 1;
                sendAtckState();
            }
        }
    }
}
gameCanvas.addEventListener('touchend', UTILS.checkTrusted(touchEnd), false);
gameCanvas.addEventListener('touchcancel', UTILS.checkTrusted(touchEnd), false);
gameCanvas.addEventListener('touchleave', UTILS.checkTrusted(touchEnd), false);

function touchEnd(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    setUsingTouch(true);
    for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        if (t.identifier == controllingTouch.id) {
            controllingTouch.id = -1;
            sendMoveDir();
        } else if (t.identifier == attackingTouch.id) {
            attackingTouch.id = -1;
            if (player.buildIndex >= 0) {
                attackState = 1;
                sendAtckState();
            }
            attackState = 0;
            sendAtckState();
        }
    }
}

//gameCanvas.addEventListener('mousemove', gameInput, false);
const mals = document.getElementById('touch-controls-fullscreen');
mals.style.display = 'block';
mals.addEventListener("mousemove", gameInput, false);

function gameInput(e) {
    e.preventDefault();
    e.stopPropagation();
    setUsingTouch(false);
    mouseX = e.clientX;
    mouseY = e.clientY;
}
mals.addEventListener("mousedown", mouseDown, false);

function mouseDown(e) {
    if (attackState != 1) {
        attackState = 1;
        if (e.button == 0) {
            MainScript.clicks.left = true;
        } else if (e.button == 1) {
            MainScript.clicks.middle = true;
        } else if (e.button == 2) {
            MainScript.clicks.right = true;
        }
    }
}
mals.addEventListener("mouseup", UTILS.checkTrusted(mouseUp));

function mouseUp(e) {
    if (attackState != 0) {
        attackState = 0;
        if (e.button == 0) {
            MainScript.clicks.left = false;
        } else if (e.button == 1) {
            MainScript.clicks.middle = false;
        } else if (e.button == 2) {
            MainScript.clicks.right = false;
        }
    }
}

function getMoveDir() {
    var dx = 0;
    var dy = 0;
    if (controllingTouch.id != -1) {
        dx += controllingTouch.currentX - controllingTouch.startX;
        dy += controllingTouch.currentY - controllingTouch.startY;
    } else {
        for (var key in moveKeys) {
            var tmpDir = moveKeys[key];
            dx += !!keys[key] * tmpDir[0];
            dy += !!keys[key] * tmpDir[1];
        }
    }
    return (dx == 0 && dy == 0) ? undefined : UTILS.fixTo(Math.atan2(dy, dx), 2);
}

var lastDir;

function getSafeDir() {
    if (!player)
        return 0;
    if (!player.lockDir) {
        lastDir = Math.atan2(mouseY - (screenHeight / 2), mouseX - (screenWidth / 2));
    }
    return lastDir || 0;
}

function getAttackDir() {
    if (!player)
        return 0;
    if (attackingTouch.id != -1) {
        lastDir = Math.atan2(
            attackingTouch.currentY - attackingTouch.startY,
            attackingTouch.currentX - attackingTouch.startX
        );
    } else if (!player.lockDir && !usingTouch) {
        lastDir = Math.atan2(mouseY - (screenHeight / 2), mouseX - (screenWidth / 2));
    }
    return UTILS.fixTo(lastDir || 0, 2);
}

var keys = {};
var moveKeys = {
    87: [0, -1],
    38: [0, -1],
    83: [0, 1],
    40: [0, 1],
    65: [-1, 0],
    37: [-1, 0],
    68: [1, 0],
    39: [1, 0]
};

function resetMoveDir() {
    keys = {};
    io.send(CLIENT_PACKETS.RESET_MOVE_DIR);
}

function keysActive() {
    return (allianceMenu.style.display != "block" &&
        chatHolder.style.display != "block");
}

function keyDown(event) {
    var keyNum = event.which || event.keyCode || 0;
    if (keyNum == 27) {
        hideAllWindows();
    } else if (player && player.alive && keysActive()) {
        if (!keys[keyNum]) {
            keys[keyNum] = 1;
            macro[event.key] = 1;
            if (keyNum == 69) {
                MainScript.sendHitOnce();
            } else if (player.weapons[keyNum - 49] != undefined) {
                player.weaponCode = player.weapons[keyNum - 49];
            } else if (keyNum == 67) {
                updateMapMarker();
            } else if (keyNum == 88) {
                sendLockDir();
            } else if (player.weapons[keyNum - 49] != undefined) {
                selectToBuild(player.weapons[keyNum - 49], true);
            } else if (player.items[keyNum - 49 - player.weapons.length] != undefined) {
                selectToBuild(player.items[keyNum - 49 - player.weapons.length]);
            } else if (keyNum == 81) {
                selectToBuild(player.items[0]);
            } else if (event.key == "z") {
                MainScript.mills.place = !MainScript.mills.place;
            } else if (keyNum == 82) {
                sendMapPing();
            } else if (moveKeys[keyNum]) {
                sendMoveDir();
            } else if (keyNum == 32) {
                attackState = 1;
                sendAtckState();
            }
        }
    }
}
window.addEventListener('keydown', UTILS.checkTrusted(keyDown));

function keyUp(event) {
    if (player && player.alive) {
        var keyNum = event.which || event.keyCode || 0;
        if (keyNum == 13) {
            toggleChat();
        } else if (keysActive()) {
            if (keys[keyNum]) {
                keys[keyNum] = 0;
                macro[event.key] = 0;
                if (moveKeys[keyNum]) {
                    sendMoveDir();
                } else if (keyNum == 32) {
                    attackState = 0;
                    sendAtckState();
                }
            }
        }
    }
}
window.addEventListener('keyup', UTILS.checkTrusted(keyUp));

function sendAtckState() {
    if (player && player.alive) {
        io.send(CLIENT_PACKETS.SET_ATTACK_STATE, attackState, (player.buildIndex >= 0 ? getAttackDir() : null));
    }
}
var lastMoveDir = undefined;

function sendMoveDir() {
    var newMoveDir = getMoveDir();
    if (lastMoveDir == undefined || newMoveDir == undefined || Math.abs(newMoveDir - lastMoveDir) > 0.3) {
        io.send(CLIENT_PACKETS.SET_MOVE_DIR, newMoveDir);
        lastMoveDir = newMoveDir;
    }
}

function sendLockDir() {
    player.lockDir = player.lockDir ? 0 : 1;
    io.send(CLIENT_PACKETS.TOGGLE_LOCK_DIR, 0);
}

function sendMapPing() {
    io.send(CLIENT_PACKETS.SEND_MAP_PING, 1);
}

function selectToBuild(index, wpn) {
    io.send(CLIENT_PACKETS.SELECT_TO_BUILD, index, wpn);
}

function selectWeapon(index, isPlace) {
    if (!isPlace) {
        player.weaponCode = index;
    }
    io.send(CLIENT_PACKETS.SELECT_TO_BUILD, index, 1);
}

function sendAtck(id, angle) {
    io.send(CLIENT_PACKETS.ATTACK_BUILD_STATE, id, angle, 0);
}

function place(id, rad, rmd, isPre) {
    let item = items.list[player.items[id]];
    let underLimit = player.itemCounts[item.group.id] == undefined ? true : player.itemCounts[item.group.id] < (config.isSandbox ? 299 : (item.group.limit || 99));
    if (player.alive && inGame && underLimit) {
        let tmpS = player.scale + item.scale + (item.placeOffset || 0);
        let pos = {
            x: player.x2 + tmpS * Math.cos(rad),
            y: player.y2 + tmpS * Math.sin(rad)
        };
        selectToBuild(player.items[id]);
        sendAtck(1, rad);
        sendAtck(0, rad);
        selectWeapon(player.weaponCode, 1);
    }
};

function checkPlace(id, dir, test) {
    if (id == undefined) return;
    let item = items.list[player.items[id]];
    let tmpS = player.scale + item.scale + (item.placeOffset || 0);
    let tmpX = player.x2 + tmpS * Math.cos(dir);
    let tmpY = player.y2 + tmpS * Math.sin(dir);
    if (objectManager.checkItemLocation(tmpX, tmpY, item.scale, 0.6, item.id, false, player) && !test) {
        place(id, dir, 1);
    }
}

function buyEquip(id, index) {
    let nID = player.skins[6] ? 6 : 0;
    if (player.alive) {
        if (index == 0) {
            if (player.skins[id]) {
                if (player.latestSkin != id) {
                    io.send(CLIENT_PACKETS.STORE_ACTION, 0, id, 0);
                }
            } else {
                if (player.latestSkin != nID) {
                    io.send(CLIENT_PACKETS.STORE_ACTION, 0, nID, 0);
                }
            }
        } else if (index == 1) {
            if (false && (id != 11 && id != 0)) {
                if (player.latestTail != 0) {
                    io.send(CLIENT_PACKETS.STORE_ACTION, 0, 0, 1);
                }
                return;
            }
            if (player.tails[id]) {
                if (player.latestTail != id) {
                    io.send(CLIENT_PACKETS.STORE_ACTION, 0, id, 1);
                }
            } else {
                if (player.latestTail != 0) {
                    io.send(CLIENT_PACKETS.STORE_ACTION, 0, 0, 1);
                }
            }
        }
    }
}

function enterGame() {
    saveVal("moo_name", nameInput.value);
    if (!inGame && socketReady()) {
        inGame = true;
        showLoadingText("Loading...");
        io.send(CLIENT_PACKETS.SPAWN_PLAYER, {
            name: nameInput.value,
            moofoll: moofoll,
            skin: skinColor
        });
    }
}

var firstSetup = true;

function setupGame(yourSID) {
    loadingText.style.display = "none";
    menuCardHolder.style.display = "block";
    mainMenu.style.display = "none";
    keys = {};
    playerSID = yourSID;
    attackState = 0;
    inGame = true;
    if (firstSetup) {
        firstSetup = false;
        gameObjects.length = 0;
    }
}

function showText(x, y, value, type) {
    textManager.showText(x, y, 50, 0.18, 500, Math.abs(value), (value >= 0) ? "#fff" : "#8ecc51");
}

var deathTextScale = 99999;

function killPlayer() {
    inGame = false;
    try {
        factorem.refreshAds([2], true);
    } catch (e) {};
    gameUI.style.display = "none";
    hideAllWindows();
    lastDeath = {
        x: player.x,
        y: player.y
    };
    loadingText.style.display = "none";
    diedText.style.display = "block";
    diedText.style.fontSize = "0px";
    deathTextScale = 0;
    setTimeout(function() {
        menuCardHolder.style.display = "block";
        mainMenu.style.display = "block";

        diedText.style.display = "none";
    }, config.deathFadeout);

    updateServerList();
}

function killObjects(sid) {
    if (player) objectManager.removeAllItems(sid);
}

function killObject(sid) {
    objectManager.disableBySid(sid);
}

function updateStatusDisplay() {
    scoreDisplay.innerText = player.points;
    foodDisplay.innerText = player.food;;
    woodDisplay.innerText = player.wood;
    stoneDisplay.innerText = player.stone;
    killCounter.innerText = player.kills;
}

var iconSprites = {};
var icons = ["crown", "skull"];

function loadIcons() {
    for (var i = 0; i < icons.length; ++i) {
        var tmpSprite = new Image();
        tmpSprite.onload = function() {
            this.isLoaded = true;
        };
        tmpSprite.src = ".././img/icons/" + icons[i] + ".png";
        iconSprites[icons[i]] = tmpSprite;
    }
}

var tmpList = [];

function updateUpgrades(points, age) {
    player.upgradePoints = points;
    player.upgrAge = age;
    if (points > 0) {
        tmpList.length = 0;
        UTILS.removeAllChildren(upgradeHolder);
        for (var i = 0; i < items.weapons.length; ++i) {
            if (items.weapons[i].age == age && (items.weapons[i].pre == undefined || player.weapons.indexOf(items.weapons[i].pre) >= 0)) {
                var e = UTILS.generateElement({
                    id: "upgradeItem" + i,
                    class: "actionBarItem",
                    onmouseout: function() {
                        showItemInfo();
                    },
                    parent: upgradeHolder
                });
                e.style.backgroundImage = document.getElementById("actionBarItem" + i).style.backgroundImage;
                tmpList.push(i);
            }
        }
        for (var i = 0; i < items.list.length; ++i) {
            if (items.list[i].age == age && (items.list[i].pre == undefined || player.items.indexOf(items.list[i].pre) >= 0)) {
                var tmpI = (items.weapons.length + i);
                var e = UTILS.generateElement({
                    id: "upgradeItem" + tmpI,
                    class: "actionBarItem",
                    onmouseout: function() {
                        showItemInfo();
                    },
                    parent: upgradeHolder
                });
                e.style.backgroundImage = document.getElementById("actionBarItem" + tmpI).style.backgroundImage;
                tmpList.push(tmpI);
            }
        }
        for (var i = 0; i < tmpList.length; i++) {
            (function(i) {
                var tmpItem = document.getElementById('upgradeItem' + i);
                tmpItem.onmouseover = function() {
                    if (items.weapons[i]) {
                        showItemInfo(items.weapons[i], true);
                    } else {
                        showItemInfo(items.list[i - items.weapons.length]);
                    }
                };
                tmpItem.onclick = UTILS.checkTrusted(function() {
                    io.send(CLIENT_PACKETS.PURCHASE_UPGRADE, i);
                });
                UTILS.hookTouchEvents(tmpItem);
            })(tmpList[i]);
        }
        if (tmpList.length) {
            upgradeHolder.style.display = "block";
            upgradeCounter.style.display = "block";
            upgradeCounter.innerHTML = "SELECT ITEMS (" + points + ")";
        } else {
            upgradeHolder.style.display = "none";
            upgradeCounter.style.display = "none";
            showItemInfo();
        }
    } else {
        upgradeHolder.style.display = "none";
        upgradeCounter.style.display = "none";
        showItemInfo();
    }
}

function sendUpgrade(index) {
    io.send(CLIENT_PACKETS.PURCHASE_UPGRADE, index);
}

function updateAge(xp, mxp, age) {
    if (xp != undefined)
        player.XP = xp;
    if (mxp != undefined)
        player.maxXP = mxp;
    if (age != undefined)
        player.age = age;
    if (age == config.maxAge) {
        ageText.innerHTML = "MAX AGE";
        ageBarBody.style.width = "100%";
    } else {
        ageText.innerHTML = "AGE " + player.age;
        ageBarBody.style.width = ((player.XP / player.maxXP) * 100) + "%";
    }
}

function updateLeaderboard(data) {
    UTILS.removeAllChildren(leaderboardData);
    var tmpC = 1;
    for (var i = 0; i < data.length; i += 3) {
        (function(i) {
            UTILS.generateElement({
                class: "leaderHolder",
                parent: leaderboardData,
                children: [
                    UTILS.generateElement({
                        class: "leaderboardItem",
                        style: "color:" + ((data[i] == playerSID) ? "#fff" : "rgba(255,255,255,0.6)"),
                        text: tmpC + ". " + (data[i + 1] != "" ? data[i + 1] : "unknown")
                    }),
                    UTILS.generateElement({
                        class: "leaderScore",
                        text: UTILS.kFormat(data[i + 2]) || "0"
                    })
                ]
            });
        })(i);
        tmpC++;
    }
}

function updateGame() {
    if (true) {

        if (player) {
            if (!lastSent || now - lastSent >= (1000 / config.clientSendRate)) {
                lastSent = now;
                io.send(CLIENT_PACKETS.UPDATE_AIM_DIR, getAttackDir());
            }
        }

        if (deathTextScale < 120) {
            deathTextScale += 0.1 * delta;
            diedText.style.fontSize = Math.min(Math.round(deathTextScale), 120) + "px";
        }

        if (player) {
            var tmpDist = UTILS.getDistance(camX, camY, player.x, player.y);
            var tmpDir = UTILS.getDirection(player.x, player.y, camX, camY);
            var camSpd = Math.min(tmpDist * 0.01 * delta, tmpDist);
            if (tmpDist > 0.05) {
                camX += camSpd * Math.cos(tmpDir);
                camY += camSpd * Math.sin(tmpDir);
            } else {
                camX = player.x;
                camY = player.y;
            }
        } else {
            camX = config.mapScale / 2;
            camY = config.mapScale / 2;
        }

        var lastTime = now - (1000 / config.serverUpdateRate);
        var tmpDiff;
        for (var i = 0; i < players.length + ais.length; ++i) {
            tmpObj = players[i] || ais[i - players.length];
            if (tmpObj && tmpObj.visible) {
                if (tmpObj.forcePos) {
                    tmpObj.x = tmpObj.x2;
                    tmpObj.y = tmpObj.y2;
                    tmpObj.dir = tmpObj.d2;
                } else {
                    var total = tmpObj.t2 - tmpObj.t1;
                    var fraction = lastTime - tmpObj.t1;
                    var ratio = (fraction / total);
                    var rate = 170;
                    tmpObj.dt += delta;
                    var tmpRate = Math.min(1.7, tmpObj.dt / rate);
                    var tmpDiff = (tmpObj.x2 - tmpObj.x1);
                    tmpObj.x = tmpObj.x1 + (tmpDiff * tmpRate);
                    tmpDiff = (tmpObj.y2 - tmpObj.y1);
                    tmpObj.y = tmpObj.y1 + (tmpDiff * tmpRate);
                    tmpObj.dir = Math.lerpAngle(tmpObj.d2, tmpObj.d1, Math.min(1.2, ratio));
                }
            }
        }

        var xOffset = camX - (maxScreenWidth / 2);
        var yOffset = camY - (maxScreenHeight / 2);

        if (config.snowBiomeTop - yOffset <= 0 && config.mapScale - config.snowBiomeTop - yOffset >= maxScreenHeight) {
            mainContext.fillStyle = "#b6db66";
            mainContext.fillRect(0, 0, maxScreenWidth, maxScreenHeight);
        } else if (config.mapScale - config.snowBiomeTop - yOffset <= 0) {
            mainContext.fillStyle = "#dbc666";
            mainContext.fillRect(0, 0, maxScreenWidth, maxScreenHeight);
        } else if (config.snowBiomeTop - yOffset >= maxScreenHeight) {
            mainContext.fillStyle = "#fff";
            mainContext.fillRect(0, 0, maxScreenWidth, maxScreenHeight);
        } else if (config.snowBiomeTop - yOffset >= 0) {
            mainContext.fillStyle = "#fff";
            mainContext.fillRect(0, 0, maxScreenWidth, config.snowBiomeTop - yOffset);
            mainContext.fillStyle = "#b6db66";
            mainContext.fillRect(0, config.snowBiomeTop - yOffset, maxScreenWidth,
                maxScreenHeight - (config.snowBiomeTop - yOffset));
        } else {
            mainContext.fillStyle = "#b6db66";
            mainContext.fillRect(0, 0, maxScreenWidth,
                (config.mapScale - config.snowBiomeTop - yOffset));
            mainContext.fillStyle = "#dbc666";
            mainContext.fillRect(0, (config.mapScale - config.snowBiomeTop - yOffset), maxScreenWidth,
                maxScreenHeight - (config.mapScale - config.snowBiomeTop - yOffset));
        }

        if (!firstSetup) {
            waterMult += waterPlus * config.waveSpeed * delta;
            if (waterMult >= config.waveMax) {
                waterMult = config.waveMax;
                waterPlus = -1;
            } else if (waterMult <= 1) {
                waterMult = waterPlus = 1;
            }
            mainContext.globalAlpha = 1;
            mainContext.fillStyle = "#dbc666";
            renderWaterBodies(xOffset, yOffset, mainContext, config.riverPadding);
            mainContext.fillStyle = "#91b2db";
            renderWaterBodies(xOffset, yOffset, mainContext, (waterMult - 1) * 250);
        }

        mainContext.lineWidth = 4;
        mainContext.strokeStyle = "#000";
        mainContext.globalAlpha = 0.06;
        mainContext.beginPath();
        for (var x = -camX; x < maxScreenWidth; x += maxScreenHeight / 18) {
            if (x > 0) {
                mainContext.moveTo(x, 0);
                mainContext.lineTo(x, maxScreenHeight);
            }
        }
        for (var y = -camY; y < maxScreenHeight; y += maxScreenHeight / 18) {
            if (x > 0) {
                mainContext.moveTo(0, y);
                mainContext.lineTo(maxScreenWidth, y);
            }
        }
        mainContext.stroke();

        mainContext.globalAlpha = 1;
        mainContext.strokeStyle = outlineColor;
        renderGameObjects(-1, xOffset, yOffset);

        mainContext.globalAlpha = 1;
        mainContext.lineWidth = outlineWidth;
        renderProjectiles(0, xOffset, yOffset);

        renderPlayers(xOffset, yOffset, 0);

        mainContext.globalAlpha = 1;
        for (var i = 0; i < ais.length; ++i) {
            tmpObj = ais[i];
            if (tmpObj.active && tmpObj.visible) {
                tmpObj.animate(delta);
                mainContext.save();
                mainContext.translate(tmpObj.x - xOffset, tmpObj.y - yOffset);
                mainContext.rotate(tmpObj.dir + tmpObj.dirPlus - (Math.PI / 2));
                renderAI(tmpObj, mainContext);
                mainContext.restore();
            }
        }

        renderGameObjects(0, xOffset, yOffset);
        renderProjectiles(1, xOffset, yOffset);
        renderGameObjects(1, xOffset, yOffset);
        renderPlayers(xOffset, yOffset, 1);
        renderGameObjects(2, xOffset, yOffset);
        renderGameObjects(3, xOffset, yOffset);

        mainContext.fillStyle = "#000";
        mainContext.globalAlpha = 0.09;
        if (xOffset <= 0) {
            mainContext.fillRect(0, 0, -xOffset, maxScreenHeight);
        }
        if (config.mapScale - xOffset <= maxScreenWidth) {
            var tmpY = Math.max(0, -yOffset);
            mainContext.fillRect(config.mapScale - xOffset, tmpY, maxScreenWidth - (config.mapScale - xOffset), maxScreenHeight - tmpY);
        }
        if (yOffset <= 0) {
            mainContext.fillRect(-xOffset, 0, maxScreenWidth + xOffset, -yOffset);
        }
        if (config.mapScale - yOffset <= maxScreenHeight) {
            var tmpX = Math.max(0, -xOffset);
            var tmpMin = 0;
            if (config.mapScale - xOffset <= maxScreenWidth)
                tmpMin = maxScreenWidth - (config.mapScale - xOffset);
            mainContext.fillRect(tmpX, config.mapScale - yOffset,
                (maxScreenWidth - tmpX) - tmpMin, maxScreenHeight - (config.mapScale - yOffset));
        }

        mainContext.globalAlpha = 1;
        mainContext.fillStyle = "rgba(0, 0, 70, 0.55)";
        mainContext.fillRect(0, 0, maxScreenWidth, maxScreenHeight);

        mainContext.strokeStyle = darkOutlineColor;
        for (var i = 0; i < players.length + ais.length; ++i) {
            tmpObj = players[i] || ais[i - players.length];
            if (tmpObj.visible) {

                if (tmpObj.skinIndex != 10 || (tmpObj == player) || (tmpObj.team && tmpObj.team == player.team)) {
                    var tmpText = (tmpObj.team ? "[" + tmpObj.team + "] " : "") + (tmpObj.name || "") + (tmpObj.id ? " (" + tmpObj.id + ")" : "");
                    if (tmpText != "") {
                        mainContext.font = (tmpObj.nameScale || 30) + "px Hammersmith One";
                        mainContext.fillStyle = "#fff";
                        mainContext.textBaseline = "middle";
                        mainContext.textAlign = "center";
                        mainContext.lineWidth = (tmpObj.nameScale ? 11 : 8);
                        mainContext.lineJoin = "round";
                        mainContext.strokeText(tmpText, tmpObj.x - xOffset, (tmpObj.y - yOffset - tmpObj.scale) - config.nameY);
                        mainContext.fillText(tmpText, tmpObj.x - xOffset, (tmpObj.y - yOffset - tmpObj.scale) - config.nameY);
                        if (tmpObj.isLeader && iconSprites["crown"].isLoaded) {
                            var tmpS = config.crownIconScale;
                            var tmpX = tmpObj.x - xOffset - (tmpS / 2) - (mainContext.measureText(tmpText).width / 2) - config.crownPad;
                            mainContext.drawImage(iconSprites["crown"], tmpX, (tmpObj.y - yOffset - tmpObj.scale) -
                                config.nameY - (tmpS / 2) - 5, tmpS, tmpS);
                        }
                        if (tmpObj.iconIndex == 1 && iconSprites["skull"].isLoaded) {
                            var tmpS = config.crownIconScale;
                            var tmpX = tmpObj.x - xOffset - (tmpS / 2) + (mainContext.measureText(tmpText).width / 2) + config.crownPad;
                            mainContext.drawImage(iconSprites["skull"], tmpX, (tmpObj.y - yOffset - tmpObj.scale) -
                                config.nameY - (tmpS / 2) - 5, tmpS, tmpS);
                        }
                    }
                    if (tmpObj.health > 0) {

                        var tmpWidth = config.healthBarWidth;
                        mainContext.fillStyle = darkOutlineColor;
                        mainContext.roundRect(tmpObj.x - xOffset - config.healthBarWidth - config.healthBarPad,
                            (tmpObj.y - yOffset + tmpObj.scale) + config.nameY, (config.healthBarWidth * 2) +
                            (config.healthBarPad * 2), 17, 8);
                        mainContext.fill();

                        mainContext.fillStyle = (tmpObj == player || (tmpObj.team && tmpObj.team == player.team)) ? "#8ecc51" : "#cc5151";
                        mainContext.roundRect(tmpObj.x - xOffset - config.healthBarWidth,
                            (tmpObj.y - yOffset + tmpObj.scale) + config.nameY + config.healthBarPad,
                            ((config.healthBarWidth * 2) * (tmpObj.health / tmpObj.maxHealth)), 17 - config.healthBarPad * 2, 7);
                        mainContext.fill();
                    }
                }
            }
        }

        textManager.update(delta, mainContext, xOffset, yOffset);

        for (var i = 0; i < players.length; ++i) {
            tmpObj = players[i];
            if (tmpObj.visible && tmpObj.chatCountdown > 0) {
                tmpObj.chatCountdown -= delta;
                if (tmpObj.chatCountdown <= 0)
                    tmpObj.chatCountdown = 0;
                mainContext.font = "32px Hammersmith One";
                var tmpSize = mainContext.measureText(tmpObj.chatMessage);
                mainContext.textBaseline = "middle";
                mainContext.textAlign = "center";
                var tmpX = tmpObj.x - xOffset;
                var tmpY = tmpObj.y - tmpObj.scale - yOffset - 90;
                var tmpH = 47;
                var tmpW = tmpSize.width + 17;
                mainContext.fillStyle = "rgba(0,0,0,0.2)";
                mainContext.roundRect(tmpX - tmpW / 2, tmpY - tmpH / 2, tmpW, tmpH, 6);
                mainContext.fill();
                mainContext.fillStyle = "#fff";
                mainContext.fillText(tmpObj.chatMessage, tmpX, tmpY);
            }
        }
    }

    renderMinimap(delta);

    if (controllingTouch.id !== -1) {
        renderControl(
            controllingTouch.startX, controllingTouch.startY,
            controllingTouch.currentX, controllingTouch.currentY
        );
    }
    if (attackingTouch.id !== -1) {
        renderControl(
            attackingTouch.startX, attackingTouch.startY,
            attackingTouch.currentX, attackingTouch.currentY
        );
    }
}

function renderControl(startX, startY, currentX, currentY) {
    mainContext.save();
    mainContext.setTransform(1, 0, 0, 1, 0, 0);

    mainContext.scale(pixelDensity, pixelDensity);
    var controlRadius = 50;
    mainContext.beginPath();
    mainContext.arc(startX, startY, controlRadius, 0, Math.PI * 2, false);
    mainContext.closePath();
    mainContext.fillStyle = "rgba(255, 255, 255, 0.3)";
    mainContext.fill();
    var controlRadius = 50;
    var offsetX = currentX - startX;
    var offsetY = currentY - startY;
    var mag = Math.sqrt(Math.pow(offsetX, 2) + Math.pow(offsetY, 2));
    var divisor = mag > controlRadius ? (mag / controlRadius) : 1;
    offsetX /= divisor;
    offsetY /= divisor;
    mainContext.beginPath();
    mainContext.arc(startX + offsetX, startY + offsetY, controlRadius * 0.5, 0, Math.PI * 2, false);
    mainContext.closePath();
    mainContext.fillStyle = "white";
    mainContext.fill();
    mainContext.restore();
}

function renderProjectiles(layer, xOffset, yOffset) {
    for (var i = 0; i < projectiles.length; ++i) {
        tmpObj = projectiles[i];
        if (tmpObj.active && tmpObj.layer == layer) {
            tmpObj.update(delta);
            if (tmpObj.active && isOnScreen(tmpObj.x - xOffset, tmpObj.y - yOffset, tmpObj.scale)) {
                mainContext.save();
                mainContext.translate(tmpObj.x - xOffset, tmpObj.y - yOffset);
                mainContext.rotate(tmpObj.dir);
                renderProjectile(0, 0, tmpObj, mainContext, 1);
                mainContext.restore();
            }
        }
    }
}

var projectileSprites = {};

function renderProjectile(x, y, obj, ctxt, debug) {
    if (obj.src) {
        var tmpSrc = items.projectiles[obj.indx].src;
        var tmpSprite = projectileSprites[tmpSrc];
        if (!tmpSprite) {
            tmpSprite = new Image();
            tmpSprite.onload = function() {
                this.isLoaded = true;
            }
            tmpSprite.src = ".././img/weapons/" + tmpSrc + ".png";
            projectileSprites[tmpSrc] = tmpSprite;
        }
        if (tmpSprite.isLoaded)
            ctxt.drawImage(tmpSprite, x - (obj.scale / 2), y - (obj.scale / 2), obj.scale, obj.scale);
    } else if (obj.indx == 1) {
        ctxt.fillStyle = "#939393";
        renderCircle(x, y, obj.scale, ctxt);
    }
}

function renderWaterBodies(xOffset, yOffset, ctxt, padding) {

    var tmpW = config.riverWidth + padding;
    var tmpY = (config.mapScale / 2) - yOffset - (tmpW / 2);
    if (tmpY < maxScreenHeight && tmpY + tmpW > 0) {
        ctxt.fillRect(0, tmpY, maxScreenWidth, tmpW);
    }
}

// render fix - i
var volanco = {
    land: null,
    lava: null,
    animationTime: 0,
    x: 13960,
    y: 13960,
};

function drawRegularPolygon(e, t, i) {
    let s = e.lineWidth || 0;
    let n = i / 2;
    e.beginPath();
    let a = (Math.PI * 2) / t;
    for (let l = 0; l < t; l++) {
        let o = n + (n - s / 2) * Math.cos(a * l);
        let r = n + (n - s / 2) * Math.sin(a * l);
        e.lineTo(o, r);
    }
    e.closePath();
}

function drawVolancoImage() {
    let e = 3200 * 2;
    let t = document.createElement("canvas");
    t.width = e;
    t.height = e;
    let i = t.getContext("2d");
    i.strokeStyle = "#3e3e3e";
    i.lineWidth = outlineWidth * 2;
    i.fillStyle = "#7f7f7f";
    drawRegularPolygon(i, 10, e);
    i.fill();
    i.stroke();
    volanco.land = t;
    let s = 100 * 2;
    let n = document.createElement("canvas");
    n.width = s;
    n.height = s;
    let a = n.getContext("2d");
    a.strokeStyle = outlineColor;
    a.lineWidth = outlineWidth * 1.6;
    a.fillStyle = "#f54e16";
    a.strokeStyle = "#f56f16";
    drawRegularPolygon(a, 10, s);
    a.fill();
    a.stroke();
    volanco.lava = n;
}

function renderGameObjects(layer, xOffset, yOffset) {
    var tmpSprite, tmpX, tmpY;
    for (var i = 0; i < gameObjects.length; ++i) {
        tmpObj = gameObjects[i];
        if (tmpObj.active) {
            tmpX = tmpObj.x + tmpObj.xWiggle - xOffset;
            tmpY = tmpObj.y + tmpObj.yWiggle - yOffset;
            if (layer == 0) {
                tmpObj.update(delta);
            }
            if (tmpObj.layer == layer && isOnScreen(tmpX, tmpY, tmpObj.scale + (tmpObj.blocker || 0))) {
                mainContext.globalAlpha = tmpObj.hideFromEnemy ? 0.6 : 1;
                if (tmpObj.isItem) {
                    tmpSprite = getItemSprite(tmpObj);
                    mainContext.save();
                    mainContext.translate(tmpX, tmpY);
                    mainContext.rotate(tmpObj.dir);
                    mainContext.drawImage(tmpSprite, -(tmpSprite.width / 2), -(tmpSprite.height / 2));
                    if (tmpObj.blocker) {
                        mainContext.strokeStyle = "#db6e6e";
                        mainContext.globalAlpha = 0.3;
                        mainContext.lineWidth = 6;
                        renderCircle(0, 0, tmpObj.blocker, mainContext, false, true);
                    }
                    mainContext.restore();
                } else {
                    tmpSprite = getResSprite(tmpObj);
                    if (player && tmpObj.type === 0) {
                        const distanceToPlayer = Math.hypot(player.x - tmpObj.x, player.y - tmpObj.y);
                        const maxDist = 300;
                        const minDist = 100;
                        let treeAlpha = 1;
                        let hitboxAlpha = 0;
                        if (distanceToPlayer < maxDist) {
                            let t = (distanceToPlayer - minDist) / (maxDist - minDist);
                            t = Math.max(Math.min(t, 1), 0);
                            treeAlpha = t;
                            hitboxAlpha = 1 - t;
                        }
                        tmpSprite = getResSprite(tmpObj);
                        if (treeAlpha > 0) {
                            mainContext.save();
                            mainContext.globalAlpha = treeAlpha;
                            mainContext.drawImage(tmpSprite, tmpX - tmpSprite.width / 2, tmpY - tmpSprite.height / 2);
                            mainContext.restore();
                        }
                        if (hitboxAlpha > 0) {
                            mainContext.save();
                            mainContext.globalAlpha = hitboxAlpha;
                            mainContext.strokeStyle = "#000000";
                            mainContext.lineWidth = 2;
                            mainContext.fillStyle = "#1c1c1c";
                            renderCircle(tmpX, tmpY, tmpObj.scale * 0.6, mainContext, false, false);
                            mainContext.restore();
                        }
                    } else if (tmpObj.type === 4) {
                        mainContext.globalAlpha = 1;
                        volanco.animationTime += delta;
                        volanco.animationTime %= 3200;
                        let c = 3200 / 2;
                        let d = 1.7 + (Math.abs(c - volanco.animationTime) / c) * 0.3;
                        let p = 100 * d;
                        mainContext.drawImage(volanco.land, tmpX - 320, tmpY - 320, 320 * 2, 320 * 2);
                        mainContext.drawImage(volanco.lava, tmpX - p, tmpY - p, p * 2, p * 2);
                    } else {
                        mainContext.drawImage(tmpSprite, tmpX - (tmpSprite.width / 2), tmpY - (tmpSprite.height / 2));
                    }
                }
            }
        }
    }
}
drawVolancoImage();

function playerHitAnimation(sid, didHit, index) {
    tmpObj = findPlayerBySID(sid);
    if (tmpObj) {
        tmpObj.startAnim(didHit, index);
        if (index < 9) {
            tmpObj.primaryReload = -MainScript.tickSpeed / items.weapons[index].speed
        } else {
            tmpObj.secondaryReload = -MainScript.tickSpeed / items.weapons[index].speed
        }
    }
}

function renderPlayers(xOffset, yOffset, zIndex) {
    mainContext.globalAlpha = 1;
    for (var i = 0; i < players.length; ++i) {
        tmpObj = players[i];
        if (tmpObj.zIndex == zIndex) {
            tmpObj.animate(delta);
            if (tmpObj.visible) {
                tmpObj.skinRot += (0.002 * delta);
                tmpDir = ((tmpObj == player) ? getAttackDir() : tmpObj.dir) + tmpObj.dirPlus;
                mainContext.save();
                mainContext.translate(tmpObj.x - xOffset, tmpObj.y - yOffset);

                mainContext.rotate(tmpDir);
                renderPlayer(tmpObj, mainContext);
                mainContext.restore();
            }
        }
    }
}

function renderPlayer(obj, ctxt) {
    ctxt = ctxt || mainContext;
    ctxt.lineWidth = outlineWidth;
    ctxt.lineJoin = "miter";
    var handAngle = (Math.PI / 4) * (items.weapons[obj.weaponIndex].armS || 1);
    var oHandAngle = (obj.buildIndex < 0) ? (items.weapons[obj.weaponIndex].hndS || 1) : 1;
    var oHandDist = (obj.buildIndex < 0) ? (items.weapons[obj.weaponIndex].hndD || 1) : 1;

    if (obj.tailIndex > 0) {
        renderTail(obj.tailIndex, ctxt, obj);
    }

    if (obj.buildIndex < 0 && !items.weapons[obj.weaponIndex].aboveHand) {
        renderTool(items.weapons[obj.weaponIndex], config.weaponVariants[obj.weaponVariant].src, obj.scale, 0, ctxt);
        if (items.weapons[obj.weaponIndex].projectile != undefined && !items.weapons[obj.weaponIndex].hideProjectile) {
            renderProjectile(obj.scale, 0,
                items.projectiles[items.weapons[obj.weaponIndex].projectile], mainContext);
        }
    }

    ctxt.fillStyle = config.skinColors[obj.skinColor];
    renderCircle(obj.scale * Math.cos(handAngle), (obj.scale * Math.sin(handAngle)), 14);
    renderCircle((obj.scale * oHandDist) * Math.cos(-handAngle * oHandAngle),
        (obj.scale * oHandDist) * Math.sin(-handAngle * oHandAngle), 14);

    if (obj.buildIndex < 0 && items.weapons[obj.weaponIndex].aboveHand) {
        renderTool(items.weapons[obj.weaponIndex], config.weaponVariants[obj.weaponVariant].src, obj.scale, 0, ctxt);
        if (items.weapons[obj.weaponIndex].projectile != undefined && !items.weapons[obj.weaponIndex].hideProjectile) {
            renderProjectile(obj.scale, 0,
                items.projectiles[items.weapons[obj.weaponIndex].projectile], mainContext);
        }
    }

    if (obj.buildIndex >= 0) {
        var tmpSprite = getItemSprite(items.list[obj.buildIndex]);
        ctxt.drawImage(tmpSprite, obj.scale - items.list[obj.buildIndex].holdOffset, -tmpSprite.width / 2);
    }

    renderCircle(0, 0, obj.scale, ctxt);

    if (obj.skinIndex > 0) {
        ctxt.rotate(Math.PI / 2);
        renderSkin(obj.skinIndex, ctxt, null, obj);
    }
}

var skinSprites = {};
var skinPointers = {};
var tmpSkin;

function renderSkin(index, ctxt, parentSkin, owner) {
    tmpSkin = skinSprites[index];
    if (!tmpSkin) {
        var tmpImage = new Image();
        tmpImage.onload = function() {
            this.isLoaded = true;
            this.onload = null;
        };
        tmpImage.src = ".././img/hats/hat_" + index + ".png";
        skinSprites[index] = tmpImage;
        tmpSkin = tmpImage;
    }
    var tmpObj = parentSkin || skinPointers[index];
    if (!tmpObj) {
        for (var i = 0; i < hats.length; ++i) {
            if (hats[i].id == index) {
                tmpObj = hats[i];
                break;
            }
        }
        skinPointers[index] = tmpObj;
    }
    if (tmpSkin.isLoaded)
        ctxt.drawImage(tmpSkin, -tmpObj.scale / 2, -tmpObj.scale / 2, tmpObj.scale, tmpObj.scale);
    if (!parentSkin && tmpObj.topSprite) {
        ctxt.save();
        ctxt.rotate(owner.skinRot);
        renderSkin(index + "_top", ctxt, tmpObj, owner);
        ctxt.restore();
    }
}

var accessSprites = {};
var accessPointers = {};

function renderTail(index, ctxt, owner) {
    tmpSkin = accessSprites[index];
    if (!tmpSkin) {
        var tmpImage = new Image();
        tmpImage.onload = function() {
            this.isLoaded = true;
            this.onload = null;
        };
        tmpImage.src = ".././img/accessories/access_" + index + ".png";
        accessSprites[index] = tmpImage;
        tmpSkin = tmpImage;
    }
    var tmpObj = accessPointers[index];
    if (!tmpObj) {
        for (var i = 0; i < accessories.length; ++i) {
            if (accessories[i].id == index) {
                tmpObj = accessories[i];
                break;
            }
        }
        accessPointers[index] = tmpObj;
    }
    if (tmpSkin.isLoaded) {
        ctxt.save();
        ctxt.translate(-20 - (tmpObj.xOff || 0), 0);
        if (tmpObj.spin)
            ctxt.rotate(owner.skinRot);
        ctxt.drawImage(tmpSkin, -(tmpObj.scale / 2), -(tmpObj.scale / 2), tmpObj.scale, tmpObj.scale);
        ctxt.restore();
    }
}

var toolSprites = {};

function renderTool(obj, variant, x, y, ctxt) {
    var tmpSrc = obj.src + (variant || "");
    var tmpSprite = toolSprites[tmpSrc];
    if (!tmpSprite) {
        tmpSprite = new Image();
        tmpSprite.onload = function() {
            this.isLoaded = true;
        }
        tmpSprite.src = ".././img/weapons/" + tmpSrc + ".png";
        toolSprites[tmpSrc] = tmpSprite;
    }
    if (tmpSprite.isLoaded)
        ctxt.drawImage(tmpSprite, x + obj.xOff - (obj.length / 2), y + obj.yOff - (obj.width / 2), obj.length, obj.width);
}

var gameObjectSprites = {};

function getResSprite(obj) {
    var biomeID = (obj.y >= config.mapScale - config.snowBiomeTop) ? 2 : ((obj.y <= config.snowBiomeTop) ? 1 : 0);
    var tmpIndex = (obj.type + "_" + obj.scale + "_" + biomeID);
    var tmpSprite = gameObjectSprites[tmpIndex];
    if (!tmpSprite) {
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = tmpCanvas.height = (obj.scale * 2.1) + outlineWidth;
        var tmpContext = tmpCanvas.getContext('2d');
        tmpContext.translate((tmpCanvas.width / 2), (tmpCanvas.height / 2));
        tmpContext.rotate(UTILS.randFloat(0, Math.PI));
        tmpContext.strokeStyle = outlineColor;
        tmpContext.lineWidth = outlineWidth;
        if (obj.type == 0) {
            var tmpScale;
            for (var i = 0; i < 2; ++i) {
                tmpScale = tmpObj.scale * (!i ? 1 : 0.5);
                renderStar(tmpContext, 8, tmpScale, tmpScale * 0.7);
                tmpContext.fillStyle = !biomeID ? (!i ? "#9ebf57" : "#b4db62") : (!i ? "#e3f1f4" : "#fff");
                tmpContext.fill();
                if (!i)
                    tmpContext.stroke();
            }
        } else if (obj.type == 1) {
            if (biomeID == 2) {
                tmpContext.fillStyle = "#606060";
                renderStar(tmpContext, 6, obj.scale * 0.3, obj.scale * 0.71);
                tmpContext.fill();
                tmpContext.stroke();
                tmpContext.fillStyle = "#89a54c";
                renderCircle(0, 0, obj.scale * 0.55, tmpContext);
                tmpContext.fillStyle = "#a5c65b";
                renderCircle(0, 0, obj.scale * 0.3, tmpContext, true);
            } else {
                renderBlob(tmpContext, 6, tmpObj.scale, tmpObj.scale * 0.7);
                tmpContext.fillStyle = biomeID ? "#e3f1f4" : "#89a54c";
                tmpContext.fill();
                tmpContext.stroke();
                tmpContext.fillStyle = biomeID ? "#6a64af" : "#c15555";
                var tmpRange;
                var berries = 4;
                var rotVal = mathPI2 / berries;
                for (var i = 0; i < berries; ++i) {
                    tmpRange = UTILS.randInt(tmpObj.scale / 3.5, tmpObj.scale / 2.3);
                    renderCircle(tmpRange * Math.cos(rotVal * i), tmpRange * Math.sin(rotVal * i),
                        UTILS.randInt(10, 12), tmpContext);
                }
            }
        } else if (obj.type == 2 || obj.type == 3) {
            tmpContext.fillStyle = (obj.type == 2) ? (biomeID == 2 ? "#938d77" : "#939393") : "#e0c655";
            renderStar(tmpContext, 3, obj.scale, obj.scale);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = (obj.type == 2) ? (biomeID == 2 ? "#b2ab90" : "#bcbcbc") : "#ebdca3";
            renderStar(tmpContext, 3, obj.scale * 0.55, obj.scale * 0.65);
            tmpContext.fill();
        }
        tmpSprite = tmpCanvas;
        gameObjectSprites[tmpIndex] = tmpSprite;
    }
    return tmpSprite;
}

var itemSprites = [];

function getItemSprite(obj, asIcon) {
    var tmpSprite = itemSprites[obj.id];
    if (!tmpSprite || asIcon) {
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = tmpCanvas.height = (obj.scale * 2.5) + outlineWidth +
            (items.list[obj.id].spritePadding || 0);
        var tmpContext = tmpCanvas.getContext('2d');
        tmpContext.translate((tmpCanvas.width / 2), (tmpCanvas.height / 2));
        tmpContext.rotate(asIcon ? 0 : (Math.PI / 2));
        tmpContext.strokeStyle = outlineColor;
        tmpContext.lineWidth = outlineWidth * (asIcon ? (tmpCanvas.width / 81) : 1);
        if (obj.name == "apple") {
            tmpContext.fillStyle = "#c15555";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fillStyle = "#89a54c";
            var leafDir = -(Math.PI / 2);
            renderLeaf(obj.scale * Math.cos(leafDir), obj.scale * Math.sin(leafDir),
                25, leafDir + Math.PI / 2, tmpContext);
        } else if (obj.name == "cookie") {
            tmpContext.fillStyle = "#cca861";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fillStyle = "#937c4b";
            var chips = 4;
            var rotVal = mathPI2 / chips;
            var tmpRange;
            for (var i = 0; i < chips; ++i) {
                tmpRange = UTILS.randInt(obj.scale / 2.5, obj.scale / 1.7);
                renderCircle(tmpRange * Math.cos(rotVal * i), tmpRange * Math.sin(rotVal * i),
                    UTILS.randInt(4, 5), tmpContext, true);
            }
        } else if (obj.name == "cheese") {
            tmpContext.fillStyle = "#f4f3ac";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fillStyle = "#c3c28b";
            var chips = 4;
            var rotVal = mathPI2 / chips;
            var tmpRange;
            for (var i = 0; i < chips; ++i) {
                tmpRange = UTILS.randInt(obj.scale / 2.5, obj.scale / 1.7);
                renderCircle(tmpRange * Math.cos(rotVal * i), tmpRange * Math.sin(rotVal * i),
                    UTILS.randInt(4, 5), tmpContext, true);
            }
        } else if (obj.name == "wood wall" || obj.name == "stone wall" || obj.name == "castle wall") {
            tmpContext.fillStyle = (obj.name == "castle wall") ? "#83898e" : (obj.name == "wood wall") ?
                "#a5974c" : "#939393";
            var sides = (obj.name == "castle wall") ? 4 : 3;
            renderStar(tmpContext, sides, obj.scale * 1.1, obj.scale * 1.1);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = (obj.name == "castle wall") ? "#9da4aa" : (obj.name == "wood wall") ?
                "#c9b758" : "#bcbcbc";
            renderStar(tmpContext, sides, obj.scale * 0.65, obj.scale * 0.65);
            tmpContext.fill();
        } else if (obj.name == "spikes" || obj.name == "greater spikes" || obj.name == "poison spikes" ||
            obj.name == "spinning spikes") {
            tmpContext.fillStyle = (obj.name == "poison spikes") ? "#7b935d" : "#939393";
            var tmpScale = (obj.scale * 0.6);
            renderStar(tmpContext, (obj.name == "spikes") ? 5 : 6, obj.scale, tmpScale);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#a5974c";
            renderCircle(0, 0, tmpScale, tmpContext);
            tmpContext.fillStyle = "#c9b758";
            renderCircle(0, 0, tmpScale / 2, tmpContext, true);
        } else if (obj.name == "windmill" || obj.name == "faster windmill" || obj.name == "power mill") {
            tmpContext.fillStyle = "#a5974c";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fillStyle = "#c9b758";
            renderRectCircle(0, 0, obj.scale * 1.5, 29, 4, tmpContext);
            tmpContext.fillStyle = "#a5974c";
            renderCircle(0, 0, obj.scale * 0.5, tmpContext);
        } else if (obj.name == "mine") {
            tmpContext.fillStyle = "#939393";
            renderStar(tmpContext, 3, obj.scale, obj.scale);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#bcbcbc";
            renderStar(tmpContext, 3, obj.scale * 0.55, obj.scale * 0.65);
            tmpContext.fill();
        } else if (obj.name == "sapling") {
            for (var i = 0; i < 2; ++i) {
                var tmpScale = obj.scale * (!i ? 1 : 0.5);
                renderStar(tmpContext, 7, tmpScale, tmpScale * 0.7);
                tmpContext.fillStyle = (!i ? "#9ebf57" : "#b4db62");
                tmpContext.fill();
                if (!i) tmpContext.stroke();
            }
        } else if (obj.name == "pit trap") {
            tmpContext.fillStyle = "#a5974c";
            renderStar(tmpContext, 3, obj.scale * 1.1, obj.scale * 1.1);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = outlineColor;
            renderStar(tmpContext, 3, obj.scale * 0.65, obj.scale * 0.65);
            tmpContext.fill();
        } else if (obj.name == "boost pad") {
            tmpContext.fillStyle = "#7e7f82";
            renderRect(0, 0, obj.scale * 2, obj.scale * 2, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#dbd97d";
            renderTriangle(obj.scale * 1, tmpContext);
        } else if (obj.name == "turret") {
            tmpContext.fillStyle = "#a5974c";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#939393";
            var tmpLen = 50;
            renderRect(0, -tmpLen / 2, obj.scale * 0.9, tmpLen, tmpContext);
            renderCircle(0, 0, obj.scale * 0.6, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
        } else if (obj.name == "platform") {
            tmpContext.fillStyle = "#cebd5f";
            var tmpCount = 4;
            var tmpS = obj.scale * 2;
            var tmpW = tmpS / tmpCount;
            var tmpX = -(obj.scale / 2);
            for (var i = 0; i < tmpCount; ++i) {
                renderRect(tmpX - (tmpW / 2), 0, tmpW, obj.scale * 2, tmpContext);
                tmpContext.fill();
                tmpContext.stroke();
                tmpX += tmpS / tmpCount;
            }
        } else if (obj.name == "healing pad") {
            tmpContext.fillStyle = "#7e7f82";
            renderRect(0, 0, obj.scale * 2, obj.scale * 2, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#db6e6e";
            renderRectCircle(0, 0, obj.scale * 0.65, 20, 4, tmpContext, true);
        } else if (obj.name == "spawn pad") {
            tmpContext.fillStyle = "#7e7f82";
            renderRect(0, 0, obj.scale * 2, obj.scale * 2, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.fillStyle = "#71aad6";
            renderCircle(0, 0, obj.scale * 0.6, tmpContext);
        } else if (obj.name == "blocker") {
            tmpContext.fillStyle = "#7e7f82";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.rotate(Math.PI / 4);
            tmpContext.fillStyle = "#db6e6e";
            renderRectCircle(0, 0, obj.scale * 0.65, 20, 4, tmpContext, true);
        } else if (obj.name == "teleporter") {
            tmpContext.fillStyle = "#7e7f82";
            renderCircle(0, 0, obj.scale, tmpContext);
            tmpContext.fill();
            tmpContext.stroke();
            tmpContext.rotate(Math.PI / 4);
            tmpContext.fillStyle = "#d76edb";
            renderCircle(0, 0, obj.scale * 0.5, tmpContext, true);
        }
        tmpSprite = tmpCanvas;
        if (!asIcon)
            itemSprites[obj.id] = tmpSprite;
    }
    return tmpSprite;
}

function renderLeaf(x, y, l, r, ctxt) {
    var endX = x + (l * Math.cos(r));
    var endY = y + (l * Math.sin(r));
    var width = l * 0.4;
    ctxt.moveTo(x, y);
    ctxt.beginPath();
    ctxt.quadraticCurveTo(((x + endX) / 2) + (width * Math.cos(r + Math.PI / 2)),
        ((y + endY) / 2) + (width * Math.sin(r + Math.PI / 2)), endX, endY);
    ctxt.quadraticCurveTo(((x + endX) / 2) - (width * Math.cos(r + Math.PI / 2)),
        ((y + endY) / 2) - (width * Math.sin(r + Math.PI / 2)), x, y);
    ctxt.closePath();
    ctxt.fill();
    ctxt.stroke();
}

function renderCircle(x, y, scale, tmpContext, dontStroke, dontFill) {
    tmpContext = tmpContext || mainContext;
    tmpContext.beginPath();
    tmpContext.arc(x, y, scale, 0, 2 * Math.PI);
    if (!dontFill) tmpContext.fill();
    if (!dontStroke) tmpContext.stroke();
}

function renderStar(ctxt, spikes, outer, inner) {
    var rot = Math.PI / 2 * 3;
    var x, y;
    var step = Math.PI / spikes;
    ctxt.beginPath();
    ctxt.moveTo(0, -outer);
    for (var i = 0; i < spikes; i++) {
        x = Math.cos(rot) * outer;
        y = Math.sin(rot) * outer;
        ctxt.lineTo(x, y);
        rot += step;
        x = Math.cos(rot) * inner;
        y = Math.sin(rot) * inner;
        ctxt.lineTo(x, y);
        rot += step;
    }
    ctxt.lineTo(0, -outer);
    ctxt.closePath();
}

function renderRect(x, y, w, h, ctxt, stroke) {
    ctxt.fillRect(x - (w / 2), y - (h / 2), w, h);
    if (!stroke)
        ctxt.strokeRect(x - (w / 2), y - (h / 2), w, h);
}

function renderRectCircle(x, y, s, sw, seg, ctxt, stroke) {
    ctxt.save();
    ctxt.translate(x, y);
    seg = Math.ceil(seg / 2);
    for (var i = 0; i < seg; i++) {
        renderRect(0, 0, s * 2, sw, ctxt, stroke);
        ctxt.rotate(Math.PI / seg);
    }
    ctxt.restore();
}

function renderBlob(ctxt, spikes, outer, inner) {
    var rot = Math.PI / 2 * 3;
    var x, y;
    var step = Math.PI / spikes;
    var tmpOuter;
    ctxt.beginPath();
    ctxt.moveTo(0, -inner);
    for (var i = 0; i < spikes; i++) {
        tmpOuter = UTILS.randInt(outer + 0.9, outer * 1.2);
        ctxt.quadraticCurveTo(Math.cos(rot + step) * tmpOuter, Math.sin(rot + step) * tmpOuter,
            Math.cos(rot + (step * 2)) * inner, Math.sin(rot + (step * 2)) * inner);
        rot += step * 2;
    }
    ctxt.lineTo(0, -inner);
    ctxt.closePath();
}

function renderTriangle(s, ctx) {
    ctx = ctx || mainContext;
    var h = s * (Math.sqrt(3) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-s / 2, h / 2);
    ctx.lineTo(s / 2, h / 2);
    ctx.lineTo(0, -h / 2);
    ctx.fill();
    ctx.closePath();
}

function prepareMenuBackground() {
    var tmpMid = config.mapScale / 2;
    var numObjects = 25;
    var maxTries = 100;

    const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const minCoord = -1000;
    const maxCoord = 1000;

    const treeScales = config.treeScales;
    const bushScales = config.bushScales;
    const rockScales = config.rockScales;
    const treeId = 0;
    const bushId = 1;
    const rockId = 2;
    const specialItemId = items.list[4].id;
    const specialItemScale = items.list[4].scale;
    const specialItemProp = items.list[10];

    const placedObjects = [];

    const getObjectRadius = (scale, objectId) => {
        if (objectId === treeId) return scale * 0.4;
        if (objectId === bushId) return scale * 0.5;
        if (objectId === rockId) return scale * 0.6;
        return scale * 0.5;
    };
    /**
     * Checks if a new object (newX, newY, newRadius) collides with any existing object.
     * Uses the distance formula: distance < radius1 + radius2
     */
    const isColliding = (newX, newY, newRadius) => {
        for (const existingObj of placedObjects) {
            const dx = newX - existingObj.x;
            const dy = newY - existingObj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const minDistance = newRadius + existingObj.radius;

            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    };

    const objectPool = [{
            id: treeId,
            getScale: () => getRandomItem(treeScales)
        },
        {
            id: treeId,
            getScale: () => getRandomItem(treeScales)
        },
        {
            id: treeId,
            getScale: () => getRandomItem(treeScales)
        },
        {
            id: bushId,
            getScale: () => getRandomItem(bushScales)
        },
        {
            id: bushId,
            getScale: () => getRandomItem(bushScales)
        },
        {
            id: rockId,
            getScale: () => getRandomItem(rockScales)
        },
        {
            id: rockId,
            getScale: () => getRandomItem(rockScales)
        },
        {
            id: specialItemId,
            getScale: () => specialItemScale,
            prop: specialItemProp
        }
    ];

    for (let i = 0; i < numObjects; i++) {
        let placed = false;
        let tries = 0;

        while (!placed && tries < maxTries) {
            const offsetX = Math.floor(Math.random() * (maxCoord - minCoord + 1)) + minCoord;
            const offsetY = Math.floor(Math.random() * (maxCoord - minCoord + 1)) + minCoord;
            const x = tmpMid + offsetX;
            const y = tmpMid + offsetY;

            const randomObject = getRandomItem(objectPool);
            const scale = randomObject.getScale();
            const objectId = randomObject.id;
            const prop = randomObject.prop || 0;

            const radius = getObjectRadius(scale, objectId);

            if (!isColliding(x, y, radius)) {
                objectManager.add(i, x, y, 0, scale, objectId, prop);
                placedObjects.push({
                    x: x,
                    y: y,
                    radius: radius
                });
                placed = true;
            }
            tries++;
        }
    }
}

function loadGameObject(data) {
    for (var i = 0; i < data.length;) {
        objectManager.add(data[i], data[i + 1], data[i + 2], data[i + 3], data[i + 4],
            data[i + 5], items.list[data[i + 6]], true, (data[i + 7] >= 0 ? {
                sid: data[i + 7]
            } : null));
        i += 8;
    }
}

function wiggleGameObject(dir, sid) {
    tmpObj = findObjectBySid(sid);
    if (tmpObj) {
        tmpObj.xWiggle += config.gatherWiggle * Math.cos(dir);
        tmpObj.yWiggle += config.gatherWiggle * Math.sin(dir);
    }
}

function shootTurret(sid, dir) {
    tmpObj = findObjectBySid(sid);
    if (tmpObj) {
        tmpObj.dir = dir;
        tmpObj.xWiggle += config.gatherWiggle * Math.cos(dir + Math.PI);
        tmpObj.yWiggle += config.gatherWiggle * Math.sin(dir + Math.PI);
    }
}

function addProjectile(x, y, dir, range, speed, indx, layer, sid) {
    if (inWindow) {
        projectileManager.addProjectile(x, y, dir, range, speed, indx, null, null, layer).sid = sid;
    }
}

function remProjectile(sid, range) {
    for (var i = 0; i < projectiles.length; ++i) {
        if (projectiles[i].sid == sid) {
            projectiles[i].range = range;
        }
    }
}

function animateAI(sid) {
    tmpObj = findAIBySID(sid);
    if (tmpObj) tmpObj.startAnim();
}

function loadAI(data) {
    for (var i = 0; i < ais.length; ++i) {
        ais[i].forcePos = !ais[i].visible;
        ais[i].visible = false;
    }
    if (data) {
        var tmpTime = Date.now();
        for (var i = 0; i < data.length;) {
            tmpObj = findAIBySID(data[i]);
            if (tmpObj) {
                tmpObj.index = data[i + 1];
                tmpObj.t1 = (tmpObj.t2 === undefined) ? tmpTime : tmpObj.t2;
                tmpObj.t2 = tmpTime;
                tmpObj.x1 = tmpObj.x;
                tmpObj.y1 = tmpObj.y;
                tmpObj.x2 = data[i + 2];
                tmpObj.y2 = data[i + 3];
                tmpObj.d1 = (tmpObj.d2 === undefined) ? data[i + 4] : tmpObj.d2;
                tmpObj.d2 = data[i + 4];
                tmpObj.health = data[i + 5];
                tmpObj.dt = 0;
                tmpObj.visible = true;
            } else {
                tmpObj = aiManager.spawn(data[i + 2], data[i + 3], data[i + 4], data[i + 1]);
                tmpObj.x2 = tmpObj.x;
                tmpObj.y2 = tmpObj.y;
                tmpObj.d2 = tmpObj.dir;
                tmpObj.health = data[i + 5];
                if (!aiManager.aiTypes[data[i + 1]].name)
                    tmpObj.name = config.cowNames[data[i + 6]];
                tmpObj.forcePos = true;
                tmpObj.sid = data[i];
                tmpObj.visible = true;
            }
            i += 7;
        }
    }
}

var aiSprites = {};

function renderAI(obj, ctxt) {
    var tmpIndx = obj.index;
    var tmpSprite = aiSprites[tmpIndx];
    if (!tmpSprite) {
        var tmpImg = new Image();
        tmpImg.onload = function() {
            this.isLoaded = true;
            this.onload = null;
        };
        tmpImg.src = ".././img/animals/" + obj.src + ".png";
        tmpSprite = tmpImg;
        aiSprites[tmpIndx] = tmpSprite;
    }
    if (tmpSprite.isLoaded) {
        var tmpScale = obj.scale * 1.2 * (obj.spriteMlt || 1);
        ctxt.drawImage(tmpSprite, -tmpScale, -tmpScale, tmpScale * 2, tmpScale * 2);
    }
}

function isOnScreen(x, y, s) {
    return (x + s >= 0 && x - s <= maxScreenWidth && y + s >= 0 && y - s <= maxScreenHeight)
}

function addPlayer(data, isYou) {
    var tmpPlayer = findPlayerByID(data[0]);
    if (!tmpPlayer) {
        tmpPlayer = new Player(data[0], data[1], config, UTILS, projectileManager,
            objectManager, players, ais, items, hats, accessories);
        players.push(tmpPlayer);
    }
    tmpPlayer.spawn(isYou ? moofoll : null);
    tmpPlayer.visible = false;
    tmpPlayer.x2 = undefined;
    tmpPlayer.y2 = undefined;
    tmpPlayer.setData(data);
    if (isYou) {
        player = tmpPlayer;
        camX = player.x;
        camY = player.y;
        updateItems();
        updateStatusDisplay();
        updateAge();
        updateUpgrades(0);
        updateItemCountDisplay();
        gameUI.style.display = "block";
    }
}

function removePlayer(id) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].id == id) {
            players.splice(i, 1);
            break;
        }
    }
}

function updateItemCounts(index, value) {
    if (player) {
        player.itemCounts[index] = value;
        updateItemCountDisplay(index);
    }
}

let isItemSetted = [];

function updateItemCountDisplay(index = undefined) {
    for (let i = 3; i < items.list.length; ++i) {
        let id = items.list[i].group.id;
        let counts = items.weapons.length + i;
        if (!isItemSetted[counts]) {
            isItemSetted[counts] = document.createElement("div");
            isItemSetted[counts].id = "itemCount" + counts;
            document.getElementById("actionBarItem" + counts).appendChild(isItemSetted[counts]);
            isItemSetted[counts].style = `
        display: block;
        position: absolute;
        padding-left: 5px;
        font-size: 2em;
        color: #fff;
        `;
            isItemSetted[counts].innerHTML = player.itemCounts[id] || 0;
        } else {
            if (index == id) isItemSetted[counts].innerHTML = player.itemCounts[index] || 0;
        }
    }
}

function updatePlayerValue(index, value, updateView) {
    if (player) {
        player[index] = value;
        if (updateView) updateStatusDisplay();
        if (index == "points") autoBuy.buyNext();
    }
}

// need to add shame logic here later
function updateHealth(sid, value) {
    tmpObj = findPlayerBySID(sid);
    if (tmpObj) {
        tmpObj.health = value;
    }
    if (player.health < 100) {
        setTimeout(() => {
            place(0, getAttackDir(), 1);
        }, 120)
    }
}

function isTeam(tmpObj) {
    return (tmpObj == player || (tmpObj.team && tmpObj.team == player.team));
}

function isAlly(sid, playerSid) {
    tmpObj = findPlayerBySID(sid);
    if (!tmpObj) return
    if (playerSid) {
        let pObj = findPlayerBySID(playerSid);
        if (!pobj) return;
        if (pObj.sid == sid) {
            return true;
        } else if (tmpObj.team) {
            return tmpObj.team === pObj.team ? true : false;
        } else {
            return false;
        }
    }
    if (!tmpObj) return
    if (player.sid == sid) {
        return true;
    } else if (tmpObj.team) {
        return tmpObj.team === player.team ? true : false;
    } else {
        return false;
    }
}

// update ticks
function updatePlayers(data) {
    var tmpTime = Date.now();
    for (var i = 0; i < players.length; ++i) {
        players[i].forcePos = !players[i].visible;
        players[i].visible = false;
    }
    for (var i = 0; i < data.length;) {
        tmpObj = findPlayerBySID(data[i]);
        if (tmpObj) {
            tmpObj.t1 = (tmpObj.t2 === undefined) ? tmpTime : tmpObj.t2;
            tmpObj.t2 = tmpTime;
            tmpObj.x1 = tmpObj.x;
            tmpObj.y1 = tmpObj.y;
            tmpObj.x2 = data[i + 1];
            tmpObj.y2 = data[i + 2];
            tmpObj.d1 = (tmpObj.d2 === undefined) ? data[i + 3] : tmpObj.d2;
            tmpObj.d2 = data[i + 3];
            tmpObj.dt = 0;
            tmpObj.buildIndex = data[i + 4];
            tmpObj.weaponIndex = data[i + 5];
            tmpObj.weaponVariant = data[i + 6];
            tmpObj.team = data[i + 7];
            tmpObj.isLeader = data[i + 8];
            tmpObj.skinIndex = data[i + 9];
            tmpObj.tailIndex = data[i + 10];
            tmpObj.iconIndex = data[i + 11];
            tmpObj.zIndex = data[i + 12];
            tmpObj.visible = true;
			MainScript.manageWeapons(tmpObj, player, items);
            let nearTrap = gameObjects.filter(e => e.trap && e.active && UTILS.getDist(e, tmpObj, 0, 2) <= (tmpObj.scale + e.getScale() + 3) && !e.isTeamObject(tmpObj, findAllianceBySid)).sort(function(a, b) {
                return UTILS.getDist(a, tmpObj, 0, 2) - UTILS.getDist(b, tmpObj, 0, 2);
            })[0];
            if (nearTrap) nearTrap.hideFromEnemy = false;
            tmpObj.lastTrap = tmpObj.inTrap;
            tmpObj.inTrap = nearTrap;
            tmpObj.escaped = !tmpObj.inTrap && tmpObj.lastTrap
            MainScript.enemies.nearInfo = players.filter(tmpObj => tmpObj.visible && (tmpObj.team != player.team || tmpObj.team === null) && tmpObj.sid != player.sid).sort((a, b) => {
                return UTILS.getDist(a, player, 2, 2) - UTILS.getDist(b, player, 2, 2);
            });
            if (tmpObj == player) {
                (!MainScript.autoMill.x || !player.oldXY.x) && (MainScript.autoMill.x = player.oldXY.x = tmpObj.x2);
                (!MainScript.autoMill.y || !player.oldXY.y) && (MainScript.autoMill.y = player.oldXY.y = tmpObj.y2);
            }
			MainScript.handleEnemies(player);
        }
        i += 13;
        if (tmpObj.weaponIndex < 9) {
            tmpObj.primaryIndex = tmpObj.weaponIndex;
            tmpObj.primaryVariant = tmpObj.weaponVariant;
        } else if (tmpObj.weaponIndex > 8) {
            tmpObj.secondaryIndex = tmpObj.weaponIndex;
            tmpObj.secondaryVariant = tmpObj.weaponVariant;
        }
    }
    for (let j = 0; j < data.length; j += 13) {
        tmpObj = findPlayerBySID(data[j]);
        if (tmpObj) {
            if (!tmpObj.isTeam(player)) {
                MainScript.enemies.enemy.push(tmpObj);
                if (tmpObj.dist2 <= items.weapons[tmpObj.primaryIndex == undefined ? 5 : tmpObj.primaryIndex].range + player.scale * 2 + 69) {
                    MainScript.enemies.nears.push(tmpObj);
                }
            }
            if (tmpObj.shooting[53]) {
                tmpObj.shooting[53] = 0;
                tmpObj.reloads[53] = (2500 - MainScript.tickSpeed);
            } else {
                if (tmpObj.reloads[53] > 0) {
                    tmpObj.reloads[53] = Math.max(0, tmpObj.reloads[53] - MainScript.tickSpeed);
                }
            }
            if (tmpObj.gathering || tmpObj.shooting[1]) {
                if (tmpObj.gathering) {
                    tmpObj.gathering = 0;
                    tmpObj.reloads[tmpObj.gatherIndex] = items.weapons[tmpObj.gatherIndex].speed * (tmpObj.skinIndex == 20 ? 0.78 : 1);
                }
                if (tmpObj.shooting[1]) {
                    tmpObj.shooting[1] = 0;
                    tmpObj.reloads[tmpObj.shootIndex] = items.weapons[tmpObj.shootIndex].speed * (tmpObj.skinIndex == 20 ? 0.78 : 1);
                }
            } else {
                if (tmpObj.buildIndex < 0) {
                    if (tmpObj.reloads[tmpObj.weaponIndex] > 0) {
                        tmpObj.reloads[tmpObj.weaponIndex] = Math.max(0, tmpObj.reloads[tmpObj.weaponIndex] - MainScript.tickSpeed);
                    }
                }
            }
        }
    }
    macro.f && place(4, getAttackDir(), 1);
    macro.v && place(2, getAttackDir(), 1);
    macro.y && place(5, getAttackDir(), 1);
    macro.h && place(player.getItemType(22), getAttackDir(), 1);
    macro.n && place(3, getAttackDir(), 1);
	autoBuy.buyNext();
    MainScript.handleTickBase(data, tmpObj, player, selectWeapon, buyEquip, checkPlace, isAlly, items, findPlayerBySID);
    MainScript.startAutoMill(player, checkPlace, items);
}

function findID(tmpObj, tmp) {
    return tmpObj.find((thisSID) => thisSID.id == tmp);
}

function findAllianceBySid(sid) {
    return player.team ? alliancePlayers.find((THIS) => THIS === sid) : null;
}

function findPlayerByID(id) {
    for (var i = 0; i < players.length; ++i) {
        if (players[i].id == id) {
            return players[i];
        }
    }
    return null;
}

function findPlayerBySID(sid) {
    for (var i = 0; i < players.length; ++i) {
        if (players[i].sid == sid) {
            return players[i];
        }
    }
    return null;
}

function findAIBySID(sid) {
    for (var i = 0; i < ais.length; ++i) {
        if (ais[i].sid == sid) {
            return ais[i];
        }
    }
    return null;
}

function findObjectBySid(sid) {
    for (var i = 0; i < gameObjects.length; ++i) {
        if (gameObjects[i].sid == sid) {
            return gameObjects[i];
        }
    }
    return null;
}

var lastPing = -1;

function pingSocketResponse() {
    var pingTime = Date.now() - lastPing;
    window.pingTime = pingTime;
    pingDisplay.innerText = "Ping: " + pingTime + " ms"
}

function pingSocket() {
    lastPing = Date.now();
    io.send(CLIENT_PACKETS.PING);
}

function serverShutdownNotice(countdown) {
    if (countdown < 0) return;

    var minutes = Math.floor(countdown / 60);
    var seconds = countdown % 60;
    seconds = ("0" + seconds).slice(-2);

    shutdownDisplay.innerText = "Server restarting in " + minutes + ":" + seconds;
    shutdownDisplay.hidden = false;
}

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        function(callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

function doUpdate() {
    now = Date.now();
    delta = now - lastUpdate;
    lastUpdate = now;
    updateGame();
    requestAnimFrame(doUpdate);
}

function startGame() {
    bindEvents();
    loadIcons();
    loadingText.style.display = "none";
    menuCardHolder.style.display = "block";
    nameInput.value = getSavedVal("moo_name") || "";
    prepareUI();
}
prepareMenuBackground();
doUpdate();

function openLink(link) {
    window.open(link, "_blank")
}

window.openLink = openLink;
window.aJoinReq = aJoinReq;
window.follmoo = follmoo;
window.kickFromClan = kickFromClan;
window.sendJoin = sendJoin;
window.leaveAlliance = leaveAlliance;
window.createAlliance = createAlliance;
window.storeBuy = storeBuy;
window.storeEquip = storeEquip;
window.showItemInfo = showItemInfo;
window.selectSkinColor = selectSkinColor;
window.changeStoreIndex = changeStoreIndex;
window.config = config;
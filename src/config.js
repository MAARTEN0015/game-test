/**
 * config.js
*/
//  RENDER:
export const maxScreenWidth = 1920;
export const maxScreenHeight = 1080;

// SERVER:
export const serverUpdateRate = 9;
export const maxPlayers = 40;
export const maxPlayersHard = maxPlayers + 10;
export const collisionDepth = 6;
export const minimapRate = 3000;

// COLLISIONS:
export const colGrid = 10;

// CLIENT:
export const clientSendRate = 5;

// UI:
export const healthBarWidth = 50;
export const healthBarPad = 4.5;
export const iconPadding = 15;
export const iconPad = 0.9;
export const deathFadeout = 3000;
export const crownIconScale = 60;
export const crownPad = 35;

// CHAT:
export const chatCountdown = 3000;
export const chatCooldown = 500;

// SANDBOX:
export const isSandbox = window.location.hostname == "sandbox.moomoo.io";

// PLAYER:
export const maxAge = 100;
export const gatherAngle = Math.PI / 2.6;
export const gatherWiggle = 10;
export const hitReturnRatio = 0.25;
export const hitAngle = Math.PI / 2;
export const playerScale = 35;
export const playerSpeed = 0.0016;
export const playerDecel = 0.993;
export const nameY = 34;

// CUSTOMIZATION:
export const skinColors = ["#bf8f54", "#cbb091", "#896c4b",
    "#fadadc", "#ececec", "#c37373", "#4c4c4c", "#ecaff7", "#738cc3",
    "#8bc373"];

// ANIMALS:
export const animalCount = 7;
export const aiTurnRandom = 0.06;
export const cowNames = ["Sid", "Steph", "Bmoe", "Romn", "Jononthecool", "Fiona", "Vince", "Nathan", "Nick", "Flappy", "Ronald", "Otis", "Pepe", "Mc Donald", "Theo", "Fabz", "Oliver", "Jeff", "Jimmy", "Helena", "Reaper",
    "Ben", "Alan", "Naomi", "XYZ", "Clever", "Jeremy", "Mike", "Destined", "Stallion", "Allison", "Meaty", "Sophia", "Vaja", "Joey", "Pendy", "Murdoch", "Theo", "Jared", "July", "Sonia", "Mel", "Dexter", "Quinn", "Milky"];

// WEAPONS:
export const shieldAngle = Math.PI / 3;
export const weaponVariants = [{
    id: 0,
    src: "",
    xp: 0,
    val: 1
}, {
    id: 1,
    src: "_g",
    xp: 3000,
    val: 1.1
}, {
    id: 2,
    src: "_d",
    xp: 7000,
    val: 1.18
}, {
    id: 3,
    src: "_r",
    poison: true,
    xp: 12000,
    val: 1.18
}, {
    id: 4,
    src: "_e",
    poison: true,
    heal: true,
    xp: 24000,
    val: 1.18,
}];

export const fetchVariant = function (player) {
    var tmpXP = player.weaponXP[player.weaponIndex] || 0;

    for (var i = weaponVariants.length - 1; i >= 0; --i) {
        if (tmpXP >= weaponVariants[i].xp)
            return weaponVariants[i];
    }
};

// NATURE:
export const resourceTypes = ["wood", "food", "stone", "points"];
export const areaCount = 7;
export const treesPerArea = 9;
export const bushesPerArea = 3;
export const totalRocks = 32;
export const goldOres = 7;
export const riverWidth = 724;
export const riverPadding = 114;
export const waterCurrent = 0.0011;
export const waveSpeed = 0.0001;
export const waveMax = 1.3;
export const treeScales = [150, 160, 165, 175];
export const bushScales = [80, 85, 95];
export const rockScales = [80, 85, 90];

// BIOME DATA:
export const snowBiomeTop = 2400;
export const snowSpeed = 0.75;

// DATA:
export const maxNameLength = 15;

// MAP:
export const mapScale = 14400;
export const mapPingScale = 40;
export const mapPingTime = 2200;
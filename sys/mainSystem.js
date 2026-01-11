// MainScript.js
import Utils from "../src/libs/utils.js";
import io from "../src/libs/io-client.js"
import config from "../src/config.js"
import PACKETS from "../src/data/packetList.js";
var CLIENT_PACKETS = PACKETS.CLIENT;

class MainScript {
    constructor() {
        this.tickSpeed = 1000 / 9;
        this.mills = {
            place: 0
        };
        this.autoMill = {
            x: undefined,
            y: undefined,
            size: function(dicksize) {
                return dicksize * 1.45;
            },
            dist: function(dicksize) {
                return dicksize * 1.8;
            },
            active: false,
            count: 0,
        };
        this.ticks = {
            tick: 0,
            tickQueue: [],
            delay: 0,
            time: [],
            manage: [],
            tickBase: function(set, tick) {
                if (this.tickQueue[this.tick + tick]) {
                    this.tickQueue[this.tick + tick].push(set);
                } else {
                    this.tickQueue[this.tick + tick] = [set];
                }
            },
        };
        this.clicks = {
            left: false,
            right: false,
            middle: false
        }
        this.enemies = {
            enemy: [],
            nears: [],
            near: [],
            people: [],
            nearestEnemy: undefined,
            nearInfo: []
        };
        this.weaponStuff = {
            isReloaded: false,
			waitToHit: 0,
        }
    }

    startAutoMill(player, placement, items) {
        try {
            let objectSize = this.autoMill.size(items.list[player.items[3]].scale);
            let objectDist = this.autoMill.dist(items.list[player.items[3]].scale);
            if (Utils.getDist(this.autoMill, player, 0, 2) > objectDist + items.list[player.items[3]].placeOffset) {
                if (this.mills.place) {
                    let millDir = Utils.getDirect(this.autoMill, player, 0, 2);
                    let plusXY = {
                        x: this.autoMill.x,
                        y: this.autoMill.y,
                    };
                    let angle = Utils.getDirect(plusXY, player, 0, 2);
                    placement(3, angle);
                    placement(3, angle + Utils.toRad(objectSize));
                    placement(3, angle - Utils.toRad(objectSize));
                    this.autoMill.count = Math.max(0, this.autoMill.count - 1);
                }
                this.autoMill.x = player.x2;
                this.autoMill.y = player.y2;
            }
        } catch (e) {}
    }

    sendHitOnce() {
        io.send(CLIENT_PACKETS.AUTO_GATHER, 1);
        io.send(CLIENT_PACKETS.AUTO_GATHER, 0);
    }

    // this will handle auto primary/secondary
    handleWeapons(player, selectWeapon) {
        // auto primary/secondary
        if (!this.clicks.middle && (this.clicks.left || this.clicks.right)) {
            if ((player.weaponIndex != (this.clicks.right && player.weapons[1] == 10 ? player.weapons[1] : player.weapons[0])) || player.buildIndex > -1) {
                selectWeapon(this.clicks.right && player.weapons[1] == 10 ? player.weapons[1] : player.weapons[0]);
            }
            if (player.reloads[this.clicks.right && player.weapons[1] == 10 ? player.weapons[1] : player.weapons[0]] == 0 && !this.weaponStuff.waitToHit) {
                this.sendHitOnce();
                this.weaponStuff.waitToHit = 1;
                this.ticks.tickBase(() => {
                    this.sendHitOnce();
                    this.weaponStuff.waitToHit = 0;
                }, 1);
            }
        }
    }

    handleTickBase(data, tmpObj, player, selectWeapon, buyEquip, checkPlace, isAlly, items, findPlayerBySID) {
        // ticks first then enemies
        this.ticks.tick++
        this.enemies.enemy = []
        this.enemies.nears = []
        this.enemies.near = []
        this.enemies.people = []
        if (!isAlly(tmpObj.sid)) {
            this.enemies.people.push(tmpObj)
        }
        if (this.ticks.tickQueue[this.ticks.tick]) {
            this.ticks.tickQueue[this.ticks.tick].forEach((action) => {
                action();
            });
            this.ticks.tickQueue[this.ticks.tick] = null;
        }
        if (this.clicks.left) {
            buyEquip(7, 0);
            buyEquip(0, 1);
        } else if (this.clicks.right) {
            buyEquip(player.weapons[1] == 10 ? player.secondaryReload : player.primaryReload ? 40 : 6, 0);
        } else {
			if (!this.clicks.left) {
				buyEquip(11, 1);
			}
        }
		// purely basic autoplacer for now, just need to test if nearestEnemy works
        if (Utils.distanceBetween(this.enemies.nearestEnemy, player) <= 350 && Utils.distanceBetween(this.enemies.nearestEnemy, player) >= 150) {
            for (let i = 0; i < 4; i++) {
                checkPlace(4, i);
            }
        } else {
			if (Utils.distanceBetween(this.enemies.nearestEnemy, player) <= 150) {
				for (let i = 0; i < 4; i++) {
					checkPlace(2, i);
				}
			}
		}
        // function calls here
        this.handleWeapons(player, selectWeapon, items);
        this.handleReloadLogic(player, selectWeapon, items);
        this.MultiTaskedSystems("hatchanger", player, items, buyEquip);
        this.MultiTaskedSystems("accchanger", player, items, buyEquip);
    }

	// basic autoreload for now
    manageWeapons(tmpObj, player, items) {
        if (tmpObj.weaponIndex < 9) {
            if (tmpObj.weaponIndex != tmpObj.primary) {
                tmpObj.primary = tmpObj.weaponIndex
                tmpObj.primaryReload = 1
            }
            tmpObj.primaryVar = tmpObj.weaponVariant
            if (tmpObj.buildIndex == -1) {
                tmpObj.primaryReload = Math.min(1, tmpObj.primaryReload + this.tickSpeed / items.weapons[tmpObj.primary].speed);
            }
        } else {
            if (tmpObj.weaponIndex != tmpObj.secondary) {
                tmpObj.secondary = tmpObj.weaponIndex
                tmpObj.secondaryReload = 1
            }
            tmpObj.secondaryVar = tmpObj.weaponVariant
            if (tmpObj.buildIndex == -1) {
                tmpObj.secondaryReload = Math.min(1, tmpObj.secondaryReload + this.tickSpeed / items.weapons[tmpObj.secondary].speed);
            }
        }
        tmpObj.sid == player.sid ? tmpObj.turretReload = Math.min(1, tmpObj.turretReload + 0.0444) : tmpObj.turretReload = Math.min(1, tmpObj.turretReload + 0.0555);
        if (tmpObj != player) {
            if (tmpObj.primary == undefined) {
                tmpObj.primary = 5
                tmpObj.primaryReload = 1
            }
            if (tmpObj.secondary == undefined) {
                tmpObj.secondary = 15
                tmpObj.secondaryReload = 1
            }
        }
    }

    handleReloadLogic(player, selectWeapon, items) {
        if (player.alive && player.weapons[1] && !this.clicks.left && !this.clicks.right && !player?.inTrap) {
            if (player.primaryReload == 1 && player.secondaryReload == 1) {
                if (!this.weaponStuff.isReloaded) {
                    this.weaponStuff.isReloaded = true;
                    let fastSpeed = items.weapons[player.weapons[0]].spdMult < items.weapons[player.weapons[1]].spdMult ? 1 : 0;
                    if (player.weaponIndex != player.weapons[fastSpeed] || player.buildIndex > -1) {
                        selectWeapon(player.weapons[fastSpeed]);
                    }
                }
            } else {
                this.weaponStuff.isReloaded = false;
                if (player.primaryReload <= player.secondaryReload) {
                    if (player.weaponIndex != player.weapons[0] || player.buildIndex > -1) {
                        selectWeapon(player.weapons[0]);
                    }
                } else {
                    if (player.weaponIndex != player.weapons[1] || player.buildIndex > -1) {
                        selectWeapon(player.weapons[1]);
                    }
                }
            }
        }
    }

    MultiTaskedSystems(type, player, items, buyEquip) {
        if (type == "hatchanger") {
            if (Utils.distanceBetween(this.enemies.nearestEnemy, player) <= 300) {
                buyEquip(6, 0);
            } else {
                if (player?.inTrap && player.weapons[1] == 10 ? player.secondaryReload : player.primaryReload) {
                    buyEquip(40, 0);
                } else {
                    if (!this.enemies.enemy.length) {
                        buyEquip(player.moveDir == undefined ? 22 : 12, 0);
                    } else {
                        if (player.y2 <= config.snowBiomeTop) {
                            buyEquip(player.moveDir ? 22 : 15, 0);
                        }
                    }
                }
                if (this.clicks.right && player.weapons[1] == 10 ? player.secondaryReload : player.primaryReload) {
                    buyEquip(40, 0);
                } else {
				    if (this.clicks.left && player.primaryReload) {
                        buyEquip(7, 0);
					}
                }
            }
        } else if (type == "accchanger") {
            if (Utils.distanceBetween(this.enemies.nearestEnemy, player) <= 300 && [0, 1, 2, 3, 4, 5, 6].includes(player.weapons[0])) {
                buyEquip(19, 1);
            } else {
                if (Utils.distanceBetween(this.enemies.nearestEnemy, player) <= (items.weapons[player.weapons[0]].range + 63) && player.primaryIndex == 7) {
                    buyEquip(19, 1);
                } else {
                    if (this.clicks.right && ([8, 7, 6].includes(player.weapons[0]))) {
                        buyEquip(11, 1);
                    } else {
                        if (this.clicks.right && ([0, 1, 2, 3, 4, 5].includes(player.weapons[0]))) {
                            if (Utils.distanceBetween(this.enemies.nearestEnemy, player) >= 300) {
                                buyEquip(11, 1);
                            } else {
                                buyEquip(19, 1);
                            }
                        } else {
                            if (this.clicks.left || player?.inTrap) {
                                buyEquip((player.weapons[0] === 8) ? 11 : 19, 1);
                            } else {
                                buyEquip(11, 1);
                            }
                        }
                    }
                }
            }
        }
    }

    handleEnemies(player) {
        if (this.enemies.enemy.length) {
            this.enemies.near = this.enemies.enemy.sort(function(tmp1, tmp2) {
                return tmp1.dist2 - tmp2.dist2;
            })[0];
            this.enemies.people = this.enemies.people.sort((a, b) => Utils.distanceBetween(a, player) - Utils.distanceBetween(b, player))
        }
        if (this.enemies.people.length) {
            this.enemies.people = this.enemies.people.sort((a, b) => Utils.distanceBetween(a, player) - Utils.distanceBetween(b, player))
            this.enemies.nearestEnemy = this.enemies.people[0]
        } else {
            this.enemies.nearestEnemy = undefined
        }
    }
}



export default new MainScript();

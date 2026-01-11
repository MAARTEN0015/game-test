import PACKETS from "./packetList.js";

const mathABS = Math.abs;
const mathCOS = Math.cos;
const mathSIN = Math.sin;
const mathPOW = Math.pow;
const mathSQRT = Math.sqrt;

export default function Player(id, sid, config, UTILS, projectileManager,
    objectManager, players, ais, items, hats, accessories, server, scoreCallback, iconCallback) {
    this.id = id;
    this.sid = sid;
    this.tmpScore = 0;
    this.team = null;
    this.skinIndex = 0;
    this.tailIndex = 0;
    this.hitTime = 0;
    this.tails = {};
    for (var i = 0; i < accessories.length; ++i) {
        if (accessories[i].price <= 0)
            this.tails[accessories[i].id] = 1;
    }
    this.skins = {};
    for (var i = 0; i < hats.length; ++i) {
        if (hats[i].price <= 0)
            this.skins[hats[i].id] = 1;
    }
    this.points = 0;
    this.dt = 0;
    this.hidden = false;
    this.itemCounts = {};
    this.isPlayer = true;
    this.pps = 0;
    this.moveDir = undefined;
    this.skinRot = 0;
    this.lastPing = 0;
    this.iconIndex = 0;
    this.skinColor = 0;

    this.spawn = function(moofoll) {
        this.attacked = false;
        this.death = false;
        this.spinDir = 0;
        this.sync = false;
        this.antiBull = 0;
        this.bullTimer = 0;
        this.poisonTimer = 0;
        this.active = true;
        this.alive = true;
        this.lockMove = false;
        this.lockDir = false;
        this.minimapCounter = 0;
        this.chatCountdown = 0;
        this.shameCount = 0;
        this.shameTimer = 0;
        this.sentTo = {};
        this.gathering = 0;
        this.gatherIndex = 0;
        this.shooting = {};
        this.shootIndex = 9;
        this.autoGather = 0;
        this.animTime = 0;
        this.animSpeed = 0;
        this.mouseState = 0;
        this.buildIndex = -1;
        this.weaponIndex = 0;
        this.weaponCode = 0;
        this.weaponVariant = 0;
        this.primaryIndex = undefined;
        this.secondaryIndex = undefined;
        this.primaryReloaded = true;
        this.secondaryReloaded = true;
        this.dmgOverTime = {};
        this.noMovTimer = 0;
        this.maxXP = 300;
        this.XP = 0;
        this.age = 1;
        this.kills = 0;
        this.upgrAge = 2;
        this.upgradePoints = 0;
        this.x = 0;
        this.y = 0;
        this.zIndex = 0;
        this.xVel = 0;
        this.yVel = 0;
        this.slowMult = 1;
        this.dir = 0;
        this.dirPlus = 0;
        this.targetDir = 0;
        this.targetAngle = 0;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.oldHealth = this.maxHealth;
        this.damaged = 0;
        this.scale = config.playerScale;
        this.speed = config.playerSpeed;
        this.resetMoveDir();
        this.resetResources(moofoll);
        this.items = [0, 3, 6, 10];
        this.weapons = [0];
        this.shootCount = 0;
        this.weaponXP = [];
        this.reloads = {
            0: 0,
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
            6: 0,
            7: 0,
            8: 0,
            9: 0,
            10: 0,
            11: 0,
            12: 0,
            13: 0,
            14: 0,
            15: 0,
            53: 0,
        };
        this.turretReloaded = false;
        this.primaryReload = 1
        this.secondaryReload = 1
        this.turretReload = 1
        this.primary = undefined
        this.secondary = undefined
        this.primaryVar = undefined
        this.secondaryVar = undefined
        this.primaryDamage = 25
        this.bTick = 0
        this.bowThreat = {
            9: 0,
            12: 0,
            13: 0,
            15: 0,
        };
        this.oldXY = {
            x: 0,
            y: 0,
        };
        this.canEmpAnti = false;
        this.empAnti = false;
        this.soldierAnti = false;
        this.poisonTick = 0;
        this.bullTick = 0;
        this.setPoisonTick = false;
        this.setBullTick = false;
        this.antiTimer = 2;
        this.healTimeStamp = 0;
        this.outHealed = false;
        this.hasAttackedThisTick = false;
        this._attackedThisTickTempVariable = false
        this.hasFiredProjectileThisTick = false;
        this._firedThisTickTempVariable = false;
        this.inTrap = false;
        this.lastTrap = false;
        this.escaped = false;
        this.hitDetect = [];
        this.inAnti = false
        this.lastAntiTick = 0
        this.turretReload = 1 //these reloads are more so used for prediction based
    };

    this.resetMoveDir = function() {
        this.moveDir = undefined;
    };

    this.resetResources = function(moofoll) {
        for (var i = 0; i < config.resourceTypes.length; ++i) {
            this[config.resourceTypes[i]] = moofoll ? 100 : 0;
        }
    };

    this.getItemType = function(id) {
        let findindx = this.items.findIndex((ids) => ids == id);
        if (findindx != -1) {
            return findindx;
        } else {
            return items.checkItem.index(id, this.items);
        }
    };

    this.addItem = function(id) {
        var tmpItem = items.list[id];
        if (tmpItem) {
            for (var i = 0; i < this.items.length; ++i) {
                if (items.list[this.items[i]].group == tmpItem.group) {
                    if (this.buildIndex == this.items[i])
                        this.buildIndex = id;
                    this.items[i] = id;
                    return true;
                }
            }
            this.items.push(id);
            return true;
        }
        return false;
    };

    this.setUserData = function(data) {
        if (data) {

            this.name = "unknown";

            var name = data.name + "";
            name = name.slice(0, config.maxNameLength);
            name = name.replace(/[^\w:\(\)\/? -]+/gmi, " ");
            name = name.replace(/[^\x00-\x7F]/g, " ");
            name = name.trim();

            if (name.length > 0) {
                this.name = name;
            }

            this.skinColor = 0;
            if (config.skinColors[data.skin])
                this.skinColor = data.skin;
        }
    };

    this.getData = function() {
        return [
            this.id,
            this.sid,
            this.name,
            UTILS.fixTo(this.x, 2),
            UTILS.fixTo(this.y, 2),
            UTILS.fixTo(this.dir, 3),
            this.health,
            this.maxHealth,
            this.scale,
            this.skinColor
        ];
    };

    this.setData = function(data) {
        this.id = data[0];
        this.sid = data[1];
        this.name = data[2];
        this.x = data[3];
        this.y = data[4];
        this.dir = data[5];
        this.health = data[6];
        this.maxHealth = data[7];
        this.scale = data[8];
        this.skinColor = data[9];
    };

    var timerCount = 0;
    this.update = function(delta) {
        if (this.active) {
            // MOVE:
            let gear = {
                skin: findID(hats, this.skinIndex),
                tail: findID(accessories, this.tailIndex)
            }
            let spdMult = ((this.buildIndex >= 0) ? 0.5 : 1) * (items.weapons[this.weaponIndex].spdMult || 1) * (gear.skin ? (gear.skin.spdMult || 1) : 1) * (gear.tail ? (gear.tail.spdMult || 1) : 1) * (this.y <= config.snowBiomeTop ? ((gear.skin && gear.skin.coldM) ? 1 : config.snowSpeed) : 1) * this.slowMult;
            /* velocity calculation */
            this.xVel = (this.x2 - this.oldPos.x2) / delta;
            this.yVel = (this.y2 - this.oldPos.y2) / delta;
            // River Multiplier
            if (!this.zIndex && this.y >= config.mapScale / 2 - config.riverWidth / 2 && this.y <= config.mapScale / 2 + config.riverWidth / 2) {
                spdMult *= (gear.skin && gear.skin.watrImm) ? 0.75 : 0.33;
                this.xVel += (gear.skin && gear.skin.watrImm) ? config.waterCurrent * 0.4 * delta : config.waterCurrent * delta;
            }
            // acceleration
            // get the { x , y } of the direction where your going when u move
            var xDir = this.moveDir != undefined ? Math.cos(this.moveDir) : 0; // get the x direction
            var yDir = this.moveDir != undefined ? Math.sin(this.moveDir) : 0; // get the y direction
            // this uh check the len so it wont go faster in diagonals
            var len = Math.hypot(xDir, yDir);
            // normalize the Dir so it wont go faster i think?  that what i found in google/gpt
            if (len) {
                xDir /= len;
                yDir /= len;
            };
            // if theres direction(!undefined) then multiply by speed
            if (xDir) this.xVel += xDir * this.speed * spdMult;
            if (yDir) this.yVel += yDir * this.speed * spdMult;
            // decelaration
            if (this.xVel) {
                this.xVel *= Math.pow(config.playerDecel, delta);
                if (this.xVel <= 0.01 && this.xVel >= -0.01) {
                    this.xVel = 0;
                }
            }
            if (this.yVel) {
                this.yVel *= Math.pow(config.playerDecel, delta);
                if (this.yVel <= 0.01 && this.yVel >= -0.01) {
                    this.yVel = 0;
                }
            }
            // apply the { location + velocity * time } = predicted location using velocity :thumbsup:
            this.xlvel = this.x2 + this.xVel * delta;
            this.ylvel = this.y2 + this.yVel * delta;
            // collision detector
            for (let i = 0; i < gameObjects.length; i++) {
                const o = gameObjects[i];
                if (o.active && !o.ignoreCollision) {
                    let dx = this.xlvel - o.x,
                        dy = this.ylvel - o.y;
                    let sca = 35 + (o.getScale ? o.getScale() : o.scale);
                    if (Math.abs(dx) <= sca || Math.abs(dy) <= sca) {
                        let tmpInt = Math.max(0, sca - UTILS.getDistance(0, 0, dx, dy));
                        if (tmpInt) {
                            let tmpAngle = Math.atan2(dy, dx);
                            let ma = Math.min(tmpInt, delta);
                            if (!o.isTeamObject(this) && o.dmg > 0 && o.name.includes("spikes") || o.type == 1 && o.y >= 12000) ma *= 1.5;
                            this.xlvel += Math.cos(tmpAngle) * ma;
                            this.ylvel += Math.sin(tmpAngle) * ma;
                        }
                    }
                }
            }
            this.maxSpeed = spdMult;
        }
    };

    this.addWeaponXP = function(amnt) {
        if (!this.weaponXP[this.weaponIndex])
            this.weaponXP[this.weaponIndex] = 0;
        this.weaponXP[this.weaponIndex] += amnt;
    };

    this.earnXP = function(amount) {
        if (this.age < config.maxAge) {
            this.XP += amount;
            if (this.XP >= this.maxXP) {
                if (this.age < config.maxAge) {
                    this.age++;
                    this.XP = 0;
                    this.maxXP *= 1.2;
                } else {
                    this.XP = this.maxXP;
                }
                this.upgradePoints++;
                server.send(this.id, PACKETS.SERVER.UPDATE_UPGRADES, this.upgradePoints, this.upgrAge);
                server.send(this.id, PACKETS.SERVER.UPDATE_AGE, this.XP, UTILS.fixTo(this.maxXP, 1), this.age);
            } else {
                server.send(this.id, PACKETS.SERVER.UPDATE_AGE, this.XP);
            }
        }
    };

    this.isTeam = function(tmpObj) {
        return (this == tmpObj || (this.team && this.team == tmpObj.team));
    };

    /*this.findAllianceBySid = function(sid) {
        return this.team ? alliancePlayers.find((THIS) => THIS === sid) : null;
    };*/

    this.changeHealth = function(amount, doer) {
        if (amount > 0 && this.health >= this.maxHealth)
            return false
        if (amount < 0 && this.skin)
            amount *= this.skin.dmgMult || 1;
        if (amount < 0 && this.tail)
            amount *= this.tail.dmgMult || 1;
        if (amount < 0)
            this.hitTime = Date.now();
        this.health += amount;
        if (this.health > this.maxHealth) {
            amount -= (this.health - this.maxHealth);
            this.health = this.maxHealth;
        }
        if (this.health <= 0)
            this.kill(doer);
        for (var i = 0; i < players.length; ++i) {
            if (this.sentTo[players[i].id])
                server.send(players[i].id, PACKETS.SERVER.UPDATE_HEALTH, this.sid, Math.round(this.health));
        }
        if (doer && doer.canSee(this) && !(doer == this && amount < 0)) {
            server.send(doer.id, PACKETS.SERVER.SHOW_TEXT, Math.round(this.x),
                Math.round(this.y), Math.round(-amount), 1);
        }
        return true;
    };

    this.kill = function(doer) {
        if (doer && doer.alive) {
            doer.kills++;
            if (doer.skin && doer.skin.goldSteal) scoreCallback(doer, Math.round(this.points / 2));
            else scoreCallback(doer, Math.round(this.age * 100 * ((doer.skin && doer.skin.kScrM) ? doer.skin.kScrM : 1)));
            server.send(doer.id, PACKETS.SERVER.UPDATE_PLAYER_VALUE, "kills", doer.kills, 1);
        }
        this.alive = false;
        server.send(this.id, PACKETS.SERVER.KILL_PLAYER);
        iconCallback();
    };

    this.addResource = function(type, amount, auto) {
        if (!auto && amount > 0)
            this.addWeaponXP(amount);
        if (type == 3) {
            scoreCallback(this, amount, true);
        } else {
            this[config.resourceTypes[type]] += amount;
            server.send(this.id, PACKETS.SERVER.UPDATE_PLAYER_VALUE, config.resourceTypes[type], this[config.resourceTypes[type]], 1);
        }
    };

    this.changeItemCount = function(index, value) {
        this.itemCounts[index] = this.itemCounts[index] || 0;
        this.itemCounts[index] += value;
        server.send(this.id, PACKETS.SERVER.UPDATE_ITEM_COUNTS, index, this.itemCounts[index]);
    };

    this.buildItem = function(item) {
        var tmpS = (this.scale + item.scale + (item.placeOffset || 0));
        var tmpX = this.x + (tmpS * mathCOS(this.dir));
        var tmpY = this.y + (tmpS * mathSIN(this.dir));
        if (this.canBuild(item) && !(item.consume && (this.skin && this.skin.noEat)) &&
            (item.consume || objectManager.checkItemLocation(tmpX, tmpY, item.scale,
                0.6, item.id, false, this))) {
            var worked = false;
            if (item.consume) {
                if (this.hitTime) {
                    var timeSinceHit = Date.now() - this.hitTime;
                    this.hitTime = 0;
                    if (timeSinceHit <= 120) {
                        this.shameCount++;
                        if (this.shameCount >= 8) {
                            this.shameTimer = 30000;
                            this.shameCount = 0;
                        }
                    } else {
                        this.shameCount -= 2;
                        if (this.shameCount <= 0) {
                            this.shameCount = 0;
                        }
                    }
                }
                if (this.shameTimer <= 0)
                    worked = item.consume(this);
            } else {
                worked = true;
                if (item.group.limit) {
                    this.changeItemCount(item.group.id, 1);
                }
                if (item.pps)
                    this.pps += item.pps;
                objectManager.add(objectManager.objects.length, tmpX, tmpY, this.dir, item.scale,
                    item.type, item, false, this);
            }
            if (worked) {
                this.useRes(item);
                this.buildIndex = -1;
            }
        }
    };

    this.hasRes = function(item, mult) {
        for (var i = 0; i < item.req.length;) {
            if (this[item.req[i]] < Math.round(item.req[i + 1] * (mult || 1)))
                return false;
            i += 2;
        }
        return true;
    };

    this.useRes = function(item, mult) {
        if (config.inSandbox)
            return;
        for (var i = 0; i < item.req.length;) {
            this.addResource(config.resourceTypes.indexOf(item.req[i]), -Math.round(item.req[i + 1] * (mult || 1)));
            i += 2;
        }
    };

    this.canBuild = function(item) {
        if (config.inSandbox)
            return true;
        if (item.group.limit && this.itemCounts[item.group.id] >= item.group.limit)
            return false;
        return this.hasRes(item);
    };

    this.gather = function() {

        this.noMovTimer = 0;

        this.slowMult -= (items.weapons[this.weaponIndex].hitSlow || 0.3);
        if (this.slowMult < 0)
            this.slowMult = 0;

        var tmpVariant = config.fetchVariant(this);
        var applyPoison = tmpVariant.poison;
        var variantDmg = tmpVariant.val;

        var hitObjs = {};
        var tmpDist, tmpDir, tmpObj, hitSomething;
        var tmpList = objectManager.getGridArrays(this.x, this.y, items.weapons[this.weaponIndex].range);
        for (var t = 0; t < tmpList.length; ++t) {
            for (var i = 0; i < tmpList[t].length; ++i) {
                tmpObj = tmpList[t][i];
                if (tmpObj.active && !tmpObj.dontGather && !hitObjs[tmpObj.sid] && tmpObj.visibleToPlayer(this)) {
                    tmpDist = UTILS.getDistance(this.x, this.y, tmpObj.x, tmpObj.y) - tmpObj.scale;
                    if (tmpDist <= items.weapons[this.weaponIndex].range) {
                        tmpDir = UTILS.getDirection(tmpObj.x, tmpObj.y, this.x, this.y);
                        if (UTILS.getAngleDist(tmpDir, this.dir) <= config.gatherAngle) {
                            hitObjs[tmpObj.sid] = 1;
                            if (tmpObj.health) {
                                if (tmpObj.changeHealth(-items.weapons[this.weaponIndex].dmg * (variantDmg) *
                                        (items.weapons[this.weaponIndex].sDmg || 1) * (this.skin && this.skin.bDmg ? this.skin.bDmg : 1), this)) {
                                    for (var x = 0; x < tmpObj.req.length;) {
                                        this.addResource(config.resourceTypes.indexOf(tmpObj.req[x]), tmpObj.req[x + 1]);
                                        x += 2;
                                    }
                                    objectManager.disableObj(tmpObj);
                                }
                            } else {
                                this.earnXP(4 * items.weapons[this.weaponIndex].gather);
                                var count = items.weapons[this.weaponIndex].gather + (tmpObj.type == 3 ? 4 : 0);
                                if (this.skin && this.skin.extraGold) {
                                    this.addResource(3, 1);
                                }
                                this.addResource(tmpObj.type, count);
                            }
                            hitSomething = true;
                            objectManager.hitObj(tmpObj, tmpDir);
                        }
                    }
                }
            }
        }

        for (var i = 0; i < players.length + ais.length; ++i) {
            tmpObj = players[i] || ais[i - players.length];
            if (tmpObj != this && tmpObj.alive && !(tmpObj.team && tmpObj.team == this.team)) {
                tmpDist = UTILS.getDistance(this.x, this.y, tmpObj.x, tmpObj.y) - (tmpObj.scale * 1.8);
                if (tmpDist <= items.weapons[this.weaponIndex].range) {
                    tmpDir = UTILS.getDirection(tmpObj.x, tmpObj.y, this.x, this.y);
                    if (UTILS.getAngleDist(tmpDir, this.dir) <= config.gatherAngle) {

                        var stealCount = items.weapons[this.weaponIndex].steal;
                        if (stealCount && tmpObj.addResource) {
                            stealCount = Math.min((tmpObj.points || 0), stealCount);
                            this.addResource(3, stealCount);
                            tmpObj.addResource(3, -stealCount);
                        }

                        var dmgMlt = variantDmg;
                        if (tmpObj.weaponIndex != undefined && items.weapons[tmpObj.weaponIndex].shield &&
                            UTILS.getAngleDist(tmpDir + Math.PI, tmpObj.dir) <= config.shieldAngle) {
                            dmgMlt = items.weapons[tmpObj.weaponIndex].shield;
                        }
                        var dmgVal = items.weapons[this.weaponIndex].dmg *
                            (this.skin && this.skin.dmgMultO ? this.skin.dmgMultO : 1) *
                            (this.tail && this.tail.dmgMultO ? this.tail.dmgMultO : 1);
                        var tmpSpd = (0.3 * (tmpObj.weightM || 1)) + (items.weapons[this.weaponIndex].knock || 0);
                        tmpObj.xVel += tmpSpd * mathCOS(tmpDir);
                        tmpObj.yVel += tmpSpd * mathSIN(tmpDir);
                        if (this.skin && this.skin.healD)
                            this.changeHealth(dmgVal * dmgMlt * this.skin.healD, this);
                        if (this.tail && this.tail.healD)
                            this.changeHealth(dmgVal * dmgMlt * this.tail.healD, this);
                        if (tmpObj.skin && tmpObj.skin.dmg && dmgMlt == 1)
                            this.changeHealth(-dmgVal * tmpObj.skin.dmg, tmpObj);
                        if (tmpObj.tail && tmpObj.tail.dmg && dmgMlt == 1)
                            this.changeHealth(-dmgVal * tmpObj.tail.dmg, tmpObj);
                        if (tmpObj.dmgOverTime && this.skin && this.skin.poisonDmg &&
                            !(tmpObj.skin && tmpObj.skin.poisonRes)) {
                            tmpObj.dmgOverTime.dmg = this.skin.poisonDmg;
                            tmpObj.dmgOverTime.time = this.skin.poisonTime || 1;
                            tmpObj.dmgOverTime.doer = this;
                        }
                        if (tmpObj.dmgOverTime && applyPoison &&
                            !(tmpObj.skin && tmpObj.skin.poisonRes)) {
                            tmpObj.dmgOverTime.dmg = 5;
                            tmpObj.dmgOverTime.time = 5;
                            tmpObj.dmgOverTime.doer = this;
                        }
                        if (tmpObj.skin && tmpObj.skin.dmgK) {
                            this.xVel -= tmpObj.skin.dmgK * mathCOS(tmpDir);
                            this.yVel -= tmpObj.skin.dmgK * mathSIN(tmpDir);
                        }
                        tmpObj.changeHealth(-dmgVal * dmgMlt, this, this);

                    }
                }
            }
        }

        this.sendAnimation(hitSomething ? 1 : 0);
    };

    this.sendAnimation = function(hit) {
        for (var i = 0; i < players.length; ++i) {
            if (this.sentTo[players[i].id] && this.canSee(players[i])) {
                server.send(players[i].id, PACKETS.SERVER.GATHER_ANIMATION, this.sid, hit ? 1 : 0, this.weaponIndex);
            }
        }
    };

    var tmpRatio = 0;
    var animIndex = 0;
    this.animate = function(delta) {
        if (this.animTime > 0) {
            this.animTime -= delta;
            if (this.animTime <= 0) {
                this.animTime = 0;
                this.dirPlus = 0;
                tmpRatio = 0;
                animIndex = 0;
            } else {
                if (animIndex == 0) {
                    tmpRatio += delta / (this.animSpeed * config.hitReturnRatio);
                    this.dirPlus = UTILS.lerp(0, this.targetAngle, Math.min(1, tmpRatio));
                    if (tmpRatio >= 1) {
                        tmpRatio = 1;
                        animIndex = 1;
                    }
                } else {
                    tmpRatio -= delta / (this.animSpeed * (1 - config.hitReturnRatio));
                    this.dirPlus = UTILS.lerp(0, this.targetAngle, Math.max(0, tmpRatio));
                }
            }
        }
    };

    this.startAnim = function(didHit, index) {
        this.animTime = this.animSpeed = items.weapons[index].speed;
        this.targetAngle = (didHit ? -config.hitAngle : -Math.PI);
        tmpRatio = 0;
        animIndex = 0;
    };

    this.canSee = function(other) {
        if (!other) return false;
        if (other.skin && other.skin.invisTimer && other.noMovTimer >=
            other.skin.invisTimer) return false;
        var dx = mathABS(other.x - this.x) - other.scale;
        var dy = mathABS(other.y - this.y) - other.scale;
        return dx <= (config.maxScreenWidth / 2) * 1.3 && dy <= (config.maxScreenHeight / 2) * 1.3;
    };
}
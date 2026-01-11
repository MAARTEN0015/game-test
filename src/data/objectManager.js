const mathFloor = Math.floor;
const mathABS = Math.abs;
const mathCOS = Math.cos;
const mathSIN = Math.sin;
const mathPOW = Math.pow;
const mathSQRT = Math.sqrt;

import PACKETS from "./packetList.js";

export default function ObjectManager(GameObject, gameObjects, UTILS, config, players, server) {
	this.objects = gameObjects;
	this.grids = {};
	this.updateObjects = [];

	let tmpX, tmpY;
	const tmpS = config.mapScale / config.colGrid;

	this.setObjectGrids = function (obj) {
		const objX = Math.min(config.mapScale, Math.max(0, obj.x));
		const objY = Math.min(config.mapScale, Math.max(0, obj.y));
		for (let x = 0; x < config.colGrid; ++x) {
			tmpX = x * tmpS;
			for (let y = 0; y < config.colGrid; ++y) {
				tmpY = y * tmpS;
				if (
					objX + obj.scale >= tmpX &&
					objX - obj.scale <= tmpX + tmpS &&
					objY + obj.scale >= tmpY &&
					objY - obj.scale <= tmpY + tmpS
				) {
					if (!this.grids[`${x}_${y}`]) this.grids[`${x}_${y}`] = [];
					this.grids[`${x}_${y}`].push(obj);
					obj.gridLocations.push(`${x}_${y}`);
				}
			}
		}
	};

	this.removeObjGrid = function (obj) {
		let tmpIndx;
		for (let i = 0; i < obj.gridLocations.length; ++i) {
			tmpIndx = this.grids[obj.gridLocations[i]].indexOf(obj);
			if (tmpIndx >= 0) {
				this.grids[obj.gridLocations[i]].splice(tmpIndx, 1);
			}
		}
	};

	this.disableObj = function (obj) {
		obj.active = false;
		if (server) {
			if (obj.owner && obj.pps) obj.owner.pps -= obj.pps;
			this.removeObjGrid(obj);
			const tmpIndx = this.updateObjects.indexOf(obj);
			if (tmpIndx >= 0) this.updateObjects.splice(tmpIndx, 1);
		}
	};

	this.hitObj = function (tmpObj, tmpDir) {
		for (let p = 0; p < players.length; ++p) {
			if (players[p].active) {
				if (tmpObj.sentTo[players[p].id]) {
					if (!tmpObj.active) server.send(players[p].id, PACKETS.SERVER.KILL_OBJECT, tmpObj.sid);
					else if (players[p].canSee(tmpObj))
						server.send(players[p].id, PACKETS.SERVER.WIGGLE_GAME_OBJECT, UTILS.fixTo(tmpDir, 1), tmpObj.sid);
				}
				if (!tmpObj.active && tmpObj.owner === players[p])
					players[p].changeItemCount(tmpObj.group.id, -1);
			}
		}
	};

	const tmpArray = [];
	let tmpGrid;

	this.getGridArrays = function (xPos, yPos, s) {
		tmpX = mathFloor(xPos / tmpS);
		tmpY = mathFloor(yPos / tmpS);
		tmpArray.length = 0;
		try {
			if (this.grids[`${tmpX}_${tmpY}`]) tmpArray.push(this.grids[`${tmpX}_${tmpY}`]);

			// RIGHT
			if (xPos + s >= (tmpX + 1) * tmpS) {
				tmpGrid = this.grids[`${tmpX + 1}_${tmpY}`];
				if (tmpGrid) tmpArray.push(tmpGrid);
				if (tmpY && yPos - s <= tmpY * tmpS) {
					// TOP RIGHT
					tmpGrid = this.grids[`${tmpX + 1}_${tmpY - 1}`];
					if (tmpGrid) tmpArray.push(tmpGrid);
				} else if (yPos + s >= (tmpY + 1) * tmpS) {
					// BOTTOM RIGHT
					tmpGrid = this.grids[`${tmpX + 1}_${tmpY + 1}`];
					if (tmpGrid) tmpArray.push(tmpGrid);
				}
			}

			// LEFT
			if (tmpX && xPos - s <= tmpX * tmpS) {
				tmpGrid = this.grids[`${tmpX - 1}_${tmpY}`];
				if (tmpGrid) tmpArray.push(tmpGrid);
				if (tmpY && yPos - s <= tmpY * tmpS) {
					// TOP LEFT
					tmpGrid = this.grids[`${tmpX - 1}_${tmpY - 1}`];
					if (tmpGrid) tmpArray.push(tmpGrid);
				} else if (yPos + s >= (tmpY + 1) * tmpS) {
					// BOTTOM LEFT
					tmpGrid = this.grids[`${tmpX - 1}_${tmpY + 1}`];
					if (tmpGrid) tmpArray.push(tmpGrid);
				}
			}

			// BOTTOM
			if (yPos + s >= (tmpY + 1) * tmpS) {
				tmpGrid = this.grids[`${tmpX}_${tmpY + 1}`];
				if (tmpGrid) tmpArray.push(tmpGrid);
			}

			// TOP
			if (tmpY && yPos - s <= tmpY * tmpS) {
				tmpGrid = this.grids[`${tmpX}_${tmpY - 1}`];
				if (tmpGrid) tmpArray.push(tmpGrid);
			}
		} catch (e) { }
		return tmpArray;
	};

	let tmpObj;

	this.add = function (sid, x, y, dir, s, type, data, setSID, owner) {
		tmpObj = null;
		for (let i = 0; i < gameObjects.length; ++i) {
			if (gameObjects[i].sid === sid) {
				tmpObj = gameObjects[i];
				break;
			}
		}
		if (!tmpObj) {
			for (let i = 0; i < gameObjects.length; ++i) {
				if (!gameObjects[i].active) {
					tmpObj = gameObjects[i];
					break;
				}
			}
		}
		if (!tmpObj) {
			tmpObj = new GameObject(sid);
			gameObjects.push(tmpObj);
		}
		if (setSID) tmpObj.sid = sid;
		tmpObj.init(x, y, dir, s, type, data, owner);
		if (server) {
			this.setObjectGrids(tmpObj);
			if (tmpObj.doUpdate) this.updateObjects.push(tmpObj);
		}
	};

	this.disableBySid = function (sid) {
		for (let i = 0; i < gameObjects.length; ++i) {
			if (gameObjects[i].sid === sid) {
				this.disableObj(gameObjects[i]);
				break;
			}
		}
	};

	this.removeAllItems = function (sid, server) {
		for (let i = 0; i < gameObjects.length; ++i) {
			if (gameObjects[i].active && gameObjects[i].owner && gameObjects[i].owner.sid === sid) {
				this.disableObj(gameObjects[i]);
			}
		}
		if (server) server.broadcast(PACKETS.SERVER.KILL_OBJECTS, sid);
	};

	this.fetchSpawnObj = function (sid) {
		let tmpLoc = null;
		for (let i = 0; i < gameObjects.length; ++i) {
			tmpObj = gameObjects[i];
			if (tmpObj.active && tmpObj.owner && tmpObj.owner.sid === sid && tmpObj.spawnPoint) {
				tmpLoc = [tmpObj.x, tmpObj.y];
				this.disableObj(tmpObj);
				server.broadcast(PACKETS.SERVER.KILL_OBJECT, tmpObj.sid);
				if (tmpObj.owner) tmpObj.owner.changeItemCount(tmpObj.group.id, -1);
				break;
			}
		}
		return tmpLoc;
	};

	this.checkItemLocation = function (x, y, s, sM, indx, ignoreWater, placer) {
		for (let i = 0; i < gameObjects.length; ++i) {
			const blockS = gameObjects[i].blocker
				? gameObjects[i].blocker
				: gameObjects[i].getScale(sM, gameObjects[i].isItem);
			if (
				gameObjects[i].active &&
				UTILS.getDistance(x, y, gameObjects[i].x, gameObjects[i].y) < s + blockS
			)
				return false;
		}
		if (
			!ignoreWater &&
			indx !== 18 &&
			y >= config.mapScale / 2 - config.riverWidth / 2 &&
			y <= config.mapScale / 2 + config.riverWidth / 2
		) {
			return false;
		}
		return true;
	};

	this.addProjectile = function (x, y, dir, range, indx) {
		const tmpData = items.projectiles[indx];
		let tmpProj;
		for (let i = 0; i < projectiles.length; ++i) {
			if (!projectiles[i].active) {
				tmpProj = projectiles[i];
				break;
			}
		}
		if (!tmpProj) {
			tmpProj = new Projectile(players, UTILS);
			projectiles.push(tmpProj);
		}
		tmpProj.init(indx, x, y, dir, tmpData.speed, range, tmpData.scale);
	};

	this.checkCollision = function (player, other, delta = 1) {
		const dx = player.x - other.x;
		const dy = player.y - other.y;
		let tmpLen = player.scale + other.scale;
		if (mathABS(dx) <= tmpLen || mathABS(dy) <= tmpLen) {
			tmpLen = player.scale + (other.getScale ? other.getScale() : other.scale);
			let tmpInt = mathSQRT(dx * dx + dy * dy) - tmpLen;
			if (tmpInt <= 0) {
				if (!other.ignoreCollision) {
					const tmpDir = UTILS.getDirection(player.x, player.y, other.x, other.y);
					const tmpDist = UTILS.getDistance(player.x, player.y, other.x, other.y);
					if (other.isPlayer) {
						tmpInt = (tmpInt * -1) / 2;
						player.x += tmpInt * mathCOS(tmpDir);
						player.y += tmpInt * mathSIN(tmpDir);
						other.x -= tmpInt * mathCOS(tmpDir);
						other.y -= tmpInt * mathSIN(tmpDir);
					} else {
						player.x = other.x + tmpLen * mathCOS(tmpDir);
						player.y = other.y + tmpLen * mathSIN(tmpDir);
						player.xVel *= 0.75;
						player.yVel *= 0.75;
					}
					if (
						other.dmg &&
						other.owner !== player &&
						!(other.owner && other.owner.team && other.owner.team === player.team)
					) {
						player.changeHealth(-other.dmg, other.owner, other);
						const tmpSpd = 1.5 * (other.weightM || 1);
						player.xVel += tmpSpd * mathCOS(tmpDir);
						player.yVel += tmpSpd * mathSIN(tmpDir);
						if (other.pDmg && !(player.skin && player.skin.poisonRes)) {
							player.dmgOverTime.dmg = other.pDmg;
							player.dmgOverTime.time = 5;
							player.dmgOverTime.doer = other.owner;
						}
						if (player.colDmg && other.health) {
							if (other.changeHealth(-player.colDmg)) this.disableObj(other);
							this.hitObj(other, UTILS.getDirection(player.x, player.y, other.x, other.y));
						}
					}
				} else if (
					other.trap &&
					!player.noTrap &&
					other.owner !== player &&
					!(other.owner && other.owner.team && other.owner.team === player.team)
				) {
					player.lockMove = true;
					other.hideFromEnemy = false;
				} else if (other.boostSpeed) {
					player.xVel += delta * other.boostSpeed * (other.weightM || 1) * mathCOS(other.dir);
					player.yVel += delta * other.boostSpeed * (other.weightM || 1) * mathSIN(other.dir);
				} else if (other.healCol) {
					player.healCol = other.healCol;
				} else if (other.teleport) {
					player.x = UTILS.randInt(0, config.mapScale);
					player.y = UTILS.randInt(0, config.mapScale);
				}
				if (other.zIndex > player.zIndex) player.zIndex = other.zIndex;
				return true;
			}
		}
		return false;
	};
}
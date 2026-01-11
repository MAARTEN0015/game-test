/**
 * gameObject.js
 */
class GameObject {
    constructor(sid) {
        this.sid = sid;

        this.sentTo = {};
        this.gridLocations = [];
        this.active = false;
        this.doUpdate = false;
        this.x = 0;
        this.y = 0;
        this.dir = 0;
        this.xWiggle = 0;
        this.yWiggle = 0;
        this.scale = 0;
        this.type = 0;
        this.id = undefined;
        this.owner = undefined;
        this.name = undefined;
        this.isItem = false;
        this.group = undefined;
        this.health = 0;
        this.layer = 2;
        this.colDiv = 1;
        this.blocker = false;
        this.ignoreCollision = false;
        this.dontGather = false;
        this.hideFromEnemy = false;
        this.friction = 0;
        this.projDmg = 0;
        this.dmg = 0;
        this.pDmg = 0;
        this.pps = 0;
        this.zIndex = 0;
        this.turnSpeed = 0;
        this.req = undefined;
        this.trap = false;
        this.healCol = false;
        this.teleport = false;
        this.boostSpeed = false;
        this.projectile = undefined;
        this.shootRange = 0;
        this.shootRate = 0;
        this.shootCount = 0;
        this.spawnPoint = false;
    }
    /**
     * Initializes all dynamic properties of the game object.
     */
    init(x, y, dir, scale, type, data, owner) {
        data = data || {};

        this.sentTo = {};
        this.gridLocations = [];
        this.active = true;
        this.doUpdate = data.doUpdate;
        this.x = x;
        this.y = y;
        this.dir = dir;
        this.xWiggle = 0;
        this.yWiggle = 0;
        this.scale = scale;
        this.type = type;
        this.id = data.id;
        this.owner = owner;
        this.name = data.name;
        this.isItem = (this.id !== undefined);
        this.group = data.group;
        this.health = data.health;
        this.layer = 2;

        if (this.group !== undefined) {
            this.layer = this.group.layer;
        } else if (this.type === 0) {
            this.layer = 3;
        } else if (this.type === 2) {
            this.layer = 0;
        } else if (this.type === 4) {
            this.layer = -1;
        }

        this.colDiv = data.colDiv || 1;
        this.blocker = data.blocker;
        this.ignoreCollision = data.ignoreCollision;
        this.dontGather = data.dontGather;
        this.hideFromEnemy = data.hideFromEnemy;
        this.friction = data.friction;
        this.projDmg = data.projDmg;
        this.dmg = data.dmg;
        this.pDmg = data.pDmg;
        this.pps = data.pps;
        this.zIndex = data.zIndex || 0;
        this.turnSpeed = data.turnSpeed;
        this.req = data.req;
        this.trap = data.trap;
        this.healCol = data.healCol;
        this.teleport = data.teleport;
        this.boostSpeed = data.boostSpeed;
        this.projectile = data.projectile;
        this.shootRange = data.shootRange;
        this.shootRate = data.shootRate;
        this.shootCount = this.shootRate;
        this.spawnPoint = data.spawnPoint;
    }
    /**
     * Changes the object's health. Returns true if health drops to 0 or below.
     */
    changeHealth(amount, doer) {
        this.health += amount;
        return (this.health <= 0);
    }
    /**
     * Calculates the scaled size of the object for collision/rendering.
     * @param {number} sM - Scale multiplier (optional, defaults to 1).
     * @param {boolean} ig - Ignore collision division (optional).
     */
    getScale(sM, ig) {
        sM = sM || 1;
        const baseScaleFactor = (this.isItem || this.type === 2 || this.type === 3 || this.type === 4) ?
            1 : (0.6 * sM);

        return this.scale * baseScaleFactor * (ig ? 1 : this.colDiv);
    }
    /**
     * Checks if the object is visible to a specific player.
     */
    visibleToPlayer(player) {
        return !(this.hideFromEnemy) || (this.owner && (this.owner === player ||
            (this.owner.team && player.team === this.owner.team)));
    }
    /**
     * Updates the object's state over time (delta is time elapsed).
     */
    update(delta) {
        if (this.active) {
            if (this.xWiggle) {
                this.xWiggle *= Math.pow(0.99, delta);
            }
            if (this.yWiggle) {
                this.yWiggle *= Math.pow(0.99, delta);
            }
            if (this.turnSpeed) {
                this.dir += this.turnSpeed * delta;
            }
        }
    }
	/** 
	 * Checks if object is from teammate's or not.
	*/
    isTeamObject(tmpObj, findAllianceBySid) {
        return this.owner == null ? true : (this.owner && tmpObj.sid == this.owner.sid || findAllianceBySid(this.owner.sid));
    };
}

export default GameObject;
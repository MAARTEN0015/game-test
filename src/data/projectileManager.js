// ProjectileManager.js
export default class ProjectileManager {
    constructor(Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server) {
        this.Projectile = Projectile;
        this.projectiles = projectiles;
        this.players = players;
        this.ais = ais;
        this.objectManager = objectManager;
        this.items = items;
        this.config = config;
        this.UTILS = UTILS;
        this.server = server;
    }

    addProjectile(x, y, dir, range, speed, indx, owner, ignoreObj, layer) {
        const { Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server } = this;

        const tmpData = items.projectiles[indx];
        let tmpProj;

        for (let i = 0; i < projectiles.length; ++i) {
            if (!projectiles[i].active) {
                tmpProj = projectiles[i];
                break;
            }
        }

        if (!tmpProj) {
            tmpProj = new Projectile(players, ais, objectManager, items, config, UTILS, server);
            tmpProj.sid = projectiles.length;
            projectiles.push(tmpProj);
        }

        tmpProj.init(indx, x, y, dir, speed, tmpData.dmg, range, tmpData.scale, owner);
        tmpProj.ignoreObj = ignoreObj;
        tmpProj.layer = layer || tmpData.layer;
        tmpProj.src = tmpData.src;

        return tmpProj;
    }
}
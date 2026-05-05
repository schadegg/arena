import { WEAPONS, COLORS, WEAPON_UPGRADES } from '../constants.js';

const MELEE_PROFILES = {
    spinner: { reachScale: 0.44, arc: 0.42, attackerPad: 0.58, targetPad: 0.42 },
    hammer: { reachScale: 0.46, arc: 0.26, attackerPad: 0.54, targetPad: 0.38 },
    flipper: { reachScale: 0.42, arc: 0.32, attackerPad: 0.58, targetPad: 0.38 },
    saw: { reachScale: 0.42, arc: 0.34, attackerPad: 0.55, targetPad: 0.4 },
    drill: { reachScale: 0.46, arc: 0.3, attackerPad: 0.56, targetPad: 0.4 },
    axe: { reachScale: 0.48, arc: 0.24, attackerPad: 0.58, targetPad: 0.38 },
    mace: { reachScale: 0.5, arc: 0.34, attackerPad: 0.62, targetPad: 0.44 },
};

const PROJECTILE_VISUAL_SCALE = 1.5;
const AUX_VISUAL_SCALE = 1.5;
const PROJECTILE_SOURCE_FRAME_MS = 70;
const PROJECTILE_TRAVEL_FRAME_MS = 80;
const PROJECTILE_IMPACT_FRAME_MS = 110;
const PROJECTILE_HIT_RADII = {
    bullet: 10,
    flame: 12,
    acid: 12,
    tesla: 13,
    plasma: 14,
    missile: 15,
    railgun: 12,
};
const PROJECTILE_ROTATION_OFFSETS = {
    bullet: Math.PI / 4,
    flame: Math.PI / 4,
    acid: Math.PI / 4,
    tesla: Math.PI / 4,
    plasma: Math.PI / 4,
    missile: Math.PI / 4,
    railgun: Math.PI / 4,
};

export default class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
        this.projectiles = [];
        this.mines = [];
        this.activeShields = [];
        this.activeDrones = [];
    }

    getWeapon(key) {
        const base = WEAPONS[key] || WEAPONS.spinner;
        // Apply weapon tier upgrades if player has them
        const prog = this.scene.registry ? this.scene.registry.get('progression') : null;
        if (prog && prog.getWeaponTier) {
            const tier = prog.getWeaponTier(key);
            if (tier > 0 && WEAPON_UPGRADES && WEAPON_UPGRADES.tiers[tier]) {
                const t = WEAPON_UPGRADES.tiers[tier];
                return { ...base,
                    key,
                    damage: Math.round(base.damage * t.damageMult),
                    range: Math.round(base.range * t.rangeMult),
                    cooldown: Math.round(base.cooldown * t.cooldownMult),
                };
            }
        }
        return { ...base, key };
    }

    // ── Attempt attack — returns result object ──
    attack(attacker, target, weaponKey) {
        const weapon = this.getWeapon(weaponKey);
        const now = Date.now();

        if (attacker.lastAttackTime && now - attacker.lastAttackTime < weapon.cooldown) {
            return { hit: false, reason: 'cooldown', effects: [] };
        }

        // Charge weapons
        if (weapon.chargeTime && !attacker.charged) {
            if (!attacker.charging) {
                attacker.charging = true;
                attacker.chargeStart = now;
                return { hit: false, reason: 'charging', effects: [] };
            }
            if (now - attacker.chargeStart < weapon.chargeTime) {
                return { hit: false, reason: 'charging', effects: [] };
            }
            attacker.charged = true;
            attacker.charging = false;
        }

        attacker.lastAttackTime = now;
        attacker.charged = false;
        attacker.attackAnim = 1.0;
        if (attacker.spriteRenderer?.triggerAttack) {
            attacker.spriteRenderer.triggerAttack();
        }

        const result = { hit: false, damage: 0, weapon, effects: [] };

        if (weapon.category === 'melee') {
            return this._meleeAttack(attacker, target, weapon, result);
        } else if (weapon.category === 'ranged') {
            return this._rangedAttack(attacker, target, weapon, result);
        } else if (weapon.category === 'explosive') {
            return this._explosiveAttack(attacker, target, weapon, result);
        } else if (weapon.category === 'utility') {
            return this._utilityAction(attacker, weapon, result);
        }

        return result;
    }

    _meleeAttack(attacker, target, weapon, result) {
        if (weapon.projectileDamage) {
            this._spawnProjectile(attacker, target, weapon, weapon.projectileDamage);
            result.effects.push({ type: 'audio', sound: this._getShootSound(weapon) });
        }

        const profile = MELEE_PROFILES[weapon.key] || {
            reachScale: 0.42,
            arc: 0.32,
            attackerPad: 0.54,
            targetPad: 0.36,
        };
        const meleeReach = weapon.range * profile.reachScale;
        const contactRange = meleeReach
            + attacker.size * profile.attackerPad
            + (target?.size || 32) * profile.targetPad;

        // Always try to break walls in swing direction, even without a target
        if (this.scene._breakTileAt) {
            const swingRange = meleeReach + attacker.size * Math.max(0.52, profile.attackerPad);
            for (let d = 15; d <= swingRange; d += 12) {
                const sx = attacker.x + Math.cos(attacker.angle) * d;
                const sy = attacker.y + Math.sin(attacker.angle) * d;
                this.scene._damageHazardsAt?.(sx, sy, 24, attacker);
                if (this.scene._isTileWalkable && !this.scene._isTileWalkable(sx, sy)) {
                    this.scene._breakTileAt(sx, sy);
                    // Also check TNT
                    if (this.scene._detonateTNTAt) this.scene._detonateTNTAt(sx, sy);
                }
            }
        }

        if (!target) return result;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > contactRange) {
            result.reason = 'out_of_range';
            return result;
        }

        // Wall line-of-sight check
        if (this.scene._isTileWalkable) {
            const steps = Math.ceil(dist / 20);
            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                const sx = attacker.x + dx * t;
                const sy = attacker.y + dy * t;
                if (!this.scene._isTileWalkable(sx, sy)) {
                    result.reason = 'blocked';
                    return result;
                }
            }
        }

        // Angle check — wide 140 degree cone
        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToTarget - attacker.angle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > Math.PI * profile.arc) {
            result.reason = 'missed';
            return result;
        }

        let damage = weapon.damage * (attacker.damageMult || 1);

        // Crit check
        if (weapon.critChance && Math.random() < weapon.critChance) {
            damage *= weapon.critMultiplier || 1.5;
            result.effects.push('crit');
        }

        // Armor pierce
        if (target.armor && weapon.armorPierce) {
            damage *= (1 - target.armor * (1 - weapon.armorPierce));
        } else if (target.armor) {
            damage *= (1 - target.armor);
        }

        result.hit = true;
        result.damage = Math.round(damage);

        // Knockback
        if (weapon.knockback) {
            const kb = weapon.knockback;
            const angle = Math.atan2(dy, dx);
            result.effects.push({ type: 'knockback', angle, force: kb });
        }

        // Stun
        if (weapon.stun) {
            result.effects.push({ type: 'stun', duration: weapon.stun });
        }

        // Bleed DoT
        if (weapon.bleed) {
            result.effects.push({ type: 'bleed', ...weapon.bleed });
        }

        // AoE
        if (weapon.aoeRadius) {
            result.effects.push({ type: 'aoe', radius: weapon.aoeRadius, damage: Math.round(damage * 0.5) });
        }

        // Particles
        const hitX = attacker.x + Math.cos(attacker.angle) * (meleeReach * 0.9);
        const hitY = attacker.y + Math.sin(attacker.angle) * (meleeReach * 0.9);
        result.effects.push({ type: 'particles', x: hitX, y: hitY, style: 'sparks', color: weapon.color });

        // Audio
        result.effects.push({ type: 'audio', sound: result.effects.some(e => e === 'crit') ? 'critHit' : 'hit' });

        return result;
    }

    _spawnProjectile(attacker, target, weapon, damageOverride = null, angleOverride = null, lifeOverride = null) {
        const angle = angleOverride ?? attacker.angle;
        const projectileSpeed = Number.isFinite(weapon.projectileSpeed) && weapon.projectileSpeed > 0
            ? weapon.projectileSpeed
            : 450;
        const projectileRange = weapon.projectileRange || weapon.range || 160;
        const lifeFromRange = projectileSpeed && projectileRange
            ? Math.round((projectileRange / projectileSpeed) * 1000)
            : null;
        const projectileLife = lifeOverride ?? (lifeFromRange
            ? Math.min(weapon.projectileLife || lifeFromRange, lifeFromRange)
            : (weapon.projectileLife || 1000));
        const spawnDist = attacker.size + 10;
        const px = attacker.x + Math.cos(angle) * spawnDist;
        const py = attacker.y + Math.sin(angle) * spawnDist;

        this.projectiles.push({
            x: px, y: py,
            vx: Math.cos(angle) * projectileSpeed,
            vy: Math.sin(angle) * projectileSpeed,
            angle,
            rotationOffset: this._projectileRotationOffset(weapon),
            hitRadius: this._projectileHitRadius(weapon),
            damage: (damageOverride ?? weapon.damage) * (attacker.damageMult || 1),
            owner: attacker,
            weapon,
            life: projectileLife,
            born: Date.now(),
            explosive: Boolean(weapon.explosionRadius),
            explosionRadius: weapon.explosionRadius || 0,
            selfDamage: weapon.selfDamage || 0,
            disableDuration: weapon.disableDuration || 0,
            stunDuration: weapon.stunDuration || 0,
            attackDisableDuration: weapon.attackDisableDuration || 0,
            homing: weapon.homing || false,
            target: target || null,
            piercing: weapon.piercing || false,
            hit: new Set(),
            gfx: this._createProjectileGraphic(weapon, px, py),
        });
    }

    _rangedAttack(attacker, target, weapon, result) {
        const angle = attacker.angle;
        const burstCount = weapon.burst || 1;
        const spread = weapon.spread || 0;
        const projectileSpeed = Number.isFinite(weapon.projectileSpeed) && weapon.projectileSpeed > 0
            ? weapon.projectileSpeed
            : 450;
        const lifeFromRange = projectileSpeed && weapon.range
            ? Math.round((weapon.range / projectileSpeed) * 1000)
            : null;
        const projectileLife = lifeFromRange
            ? Math.min(weapon.projectileLife || lifeFromRange, lifeFromRange)
            : (weapon.projectileLife || 1000);

        for (let i = 0; i < burstCount; i++) {
            const a = angle + (Math.random() - 0.5) * spread;
            this._spawnProjectile(attacker, target, weapon, weapon.damage, a, projectileLife);
        }

        result.effects.push({ type: 'audio', sound: this._getShootSound(weapon) });
        return result;
    }

    _explosiveAttack(attacker, target, weapon, result) {
        if (weapon.mineCount) {
            // Drop mines
            for (let i = 0; i < weapon.mineCount; i++) {
                const offsetAngle = (Math.PI * 2 / weapon.mineCount) * i;
                const mx = attacker.x + Math.cos(offsetAngle) * 30;
                const my = attacker.y + Math.sin(offsetAngle) * 30;
                this.mines.push({
                    x: mx, y: my, owner: attacker, weapon,
                    life: weapon.mineLife || 10000, born: Date.now(),
                    armed: false, armTime: 500,
                    gfx: this._createMineGraphic(mx, my),
                });
            }
            result.effects.push({ type: 'audio', sound: 'minePlace' });
        } else {
            // Throw projectile that explodes
            const angle = attacker.angle;
            const spawnDist = attacker.size + 10;
            const projectileSpeed = Number.isFinite(weapon.projectileSpeed) && weapon.projectileSpeed > 0
                ? weapon.projectileSpeed
                : 300;
            const lifeFromRange = projectileSpeed && weapon.range
                ? Math.round((weapon.range / projectileSpeed) * 1000)
                : null;
            const projectileLife = lifeFromRange
                ? Math.min(weapon.projectileLife || lifeFromRange, lifeFromRange)
                : (weapon.projectileLife || 1500);
            this.projectiles.push({
                x: attacker.x + Math.cos(angle) * spawnDist,
                y: attacker.y + Math.sin(angle) * spawnDist,
                vx: Math.cos(angle) * projectileSpeed,
                vy: Math.sin(angle) * projectileSpeed,
                angle,
                rotationOffset: this._projectileRotationOffset(weapon),
                hitRadius: this._projectileHitRadius(weapon),
                damage: weapon.damage * (attacker.damageMult || 1),
                owner: attacker,
                weapon,
                life: projectileLife,
                born: Date.now(),
                explosive: true,
                explosionRadius: weapon.explosionRadius || 80,
                selfDamage: weapon.selfDamage || 0,
                disableDuration: weapon.disableDuration || 0,
                stunDuration: weapon.stunDuration || 0,
                attackDisableDuration: weapon.attackDisableDuration || 0,
                gfx: this._createProjectileGraphic(weapon,
                    attacker.x + Math.cos(angle) * spawnDist,
                    attacker.y + Math.sin(angle) * spawnDist),
                hit: new Set(),
            });
            result.effects.push({ type: 'audio', sound: (weapon.disableDuration || weapon.stunDuration || weapon.attackDisableDuration) ? 'emp' : 'laser' });
        }
        return result;
    }

    _utilityAction(attacker, weapon, result) {
        if (weapon.shieldHp) {
            attacker.shieldHp = weapon.shieldHp;
            attacker.shieldMaxHp = weapon.shieldHp;
            attacker.shieldExpire = Date.now() + weapon.shieldDuration;
            result.effects.push({ type: 'audio', sound: 'shieldUp' });
            result.effects.push({ type: 'particles', x: attacker.x, y: attacker.y, style: 'shield' });
        } else if (weapon.healAmount) {
            attacker.healingActive = true;
            attacker.healRemaining = weapon.healAmount;
            attacker.healEnd = Date.now() + weapon.healDuration;
            result.effects.push({ type: 'audio', sound: 'repair' });
            result.effects.push({ type: 'particles', x: attacker.x, y: attacker.y, style: 'heal' });
        }
        return result;
    }

    _getShootSound(weapon) {
        if (weapon.chargeTime) return 'railgun';
        if (weapon.dot) return 'flame';
        if (weapon.color === COLORS.PURPLE) return 'plasma';
        return 'laser';
    }

    _botBodyRadius(bot) {
        return Math.max(16, (bot?.size || 32) * 0.78);
    }

    _projectileType(weapon) {
        if (weapon.dot && weapon.color === COLORS.ORANGE) return 'flame';
        if (weapon.piercing) return 'railgun';
        if (weapon.homing) return 'missile';
        if (weapon.chainTargets) return 'tesla';
        if (weapon.slowPercent) return 'acid';
        if (weapon.color === COLORS.PURPLE) return 'plasma';
        return 'bullet';
    }

    _projectileHitRadius(weapon) {
        return PROJECTILE_HIT_RADII[this._projectileType(weapon)] || PROJECTILE_HIT_RADII.bullet;
    }

    _projectileRotationOffset(weapon) {
        return PROJECTILE_ROTATION_OFFSETS[this._projectileType(weapon)] || 0;
    }

    _createProjectileGraphic(weapon, x, y) {
        // Map weapon properties to projectile sprite keys
        const projMap = {
            flame: weapon.dot && weapon.color === COLORS.ORANGE,
            railgun: weapon.piercing,
            missile: weapon.homing,
            tesla: weapon.chainTargets,
            acid: weapon.slowPercent,
            plasma: weapon.color === COLORS.PURPLE,
        };
        let spriteKey = `proj_${this._projectileType(weapon)}`;
        if (spriteKey === 'proj_bullet') {
            for (const [key, condition] of Object.entries(projMap)) {
                if (condition) { spriteKey = `proj_${key}`; break; }
            }
        }

        if (this.scene.textures.exists(spriteKey)) {
            const img = this.scene.add.sprite(x, y, spriteKey, 0).setDepth(50);
            const sz = (weapon.piercing ? 42 : (weapon.homing ? 34 : 26)) * PROJECTILE_VISUAL_SCALE;
            img.setDisplaySize(sz, sz);
            return img;
        }

        // Procedural fallback
        const gfx = this.scene.add.graphics();
        gfx.setDepth(50);
        const size = weapon.explosionRadius ? 6 : (weapon.piercing ? 8 : 4);
        gfx.fillStyle(weapon.color || 0xffffff, 0.9);
        gfx.fillCircle(0, 0, size);
        gfx.setPosition(x, y);
        return gfx;
    }

    _createMineGraphic(x, y) {
        // Use landmine sprite if available
        if (this.scene.textures.exists('aux_landmine')) {
            return this.scene.add.sprite(x, y, 'aux_landmine', 0)
                .setDisplaySize(34 * AUX_VISUAL_SCALE, 34 * AUX_VISUAL_SCALE)
                .setDepth(10);
        }
        const gfx = this.scene.add.graphics();
        gfx.setDepth(10);
        gfx.fillStyle(COLORS.DARK_GRAY, 0.8);
        gfx.fillCircle(0, 0, 8);
        gfx.lineStyle(1, COLORS.RED, 0.6);
        gfx.strokeCircle(0, 0, 10);
        gfx.setPosition(x, y);
        return gfx;
    }

    // ── Update projectiles, mines, shields, drones ──
    update(delta, bots, arenaRect) {
        const now = Date.now();
        const dt = delta / 1000;

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
                    !Number.isFinite(p.vx) || !Number.isFinite(p.vy) ||
                    !Number.isFinite(p.life)) {
                this._removeProjectileAt(i, false);
                continue;
            }

            const sourceAge = now - p.born;
            if (sourceAge < PROJECTILE_SOURCE_FRAME_MS) {
                p.gfx.setPosition(p.x, p.y);
                p.gfx.setRotation(p.angle + (p.rotationOffset || 0));
                this._updateProjectileFrame(p, now);
                continue;
            }

            p.life -= delta;
            if (p.life <= 0) {
                if (p.explosive) {
                    this._explodeProjectile(p, bots);
                }
                this._removeProjectileAt(i, p.explosive);
                continue;
            }

            // Homing
            if (p.homing && p.target && p.target.hp > 0) {
                const dx = p.target.x - p.x;
                const dy = p.target.y - p.y;
                const targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - p.angle;
                if (diff > Math.PI) diff -= Math.PI * 2;
                if (diff < -Math.PI) diff += Math.PI * 2;
                const turnSpeed = 3 * dt;
                p.angle += Math.max(-turnSpeed, Math.min(turnSpeed, diff));
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                p.vx = Math.cos(p.angle) * speed;
                p.vy = Math.sin(p.angle) * speed;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.gfx.setPosition(p.x, p.y);
            p.gfx.setRotation(p.angle + (p.rotationOffset || 0));
            this._updateProjectileFrame(p, now);

            if (this.scene._damageHazardsAt?.(p.x, p.y, 18, p.owner)) {
                if (p.explosive) {
                    this._explodeProjectile(p, bots);
                } else {
                    this.scene.particles.sparks(p.x, p.y, p.weapon.color || 0xffffff, 5);
                }
                this._removeProjectileAt(i, true);
                continue;
            }

            // Trail particles
            if (p.weapon.dot && p.weapon.color === COLORS.ORANGE) {
                this.scene.particles.fire(p.x, p.y, p.angle + Math.PI, 20);
            } else if (p.weapon.homing) {
                this.scene.particles.smoke(p.x - Math.cos(p.angle) * 8, p.y - Math.sin(p.angle) * 8, 0x666666);
            } else if (p.weapon.piercing) {
                this.scene.particles.electric(p.x, p.y, 2);
            } else if (p.weapon.color === COLORS.PURPLE) {
                this.scene.particles.plasma(p.x, p.y, p.angle);
            }

            // Wall/bounds collision — check tile grid if available, else use arena rect
            let hitWall = false;
            if (this.scene._isTileWalkable) {
                if (!this.scene._isTileWalkable(p.x, p.y)) {
                    hitWall = true;
                }
            } else if (arenaRect && (p.x < arenaRect.x || p.x > arenaRect.x + arenaRect.width ||
                p.y < arenaRect.y || p.y > arenaRect.y + arenaRect.height)) {
                hitWall = true;
            }
            if (hitWall) {
                // Break breakable tiles
                if (this.scene._breakTileAt) this.scene._breakTileAt(p.x, p.y);
                // Explosive projectiles still explode on wall impact
                if (p.explosive) {
                    this._explodeProjectile(p, bots);
                }
                this.scene.particles.sparks(p.x, p.y, p.weapon.color || 0xffffff, 5);
                this._removeProjectileAt(i, true);
                continue;
            }

            // Hit detection against bots
            for (const bot of bots) {
                if (bot === p.owner) continue;
                if (p.hit.has(bot)) continue;

                const dx = bot.x - p.x;
                const dy = bot.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this._botBodyRadius(bot) + (p.hitRadius || 10)) {
                    p.hit.add(bot);

                    if (p.explosive) {
                        bot.takeDamage(Math.round(p.damage), p.owner);
                        this._explodeProjectile(p, bots);
                        this._removeProjectileAt(i, true);
                        break;
                    }

                    let damage = p.damage;
                    if (bot.armor) damage *= (1 - bot.armor);

                    bot.takeDamage(damage, p.owner);
                    this.scene.particles.sparks(p.x, p.y, p.weapon.color);

                    if (p.weapon.dot) {
                        bot.addDot(p.weapon.dot.damage, p.weapon.dot.duration);
                    }
                    if (p.weapon.slowPercent) {
                        bot.addSlow(p.weapon.slowPercent, 2000);
                    }
                    if (p.weapon.disableDuration) {
                        bot.disable(p.weapon.disableDuration);
                    }
                    if (p.weapon.stunDuration) {
                        bot.stun(p.weapon.stunDuration);
                    }
                    if (p.weapon.attackDisableDuration) {
                        bot.disableAttack?.(p.weapon.attackDisableDuration);
                    }
                    if (p.weapon.chainTargets) {
                        this._chainLightning(p, bot, bots);
                    }

                    if (!p.piercing) {
                        this._removeProjectileAt(i, true);
                        break;
                    }
                }
            }
        }

        // Update mines
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const mine = this.mines[i];
            mine.life -= delta;
            if (mine.life <= 0) {
                mine.gfx.destroy();
                this.mines.splice(i, 1);
                continue;
            }

            if (!mine.armed && now - mine.born > mine.armTime) {
                mine.armed = true;
                // Update to armed frame if sprite, else procedural
                if (mine.gfx.setFrame) {
                    mine.gfx.setFrame(1); // frame 1 = armed
                } else {
                    mine.gfx.clear();
                    mine.gfx.fillStyle(COLORS.RED, 0.8);
                    mine.gfx.fillCircle(0, 0, 8);
                    mine.gfx.lineStyle(1, COLORS.YELLOW, 0.8);
                    mine.gfx.strokeCircle(0, 0, 10);
                }
            }

            if (mine.armed) {
                for (const bot of bots) {
                    if (bot === mine.owner) continue;
                    const dx = bot.x - mine.x;
                    const dy = bot.y - mine.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < (mine.weapon.triggerRadius || 40)) {
                        // Explode mine
                        this.scene._spawnExplosionSprite?.(mine.x, mine.y, Math.max(96, (mine.weapon.explosionRadius || 70) * 1.5));
                        this.scene.particles.explosion(mine.x, mine.y, mine.weapon.explosionRadius || 70);
                        this.scene.audio.playBombExplosion?.(0.9);

                        for (const b of bots) {
                            const d = Math.sqrt((b.x - mine.x) ** 2 + (b.y - mine.y) ** 2);
                            if (d < (mine.weapon.explosionRadius || 70)) {
                                const dmg = mine.weapon.damage * (1 - d / (mine.weapon.explosionRadius || 70));
                                b.takeDamage(Math.round(dmg), mine.owner);
                            }
                        }

                        this.scene._damageHazardsAt?.(mine.x, mine.y, mine.weapon.explosionRadius || 70, mine.owner);

                        mine.gfx.destroy();
                        this.mines.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    _updateProjectileFrame(projectile, now) {
        if (!projectile.gfx?.setFrame || projectile.gfx.active === false) return;

        const age = Math.max(0, now - projectile.born);
        if (age < PROJECTILE_SOURCE_FRAME_MS) {
            if (Number(projectile.gfx.frame?.name) !== 0) projectile.gfx.setFrame(0);
            return;
        }

        const travelFrame = Math.floor((age - PROJECTILE_SOURCE_FRAME_MS) / PROJECTILE_TRAVEL_FRAME_MS) % 2;
        const frame = travelFrame === 0 ? 1 : 2;
        if (Number(projectile.gfx.frame?.name) !== frame) projectile.gfx.setFrame(frame);
    }

    _removeProjectileAt(index, showImpactFrame = false) {
        const [projectile] = this.projectiles.splice(index, 1);
        if (!projectile?.gfx) return;

        if (!showImpactFrame || !projectile.gfx.setFrame || projectile.gfx.active === false) {
            projectile.gfx.destroy();
            return;
        }

        projectile.gfx.setFrame(3);
        projectile.gfx.setPosition(projectile.x, projectile.y);
        projectile.gfx.setRotation(projectile.angle + (projectile.rotationOffset || 0));
        projectile.gfx.setDepth(55);
        if (!this.scene.tweens?.add) {
            projectile.gfx.destroy();
            return;
        }

        this.scene.tweens.add({
            targets: projectile.gfx,
            alpha: 0,
            duration: PROJECTILE_IMPACT_FRAME_MS,
            onComplete: () => projectile.gfx.destroy(),
        });
    }

    _chainLightning(projectile, firstTarget, bots) {
        const maxChains = Math.max(0, projectile.weapon.chainTargets || 0);
        const chainRange = projectile.weapon.chainRange || 100;
        const hit = new Set([projectile.owner, firstTarget]);
        let origin = firstTarget;

        for (let i = 0; i < maxChains; i++) {
            let next = null;
            let bestDist = Infinity;
            for (const bot of bots) {
                if (!bot.alive || hit.has(bot)) continue;
                const dist = Math.hypot(bot.x - origin.x, bot.y - origin.y);
                if (dist < chainRange && dist < bestDist) {
                    next = bot;
                    bestDist = dist;
                }
            }
            if (!next) break;

            hit.add(next);
            const damage = Math.max(1, Math.round(projectile.damage * Math.pow(0.72, i + 1)));
            next.takeDamage(damage, projectile.owner);
            if (projectile.weapon.disableDuration) {
                next.disable(Math.max(80, projectile.weapon.disableDuration * 0.65));
            }
            this.scene.particles.electric(next.x, next.y, 10);
            this._drawTeslaArc(origin.x, origin.y, next.x, next.y);
            origin = next;
        }
    }

    _drawTeslaArc(x1, y1, x2, y2) {
        const g = this.scene.add.graphics().setDepth(70);
        g.lineStyle(3, COLORS.CYAN, 0.8);
        g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(1, COLORS.WHITE, 0.9);
        g.lineBetween(x1, y1, x2, y2);
        this.scene.tweens.add({
            targets: g,
            alpha: 0,
            duration: 120,
            onComplete: () => g.destroy(),
        });
    }

    _explodeProjectile(p, bots) {
        const radius = p.explosionRadius || 80;
        this.scene._spawnExplosionSprite?.(p.x, p.y, Math.max(96, radius * 1.5));
        this.scene.particles.explosion(p.x, p.y, radius);
        if (p.weapon?.key === 'missile' || p.weapon?.homing || p.explosive) {
            this.scene.audio.playBombExplosion?.(0.95);
        } else {
            this.scene.audio.playExplosion();
        }

        for (const bot of bots) {
            const dx = bot.x - p.x;
            const dy = bot.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const bodyRadius = this._botBodyRadius(bot);
            if (dist < radius + bodyRadius) {
                const edgeDist = Math.max(0, dist - bodyRadius * 0.7);
                const falloff = Math.max(0, 1 - edgeDist / radius);
                let damage = p.damage * falloff;
                if (bot === p.owner) damage = p.selfDamage * falloff;
                if (damage > 0) {
                    bot.takeDamage(Math.round(damage), p.owner);
                    // Knockback from explosion
                    const angle = Math.atan2(dy, dx);
                    bot.applyKnockback(angle, 140 * falloff);
                }
                if (p.disableDuration && bot !== p.owner) {
                    bot.disable(p.disableDuration);
                }
                if (p.stunDuration && bot !== p.owner) {
                    bot.stun(p.stunDuration);
                }
                if (p.attackDisableDuration && bot !== p.owner) {
                    bot.disableAttack?.(p.attackDisableDuration);
                }
            }
        }

        this.scene._damageHazardsAt?.(p.x, p.y, radius, p.owner);

        // Screen shake
        if (this.scene.cameras && this.scene.cameras.main) {
            this.scene.cameras.main.shake(200, 0.01);
        }
    }

    destroyAll() {
        for (const p of this.projectiles) p.gfx.destroy();
        for (const m of this.mines) m.gfx.destroy();
        this.projectiles = [];
        this.mines = [];
    }
}

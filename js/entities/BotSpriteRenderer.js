// BotSpriteRenderer.js v3 — manifest-driven directional rotation.
// Companion to BossSpriteRenderer. Picks chassis sheet based on bot state,
// picks frame within sheet based on bot.angle, using directional_manifest.json
// to map angle → eligible cells (within ±45°), then rotates each cell at draw
// time so the visible facing matches bot.angle exactly. Weapon overlay still
// uses 2×2 sheet.

const ATTACK_DURATION_MS = 350;
const DIR_TOLERANCE_DEG = 15;     // eligible frames are within ±this of bot.angle
const ATTACK_FPS = 12;
const DEFAULT_WEAPON_MOUNT = {
    scale: 1.32,
    forward: 0.28,
    lift: -0.16,
    lateral: 0,
    originX: 0.5,
    originY: 0.68,
    rotationOffset: 0,
};
const WEAPON_MOUNTS = {
    spinner: { scale: 1.5, forward: 0.14, lift: -0.06, originY: 0.55, rotationOffset: Math.PI / 2 },
    hammer: { scale: 1.42, forward: 0.12, lift: -0.22, originY: 0.8, rotationOffset: Math.PI / 2 },
    flipper: { scale: 1.34, forward: 0.3, lift: -0.12, originY: 0.66, rotationOffset: 0 },
    saw: { scale: 1.48, forward: 0.22, lift: -0.1, originY: 0.58, rotationOffset: 0 },
    drill: { scale: 1.32, forward: 0.34, lift: -0.12, originY: 0.62, rotationOffset: 0 },
    axe: { scale: 1.46, forward: 0.17, lift: -0.22, originY: 0.82, rotationOffset: Math.PI / 2 },
    mace: { scale: 1.45, forward: 0.2, lift: -0.18, originY: 0.76, rotationOffset: Math.PI / 2 },
    flamethrower: { scale: 1.28, forward: 0.32, lift: -0.1, originY: 0.66, rotationOffset: 0 },
    plasma: { scale: 1.28, forward: 0.32, lift: -0.1, originY: 0.66, rotationOffset: 0 },
    railgun: { scale: 1.38, forward: 0.4, lift: -0.11, originY: 0.64, rotationOffset: 0 },
    tesla: { scale: 1.26, forward: 0.24, lift: -0.09, originY: 0.66, rotationOffset: 0 },
    acid: { scale: 1.28, forward: 0.3, lift: -0.08, originY: 0.66, rotationOffset: 0 },
    missile: { scale: 1.38, forward: 0.36, lift: -0.12, originY: 0.65, rotationOffset: 0 },
};

// ──────────────────────────────────────────────────────────────
// Module-level helpers for the directional manifest system.
// Compass: 0° = N (world-frame), 90° = E, 180° = S, 270° = W (CW positive).
// Phaser bot.angle: CW-positive radians, 0 rad = +X = east.
// Both are CW-positive so the conversion is just a 90° offset (Phaser
// zero is east, compass zero is north → +90° to go from Phaser to compass).
// ──────────────────────────────────────────────────────────────

/** Convert Phaser bot.angle (radians, CW-positive, 0=east) → compass deg (0=N, CW). */
function botAngleRadToCompassDeg(rad) {
    const deg = rad * 180 / Math.PI;
    return ((deg + 90) % 360 + 360) % 360;
}

/** Smallest signed compass-angle difference, wrapped to (-180, 180]. */
function angularDiffDeg(a, b) {
    return ((a - b + 540) % 360) - 180;
}

/**
 * Filter eligible_cells (from manifest) to those within ±tol of targetCompass.
 * If none qualify, return the single closest cell so we never render nothing.
 */
function pickEligibleCells(allCells, targetCompass, tolDeg) {
    const within = allCells.filter(c =>
        Math.abs(angularDiffDeg(c.angle, targetCompass)) <= tolDeg);
    if (within.length > 0) return within;
    let best = allCells[0];
    let bestDist = Math.abs(angularDiffDeg(best.angle, targetCompass));
    for (const c of allCells) {
        const d = Math.abs(angularDiffDeg(c.angle, targetCompass));
        if (d < bestDist) { best = c; bestDist = d; }
    }
    return [best];
}

export class BotSpriteRenderer {
    constructor(bot) {
        this.bot = bot;
        this.scene = bot.scene;
        this.sprite = null;
        this.weaponSprite = null;
        this.shadowSprite = null;

        this.currentSheet = null;
        this.attackPlayUntil = 0;
        this.flashUntil = 0;
        this.lastHp = bot.hp;
        this.lastSpriteFrame = -1;
        this.currentWeaponKey = this.bot.weaponKey;
        this.weaponMount = { ...DEFAULT_WEAPON_MOUNT, ...(WEAPON_MOUNTS[this.bot.weaponKey] || {}) };
        this.currentDisplayScale = null;

        // Per-instance random still-frame choices for non-attacking chassis sheets.
        this.staticFrameSeed = {
            idle: Math.floor(Math.random() * 1024),
            walk: Math.floor(Math.random() * 1024),
        };
        // Attack animation still advances over time.
        this.animTimeMs = Math.random() * 1000;

        // Directional manifest — loaded once, shared across all bots
        this.manifest = this.scene.cache.json.get('directional_manifest') || {};

        this._tryAttachSprite();
    }

    _availableSheets() {
        const key = this.bot.chassisKey;
        return {
            idle:   this.scene.textures.exists(`chassis_${key}_idle`),
            walk:   this.scene.textures.exists(`chassis_${key}_walk`),
            attack: this.scene.textures.exists(`chassis_${key}_attack`),
        };
    }

    _tryAttachSprite() {
        const avail = this._availableSheets();
        if (!avail.idle && !avail.walk) return;

        const startSheet = avail.idle ? 'idle' : 'walk';
        const tex = `chassis_${this.bot.chassisKey}_${startSheet}`;

        // Ground shadow
        this.shadowSprite = this.scene.add.ellipse(
            0, this.bot.size * 0.6,
            this.bot.size * 1.8, this.bot.size * 0.5,
            0x000000, 0.4
        );
        this.bot.container.addAt(this.shadowSprite, 1);

        // Chassis sprite
        this.sprite = this.scene.add.sprite(0, 0, tex, 0);
        this._applyChassisDisplaySize(startSheet);
        this.sprite.setOrigin(0.5, 0.6);
        this.sprite.setTint(this.bot.skinColor);
        this.bot.container.addAt(this.sprite, 2);

        // Hide programmatic gfx
        if (this.bot.gfx) this.bot.gfx.setVisible(false);

        this.currentSheet = startSheet;

        this._attachWeaponSprite();
    }

    /**
     * Pick a chassis frame for the current state + bot.angle, using the
     * directional manifest. Returns:
     *   { texKey, frame, rotationDeltaRad }
     * where rotationDeltaRad is the rotation to apply on top of the sprite
     * so its visible facing matches bot.angle.
     *
     * For directional_anim sheets:
     *   - idle/walk: pick one stable random eligible cell, no animation
     *   - attack: cycle eligible cells as animation frames
     *   - each frame draws with rotation = (bot.angle - cell_angle)
     *
     * For attack_sequence and death_sequence (bosses only — kept here for
     * symmetry, but chassis don't use them):
     *   - Step through attack_sequence cells in order, no rotation.
     */
    _pickFrame(stateName) {
        const sheetKey = `chassis_${this.bot.chassisKey}_${stateName}.png`;
        const entry = this.manifest[sheetKey];
        if (!entry) {
            // No manifest entry — fall back to frame 0, no rotation.
            return {
                texKey: `chassis_${this.bot.chassisKey}_${stateName}`,
                frame: 0,
                rotationDeltaRad: 0,
            };
        }

        if (entry.kind === 'directional_anim') {
            const targetCompass = botAngleRadToCompassDeg(this.bot.angle);
            const eligible = pickEligibleCells(entry.eligible_cells, targetCompass, DIR_TOLERANCE_DEG);
            const idx = stateName === 'attack'
                ? Math.floor(this.animTimeMs / 1000 * ATTACK_FPS) % eligible.length
                : (this.staticFrameSeed[stateName] || 0) % eligible.length;
            const chosen = eligible[idx];
            const sourceSheet = chosen.source_sheet || sheetKey.replace('.png', '');
            // Both targetCompass and chosen.angle are compass degrees (CW positive).
            // Phaser sprite.rotation is also CW positive (radians). So the delta
            // converts directly: (target - cell) compass-degrees → Phaser radians.
            const deltaDeg = angularDiffDeg(targetCompass, chosen.angle);
            return {
                texKey: sourceSheet.replace('.png', ''),
                frame: chosen.cell,
                rotationDeltaRad: deltaDeg * Math.PI / 180,
            };
        }

        // Fallback for unknown kinds — single static frame, no rotation.
        return {
            texKey: `chassis_${this.bot.chassisKey}_${stateName}`,
            frame: 0,
            rotationDeltaRad: 0,
        };
    }

    _attachWeaponSprite() {
        if (this.weaponSprite) {
            this.weaponSprite.destroy();
            this.weaponSprite = null;
        }

        this.currentWeaponKey = this.bot.weaponKey;
        this.weaponMount = { ...DEFAULT_WEAPON_MOUNT, ...(WEAPON_MOUNTS[this.currentWeaponKey] || {}) };

        const weaponTex = `weapon_${this.currentWeaponKey}`;
        if (!this.scene.textures.exists(weaponTex)) return;

        this.weaponSprite = this.scene.add.sprite(0, this.bot.size * this.weaponMount.lift, weaponTex, 0);
        const wTarget = this.bot.size * this.weaponMount.scale;
        this.weaponSprite.setDisplaySize(wTarget, wTarget);
        this.weaponSprite.setOrigin(this.weaponMount.originX, this.weaponMount.originY);
        this.bot.container.addAt(this.weaponSprite, 3);
    }

    _applyChassisDisplaySize() {
        if (!this.sprite) return;
        if (this.currentDisplayScale === 1) return;
        const targetW = this.bot.size * 2.6;
        this.sprite.setDisplaySize(targetW, targetW);
        if (this.shadowSprite) {
            this.shadowSprite.setScale(1);
            this.shadowSprite.y = this.bot.size * 0.6;
        }
        if (this.weaponSprite) {
            const wTarget = this.bot.size * this.weaponMount.scale;
            this.weaponSprite.setDisplaySize(wTarget, wTarget);
        }
        this.currentDisplayScale = 1;
    }

    refreshWeapon() {
        this._attachWeaponSprite();
    }

    _setSheet(sheetName) {
        if (this.currentSheet === sheetName) return;
        const tex = `chassis_${this.bot.chassisKey}_${sheetName}`;
        if (!this.scene.textures.exists(tex)) return;
        this.sprite.setTexture(tex);
        this.currentSheet = sheetName;
        this.lastSpriteFrame = -1;
    }

    update(delta) {
        if (!this.sprite) return;
        const bot = this.bot;
        const now = Date.now();
        const avail = this._availableSheets();

        // Only attack animation advances frame time.
        this.animTimeMs += delta;

        if (this.currentWeaponKey !== bot.weaponKey) {
            this.refreshWeapon();
        }
        if (bot.attackAnim > 0.65 && now >= this.attackPlayUntil) {
            this.triggerAttack();
        }

        // ── Pick sheet ──
        let targetSheet;
        if (!bot.alive) {
            targetSheet = avail.idle ? 'idle' : 'walk';  // dead pose
        } else if (now < this.attackPlayUntil && avail.attack) {
            targetSheet = 'attack';
        } else {
            const moving = Math.abs(bot.moveDir.x) > 0.05 || Math.abs(bot.moveDir.y) > 0.05;
            targetSheet = (moving && avail.walk) ? 'walk' : (avail.idle ? 'idle' : 'walk');
        }

        // ── Pick frame + rotation from manifest ──
        const pick = this._pickFrame(targetSheet);

        // The picked frame may live in a *different* sheet than targetSheet
        // (walk pulls from idle / attack cells). Switch the sprite's texture
        // accordingly.
        if (this.sprite.texture.key !== pick.texKey
                && this.scene.textures.exists(pick.texKey)) {
            this.sprite.setTexture(pick.texKey);
            this.lastSpriteFrame = -1;
        }
        if (pick.frame !== this.lastSpriteFrame) {
            this.sprite.setFrame(pick.frame);
            this.lastSpriteFrame = pick.frame;
        }
        // Apply rotation so visible facing matches bot.angle exactly.
        this._applyChassisDisplaySize(targetSheet);
        this.sprite.rotation = pick.rotationDeltaRad;
        this.currentSheet = targetSheet;

        // ── Damage flash ──
        if (bot.hp < this.lastHp - 0.5) {
            this.flashUntil = now + 80;
        }
        this.lastHp = bot.hp;
        if (now < this.flashUntil) {
            this.sprite.setTint(0xffffff);
        } else if (!bot.alive) {
            this.sprite.setTint(0x666666);
        } else if (bot.disabled) {
            this.sprite.setTint(0x555555);
        } else if (bot.attackDisabled) {
            this.sprite.setTint(0x66ccff);
        } else {
            this.sprite.setTint(bot.skinColor);
        }

        // ── Weapon: rotate to face bot direction, change frame on fire ──
        if (this.weaponSprite) {
            const mount = this.weaponMount;
            const forward = bot.size * mount.forward;
            const lateral = bot.size * mount.lateral;
            this.weaponSprite.rotation = bot.angle + mount.rotationOffset;
            this.weaponSprite.x = Math.cos(bot.angle) * forward - Math.sin(bot.angle) * lateral;
            this.weaponSprite.y = Math.sin(bot.angle) * forward + Math.cos(bot.angle) * lateral + bot.size * mount.lift;
            // Frame: 0=idle, 1=fire1, 2=fire2, 3=damaged
            if (now < this.attackPlayUntil) {
                const inAttack = (this.attackPlayUntil - now) / ATTACK_DURATION_MS;
                this.weaponSprite.setFrame(inAttack > 0.5 ? 1 : 2);
            } else if (bot.hp < bot.maxHp * 0.25) {
                this.weaponSprite.setFrame(3);
            } else {
                this.weaponSprite.setFrame(0);
            }
        }

        // ── Idle bob ──
        if (bot.alive) {
            const bob = Math.sin(now * 0.006) * 1.2;
            this.sprite.y = bob;
        }

        // ── Y-sort depth ──
        bot.container.setDepth(bot.y);
    }

    /** Called when bot fires its weapon. */
    triggerAttack() {
        if (!this.sprite || !this.bot.alive) return;
        this.attackPlayUntil = Date.now() + ATTACK_DURATION_MS;
    }

    destroy() {
        if (this.sprite) this.sprite.destroy();
        if (this.weaponSprite) this.weaponSprite.destroy();
        if (this.shadowSprite) this.shadowSprite.destroy();
    }
}

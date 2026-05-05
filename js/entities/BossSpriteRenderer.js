// BossSpriteRenderer.js v3 — manifest-driven directional rotation + sequence playback.
//
// Loads up to 5 sprite sheets per boss. Frame selection driven by
// directional_manifest.json:
//   - idle/walk: directional_anim — pick eligible cells within ±45° of
//     boss.angle, cycle as animation, rotate each frame to match angle
//   - attack1/attack2: attack_sequence — play '-' cells in source order,
//     loop count from manifest meta, no rotation
//   - death: death_sequence — play all 16 cells in source order once,
//     no rotation, hold last frame
//
// Hitbox/damage stays wired through Boss.size + Boss.takeDamage; sprite is
// purely visual.

const ATTACK_DURATION_MS = 600;   // fallback; overridden by attack sequence length × loops
const DEATH_DURATION_MS = 1500;
const DIR_TOLERANCE_DEG = 15;
const ATTACK_FPS = 12;
const DEATH_FPS = 6;
const BOSS_MANIFEST_SLUGS = {
    crusher: 'crusher',
    forgemaster: 'forgemaster',
    magmaCore: 'magma_core',
    virusExe: 'virus_exe',
    titan: 'titan',
    jungleBeast: 'jungle_beast',
    frostCore: 'frost_core',
    voltEngine: 'volt_engine',
    rockGolem: 'rock_golem',
    prismLord: 'prism_lord',
};

// ── Compass / Phaser angle helpers ──────────────────────────────────
// Compass: 0=N (CW positive). Phaser: 0=east (CW positive radians).
// Both CW-positive, so conversion is just a 90° offset.
function botAngleRadToCompassDeg(rad) {
    const deg = rad * 180 / Math.PI;
    return ((deg + 90) % 360 + 360) % 360;
}
function angularDiffDeg(a, b) {
    return ((a - b + 540) % 360) - 180;
}
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

export class BossSpriteRenderer {
    constructor(boss) {
        this.boss = boss;
        this.scene = boss.scene;
        this.sprite = null;
        this.shadowSprite = null;

        // State
        this.currentSheet = null;     // 'idle' | 'walk' | 'attack1' | 'attack2' | 'death'
        this.attackPlayUntil = 0;     // timestamp when attack animation ends
        this.currentAttackType = 1;   // alternates between attack1/2
        this.deathStartedAt = 0;
        this.flashUntil = 0;
        this.lastHp = boss.hp;
        this.lastSpriteFrame = -1;
        this.staticFrameSeed = {
            idle: Math.floor(Math.random() * 1024),
            walk: Math.floor(Math.random() * 1024),
        };
        this.animTimeMs = Math.random() * 1000;

        // Directional manifest, loaded once (shared across all boss instances)
        this.manifest = this.scene.cache.json.get('directional_manifest') || {};

        this._tryAttachSprite();
    }

    _availableSheets() {
        const key = this.boss.bossKey;
        return {
            idle:    this.scene.textures.exists(`boss_${key}_idle`),
            walk:    this.scene.textures.exists(`boss_${key}_walk`),
            attack1: this.scene.textures.exists(`boss_${key}_attack1`),
            attack2: this.scene.textures.exists(`boss_${key}_attack2`),
            death:   this.scene.textures.exists(`boss_${key}_death`),
        };
    }

    _manifestSlug() {
        return BOSS_MANIFEST_SLUGS[this.boss.bossKey] || this.boss.bossKey;
    }

    _manifestSheetKey(stateName) {
        return `boss_${this._manifestSlug()}_${stateName}.png`;
    }

    _runtimeSheetKey(stateName) {
        return `boss_${this.boss.bossKey}_${stateName}`;
    }

    _runtimeKeyFromManifestSheet(sourceSheet, fallbackState = 'idle') {
        if (!sourceSheet) return this._runtimeSheetKey(fallbackState);
        const base = sourceSheet.replace('.png', '');
        const manifestSlug = this._manifestSlug();
        const prefix = `boss_${manifestSlug}_`;
        if (base.startsWith(prefix)) {
            const suffix = base.slice(prefix.length);
            return `boss_${this.boss.bossKey}_${suffix}`;
        }
        return base;
    }

    _tryAttachSprite() {
        const avail = this._availableSheets();
        if (!avail.idle && !avail.walk) return; // need at least one rotation sheet

        const startSheet = avail.idle ? 'idle' : 'walk';
        const tex = `boss_${this.boss.bossKey}_${startSheet}`;

        // Soft circular ground shadow underneath
        this.shadowSprite = this.scene.add.ellipse(0, this.boss.size * 0.7, this.boss.size * 2.4, this.boss.size * 0.6, 0x000000, 0.4);
        this.boss.container.addAt(this.shadowSprite, 1);

        this.sprite = this.scene.add.sprite(0, 0, tex, 0);
        const targetW = this.boss.size * 3.2;  // bosses render large
        this.sprite.setDisplaySize(targetW, targetW);
        this.sprite.setOrigin(0.5, 0.65);  // origin slightly low so sprite "stands" on the bot center
        this.boss.container.addAt(this.sprite, 2);

        // Hide programmatic graphics
        if (this.boss.gfx) this.boss.gfx.setVisible(false);

        this.currentSheet = startSheet;
    }

    /**
     * Pick a boss frame for the current state + boss.angle, using the
     * directional manifest. Returns:
     *   { texKey, frame, rotationDeltaRad }
     *
     * The boss manifest has three kinds:
     *   directional_anim — eligible cells within ±45°, hold a still frame
     *   for idle/walk and only animate during attack
     *   attack_sequence  — '-' cells played in source order, looped per meta, no rotation
     *   death_sequence   — all cells played in source order once, no rotation
     */
    _pickFrame(stateName) {
        const sheetKey = this._manifestSheetKey(stateName);
        const entry = this.manifest[sheetKey];
        const fallbackTex = this._runtimeSheetKey(stateName);

        if (!entry) {
            return { texKey: fallbackTex, frame: 0, rotationDeltaRad: 0 };
        }

        if (entry.kind === 'directional_anim') {
            const targetCompass = botAngleRadToCompassDeg(this.boss.angle);
            const eligible = pickEligibleCells(entry.eligible_cells, targetCompass, DIR_TOLERANCE_DEG);
            const idx = stateName.startsWith('attack')
                ? Math.floor(this.animTimeMs / 1000 * ATTACK_FPS) % eligible.length
                : (this.staticFrameSeed[stateName] || 0) % eligible.length;
            const chosen = eligible[idx];
            const sourceSheet = this._runtimeKeyFromManifestSheet(chosen.source_sheet || sheetKey, stateName);
            const deltaDeg = angularDiffDeg(targetCompass, chosen.angle);
            return {
                texKey: sourceSheet,
                frame: chosen.cell,
                rotationDeltaRad: deltaDeg * Math.PI / 180,
            };
        }

        if (entry.kind === 'attack_sequence') {
            const seq = entry.attack_sequence;
            if (!seq || seq.length === 0) {
                return { texKey: fallbackTex, frame: 0, rotationDeltaRad: 0 };
            }
            const loops = (entry.meta && entry.meta.loop_count) || 1;
            const totalFrames = seq.length * loops;
            const elapsed = Date.now() - (this.attackPlayUntil - this.attackTotalMs);
            const t = Math.floor(elapsed / 1000 * ATTACK_FPS);
            // Clamp to last frame on overflow (attack ends shortly after).
            const idx = Math.min(t, totalFrames - 1);
            const cell = seq[idx % seq.length];
            return { texKey: fallbackTex, frame: cell, rotationDeltaRad: 0 };
        }

        if (entry.kind === 'death_sequence') {
            const seq = entry.attack_sequence;
            const elapsed = Date.now() - this.deathStartedAt;
            const t = Math.floor(elapsed / 1000 * DEATH_FPS);
            const idx = Math.min(t, seq.length - 1);  // hold on last frame
            return { texKey: fallbackTex, frame: seq[idx], rotationDeltaRad: 0 };
        }

        return { texKey: fallbackTex, frame: 0, rotationDeltaRad: 0 };
    }

    /** Switch which sheet the sprite uses (idle/walk/attack1/attack2/death). */
    _setSheet(sheetName) {
        if (this.currentSheet === sheetName) return;
        const tex = this._runtimeSheetKey(sheetName);
        if (!this.scene.textures.exists(tex)) return;
        this.sprite.setTexture(tex);
        this.currentSheet = sheetName;
        this.lastSpriteFrame = -1; // force frame refresh
    }

    update(delta) {
        if (!this.sprite) return;
        const boss = this.boss;
        const now = Date.now();
        const avail = this._availableSheets();

        // Advance our animation clock
        this.animTimeMs += delta;

        // ── 1. State machine: pick which sheet to display ──
        let targetSheet;

        if (!boss.alive) {
            if (this.deathStartedAt === 0) this.deathStartedAt = now;
            if (avail.death) {
                targetSheet = 'death';
            } else {
                targetSheet = avail.idle ? 'idle' : 'walk';
            }
        } else if (now < this.attackPlayUntil) {
            const sheet = `attack${this.currentAttackType}`;
            targetSheet = avail[sheet] ? sheet : (avail.attack1 ? 'attack1' : (avail.walk ? 'walk' : 'idle'));
        } else {
            const moving = Math.abs(boss.moveDir.x) > 0.05 || Math.abs(boss.moveDir.y) > 0.05;
            if (moving && avail.walk) {
                targetSheet = 'walk';
            } else if (avail.idle) {
                targetSheet = 'idle';
            } else {
                targetSheet = 'walk';
            }
        }

        // ── 2. Pick frame (and possibly source texture) from manifest ──
        const pick = this._pickFrame(targetSheet);
        if (this.sprite.texture.key !== pick.texKey
                && this.scene.textures.exists(pick.texKey)) {
            this.sprite.setTexture(pick.texKey);
            this.lastSpriteFrame = -1;
        }
        if (pick.frame !== this.lastSpriteFrame) {
            this.sprite.setFrame(pick.frame);
            this.lastSpriteFrame = pick.frame;
        }
        this.sprite.rotation = pick.rotationDeltaRad;
        this.currentSheet = targetSheet;

        // ── 3. Damage flash (overlay white tint when HP drops) ──
        if (boss.hp < this.lastHp - 0.5) {
            this.flashUntil = now + 100;
        }
        this.lastHp = boss.hp;
        if (now < this.flashUntil) {
            this.sprite.setTint(0xffffff);
        } else if (boss.enraged) {
            // Enraged tint pulse
            const pulse = 0.7 + Math.sin(now * 0.01) * 0.3;
            const r = 255;
            const g = Math.floor(180 * pulse);
            const b = Math.floor(180 * pulse);
            this.sprite.setTint((r << 16) | (g << 8) | b);
        } else if (!boss.alive) {
            // Dim the death sprite slightly
            this.sprite.setTint(0xcccccc);
        } else {
            this.sprite.clearTint();
        }

        // ── 4. No non-attack sprite motion ──
        this.sprite.y = 0;

        // ── 5. Y-sort depth so closer entities draw on top ──
        boss.container.setDepth(boss.y);

        // ── 6. Hide name text during death ──
        if (boss.nameText && !boss.alive) {
            boss.nameText.setVisible(false);
        }
    }

    /** Called from Boss._meleeAttack/_rangedAttack/_slamAttack to play attack anim. */
    triggerAttack(attackType = null) {
        if (!this.sprite || !this.boss.alive) return;
        if (attackType === null) {
            this.currentAttackType = (this.currentAttackType === 1) ? 2 : 1;
        } else {
            this.currentAttackType = attackType;
        }
        // Compute duration from manifest: seq.length × loops × frame interval.
        // Falls back to ATTACK_DURATION_MS if no manifest entry exists.
        const sheetKey = this._manifestSheetKey(`attack${this.currentAttackType}`);
        const entry = this.manifest && this.manifest[sheetKey];
        let duration = ATTACK_DURATION_MS;
        if (entry && entry.kind === 'attack_sequence' && entry.attack_sequence) {
            const loops = (entry.meta && entry.meta.loop_count) || 1;
            duration = (entry.attack_sequence.length * loops) / ATTACK_FPS * 1000;
        }
        this.attackTotalMs = duration;
        this.attackPlayUntil = Date.now() + duration;
    }

    destroy() {
        if (this.sprite) this.sprite.destroy();
        if (this.shadowSprite) this.shadowSprite.destroy();
    }
}

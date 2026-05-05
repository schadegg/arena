import { COLORS, WEAPONS, CHASSIS } from '../constants.js';
import { BotSpriteRenderer } from './BotSpriteRenderer.js';

export default class Bot {
    constructor(scene, x, y, config = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.angle = config.angle || 0;

        // Identity
        this.name = config.name || 'Bot';
        this.isPlayer = config.isPlayer || false;
        this.weaponKey = config.weapon || 'spinner';
        this.skinColor = config.skinColor || COLORS.STEEL;

        // Chassis
        this.chassisKey = config.chassis || 'medium';
        const chassis = CHASSIS[this.chassisKey];
        this.size = config.size || chassis.size;
        this.speed = config.speed || chassis.speed;
        this.maxHp = config.hp || chassis.hp;
        this.hp = this.maxHp;
        this.armor = config.armor || chassis.armor;

        // Movement state
        this.moveDir = { x: 0, y: 0 };
        this.vx = 0;
        this.vy = 0;
        this.knockbackVx = 0;
        this.knockbackVy = 0;

        // Combat state
        this.lastAttackTime = 0;
        this.attackAnim = 0;
        this.wantsAttack = false;
        this.charging = false;
        this.chargeStart = 0;
        this.charged = false;

        // Energy
        this.energy = 100;
        this.maxEnergy = 100;
        this.energyRegen = 15; // per second

        // Dodge
        this.dodging = false;
        this.dodgeEnd = 0;
        this.dodgeCooldownEnd = 0;
        this.dodgeDir = { x: 0, y: 0 };

        // Bomb
        this.bombActive = false;
        this.bombCooldownEnd = 0;

        // Block
        this.blocking = false;

        // Secondary weapon
        this.secondaryWeaponKey = config.secondaryWeapon || null;

        // Invincibility frames after hit
        this.iFrames = false;
        this.iFrameEnd = 0;

        // Speed burst after kill
        this.speedBurst = false;
        this.speedBurstEnd = 0;

        // Smooth acceleration
        this.velX = 0;
        this.velY = 0;

        // Status effects
        this.stunned = false;
        this.stunEnd = 0;
        this.disabled = false;
        this.disableEnd = 0;
        this.attackDisabled = false;
        this.attackDisableEnd = 0;
        this.dots = [];
        this.slows = [];
        this.shieldHp = 0;
        this.shieldMaxHp = 0;
        this.shieldExpire = 0;
        this.healingActive = false;
        this.healRemaining = 0;
        this.healEnd = 0;

        // Visuals
        this.container = scene.add.container(x, y).setDepth(20);
        this.gfx = scene.add.graphics();
        this.container.add(this.gfx);

        // Health bar
        const barY = -this.size - 16;
        this.hpBarInnerWidth = Math.max(42, this.size * 1.55);
        this.hpBarBg = scene.add.rectangle(0, barY, this.hpBarInnerWidth, 5, 0x250606, 0.95)
            .setOrigin(0.5);
        this.hpBarFill = scene.add.rectangle(-this.hpBarInnerWidth / 2, barY, this.hpBarInnerWidth, 5, COLORS.GREEN, 0.98)
            .setOrigin(0, 0.5);
        this.hpBarShield = scene.add.rectangle(-this.hpBarInnerWidth / 2, barY - 5, this.hpBarInnerWidth, 2, COLORS.CYAN, 0.72)
            .setOrigin(0, 0.5)
            .setVisible(false);
        this.hpBarFrame = scene.add.graphics();
        this._drawHealthBarFrame(barY);
        this.container.add([this.hpBarBg, this.hpBarFill, this.hpBarShield, this.hpBarFrame]);

        // Name text
        this.nameText = scene.add.text(0, -this.size - 22, this.name, {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        this.container.add(this.nameText);

        // Shield visual
        this.shieldGfx = scene.add.graphics();
        this.container.add(this.shieldGfx);

        // Stun indicator
        this.stunGfx = scene.add.graphics();
        this.container.add(this.stunGfx);

        this.draw();

        // Sprite-based rendering layer — handles chassis, weapon, shadow, all visuals
        // When active, it hides bot.gfx and owns all visual elements
        this.spriteRenderer = new BotSpriteRenderer(this);
        this.weaponSprite = null; // BotSpriteRenderer creates its own weapon sprite
    }

    draw() {
        const g = this.gfx;
        g.clear();
        const s = this.size;
        const t = Date.now();

        // ═══════════════════════════════════════
        // SPRITE RENDERER ACTIVE — only draw overlays, skip all procedural body/weapon
        // ═══════════════════════════════════════
        if (this.spriteRenderer && this.spriteRenderer.sprite) {
            this._drawHealthBar();

            // Shield overlay
            this.shieldGfx.clear();
            if (this.shieldHp > 0) {
                const sa = 0.2 + (this.shieldHp / this.shieldMaxHp) * 0.3 + Math.sin(t * 0.005) * 0.05;
                this.shieldGfx.fillStyle(COLORS.BLUE, sa * 0.12);
                this.shieldGfx.fillCircle(0, 0, s + 16);
                this.shieldGfx.lineStyle(4, COLORS.CYAN, sa);
                this.shieldGfx.strokeCircle(0, 0, s + 16);
            }

            // Block stance overlay
            if (this.blocking) {
                g.fillStyle(COLORS.BLUE, 0.12);
                g.fillCircle(0, 0, s + 10);
                g.lineStyle(3, COLORS.CYAN, 0.5);
                g.strokeCircle(0, 0, s + 10);
            }

            // Stun stars overlay
            this.stunGfx.clear();
            if (this.stunned) {
                for (let i = 0; i < 3; i++) {
                    const sa2 = t * 0.005 + (Math.PI * 2 / 3) * i;
                    const sx = Math.cos(sa2) * (s + 10);
                    const sy = Math.sin(sa2) * (s + 10) - s * 0.3;
                    this.stunGfx.fillStyle(COLORS.YELLOW, 0.8);
                    const starPts = [];
                    for (let j = 0; j < 10; j++) {
                        const sa3 = (Math.PI * 2 / 10) * j - Math.PI / 2;
                        const sr = j % 2 === 0 ? 8 : 3;
                        starPts.push({ x: sx + Math.cos(sa3) * sr, y: sy + Math.sin(sa3) * sr });
                    }
                    this.stunGfx.fillPoints(starPts, true);
                }
            }

            // I-frame flash
            if (this.iFrames) {
                g.fillStyle(COLORS.WHITE, 0.1 + Math.sin(t * 0.03) * 0.1);
                g.fillCircle(0, 0, s * 0.8);
            }

            return; // DONE — sprite renderer handles everything else
        }

        // ═══════════════════════════════════════
        // PROCEDURAL FALLBACK — only runs if no sprite renderer
        // ═══════════════════════════════════════
        const weapon = WEAPONS[this.weaponKey] || WEAPONS.spinner;
        const col = this.disabled ? 0x555555 : this.skinColor;
        const dk = this._darken(col, 70);
        const lt = this._lighten(col, 60);
        const a = this.angle;
        const p = a + Math.PI / 2;
        const moving = Math.abs(this.moveDir.x) > 0.05 || Math.abs(this.moveDir.y) > 0.05;
        // t already declared above for sprite path
        const lowHp = this.hp < this.maxHp * 0.35;
        const eyeCol = this.disabled ? COLORS.RED : (lowHp ? COLORS.RED : COLORS.CYAN);
        const OL = 4; // outline width — cel-shade signature

        // ── Drop Shadow (elongated, top-left light source) ──
        g.fillStyle(0x000000, 0.3);
        g.fillCircle(5, 9, s * 0.75);
        g.fillCircle(8, 10, s * 0.6);
        g.fillCircle(2, 8, s * 0.55);

        // ══════════════════════════════════════
        //  CEL-SHADED CHASSIS DRAWING
        // ══════════════════════════════════════

        if (this.chassisKey === 'light') {
            // ── LIGHT: Sleek speedster wedge ──
            // Fins (behind)
            for (const sd of [-1, 1]) {
                const finPts = [
                    { x: -Math.cos(a) * s * 0.5 + Math.cos(p) * s * 0.65 * sd, y: -Math.sin(a) * s * 0.5 + Math.sin(p) * s * 0.65 * sd },
                    { x: -Math.cos(a) * s * 1.0 + Math.cos(p) * s * 0.85 * sd, y: -Math.sin(a) * s * 1.0 + Math.sin(p) * s * 0.85 * sd },
                    { x: -Math.cos(a) * s * 0.85 + Math.cos(p) * s * 0.35 * sd, y: -Math.sin(a) * s * 0.85 + Math.sin(p) * s * 0.35 * sd },
                ];
                this._celPoly(g, finPts, dk, 3);
            }
            // Body wedge
            const bodyPts = [
                { x: Math.cos(a) * s * 1.35, y: Math.sin(a) * s * 1.35 },
                { x: Math.cos(a + 2.2) * s * 0.7, y: Math.sin(a + 2.2) * s * 0.7 },
                { x: -Math.cos(a) * s * 0.8 + Math.cos(p) * s * 0.5, y: -Math.sin(a) * s * 0.8 + Math.sin(p) * s * 0.5 },
                { x: -Math.cos(a) * s * 0.55, y: -Math.sin(a) * s * 0.55 },
                { x: -Math.cos(a) * s * 0.8 - Math.cos(p) * s * 0.5, y: -Math.sin(a) * s * 0.8 - Math.sin(p) * s * 0.5 },
                { x: Math.cos(a - 2.2) * s * 0.7, y: Math.sin(a - 2.2) * s * 0.7 },
            ];
            this._celPoly(g, bodyPts, col, OL);
            // Shadow band (bottom half of body)
            g.fillStyle(dk, 0.3);
            g.fillCircle(Math.cos(p) * s * 0.15 + Math.cos(a) * s * -0.1, Math.sin(p) * s * 0.15 + Math.sin(a) * s * -0.1, s * 0.5);
            // Cockpit canopy
            this._celCircle(g, Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35, s * 0.22, lt, 3);
            // Racing stripe
            g.lineStyle(4, lt, 0.4);
            g.lineBetween(Math.cos(a) * s * 1.1, Math.sin(a) * s * 1.1, -Math.cos(a) * s * 0.4, -Math.sin(a) * s * 0.4);
            g.lineStyle(OL, 0x000000, 0.3);
            g.lineBetween(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.15, -Math.cos(a) * s * 0.45, -Math.sin(a) * s * 0.45);
            // Hover jets
            if (moving) {
                for (const sd of [-0.3, 0.3]) {
                    const jx = -Math.cos(a) * s * 0.4 + Math.cos(p) * s * sd;
                    const jy = -Math.sin(a) * s * 0.4 + Math.sin(p) * s * sd;
                    g.fillStyle(COLORS.CYAN, 0.4 + Math.random() * 0.2);
                    g.fillCircle(jx, jy, 6 + Math.random() * 3);
                    g.fillStyle(COLORS.WHITE, 0.3);
                    g.fillCircle(jx, jy, 3);
                }
            }
            // Visor eye
            this._celCircle(g, Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, 7, eyeCol, 3);

        } else if (this.chassisKey === 'heavy') {
            // ── HEAVY: Fortress bulldozer ──
            // Treads
            for (const sd of [-1, 1]) {
                const tx = Math.cos(p) * s * 0.85 * sd;
                const ty = Math.sin(p) * s * 0.85 * sd;
                const tPts = [
                    { x: tx + Math.cos(a) * s * 0.9 + Math.cos(p) * s * 0.2 * sd, y: ty + Math.sin(a) * s * 0.9 + Math.sin(p) * s * 0.2 * sd },
                    { x: tx + Math.cos(a) * s * 0.9 - Math.cos(p) * s * 0.2 * sd, y: ty + Math.sin(a) * s * 0.9 - Math.sin(p) * s * 0.2 * sd },
                    { x: tx - Math.cos(a) * s * 0.8 - Math.cos(p) * s * 0.2 * sd, y: ty - Math.sin(a) * s * 0.8 - Math.sin(p) * s * 0.2 * sd },
                    { x: tx - Math.cos(a) * s * 0.8 + Math.cos(p) * s * 0.2 * sd, y: ty - Math.sin(a) * s * 0.8 + Math.sin(p) * s * 0.2 * sd },
                ];
                this._celPoly(g, tPts, 0x1a1a1a, 3);
                // Tread teeth
                g.lineStyle(3, 0x2a2a2a, 0.7);
                for (let i = -3; i <= 3; i++) {
                    const cx = tx + Math.cos(a) * s * 0.25 * i;
                    const cy = ty + Math.sin(a) * s * 0.25 * i;
                    g.lineBetween(cx + Math.cos(p) * s * 0.2 * sd, cy + Math.sin(p) * s * 0.2 * sd,
                                  cx - Math.cos(p) * s * 0.15 * sd, cy - Math.sin(p) * s * 0.15 * sd);
                }
            }
            // Wide body
            const bPts = [
                { x: Math.cos(a) * s * 0.9 + Math.cos(p) * s * 0.65, y: Math.sin(a) * s * 0.9 + Math.sin(p) * s * 0.65 },
                { x: Math.cos(a) * s * 0.9 - Math.cos(p) * s * 0.65, y: Math.sin(a) * s * 0.9 - Math.sin(p) * s * 0.65 },
                { x: -Math.cos(a) * s * 0.7 - Math.cos(p) * s * 0.7, y: -Math.sin(a) * s * 0.7 - Math.sin(p) * s * 0.7 },
                { x: -Math.cos(a) * s * 0.7 + Math.cos(p) * s * 0.7, y: -Math.sin(a) * s * 0.7 + Math.sin(p) * s * 0.7 },
            ];
            this._celPoly(g, bPts, col, OL + 1);
            // Front plow
            const plowPts = [
                { x: Math.cos(a) * s * 1.15 + Math.cos(p) * s * 0.8, y: Math.sin(a) * s * 1.15 + Math.sin(p) * s * 0.8 },
                { x: Math.cos(a) * s * 1.15 - Math.cos(p) * s * 0.8, y: Math.sin(a) * s * 1.15 - Math.sin(p) * s * 0.8 },
                { x: Math.cos(a) * s * 0.9 - Math.cos(p) * s * 0.65, y: Math.sin(a) * s * 0.9 - Math.sin(p) * s * 0.65 },
                { x: Math.cos(a) * s * 0.9 + Math.cos(p) * s * 0.65, y: Math.sin(a) * s * 0.9 + Math.sin(p) * s * 0.65 },
            ];
            this._celPoly(g, plowPts, dk, OL);
            // Bolts
            for (const sd of [-1, 1]) {
                this._celCircle(g, Math.cos(a) * s * 0.3 + Math.cos(p) * s * 0.5 * sd, Math.sin(a) * s * 0.3 + Math.sin(p) * s * 0.5 * sd, 4, 0x888888, 2);
                this._celCircle(g, -Math.cos(a) * s * 0.4 + Math.cos(p) * s * 0.5 * sd, -Math.sin(a) * s * 0.4 + Math.sin(p) * s * 0.5 * sd, 4, 0x888888, 2);
            }
            // Smoke stacks
            for (const sd of [-0.5, 0.5]) {
                const sx = -Math.cos(a) * s * 0.5 + Math.cos(p) * s * sd;
                const sy = -Math.sin(a) * s * 0.5 + Math.sin(p) * s * sd;
                this._celCircle(g, sx, sy, 6, 0x444444, 3);
                if (moving && Math.random() < 0.5) {
                    g.fillStyle(0x777777, 0.25);
                    g.fillCircle(sx - Math.cos(a) * 10, sy - Math.sin(a) * 10, 5 + Math.random() * 4);
                }
            }
            // Angry slit eyes
            for (const sd of [-1, 1]) {
                const ex = Math.cos(a) * s * 0.55 + Math.cos(p) * s * 0.25 * sd;
                const ey = Math.sin(a) * s * 0.55 + Math.sin(p) * s * 0.25 * sd;
                g.fillStyle(0x000000, 0.8);
                g.fillRect(ex - 7, ey - 3, 14, 6);
                g.fillStyle(eyeCol, 0.9);
                g.fillRect(ex - 5, ey - 2, 10, 4);
                g.fillStyle(COLORS.WHITE, 0.6);
                g.fillCircle(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, 1.5);
            }

        } else if (this.chassisKey === 'titan') {
            // ── TITAN: Giant mech walker ──
            // Legs
            for (const sd of [-1, 1]) {
                for (const fb of [-1, 1]) {
                    const bx = Math.cos(a) * s * 0.3 * fb + Math.cos(p) * s * 0.5 * sd;
                    const by = Math.sin(a) * s * 0.3 * fb + Math.sin(p) * s * 0.5 * sd;
                    const fx = bx + Math.cos(p) * s * 0.5 * sd + Math.cos(a) * Math.sin(t * 0.003 + fb + sd) * 6;
                    const fy = by + Math.sin(p) * s * 0.5 * sd + Math.sin(a) * Math.sin(t * 0.003 + fb + sd) * 6;
                    // Leg shadow
                    g.lineStyle(8, 0x000000, 0.4);
                    g.lineBetween(bx + 2, by + 2, fx + 2, fy + 2);
                    // Leg
                    g.lineStyle(6, 0x444444, 1);
                    g.lineBetween(bx, by, fx, fy);
                    // Outline
                    g.lineStyle(2, 0x000000, 0.8);
                    g.lineBetween(bx, by, fx, fy);
                    // Joints
                    this._celCircle(g, fx, fy, 7, 0x555555, 3);
                    this._celCircle(g, bx, by, 5, 0x555555, 2);
                }
            }
            // Torso
            const torso = [];
            for (let i = 0; i < 8; i++) {
                const ba = a + (Math.PI / 4) * i;
                torso.push({ x: Math.cos(ba) * s * 0.85, y: Math.sin(ba) * s * 0.85 });
            }
            this._celPoly(g, torso, col, OL + 1);
            // Shoulder pods
            for (const sd of [-1, 1]) {
                const sx = Math.cos(p) * s * 0.75 * sd;
                const sy = Math.sin(p) * s * 0.75 * sd;
                this._celCircle(g, sx, sy, s * 0.22, dk, OL);
                g.fillStyle(weapon.color, 0.5);
                g.fillCircle(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5, 5);
                g.lineStyle(2, 0x000000, 0.5);
                g.strokeCircle(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5, 5);
            }
            // Cockpit
            this._celCircle(g, 0, 0, s * 0.3, dk, 3);
            g.fillStyle(eyeCol, 0.2);
            g.fillCircle(0, 0, s * 0.22);
            // Big eye
            this._celCircle(g, Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, 9, eyeCol, 3);
            g.fillStyle(COLORS.WHITE, 0.7);
            g.fillCircle(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25, 3);
            // Vent grille
            g.lineStyle(3, 0x000000, 0.5);
            for (let i = -2; i <= 2; i++) {
                const vx = -Math.cos(a) * s * 0.5 + Math.cos(p) * i * 7;
                const vy = -Math.sin(a) * s * 0.5 + Math.sin(p) * i * 7;
                g.lineBetween(vx, vy, vx - Math.cos(a) * 12, vy - Math.sin(a) * 12);
            }

        } else {
            // ── MEDIUM: Boxy tank (default) ──
            // Treads
            for (const sd of [-1, 1]) {
                const tx = Math.cos(p) * s * 0.7 * sd;
                const ty = Math.sin(p) * s * 0.7 * sd;
                const tW = s * 0.2, tL = s * 0.85;
                const tPts = [
                    { x: tx + Math.cos(a) * tL + Math.cos(p) * tW * sd, y: ty + Math.sin(a) * tL + Math.sin(p) * tW * sd },
                    { x: tx + Math.cos(a) * tL - Math.cos(p) * tW * sd, y: ty + Math.sin(a) * tL - Math.sin(p) * tW * sd },
                    { x: tx - Math.cos(a) * tL - Math.cos(p) * tW * sd, y: ty - Math.sin(a) * tL - Math.sin(p) * tW * sd },
                    { x: tx - Math.cos(a) * tL + Math.cos(p) * tW * sd, y: ty - Math.sin(a) * tL + Math.sin(p) * tW * sd },
                ];
                this._celPoly(g, tPts, 0x1a1a1a, 3);
            }
            // Body
            const bPts = [
                { x: Math.cos(a) * s * 0.85 + Math.cos(p) * s * 0.55, y: Math.sin(a) * s * 0.85 + Math.sin(p) * s * 0.55 },
                { x: Math.cos(a) * s * 0.85 - Math.cos(p) * s * 0.55, y: Math.sin(a) * s * 0.85 - Math.sin(p) * s * 0.55 },
                { x: -Math.cos(a) * s * 0.65 - Math.cos(p) * s * 0.55, y: -Math.sin(a) * s * 0.65 - Math.sin(p) * s * 0.55 },
                { x: -Math.cos(a) * s * 0.65 + Math.cos(p) * s * 0.55, y: -Math.sin(a) * s * 0.65 + Math.sin(p) * s * 0.55 },
            ];
            this._celPoly(g, bPts, col, OL);
            // Turret
            this._celCircle(g, Math.cos(a) * s * 0.1, Math.sin(a) * s * 0.1, s * 0.3, dk, OL);
            // Turret barrel
            g.fillStyle(0x333333, 1);
            const bx1 = Math.cos(a) * s * 0.1, by1 = Math.sin(a) * s * 0.1;
            const bx2 = Math.cos(a) * s * 0.7, by2 = Math.sin(a) * s * 0.7;
            g.lineStyle(6, 0x333333, 1);
            g.lineBetween(bx1, by1, bx2, by2);
            g.lineStyle(2, 0x000000, 0.7);
            g.lineBetween(bx1, by1, bx2, by2);
            // Antenna
            g.lineStyle(2, 0x888888, 0.7);
            const antX = -Math.cos(a) * s * 0.4 + Math.cos(p) * s * 0.3;
            const antY = -Math.sin(a) * s * 0.4 + Math.sin(p) * s * 0.3;
            g.lineBetween(antX, antY, antX - Math.cos(a) * 14, antY - Math.sin(a) * 14);
            g.lineStyle(3, 0x000000, 0.4);
            g.lineBetween(antX, antY, antX - Math.cos(a) * 14, antY - Math.sin(a) * 14);
            this._celCircle(g, antX - Math.cos(a) * 14, antY - Math.sin(a) * 14, 3, COLORS.RED, 2);
            // Eyes
            for (const sd of [-1, 1]) {
                const ex = Math.cos(a) * s * 0.55 + Math.cos(p) * s * 0.2 * sd;
                const ey = Math.sin(a) * s * 0.55 + Math.sin(p) * s * 0.2 * sd;
                this._celCircle(g, ex, ey, 5, eyeCol, 3);
            }
        }

        // ── Engine glow (all types) ──
        if (moving) {
            const rx = -Math.cos(a) * s * 0.7, ry = -Math.sin(a) * s * 0.7;
            g.fillStyle(COLORS.ORANGE, 0.3 + Math.random() * 0.15);
            g.fillCircle(rx, ry, 6 + Math.random() * 3);
            g.fillStyle(COLORS.YELLOW, 0.25);
            g.fillCircle(rx, ry, 3);
        }

        // ── Damage sparks ──
        if (lowHp && Math.random() < 0.45) {
            g.fillStyle(COLORS.YELLOW, 0.9);
            g.fillCircle((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 2 + Math.random());
            g.fillStyle(COLORS.ORANGE, 0.5);
            g.fillCircle((Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s * 0.5, 3.5);
        }

        // ── Dodge ghost ──
        if (this.dodging) {
            g.fillStyle(COLORS.WHITE, 0.2);
            g.fillCircle(-this.dodgeDir.x * 18, -this.dodgeDir.y * 18, s * 0.65);
        }

        // ── Block stance ──
        if (this.blocking) {
            const pulse = Math.sin(t * 0.008) * 0.08;
            g.fillStyle(COLORS.BLUE, 0.12 + pulse);
            g.fillCircle(0, 0, s + 10);
            g.lineStyle(3, COLORS.CYAN, 0.5 + pulse);
            g.strokeCircle(0, 0, s + 10);
            g.lineStyle(2, 0x000000, 0.3);
            g.strokeCircle(0, 0, s + 12);
        }

        // ── Weapon ──
        const atkLerp = this.attackAnim;
        const wOffset = s + (atkLerp > 0 ? 12 + atkLerp * 10 : 4);
        const wx = Math.cos(a) * wOffset;
        const wy = Math.sin(a) * wOffset;

        // Sprite-based weapon rendering
        if (this.weaponSprite) {
            this.weaponSprite.setPosition(wx, wy);
            // Sprites face RIGHT by default, so rotation = bot angle (0 = right)
            this.weaponSprite.setRotation(a);
            this.weaponSprite.setVisible(true);
            // Show correct frame: 0=idle, 2=active during attack
            this.weaponSprite.setFrame(atkLerp > 0.3 ? 2 : 0);
            // Update texture if weapon was swapped
            const texKey = `weapon_${this.weaponKey}`;
            if (this.scene.textures.exists(texKey) && this.weaponSprite.texture.key !== texKey) {
                this.weaponSprite.setTexture(texKey, 0);
            }
        } else {
        // Arm shadow
        g.lineStyle(7, 0x000000, 0.35);
        g.lineBetween(Math.cos(a) * s * 0.6 + 2, Math.sin(a) * s * 0.6 + 2, wx + 2, wy + 2);
        // Arm
        g.lineStyle(5, 0x666666, 1);
        g.lineBetween(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, wx, wy);
        g.lineStyle(2, 0x000000, 0.7);
        g.lineBetween(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, wx, wy);
        this._celCircle(g, Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, 6, 0x555555, 3);

        // ── Attack arc trail ──
        if (atkLerp > 0.1) {
            const arcR = wOffset + 14;
            g.lineStyle(5, weapon.color, atkLerp * 0.7);
            g.beginPath();
            g.arc(0, 0, arcR, a - 1.1 * atkLerp, a + 1.1 * atkLerp, false);
            g.strokePath();
            g.lineStyle(3, COLORS.WHITE, atkLerp * 0.35);
            g.beginPath();
            g.arc(0, 0, arcR - 5, a - 0.8 * atkLerp, a + 0.8 * atkLerp, false);
            g.strokePath();
            // Outline on arc
            g.lineStyle(1, 0x000000, atkLerp * 0.3);
            g.beginPath();
            g.arc(0, 0, arcR + 2, a - 1.1 * atkLerp, a + 1.1 * atkLerp, false);
            g.strokePath();
        }

        this._drawWeapon(wx, wy, weapon);
        } // end else (no weaponSprite)

        // ── Health Bar ──
        this._drawHealthBar();

        // ── Weapon Cooldown Ring ──
        if (this.lastAttackTime) {
            const wpn = WEAPONS[this.weaponKey];
            const cd = wpn ? wpn.cooldown : 500;
            const elapsed = Date.now() - this.lastAttackTime;
            const cdRatio = Math.min(1, elapsed / cd);
            if (cdRatio < 1) {
                g.lineStyle(2, weapon.color, 0.3);
                g.beginPath();
                g.arc(0, 0, s + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cdRatio, false);
                g.strokePath();
            }
        }

        // ── Speed Burst Aura ──
        if (this.speedBurst) {
            const pulse = Math.sin(Date.now() * 0.01) * 0.1;
            g.lineStyle(2, COLORS.YELLOW, 0.3 + pulse);
            g.strokeCircle(0, 0, s + 8);
        }

        // ── I-Frame Flash ──
        if (this.iFrames) {
            g.fillStyle(COLORS.WHITE, 0.1 + Math.sin(Date.now() * 0.03) * 0.1);
            g.fillCircle(0, 0, s * 0.8);
        }

        // ── Shield (cel outline) ──
        this.shieldGfx.clear();
        if (this.shieldHp > 0) {
            const sa = 0.2 + (this.shieldHp / this.shieldMaxHp) * 0.3 + Math.sin(t * 0.005) * 0.05;
            this.shieldGfx.fillStyle(COLORS.BLUE, sa * 0.12);
            this.shieldGfx.fillCircle(0, 0, s + 16);
            this.shieldGfx.lineStyle(4, COLORS.CYAN, sa);
            this.shieldGfx.strokeCircle(0, 0, s + 16);
            this.shieldGfx.lineStyle(2, 0x000000, sa * 0.4);
            this.shieldGfx.strokeCircle(0, 0, s + 18);
        }

        // ── Stun Stars ──
        this.stunGfx.clear();
        if (this.stunned) {
            for (let i = 0; i < 3; i++) {
                const sa = t * 0.005 + (Math.PI * 2 / 3) * i;
                const sx = Math.cos(sa) * (s + 10);
                const sy = Math.sin(sa) * (s + 10) - s * 0.3;
                this.stunGfx.fillStyle(COLORS.YELLOW, 0.9);
                const starPts = [];
                for (let j = 0; j < 10; j++) {
                    const sa2 = (Math.PI * 2 / 10) * j - Math.PI / 2;
                    const sr = j % 2 === 0 ? 8 : 3;
                    starPts.push({ x: sx + Math.cos(sa2) * sr, y: sy + Math.sin(sa2) * sr });
                }
                this.stunGfx.fillPoints(starPts, true);
                this.stunGfx.lineStyle(2, 0x000000, 0.6);
                this.stunGfx.strokePoints(starPts, true);
            }
        }
    }

    _drawWeapon(wx, wy, weapon) {
        // Only called as procedural fallback — sprite weapons handled in draw()
        const t = Date.now();
        const anim = this.attackAnim;
        const s = this.size;
        const a = this.angle;
        const perpA = a + Math.PI / 2;
        const g = this.gfx;

        switch (this.weaponKey) {
            case 'spinner': {
                // FULL-BODY ORBIT — 4 massive blades spinning around the entire bot
                const spin = t * 0.008;
                const orbitR = s + 12;
                g.lineStyle(4, weapon.color, 0.85);
                for (let i = 0; i < 4; i++) {
                    const ba = spin + (Math.PI / 2) * i;
                    const bx = Math.cos(ba) * orbitR;
                    const by = Math.sin(ba) * orbitR;
                    // Blade shape — elongated triangle
                    const bladeLen = 18;
                    const perpB = ba + Math.PI / 2;
                    g.fillStyle(weapon.color, 0.8);
                    const bp = [
                        { x: bx + Math.cos(ba) * bladeLen, y: by + Math.sin(ba) * bladeLen },
                        { x: bx + Math.cos(perpB) * 5, y: by + Math.sin(perpB) * 5 },
                        { x: bx - Math.cos(perpB) * 5, y: by - Math.sin(perpB) * 5 },
                    ];
                    g.fillPoints(bp, true);
                    // Edge highlight
                    g.lineStyle(1, COLORS.WHITE, 0.3);
                    g.lineBetween(bp[0].x, bp[0].y, bp[1].x, bp[1].y);
                }
                // Center hub
                g.fillStyle(COLORS.DARK_GRAY, 0.9);
                g.fillCircle(0, 0, 5);
                g.fillStyle(weapon.color, 0.4);
                g.fillCircle(0, 0, 3);
                break;
            }
            case 'hammer': {
                // Massive war hammer with thick handle and heavy head
                const swingAngle = anim > 0 ? anim * 1.2 : 0;
                const hAngle = a + swingAngle;
                // Handle
                g.lineStyle(5, 0x885533, 1);
                g.lineBetween(wx - Math.cos(hAngle) * 15, wy - Math.sin(hAngle) * 15,
                    wx + Math.cos(hAngle) * 10, wy + Math.sin(hAngle) * 10);
                // Hammer head — wide rectangle
                const hx = wx + Math.cos(hAngle) * 8;
                const hy = wy + Math.sin(hAngle) * 8;
                const hPerp = hAngle + Math.PI / 2;
                const headPts = [
                    { x: hx + Math.cos(hPerp) * 14, y: hy + Math.sin(hPerp) * 14 },
                    { x: hx - Math.cos(hPerp) * 14, y: hy - Math.sin(hPerp) * 14 },
                    { x: hx - Math.cos(hPerp) * 14 + Math.cos(hAngle) * 10, y: hy - Math.sin(hPerp) * 14 + Math.sin(hAngle) * 10 },
                    { x: hx + Math.cos(hPerp) * 14 + Math.cos(hAngle) * 10, y: hy + Math.sin(hPerp) * 14 + Math.sin(hAngle) * 10 },
                ];
                g.fillStyle(weapon.color, 1);
                g.fillPoints(headPts, true);
                g.lineStyle(2, 0x000000, 0.4);
                g.strokePoints(headPts, true);
                // Metal highlight
                g.fillStyle(COLORS.YELLOW, 0.15);
                g.fillRect(hx - 3, hy - 3, 6, 6);
                break;
            }
            case 'flipper': {
                // Wide wedge ramp visible under front of bot
                const fAngle = a + (anim > 0 ? -0.8 * anim : 0);
                const rampW = 28;
                const fPerp = fAngle + Math.PI / 2;
                g.fillStyle(weapon.color, 0.85);
                const fp = [
                    { x: wx + Math.cos(fAngle) * 22, y: wy + Math.sin(fAngle) * 22 },
                    { x: wx + Math.cos(fPerp) * rampW / 2 - Math.cos(fAngle) * 5, y: wy + Math.sin(fPerp) * rampW / 2 - Math.sin(fAngle) * 5 },
                    { x: wx - Math.cos(fPerp) * rampW / 2 - Math.cos(fAngle) * 5, y: wy - Math.sin(fPerp) * rampW / 2 - Math.sin(fAngle) * 5 },
                ];
                g.fillPoints(fp, true);
                g.lineStyle(2, 0x000000, 0.3);
                g.strokePoints(fp, true);
                // Hydraulic pistons
                g.lineStyle(2, COLORS.MID_GRAY, 0.6);
                g.lineBetween(wx - Math.cos(fAngle) * 5, wy - Math.sin(fAngle) * 5, fp[0].x, fp[0].y);
                break;
            }
            case 'saw': {
                // Large buzzing disc with visible teeth
                const spin = t * 0.02;
                const sawR = 18;
                // Glow
                g.fillStyle(weapon.color, 0.15);
                g.fillCircle(wx, wy, sawR + 5);
                // Main disc
                g.fillStyle(weapon.color, 0.9);
                g.fillCircle(wx, wy, sawR);
                // Teeth around edge
                g.lineStyle(3, COLORS.DARK_GRAY, 0.9);
                for (let i = 0; i < 12; i++) {
                    const ta = spin + (Math.PI * 2 / 12) * i;
                    g.lineBetween(
                        wx + Math.cos(ta) * (sawR - 4), wy + Math.sin(ta) * (sawR - 4),
                        wx + Math.cos(ta) * (sawR + 4), wy + Math.sin(ta) * (sawR + 4)
                    );
                }
                // Center
                g.fillStyle(COLORS.DARK_GRAY, 1);
                g.fillCircle(wx, wy, 5);
                // Sparks when attacking
                if (anim > 0) {
                    g.fillStyle(COLORS.YELLOW, 0.7);
                    for (let i = 0; i < 3; i++) {
                        const sa = Math.random() * Math.PI * 2;
                        g.fillCircle(wx + Math.cos(sa) * sawR, wy + Math.sin(sa) * sawR, 2);
                    }
                }
                break;
            }
            case 'drill': {
                // Long spiraling cone extending forward
                const drillLen = 28;
                const spin = t * 0.012;
                for (let d = drillLen; d > 0; d -= 3) {
                    const ratio = d / drillLen;
                    const dx = wx + Math.cos(a) * (drillLen - d);
                    const dy = wy + Math.sin(a) * (drillLen - d);
                    const r = 8 * ratio;
                    const spiralA = spin + d * 0.3;
                    g.fillStyle(spiralA % 2 < 1 ? weapon.color : COLORS.LIGHT_GRAY, 0.85);
                    g.fillCircle(dx, dy, r);
                }
                // Tip glow
                g.fillStyle(COLORS.WHITE, 0.5);
                g.fillCircle(wx + Math.cos(a) * drillLen, wy + Math.sin(a) * drillLen, 2);
                break;
            }
            case 'axe': {
                // Massive axe with visible swing arc
                const swingA = anim > 0 ? anim * 1.5 : 0;
                const axeA = a + swingA;
                // Long handle
                g.lineStyle(4, 0x885533, 1);
                g.lineBetween(wx - Math.cos(axeA) * 18, wy - Math.sin(axeA) * 18,
                    wx + Math.cos(axeA) * 8, wy + Math.sin(axeA) * 8);
                // Axe head — large crescent
                const axPerp = axeA + Math.PI / 2;
                const headCx = wx + Math.cos(axeA) * 6;
                const headCy = wy + Math.sin(axeA) * 6;
                const axePts = [
                    { x: headCx + Math.cos(axPerp) * 16, y: headCy + Math.sin(axPerp) * 16 },
                    { x: headCx + Math.cos(axeA) * 18, y: headCy + Math.sin(axeA) * 18 },
                    { x: headCx - Math.cos(axPerp) * 16, y: headCy - Math.sin(axPerp) * 16 },
                    { x: headCx - Math.cos(axeA) * 4, y: headCy - Math.sin(axeA) * 4 },
                ];
                g.fillStyle(weapon.color, 1);
                g.fillPoints(axePts, true);
                g.lineStyle(1, 0x000000, 0.4);
                g.strokePoints(axePts, true);
                // Edge gleam
                g.lineStyle(1, COLORS.WHITE, 0.3);
                g.lineBetween(axePts[0].x, axePts[0].y, axePts[1].x, axePts[1].y);
                break;
            }
            case 'mace': {
                // Swinging spiked ball on chain
                const swingPhase = t * 0.004 + (anim > 0 ? anim * 3 : 0);
                const chainLen = 25;
                const ballX = wx + Math.cos(a + Math.sin(swingPhase) * 0.5) * chainLen;
                const ballY = wy + Math.sin(a + Math.sin(swingPhase) * 0.5) * chainLen;
                // Chain links
                g.lineStyle(2, 0x888888, 0.8);
                for (let c = 0; c < 5; c++) {
                    const ratio = c / 5;
                    const cx2 = wx + (ballX - wx) * ratio;
                    const cy2 = wy + (ballY - wy) * ratio;
                    g.fillStyle(0x666666, 0.7);
                    g.fillCircle(cx2, cy2, 2);
                }
                g.lineBetween(wx, wy, ballX, ballY);
                // Spiked ball
                g.fillStyle(weapon.color, 1);
                g.fillCircle(ballX, ballY, 12);
                // Spikes
                for (let i = 0; i < 8; i++) {
                    const sa = (Math.PI * 2 / 8) * i + t * 0.002;
                    g.fillStyle(COLORS.LIGHT_GRAY, 0.9);
                    const sp = [
                        { x: ballX + Math.cos(sa) * 12, y: ballY + Math.sin(sa) * 12 },
                        { x: ballX + Math.cos(sa) * 18, y: ballY + Math.sin(sa) * 18 },
                        { x: ballX + Math.cos(sa + 0.2) * 11, y: ballY + Math.sin(sa + 0.2) * 11 },
                    ];
                    g.fillPoints(sp, true);
                }
                break;
            }
            case 'flamethrower': {
                // Wide barrel with pilot flame
                g.fillStyle(COLORS.DARK_GRAY, 1);
                const fPerp = perpA;
                const barrelPts = [
                    { x: wx - Math.cos(a) * 8 + Math.cos(fPerp) * 6, y: wy - Math.sin(a) * 8 + Math.sin(fPerp) * 6 },
                    { x: wx - Math.cos(a) * 8 - Math.cos(fPerp) * 6, y: wy - Math.sin(a) * 8 - Math.sin(fPerp) * 6 },
                    { x: wx + Math.cos(a) * 18 - Math.cos(fPerp) * 4, y: wy + Math.sin(a) * 18 - Math.sin(fPerp) * 4 },
                    { x: wx + Math.cos(a) * 18 + Math.cos(fPerp) * 4, y: wy + Math.sin(a) * 18 + Math.sin(fPerp) * 4 },
                ];
                g.fillPoints(barrelPts, true);
                g.lineStyle(1, 0x333333, 0.5);
                g.strokePoints(barrelPts, true);
                // Pilot flame
                const flameX = wx + Math.cos(a) * 20;
                const flameY = wy + Math.sin(a) * 20;
                g.fillStyle(COLORS.ORANGE, 0.6 + Math.random() * 0.2);
                g.fillCircle(flameX, flameY, 4 + Math.random() * 2);
                g.fillStyle(COLORS.YELLOW, 0.5);
                g.fillCircle(flameX, flameY, 2);
                break;
            }
            case 'plasma': {
                // Pulsing energy orb with arcs
                const pulse = Math.sin(t * 0.006) * 3;
                g.fillStyle(weapon.color, 0.2);
                g.fillCircle(wx, wy, 18 + pulse);
                g.fillStyle(weapon.color, 0.5);
                g.fillCircle(wx, wy, 12 + pulse * 0.5);
                g.fillStyle(COLORS.WHITE, 0.4);
                g.fillCircle(wx, wy, 5);
                // Electric arcs
                g.lineStyle(1, weapon.color, 0.5);
                for (let i = 0; i < 4; i++) {
                    const arcA = t * 0.005 + (Math.PI / 2) * i;
                    const arcR = 15 + pulse;
                    g.lineBetween(wx, wy, wx + Math.cos(arcA) * arcR, wy + Math.sin(arcA) * arcR);
                }
                break;
            }
            case 'railgun': {
                // Long barrel with glowing core
                const barrelLen = 32;
                g.fillStyle(COLORS.DARK_GRAY, 1);
                const rPerp = perpA;
                const rPts = [
                    { x: wx - Math.cos(a) * 5 + Math.cos(rPerp) * 5, y: wy - Math.sin(a) * 5 + Math.sin(rPerp) * 5 },
                    { x: wx - Math.cos(a) * 5 - Math.cos(rPerp) * 5, y: wy - Math.sin(a) * 5 - Math.sin(rPerp) * 5 },
                    { x: wx + Math.cos(a) * barrelLen - Math.cos(rPerp) * 3, y: wy + Math.sin(a) * barrelLen - Math.sin(rPerp) * 3 },
                    { x: wx + Math.cos(a) * barrelLen + Math.cos(rPerp) * 3, y: wy + Math.sin(a) * barrelLen + Math.sin(rPerp) * 3 },
                ];
                g.fillPoints(rPts, true);
                // Glowing core line
                g.lineStyle(2, weapon.color, 0.7);
                g.lineBetween(wx, wy, wx + Math.cos(a) * barrelLen, wy + Math.sin(a) * barrelLen);
                // Charge glow at tip
                if (this.charging) {
                    const cp = Math.min(1, (Date.now() - this.chargeStart) / 800);
                    g.fillStyle(COLORS.YELLOW, cp * 0.8);
                    g.fillCircle(wx + Math.cos(a) * barrelLen, wy + Math.sin(a) * barrelLen, 6 * cp);
                }
                break;
            }
            case 'tesla': {
                // Crackling coil with long arcs
                g.fillStyle(weapon.color, 0.6);
                g.fillCircle(wx, wy, 10);
                g.lineStyle(2, COLORS.WHITE, 0.5);
                g.strokeCircle(wx, wy, 12);
                // Long crackling arcs
                g.lineStyle(2, COLORS.CYAN, 0.7);
                for (let i = 0; i < 5; i++) {
                    const boltA = t * 0.008 + (Math.PI * 2 / 5) * i;
                    let bx = wx, by = wy;
                    for (let seg = 0; seg < 3; seg++) {
                        const nx = bx + Math.cos(boltA + (Math.random() - 0.5)) * 10;
                        const ny = by + Math.sin(boltA + (Math.random() - 0.5)) * 10;
                        g.lineBetween(bx, by, nx, ny);
                        bx = nx; by = ny;
                    }
                }
                break;
            }
            case 'acid': {
                // Barrel with dripping nozzle
                g.fillStyle(COLORS.DARK_GRAY, 1);
                g.fillRect(wx - 6, wy - 5, 20, 10);
                g.lineStyle(1, 0x333333, 0.5);
                g.strokeRect(wx - 6, wy - 5, 20, 10);
                g.fillStyle(weapon.color, 0.8);
                g.fillCircle(wx + 16, wy, 5);
                // Drip
                g.fillStyle(weapon.color, 0.5);
                g.fillCircle(wx + 16, wy + 6 + Math.sin(t * 0.003) * 3, 2);
                break;
            }
            case 'missile': {
                // Launcher pod with missile tips
                const mPerp = perpA;
                g.fillStyle(COLORS.DARK_GRAY, 1);
                g.fillRect(wx - 8, wy - 8, 16, 16);
                g.lineStyle(1, 0x444444, 0.5);
                g.strokeRect(wx - 8, wy - 8, 16, 16);
                // Missile tips in pod
                for (const off of [-4, 4]) {
                    const mx = wx + Math.cos(a) * 10;
                    const my = wy + Math.sin(mPerp) * off;
                    g.fillStyle(COLORS.RED, 0.9);
                    g.fillCircle(mx, my, 3);
                    g.fillStyle(COLORS.DARK_GRAY, 0.8);
                    g.fillRect(mx - 6, my - 2, 6, 4);
                }
                break;
            }
            case 'nuke': {
                // Glowing hazard sphere with radiation rings
                const pulse = Math.sin(t * 0.004) * 2;
                g.fillStyle(weapon.color, 0.15);
                g.fillCircle(wx, wy, 18 + pulse);
                g.fillStyle(weapon.color, 0.5);
                g.fillCircle(wx, wy, 12);
                g.fillStyle(COLORS.YELLOW, 0.6);
                g.fillCircle(wx, wy, 6);
                // Radiation symbol
                g.lineStyle(2, COLORS.YELLOW, 0.5);
                for (let i = 0; i < 3; i++) {
                    const ra = (Math.PI * 2 / 3) * i + t * 0.001;
                    g.beginPath();
                    g.arc(wx, wy, 14, ra - 0.3, ra + 0.3, false);
                    g.strokePath();
                }
                break;
            }
            case 'mines': {
                // Mine dispenser rack
                g.fillStyle(COLORS.DARK_GRAY, 0.9);
                g.fillRect(wx - 10, wy - 8, 20, 16);
                for (let i = -1; i <= 1; i++) {
                    g.fillStyle(COLORS.RED, 0.7);
                    g.fillCircle(wx + i * 7, wy, 5);
                    g.fillStyle(COLORS.DARK_GRAY, 0.5);
                    g.fillCircle(wx + i * 7, wy, 2);
                }
                break;
            }
            case 'emp': {
                // Pulsing EMP orb
                const pulse = Math.sin(t * 0.005) * 3;
                g.fillStyle(COLORS.BLUE, 0.4);
                g.fillCircle(wx, wy, 14 + pulse);
                g.lineStyle(2, COLORS.CYAN, 0.6);
                g.strokeCircle(wx, wy, 10 + pulse);
                g.fillStyle(COLORS.WHITE, 0.4);
                g.fillCircle(wx, wy, 4);
                break;
            }
            case 'shield': {
                // Shield projector
                g.lineStyle(3, COLORS.BLUE, 0.7);
                g.strokeCircle(wx, wy, 14);
                g.fillStyle(COLORS.CYAN, 0.2);
                g.fillCircle(wx, wy, 14);
                g.fillStyle(COLORS.WHITE, 0.4);
                g.fillCircle(wx, wy, 4);
                break;
            }
            case 'repair': {
                // Repair drone arm with cross
                g.fillStyle(COLORS.GREEN, 0.8);
                g.fillRect(wx - 3, wy - 10, 6, 20);
                g.fillRect(wx - 10, wy - 3, 20, 6);
                g.fillStyle(COLORS.WHITE, 0.3);
                g.fillCircle(wx, wy, 3);
                break;
            }
            default: {
                g.fillStyle(weapon.color, 0.8);
                g.fillCircle(wx, wy, 10);
            }
        }
    }

    _drawHealthBar() {
        const barWidth = this.hpBarInnerWidth;
        const hpRatio = Math.max(0, this.hp / this.maxHp);
        const hpColor = hpRatio <= 0.3 ? COLORS.RED : COLORS.GREEN;

        this.hpBarFill.setFillStyle(hpColor, 0.96);
        this.hpBarFill.setScale(hpRatio, 1);
        this.hpBarFill.x = -barWidth / 2;

        // Shield overlay
        if (this.shieldHp > 0) {
            const shieldRatio = this.shieldHp / this.shieldMaxHp;
            this.hpBarShield.setScale(shieldRatio, 1);
            this.hpBarShield.x = -barWidth / 2;
            this.hpBarShield.setVisible(true);
        } else {
            this.hpBarShield.setVisible(false);
        }
    }

    _drawHealthBarFrame(barY) {
        const w = this.hpBarInnerWidth + 14;
        const h = 11;
        const x = -w / 2;
        const y = barY - h / 2;
        this.hpBarFrame.clear();
        this.hpBarFrame.lineStyle(2, 0x4d5d70, 0.96);
        this.hpBarFrame.strokeRect(x, y, w, h);
        this.hpBarFrame.lineStyle(1, 0x06090f, 1);
        this.hpBarFrame.strokeRect(x + 2, y + 2, w - 4, h - 4);
        this.hpBarFrame.lineStyle(1, 0xffa34c, 0.55);
        this.hpBarFrame.lineBetween(x + 6, y + h - 3, x + w - 6, y + h - 3);
    }

    _lighten(color, amount) {
        const r = Math.min(255, ((color >> 16) & 0xff) + amount);
        const g = Math.min(255, ((color >> 8) & 0xff) + amount);
        const b = Math.min(255, (color & 0xff) + amount);
        return (r << 16) | (g << 8) | b;
    }

    _darken(color, amount) {
        const r = Math.max(0, ((color >> 16) & 0xff) - amount);
        const g = Math.max(0, ((color >> 8) & 0xff) - amount);
        const b = Math.max(0, (color & 0xff) - amount);
        return (r << 16) | (g << 8) | b;
    }

    // ── Cel-shading helpers ──
    // Light direction: top-left (-0.7, -0.7)
    _celCircle(g, x, y, r, baseColor, outlineW = 4) {
        const dk = this._darken(baseColor, 70);
        const lt = this._lighten(baseColor, 60);
        // Shadow half (offset bottom-right)
        g.fillStyle(dk, 1);
        g.fillCircle(x + 2, y + 2, r);
        // Base fill
        g.fillStyle(baseColor, 1);
        g.fillCircle(x, y, r);
        // Highlight crescent (top-left)
        g.fillStyle(lt, 0.45);
        g.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.7);
        // Thick outline
        g.lineStyle(outlineW, 0x000000, 0.85);
        g.strokeCircle(x, y, r);
        // Specular dot
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.18);
    }

    _celPoly(g, pts, baseColor, outlineW = 4) {
        const dk = this._darken(baseColor, 70);
        const lt = this._lighten(baseColor, 60);
        // Shadow (offset)
        const shadowPts = pts.map(p => ({ x: p.x + 3, y: p.y + 3 }));
        g.fillStyle(dk, 0.8);
        g.fillPoints(shadowPts, true);
        // Base
        g.fillStyle(baseColor, 1);
        g.fillPoints(pts, true);
        // Outline
        g.lineStyle(outlineW, 0x000000, 0.85);
        g.strokePoints(pts, true);
    }

    _celRect(g, x, y, w, h, baseColor, outlineW = 4) {
        const dk = this._darken(baseColor, 70);
        const lt = this._lighten(baseColor, 60);
        // Shadow
        g.fillStyle(dk, 0.8);
        g.fillRect(x + 3, y + 3, w, h);
        // Base
        g.fillStyle(baseColor, 1);
        g.fillRect(x, y, w, h);
        // Highlight band (top edge)
        g.fillStyle(lt, 0.35);
        g.fillRect(x, y, w, h * 0.3);
        // Outline
        g.lineStyle(outlineW, 0x000000, 0.85);
        g.strokeRect(x, y, w, h);
    }

    // ── Update ──
    update(delta) {
        const dt = delta / 1000;
        const now = Date.now();

        // Status effect timers
        if (this.stunned && now >= this.stunEnd) this.stunned = false;
        if (this.disabled && now >= this.disableEnd) this.disabled = false;
        if (this.attackDisabled && now >= this.attackDisableEnd) this.attackDisabled = false;

        // Energy regen — faster when not attacking (rewarding patience)
        const recentAttack = this.lastAttackTime && (now - this.lastAttackTime < 1000);
        const regenRate = recentAttack ? this.energyRegen * 0.5 : this.energyRegen * 1.5;
        this.energy = Math.min(this.maxEnergy, this.energy + regenRate * dt);

        // Dodge processing
        if (this.dodging && now >= this.dodgeEnd) {
            this.dodging = false;
        }

        // I-frames processing
        if (this.iFrames && now >= this.iFrameEnd) {
            this.iFrames = false;
        }

        // Speed burst processing
        if (this.speedBurst && now >= this.speedBurstEnd) {
            this.speedBurst = false;
        }

        // DoT processing
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const dot = this.dots[i];
            dot.timer -= delta;
            dot.tickTimer -= delta;
            if (dot.tickTimer <= 0) {
                this.hp -= dot.damage;
                dot.tickTimer = 500;
                if (this.scene.particles) this.scene.particles.fire(this.x, this.y, Math.random() * Math.PI * 2, 20);
            }
            if (dot.timer <= 0) this.dots.splice(i, 1);
        }

        // Slow processing
        for (let i = this.slows.length - 1; i >= 0; i--) {
            this.slows[i].timer -= delta;
            if (this.slows[i].timer <= 0) this.slows.splice(i, 1);
        }

        // Shield expiry
        if (this.shieldHp > 0 && now >= this.shieldExpire) {
            this.shieldHp = 0;
        }

        // Healing
        if (this.healingActive && this.healRemaining > 0 && now < this.healEnd) {
            const healRate = this.healRemaining / ((this.healEnd - now) / 1000);
            const healThisFrame = healRate * dt;
            this.hp = Math.min(this.maxHp, this.hp + healThisFrame);
            this.healRemaining -= healThisFrame;
            if (Math.random() < 0.1 && this.scene.particles) this.scene.particles.heal(this.x, this.y);
        } else {
            this.healingActive = false;
        }

        // Can't move while stunned or disabled
        if (this.stunned || this.disabled) {
            this.moveDir.x = 0;
            this.moveDir.y = 0;
        }

        // Movement — smooth acceleration
        let speedMult = 1;
        for (const slow of this.slows) {
            speedMult *= (1 - slow.percent);
        }
        if (this.speedBurst) speedMult *= 1.5;

        if (this.dodging) {
            this.x += this.dodgeDir.x * 500 * dt;
            this.y += this.dodgeDir.y * 500 * dt;
        } else {
            const targetSpeed = this.speed * speedMult;
            const accel = this.iceSlip ? 3 : 12; // ice = slippery, low accel
            const targetVx = this.moveDir.x * targetSpeed;
            const targetVy = this.moveDir.y * targetSpeed;
            // Lerp toward target velocity
            this.velX += (targetVx - this.velX) * Math.min(1, accel * dt);
            this.velY += (targetVy - this.velY) * Math.min(1, accel * dt);
            this.x += (this.velX + this.knockbackVx) * dt;
            this.y += (this.velY + this.knockbackVy) * dt;
        }

        // Knockback decay
        this.knockbackVx *= 0.88;
        this.knockbackVy *= 0.88;
        if (Math.abs(this.knockbackVx) < 1) this.knockbackVx = 0;
        if (Math.abs(this.knockbackVy) < 1) this.knockbackVy = 0;

        // Attack animation decay
        if (this.attackAnim > 0) {
            this.attackAnim -= dt * 4;
            if (this.attackAnim < 0) this.attackAnim = 0;
        }

        // Update container position
        this.container.setPosition(this.x, this.y);

        // Redraw
        this.draw();

        // Sprite layer update
        if (this.spriteRenderer) this.spriteRenderer.update(delta);
    }

    // ── Damage ──
    takeDamage(amount, source) {
        if (amount <= 0) return;
        if (this.dodging) return; // i-frames during dodge
        if (this.iFrames) return;  // post-hit invincibility

        // Block reduces damage 70%
        if (this.blocking) {
            amount *= 0.3;
            if (this.scene.particles) this.scene.particles.sparks(this.x, this.y, COLORS.WHITE, 4);
        }

        // Backstab: if attacker is behind us, 1.5x damage
        if (source && source.x !== undefined) {
            const angleFromAttacker = Math.atan2(source.y - this.y, source.x - this.x);
            let behindDiff = Math.abs(angleFromAttacker - this.angle);
            if (behindDiff > Math.PI) behindDiff = Math.PI * 2 - behindDiff;
            if (behindDiff < Math.PI * 0.35) {
                // Attacker is behind us — backstab!
                amount *= 1.5;
            }
        }

        // Shield absorb
        if (this.shieldHp > 0) {
            const absorbed = Math.min(this.shieldHp, amount);
            this.shieldHp -= absorbed;
            amount -= absorbed;
            if (this.shieldHp <= 0) {
                if (this.scene.particles) this.scene.particles.shieldBreak(this.x, this.y);
                if (this.scene.audio) this.scene.audio.playShieldBreak();
            }
        }

        if (amount <= 0) return;
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;

        // Damage number
        this._showDamageNumber(amount);
        if (this.scene.audio?.playHit) {
            this.scene.audio.playHit(this.isPlayer);
        }

        // Post-hit invincibility frames (300ms) — prevents stunlock
        this.iFrames = true;
        this.iFrameEnd = Date.now() + 300;

        // Flash red (also indicates i-frames)
        try {
            this.scene.tweens.add({
                targets: this.gfx,
                alpha: 0.3,
                duration: 80,
                yoyo: true,
                repeat: 2,
            });
        } catch (e) { /* scene may be shutting down */ }
    }

    _showDamageNumber(amount) {
        const color = amount >= 30 ? '#ff3333' : amount >= 15 ? '#ffaa33' : '#ffffff';
        const size = amount >= 30 ? '18px' : amount >= 15 ? '14px' : '12px';
        const text = this.scene.add.text(
            this.x + (Math.random() - 0.5) * 20,
            this.y - this.size - 20,
            `-${Math.round(amount)}`,
            { fontSize: size, fontFamily: 'monospace', color, fontStyle: 'bold',
              stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5).setDepth(150);

        this.scene.tweens.add({
            targets: text, y: text.y - 40, alpha: 0,
            duration: 800, ease: 'Power2',
            onComplete: () => text.destroy(),
        });
    }

    // ── Status effects ──
    applyKnockback(angle, force) {
        this.knockbackVx += Math.cos(angle) * force;
        this.knockbackVy += Math.sin(angle) * force;
    }

    stun(duration) {
        this.stunned = true;
        this.stunEnd = Date.now() + duration;
    }

    disable(duration) {
        this.disabled = true;
        this.disableEnd = Date.now() + duration;
    }

    disableAttack(duration) {
        this.attackDisabled = true;
        this.attackDisableEnd = Date.now() + duration;
    }

    addDot(damage, duration) {
        this.dots.push({ damage, timer: duration, tickTimer: 0 });
    }

    addSlow(percent, duration) {
        this.slows.push({ percent, timer: duration });
    }

    // ── Dodge Roll ──
    startDodge(dirX, dirY) {
        const now = Date.now();
        if (this.dodging || now < this.dodgeCooldownEnd || this.energy < 25) return false;
        if (this.stunned || this.disabled) return false;

        const mag = Math.sqrt(dirX * dirX + dirY * dirY);
        if (mag < 0.1) {
            // Default to facing direction
            dirX = Math.cos(this.angle);
            dirY = Math.sin(this.angle);
        } else {
            dirX /= mag;
            dirY /= mag;
        }

        this.dodging = true;
        this.dodgeDir = { x: dirX, y: dirY };
        this.dodgeEnd = now + 200;  // 200ms of i-frames
        this.dodgeCooldownEnd = now + 800;
        this.energy -= 25;
        return true;
    }

    // ── Weapon Swap ──
    swapWeapon() {
        if (!this.secondaryWeaponKey) return;
        const temp = this.weaponKey;
        this.weaponKey = this.secondaryWeaponKey;
        this.secondaryWeaponKey = temp;
        if (this.spriteRenderer?.refreshWeapon) {
            this.spriteRenderer.refreshWeapon();
        }
    }

    grantSpeedBurst() {
        this.speedBurst = true;
        this.speedBurstEnd = Date.now() + 1500;
    }

    // ── Arena constraints ──
    constrainToArena(rect) {
        const halfSize = this.size;
        this.x = Math.max(rect.x + halfSize, Math.min(rect.x + rect.width - halfSize, this.x));
        this.y = Math.max(rect.y + halfSize, Math.min(rect.y + rect.height - halfSize, this.y));
    }

    get alive() { return this.hp > 0; }

    destroy() {
        if (this.spriteRenderer) this.spriteRenderer.destroy();
        this.container.destroy();
    }
}

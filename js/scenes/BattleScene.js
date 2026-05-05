import {
    COLORS, GAME_WIDTH, GAME_HEIGHT, ARENA_MARGIN, ARENAS, DIFFICULTY,
    WEAPONS, CHASSIS, SKINS, ONLINE_NAMES, ONLINE_FLAGS, AI_BOT_NAMES,
    ENERGY_CONFIG, TILE_SIZE, ARENA_LAYOUTS, ARENA_SHAPES,
} from '../constants.js';
import Bot from '../entities/Bot.js';
import Boss from '../entities/Boss.js';
import ParticleManager from '../systems/ParticleManager.js';
import WeaponSystem from '../systems/WeaponSystem.js';
import AIController from '../systems/AIController.js';
import { addButton, addHpBar, addIcon, addPanel, addRowPanel, addSectionPanel } from '../ui.js';

const HAZARD_VISUAL_SCALE = 2;
const FX_VISUAL_SCALE = 1;
const FX_COUNT_MULTIPLIER = 2;
const FX_ALPHA_MULTIPLIER = 1.5;
const AUX_VISUAL_SCALE = 1.5;

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.battleMode = data.mode || 'quick'; // quick, online, campaign, boss, multiplayer, survival
        this.arenaKey = data.arena || 'scrapyard';
        this.bossKey = data.boss || null;
        this.worldId = data.world || 1;
        this.levelId = data.level || 1;
        this.isMultiplayer = data.mode === 'multiplayer';
        this.isSurvival = data.mode === 'survival';
        this.isHost = data.isHost || false;
    }

    create() {
        this.prog = this.registry.get('progression');
        this.audio = this.registry.get('audio');
        this.disableCombatShake = true;
        if (this.audio) {
            this.audio.init();
            this.audio.resume();
            if (this.audio.setGameplaySfxEnabled) {
                this.audio.setGameplaySfxEnabled(true);
            }
        }
        if (this.disableCombatShake && this.cameras?.main?.shake) {
            this.cameras.main.shake = () => this.cameras.main;
        }

        const diffKey = this.registry.get('difficulty') || 'medium';
        this.diffSettings = DIFFICULTY[diffKey] || DIFFICULTY.medium;
        this.arenaData = ARENAS[this.arenaKey] || ARENAS.scrapyard;

        // ── Systems ──
        this.particles = new ParticleManager(this);
        this.weapons = new WeaponSystem(this);

        // ── Arena (tile-based, generated from shape) ──
        this.tileCols = Math.floor(GAME_WIDTH / TILE_SIZE);
        this.tileRows = Math.floor(GAME_HEIGHT / TILE_SIZE);
        this.tileOffX = (GAME_WIDTH - this.tileCols * TILE_SIZE) / 2;
        this.tileOffY = (GAME_HEIGHT - this.tileRows * TILE_SIZE) / 2;
        // Pixel-perfect walk mask must be loaded before generating the grid,
        // so _generateArenaGrid can sample it to decide each tile's floor/wall.
        this._loadWalkMask();
        this.tileGrid = this._generateArenaGrid();
        this.arenaRect = {
            x: this.tileOffX, y: this.tileOffY,
            width: this.tileCols * TILE_SIZE, height: this.tileRows * TILE_SIZE,
        };
        this._drawArena();
        if (this.audio) {
            this.audio.startArenaMusic(this.arenaKey);
        }

        // ── HUD ──
        this._createHUD();

        // ── Player Bot ──
        const playerChassis = CHASSIS[this.prog.chassis] || CHASSIS.medium;
        let skinColor;
        if (this.prog.skin === 'custom' && this.prog.customColor) {
            const [r, g, b] = this.prog.customColor;
            skinColor = (r << 16) | (g << 8) | b;
        } else {
            skinColor = (SKINS[this.prog.skin] || SKINS.steel).color;
        }

        // Find spawn positions from tile grid
        const spawns = this._findTileSpawns();
        const pSpawn = spawns.player[0] || { x: this.arenaRect.x + 100, y: GAME_HEIGHT / 2 };
        this.enemySpawns = spawns.enemy;
        const safePlayerSpawn = this._snapToWalkablePoint(
            pSpawn.x,
            pSpawn.y,
            playerChassis.size * 0.6,
            playerChassis.size * 0.6
        );

        this.player = new Bot(this, safePlayerSpawn.x, safePlayerSpawn.y, {
            name: this.prog.botName,
            isPlayer: true,
            weapon: this.prog.weapon,
            secondaryWeapon: this.prog.data.secondaryWeapon || null,
            skinColor,
            chassis: this.prog.chassis,
            hp: playerChassis.hp,
            speed: playerChassis.speed + (this.prog.getSpeedBonus ? this.prog.getSpeedBonus() : 0),
            size: playerChassis.size,
            armor: playerChassis.armor + (this.prog.getArmorBonus ? this.prog.getArmorBonus() : 0),
        });

        // Ice arena = slippery movement
        if (this.arenaKey === 'ice') this.player.iceSlip = true;

        // ── Enemy / Boss / Remote Player ──
        this.enemies = [];
        this.aiControllers = [];
        this.isBossFight = this.battleMode === 'boss' || this.bossKey != null;
        this.remoteBot = null;
        this.net = null;

        if (this.isMultiplayer) {
            this._setupMultiplayer();
        } else if (this.isBossFight && this.bossKey) {
            const bSpawn = this.enemySpawns[0] || { x: this.arenaRect.x + this.arenaRect.width - 100, y: GAME_HEIGHT / 2 };
            this.boss = new Boss(this, bSpawn.x, bSpawn.y, this.bossKey);
            const bossSpawn = this._snapToWalkablePoint(this.boss.x, this.boss.y, this.boss.size * 0.6, this.boss.size * 0.6);
            this.boss.x = bossSpawn.x;
            this.boss.y = bossSpawn.y;
            this.enemies.push(this.boss);
            this._showBossIntro();
        } else if (this.isSurvival) {
            this._startSurvivalWave();
        } else {
            // Campaign: more enemies at higher levels. Quick battle: 1 enemy.
            const enemyCount = this.battleMode === 'campaign'
                ? Math.min(1 + Math.floor((this.levelId - 1) / 2), 4)  // 1,1,2,2,3 enemies
                : 1;
            for (let i = 0; i < enemyCount; i++) {
                this._spawnEnemy();
            }
        }

        // ── Input ──
        this.keys = this.input.keyboard.addKeys({
            up: 'W', down: 'S', left: 'A', right: 'D',
            arrowUp: 'UP', arrowDown: 'DOWN', arrowLeft: 'LEFT', arrowRight: 'RIGHT',
            attack: 'SPACE', special: 'E', pause: 'ESC',
            dodge: 'SHIFT', swap: 'Q',
        });
        this._pauseKeyHandler = () => {
            if (!this.isMultiplayer && (this.battleActive || this.paused)) this._togglePause();
        };
        this.input.keyboard.on('keydown-ESC', this._pauseKeyHandler);
        this.events.once('shutdown', () => {
            if (this._pauseKeyHandler) this.input.keyboard.off('keydown-ESC', this._pauseKeyHandler);
        });

        // ── Touch Controls ──
        this._createTouchControls();

        // ── Battle state ──
        this.battleActive = true;
        this.battleResult = null;
        this.battleTimer = 0;
        this.arenaMusicStarted = !!this.audio;
        this.arenaMusicStartAt = null;
        this.comboCount = 0;
        this.survivalWave = this.isSurvival ? 1 : 0;
        this.survivalKills = 0;
        this.comboTimer = 0;
        this.paused = false;
        this.healthPickups = [];
        this.damageDealt = 0;
        this.damageReceived = 0;
        this.hazardsInitialized = false;

        // ── Hazards ──
        this.hazards = [];
        this._createHazards();

        // ── Camera effects ──
        this.cameras.main.fadeIn(500, 0, 0, 0);

        // ── Round start text ──
        if (!this.isBossFight) {
            this._showFightText();
        }
    }

    update(time, delta) {
        if (this.paused) {
            return;
        }
        if (!this.battleActive) return;

        this.battleTimer += delta;

        // ── Player Input ──
        this._handleInput(delta);

        // ── Update all bots ──
        this.player.update(delta);
        this._constrainBotToTiles(this.player);
        this._checkTeleporters(this.player);
        this._pushBotsApart();

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (this.isBossFight && enemy === this.boss) {
                enemy.update(delta, this.player, this.arenaRect);
                this._constrainBotToTiles(enemy);
                this._checkTeleporters(enemy);
            } else {
                enemy.update(delta);
                this._constrainBotToTiles(enemy);
                this._checkTeleporters(enemy);
            }

            // Check death
            if (!enemy.alive) {
                this.particles.deathExplosion(enemy.x, enemy.y, enemy.skinColor);
                if (this.audio) this.audio.playDeath();
                this.cameras.main.shake(300, 0.02);
                this._spawnHealthPickup(enemy.x, enemy.y);
                this._spawnScrapPickup(enemy.x, enemy.y);
                // Speed burst for player on kill
                this.player.grantSpeedBurst();

                enemy.destroy();
                this.enemies.splice(i, 1);
                this.aiControllers = this.aiControllers.filter(ai => ai.bot !== enemy);

                if (this.isSurvival) {
                    this.survivalKills++;
                    // Check if wave cleared
                    if (this.enemies.length === 0) {
                        this.survivalWave++;
                        this._startSurvivalWave();
                    }
                } else if (enemy === this.boss || this.enemies.length === 0) {
                    this._endBattle('win');
                    return;
                }
            }
        }

        // Check player death
        if (!this.player.alive) {
            this.particles.deathExplosion(this.player.x, this.player.y, this.player.skinColor);
            if (this.audio) this.audio.playDeath();
            this._endBattle('lose');
            return;
        }

        // ── AI (skip in multiplayer — remote player is human) ──
        if (!this.isMultiplayer) {
            for (const ai of this.aiControllers) {
                ai.update(delta, this.player, this.arenaRect);
                if (ai.bot.wantsAttack) {
                    ai.bot.wantsAttack = false;
                    this._tryUseActiveWeapon(ai.bot, this.player);
                }
                if (ai.bot.wantsBomb) {
                    ai.bot.wantsBomb = false;
                    const activeWeapon = this.weapons.getWeapon(ai.bot.weaponKey);
                    if (activeWeapon.category === 'bomb') {
                        this._tryUseActiveWeapon(ai.bot, this.player);
                    }
                }
            }
        }

        // ── Multiplayer: interpolate remote bot from network state ──
        if (this.isMultiplayer && this.remoteBot && this.net) {
            this._updateRemoteBot(delta);
        }

        // ── Weapons & Projectiles ──
        const allBots = [this.player, ...this.enemies];
        this.weapons.update(delta, allBots, this.arenaRect);

        // ── Hazards ──
        this._updateHazards(delta);

        // ── Animated arena effects ──
        this._updateArenaEffects(delta);

        // ── Particles ──
        this.particles.update(delta);

        // ── Health Pickups ──
        this._updateHealthPickups();
        this._updateScrapPickups();

        // ── HUD ──
        this._updateHUD();

        // ── Combo decay ──
        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) this.comboCount = 0;
        }

        // ── Player movement trail ──
        if (Math.abs(this.player.moveDir.x) > 0.1 || Math.abs(this.player.moveDir.y) > 0.1) {
            if (Math.random() < 0.15) {
                this.particles.trail(this.player.x, this.player.y, skinColorFromProg(this.prog), this.player.angle + Math.PI);
            }
        }

        // ── Dynamic Zoom (never above 1.0 to avoid black bars) ──
        const aliveEnemies = this.enemies.filter(e => e.alive).length;
        const targetZoom = aliveEnemies >= 4 ? 0.92 : 1.0;
        const cam = this.cameras.main;
        cam.zoom += (targetZoom - cam.zoom) * 0.02;
    }

    // ── Input Handling ──
    _handleInput(delta) {
        const p = this.player;
        if (p.stunned || p.disabled) return;

        // Movement
        let dx = 0, dy = 0;
        if (this.keys.left.isDown || this.keys.arrowLeft.isDown) dx -= 1;
        if (this.keys.right.isDown || this.keys.arrowRight.isDown) dx += 1;
        if (this.keys.up.isDown || this.keys.arrowUp.isDown) dy -= 1;
        if (this.keys.down.isDown || this.keys.arrowDown.isDown) dy += 1;

        // Touch joystick override
        if (this.touchJoystick && this.touchJoystick.active) {
            dx = this.touchJoystick.dx;
            dy = this.touchJoystick.dy;
        }

        // Normalize diagonal
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0) {
            p.moveDir.x = dx / mag;
            p.moveDir.y = dy / mag;
            p.angle = Math.atan2(dy, dx);
        } else {
            p.moveDir.x = 0;
            p.moveDir.y = 0;
        }

        // Attack — hold SPACE for continuous, auto-face nearest enemy
        const attackDown = this.keys.attack.isDown || this.touchAttackPressed;
        this.touchAttackPressed = false;
        if (attackDown) {
            if (p.attackDisabled) {
                if (this.audio) this.audio.playMiss();
                return;
            }
            const closestEnemy = this._getClosestEnemy(p);
            const activeWeapon = this.weapons.getWeapon(p.weaponKey);
            const atkCost = ENERGY_CONFIG.attackCosts[activeWeapon.category] || 10;

            if (p.energy < atkCost) {
                // Out of energy — stagger briefly instead of firing for free.
                if (!p.stunned) {
                    p.stun(180);
                    this.particles.electric(p.x, p.y, 5);
                    if (this.audio) this.audio.playMiss();
                }
            } else {
                const result = this._tryUseActiveWeapon(p, closestEnemy);

                if (this.isMultiplayer && this.net && result?.hit) {
                    this.net.sendAttack({
                        x: p.x, y: p.y, angle: p.angle,
                        weapon: p.weaponKey,
                        damage: result.damage,
                        effects: result.effects.filter(e => typeof e === 'object').map(e => e.type),
                    });
                }
            }
        }

        // Dodge roll (SHIFT + moving) or Block (SHIFT + stationary) + touch
        const isMoving = Math.abs(p.moveDir.x) > 0.1 || Math.abs(p.moveDir.y) > 0.1;
        const dodgeTriggered = Phaser.Input.Keyboard.JustDown(this.keys.dodge) || this.touchDodgePressed;
        this.touchDodgePressed = false;
        if (dodgeTriggered && isMoving) {
            const dodged = p.startDodge(p.moveDir.x, p.moveDir.y);
            if (dodged) {
                this.particles.sparks(p.x, p.y, COLORS.WHITE, 6);
                if (this.audio) this.audio.playSwing();
            }
        } else if (this.keys.dodge.isDown && !isMoving) {
            p.blocking = true;
        } else if (!this.keys.dodge.isDown) {
            // Don't override touch block button
            if (!this.sys.game.device.input.touch) p.blocking = false;
        }

        this.touchBombPressed = false;

        // Weapon swap (Q key or touch)
        const swapTriggered = Phaser.Input.Keyboard.JustDown(this.keys.swap) || this.touchSwapPressed;
        this.touchSwapPressed = false;
        if (swapTriggered) {
            p.swapWeapon();
        }

        // Pause is handled by a keydown listener so ESC can also resume.
    }

    _tryUseActiveWeapon(attacker, target) {
        const weapon = this.weapons.getWeapon(attacker.weaponKey);
        const atkCost = ENERGY_CONFIG.attackCosts[weapon.category] || 10;

        if (attacker.stunned || attacker.disabled || attacker.attackDisabled) {
            return { reason: 'attack_disabled', weapon, effects: [], hit: false };
        }

        if (weapon.category === 'bomb' || weapon.key === 'emp') {
            return this._tryPlantEquippedBomb(attacker, weapon, atkCost);
        }

        const result = this.weapons.attack(attacker, target, attacker.weaponKey);
        if (result.reason !== 'cooldown' && result.reason !== 'charging') {
            attacker.energy -= Math.min(atkCost, attacker.energy);
        }
        if (this.audio && result.reason !== 'cooldown' && result.reason !== 'charging') {
            this.audio.playWeaponAttack(attacker.weaponKey);
        }
        this._processAttackResult(result, attacker, target);
        return result;
    }

    _tryPlantEquippedBomb(attacker, bombWeapon, atkCost) {
        if (attacker.bombActive || Date.now() < attacker.bombCooldownEnd) {
            return { reason: 'cooldown', weapon: bombWeapon, effects: [] };
        }
        if (attacker.energy < atkCost) {
            return { reason: 'no_energy', weapon: bombWeapon, effects: [] };
        }

        attacker.energy -= Math.min(atkCost, attacker.energy);
        attacker.attackAnim = 1;
        if (attacker.spriteRenderer?.triggerAttack) {
            attacker.spriteRenderer.triggerAttack();
        }
        attacker.bombActive = true;
        this._plantBomb(attacker.x, attacker.y, attacker, bombWeapon);
        if (this.audio) {
            if (bombWeapon.disableDuration || bombWeapon.stunDuration || bombWeapon.attackDisableDuration) this.audio.playEMP();
            else this.audio.playMinePlace();
        }
        return { reason: 'planted', weapon: bombWeapon, effects: [], hit: false };
    }

    _processAttackResult(result, attacker, target) {
        if (!result) return;

        for (const effect of (result.effects || [])) {
            if (typeof effect === 'string' && effect === 'crit') {
                // Crit was already processed
                continue;
            }
            if (!effect.type) continue;

            switch (effect.type) {
                case 'knockback':
                    if (target) target.applyKnockback(effect.angle, effect.force);
                    break;
                case 'stun':
                    if (target) target.stun(effect.duration);
                    break;
                case 'bleed':
                    if (target) target.addDot(effect.damage, effect.duration);
                    break;
                case 'aoe':
                    // Damage all enemies in radius
                    for (const enemy of this.enemies) {
                        if (enemy === attacker) continue;
                        const d = Math.sqrt((enemy.x - attacker.x) ** 2 + (enemy.y - attacker.y) ** 2);
                        if (d < effect.radius) {
                            enemy.takeDamage(effect.damage, attacker);
                        }
                    }
                    break;
                case 'particles':
                    if (effect.style === 'sparks') {
                        this.particles.sparks(effect.x, effect.y, effect.color);
                    } else if (effect.style === 'shield') {
                        this.particles.shieldEffect(effect.x, effect.y);
                    } else if (effect.style === 'heal') {
                        this.particles.heal(effect.x, effect.y);
                    }
                    break;
                case 'audio':
                    if (effect.sound === 'hit' || effect.sound === 'critHit') continue;
                    if (this.audio) {
                        const fn = 'play' + effect.sound.charAt(0).toUpperCase() + effect.sound.slice(1);
                        if (typeof this.audio[fn] === 'function') this.audio[fn]();
                    }
                    break;
            }
        }

        if (result.hit && result.damage > 0 && target) {
            // Combo damage multiplier — scales with consecutive hits
            let comboDmg = result.damage;
            if (attacker.isPlayer && this.comboCount > 1) {
                comboDmg = Math.round(result.damage * (1 + this.comboCount * 0.08)); // +8% per combo
            }
            target.takeDamage(comboDmg, attacker);

            // ── Screen Flash on big hits ──
            if (result.damage >= 30) {
                const flashColor = attacker.isPlayer ? 0xffffff : 0xff2222;
                const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, flashColor, 0.3).setDepth(300);
                this.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });
            }

            // ── Universal knockback (varied per weapon) ──
            if (target && attacker) {
                const kbAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
                const baseKB = result.weapon ? (result.weapon.knockback || 60) : 60;
                target.applyKnockback(kbAngle, baseKB);
            }

            if (attacker.isPlayer) {
                this.damageDealt += result.damage;
                this.comboCount++;
                this.comboTimer = 2000;
                this.cameras.main.shake(100, 0.008 + result.damage * 0.0003);
            } else {
                this.damageReceived += result.damage;
                this.cameras.main.shake(60, 0.004);
            }
        }

        if (result.reason === 'missed' && this.audio) {
            this.audio.playMiss();
        }
    }

    _getClosestEnemy(from) {
        let closest = null;
        let minDist = Infinity;
        for (const e of this.enemies) {
            if (!e.alive) continue;
            const d = Math.sqrt((e.x - from.x) ** 2 + (e.y - from.y) ** 2);
            if (d < minDist) { minDist = d; closest = e; }
        }
        return closest;
    }

    // ── Arena Drawing ──
    _drawArena() {
        const arena = this.arenaData;
        const WH = 14; // wall height for fake 3D
        const OL = 3;  // cel outline width
        const T = TILE_SIZE;
        const ox = this.tileOffX, oy = this.tileOffY;
        const dk = (c, n = 70) => { const R = Math.max(0,((c>>16)&0xff)-n); const G = Math.max(0,((c>>8)&0xff)-n); const B = Math.max(0,(c&0xff)-n); return (R<<16)|(G<<8)|B; };
        const lt = (c, n = 50) => { const R = Math.min(255,((c>>16)&0xff)+n); const G = Math.min(255,((c>>8)&0xff)+n); const B = Math.min(255,(c&0xff)+n); return (R<<16)|(G<<8)|B; };

        // ── Background: painted arena PNG if available, else color fallback ──
        const bgKey = `arena_${this.arenaKey}`;
        this.usePaintedBg = this.textures.exists(bgKey);
        const usePaintedBg = this.usePaintedBg;
        if (usePaintedBg) {
            const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, bgKey).setDepth(-1);
            bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        } else {
            this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, arena.bgColor).setDepth(-1);
        }

        const gfx = this.add.graphics().setDepth(0);
        const wallGfx = this.add.graphics().setDepth(3);
        this.tileSprites = {};

        // ── Draw each tile ──
        for (let row = 0; row < this.tileRows; row++) {
            for (let col = 0; col < this.tileCols; col++) {
                const tile = this.tileGrid[row][col];
                const tx = ox + col * T;
                const ty = oy + row * T;

                if (tile === 0 && !usePaintedBg) {
                    // ── Wall tile: 3D block with top + right face ──
                    // Right face
                    wallGfx.fillStyle(dk(arena.wallColor, 50), 1);
                    const rf = [
                        { x: tx + T, y: ty }, { x: tx + T + WH * 0.5, y: ty - WH * 0.5 },
                        { x: tx + T + WH * 0.5, y: ty + T - WH * 0.5 }, { x: tx + T, y: ty + T },
                    ];
                    wallGfx.fillPoints(rf, true);
                    // Top face
                    wallGfx.fillStyle(lt(arena.wallColor, 20), 1);
                    const tf = [
                        { x: tx, y: ty }, { x: tx + WH * 0.5, y: ty - WH * 0.5 },
                        { x: tx + T + WH * 0.5, y: ty - WH * 0.5 }, { x: tx + T, y: ty },
                    ];
                    wallGfx.fillPoints(tf, true);
                    // Front face
                    wallGfx.fillStyle(arena.wallColor, 1);
                    wallGfx.fillRect(tx, ty, T, T);
                    // Highlight band
                    wallGfx.fillStyle(lt(arena.wallColor, 30), 0.25);
                    wallGfx.fillRect(tx, ty, T, T * 0.2);
                    // Outline
                    wallGfx.lineStyle(OL, 0x000000, 0.65);
                    wallGfx.strokeRect(tx, ty, T, T);

                } else if (tile >= 1) {
                    if (!usePaintedBg) {
                    // ── Floor tile ──
                    gfx.fillStyle(dk(arena.floorColor, 20), 0.4);
                    gfx.fillRect(tx + 2, ty + 2, T, T);
                    gfx.fillStyle(arena.floorColor, 1);
                    gfx.fillRect(tx, ty, T, T);
                    gfx.lineStyle(1, arena.wallColor, 0.08);
                    gfx.strokeRect(tx, ty, T, T);

                    } // end !usePaintedBg floor

                    if (tile === 4) {
                        // Lava / damage tile
                        if (this.textures.exists('hazard_lava_pool')) {
                            const spr = this.add.sprite(tx + T / 2, ty + T / 2, 'hazard_lava_pool', 0)
                                .setDisplaySize(T * 1.2 * HAZARD_VISUAL_SCALE, T * 1.2 * HAZARD_VISUAL_SCALE).setDepth(1);
                            this.tileSprites[`${row},${col}`] = spr;
                        } else {
                            gfx.fillStyle(COLORS.LAVA, 0.35);
                            gfx.fillRect(tx + 3, ty + 3, T - 6, T - 6);
                        }
                    } else if (tile === 2) {
                        // Hazard zone tile
                        if (this.textures.exists('hazard_electric_floor')) {
                            const spr = this.add.sprite(tx + T / 2, ty + T / 2, 'hazard_electric_floor', 0)
                                .setDisplaySize(T * 1.2 * HAZARD_VISUAL_SCALE, T * 1.2 * HAZARD_VISUAL_SCALE).setDepth(1);
                            this.tileSprites[`${row},${col}`] = spr;
                        } else {
                            gfx.fillStyle(arena.accentColor, 0.15);
                            gfx.fillRect(tx + 2, ty + 2, T - 4, T - 4);
                        }
                        // Hazard stripes fallback
                        if (!this.textures.exists('hazard_electric_floor')) {
                        for (let s = 0; s < T; s += 12) {
                            const stripe = (s / 12) % 2 === 0;
                            gfx.fillStyle(stripe ? arena.accentColor : 0x111111, 0.2);
                            gfx.fillRect(tx + s, ty, 6, T);
                        }
                        } // end hazard stripes fallback
                    } else if (tile === 3) {
                        const breakableKey = this.textures.exists('hazard_box') && (row + col) % 3 === 0
                            ? 'hazard_box'
                            : 'hazard_breakable_wall';
                        if (this.textures.exists(breakableKey)) {
                            const spr = this.add.sprite(tx + T / 2, ty + T / 2, breakableKey, 0)
                                .setDisplaySize(T * 1.45 * HAZARD_VISUAL_SCALE, T * 1.45 * HAZARD_VISUAL_SCALE).setDepth(4);
                            this.tileSprites[`${row},${col}`] = spr;
                        } else {
                            gfx.fillStyle(0x000000, 0.3);
                            gfx.fillRect(tx + 6, ty + 6, T - 8, T - 8);
                            gfx.fillStyle(dk(arena.wallColor, 30), 1);
                            gfx.fillRect(tx + 4, ty + 4, T - 8, T - 8);
                            gfx.lineStyle(3, 0x000000, 0.5);
                            gfx.strokeRect(tx + 4, ty + 4, T - 8, T - 8);
                        }
                    } else if (tile === 7) {
                        if (this.textures.exists('hazard_tnt_crate')) {
                            const spr = this.add.sprite(tx + T / 2, ty + T / 2, 'hazard_tnt_crate', 0)
                                .setDisplaySize(T * 1.25 * HAZARD_VISUAL_SCALE, T * 1.25 * HAZARD_VISUAL_SCALE).setDepth(4);
                            this.tileSprites[`${row},${col}`] = spr;
                        } else {
                            gfx.fillStyle(0x000000, 0.3);
                            gfx.fillCircle(tx + T / 2 + 3, ty + T / 2 + 3, T * 0.35);
                            gfx.fillStyle(0xcc2211, 1);
                            gfx.fillCircle(tx + T / 2, ty + T / 2, T * 0.35);
                            gfx.lineStyle(3, 0x000000, 0.7);
                            gfx.strokeCircle(tx + T / 2, ty + T / 2, T * 0.35);
                        }
                    } else if (tile === 8) {
                        if (this.textures.exists('hazard_teleporter_pad')) {
                            const spr = this.add.sprite(tx + T / 2, ty + T / 2, 'hazard_teleporter_pad', 0)
                                .setDisplaySize(T * 1.4 * HAZARD_VISUAL_SCALE, T * 1.4 * HAZARD_VISUAL_SCALE).setDepth(4);
                            this.tileSprites[`${row},${col}`] = spr;
                        } else {
                            gfx.fillStyle(0x000000, 0.3);
                            gfx.fillCircle(tx + T / 2 + 2, ty + T / 2 + 2, T * 0.38);
                            gfx.fillStyle(0x5533aa, 0.6);
                            gfx.fillCircle(tx + T / 2, ty + T / 2, T * 0.38);
                            gfx.lineStyle(3, 0x000000, 0.6);
                            gfx.strokeCircle(tx + T / 2, ty + T / 2, T * 0.38);
                        }
                    }
                }
            }
        }

        // ── Animated effects layer ──
        this.arenaFxGfx = this.add.graphics().setDepth(2);
        this.arenaFxData = this._initArenaEffects();
    }

    _drawArenaFloorDetails(gfx) {
        const r = this.arenaRect;
        const a = this.arenaKey;

        if (a === 'scrapyard') {
            // Oil stains
            for (let i = 0; i < 6; i++) {
                const ox = r.x + 50 + Math.random() * (r.width - 100);
                const oy = r.y + 50 + Math.random() * (r.height - 100);
                const or2 = 15 + Math.random() * 25;
                gfx.fillStyle(0x222211, 0.25);
                gfx.fillCircle(ox, oy, or2);
                gfx.fillStyle(0x1a1a0e, 0.15);
                gfx.fillCircle(ox + 3, oy + 2, or2 * 0.7);
            }
            // Scratch marks
            gfx.lineStyle(1, 0x555544, 0.15);
            for (let i = 0; i < 12; i++) {
                const sx = r.x + Math.random() * r.width;
                const sy = r.y + Math.random() * r.height;
                const angle = Math.random() * Math.PI;
                const len = 20 + Math.random() * 40;
                gfx.lineBetween(sx, sy, sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
            }
            // Rivets along edges
            gfx.fillStyle(0x666655, 0.3);
            for (let x = r.x + 20; x < r.x + r.width; x += 40) {
                gfx.fillCircle(x, r.y + 12, 2);
                gfx.fillCircle(x, r.y + r.height - 12, 2);
            }

        } else if (a === 'factory') {
            // Metal plate panels
            const panelW = r.width / 4;
            const panelH = r.height / 3;
            gfx.lineStyle(2, 0x555566, 0.2);
            for (let px = 0; px < 4; px++) {
                for (let py = 0; py < 3; py++) {
                    const x = r.x + px * panelW;
                    const y = r.y + py * panelH;
                    gfx.strokeRect(x + 3, y + 3, panelW - 6, panelH - 6);
                    // Panel rivets
                    gfx.fillStyle(0x666677, 0.25);
                    gfx.fillCircle(x + 10, y + 10, 2);
                    gfx.fillCircle(x + panelW - 10, y + 10, 2);
                    gfx.fillCircle(x + 10, y + panelH - 10, 2);
                    gfx.fillCircle(x + panelW - 10, y + panelH - 10, 2);
                }
            }
            // Warning paint
            gfx.fillStyle(COLORS.YELLOW, 0.06);
            gfx.fillRect(r.x + r.width / 2 - 2, r.y, 4, r.height);

        } else if (a === 'volcano') {
            // Lava cracks (branching)
            for (let i = 0; i < 5; i++) {
                let cx = r.x + 50 + Math.random() * (r.width - 100);
                let cy = r.y + 50 + Math.random() * (r.height - 100);
                for (let seg = 0; seg < 6; seg++) {
                    const nx = cx + (Math.random() - 0.5) * 60;
                    const ny = cy + (Math.random() - 0.5) * 60;
                    // Glow
                    gfx.lineStyle(6, COLORS.LAVA, 0.08);
                    gfx.lineBetween(cx, cy, nx, ny);
                    // Core
                    gfx.lineStyle(2, COLORS.YELLOW, 0.2);
                    gfx.lineBetween(cx, cy, nx, ny);
                    cx = nx; cy = ny;
                }
            }
            // Scorch marks
            for (let i = 0; i < 8; i++) {
                const sx = r.x + Math.random() * r.width;
                const sy = r.y + Math.random() * r.height;
                gfx.fillStyle(0x1a0800, 0.2);
                gfx.fillCircle(sx, sy, 10 + Math.random() * 15);
            }
            // Rocky texture
            gfx.fillStyle(0x443322, 0.08);
            for (let i = 0; i < 20; i++) {
                gfx.fillCircle(r.x + Math.random() * r.width, r.y + Math.random() * r.height, 3 + Math.random() * 5);
            }

        } else if (a === 'cyber') {
            // Circuit board traces
            gfx.lineStyle(1, COLORS.NEON_GREEN, 0.08);
            for (let x = r.x; x <= r.x + r.width; x += 80) gfx.lineBetween(x, r.y, x, r.y + r.height);
            for (let y = r.y; y <= r.y + r.height; y += 80) gfx.lineBetween(r.x, y, r.x + r.width, y);
            // Circuit nodes
            for (let x = r.x + 40; x < r.x + r.width; x += 80) {
                for (let y = r.y + 40; y < r.y + r.height; y += 80) {
                    if (Math.random() < 0.4) {
                        gfx.fillStyle(COLORS.NEON_GREEN, 0.12);
                        gfx.fillCircle(x, y, 3);
                        // Trace segments
                        gfx.lineStyle(1, COLORS.NEON_GREEN, 0.06);
                        const dir = Math.floor(Math.random() * 4);
                        const len = 20 + Math.random() * 30;
                        const dx = [1, 0, -1, 0][dir] * len;
                        const dy = [0, 1, 0, -1][dir] * len;
                        gfx.lineBetween(x, y, x + dx, y + dy);
                    }
                }
            }
            // Hex patterns
            gfx.lineStyle(1, 0x2233aa, 0.06);
            for (let i = 0; i < 8; i++) {
                const hx = r.x + 80 + Math.random() * (r.width - 160);
                const hy = r.y + 80 + Math.random() * (r.height - 160);
                const hr = 20 + Math.random() * 20;
                const pts = [];
                for (let j = 0; j < 6; j++) {
                    const ha = (Math.PI / 3) * j;
                    pts.push({ x: hx + Math.cos(ha) * hr, y: hy + Math.sin(ha) * hr });
                }
                gfx.strokePoints(pts, true);
            }

        } else if (a === 'space') {
            // Starfield
            for (let i = 0; i < 80; i++) {
                const sx = r.x + Math.random() * r.width;
                const sy = r.y + Math.random() * r.height;
                const brightness = Math.random();
                gfx.fillStyle(0xffffff, brightness * 0.4 + 0.05);
                gfx.fillCircle(sx, sy, brightness * 1.5 + 0.3);
            }
            // Nebula blobs
            const nebulaColors = [0x3344aa, 0x6633aa, 0x224488];
            for (let i = 0; i < 4; i++) {
                const nx = r.x + 100 + Math.random() * (r.width - 200);
                const ny = r.y + 80 + Math.random() * (r.height - 160);
                const nr = 40 + Math.random() * 60;
                const nc = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
                gfx.fillStyle(nc, 0.04);
                gfx.fillCircle(nx, ny, nr);
                gfx.fillStyle(nc, 0.03);
                gfx.fillCircle(nx + 10, ny - 10, nr * 0.7);
            }
            // Station floor plates
            gfx.lineStyle(1, 0x334455, 0.12);
            for (let x = r.x; x <= r.x + r.width; x += 60) gfx.lineBetween(x, r.y, x, r.y + r.height);
            for (let y = r.y; y <= r.y + r.height; y += 60) gfx.lineBetween(r.x, y, r.x + r.width, y);
        }
    }

    // ── Animated arena effects (called each frame) ──
    _initArenaEffects() {
        const r = this.arenaRect;
        const fxBounds = { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT };
        const randomFxX = () => fxBounds.x + Math.random() * fxBounds.width;
        const randomFxY = () => fxBounds.y + Math.random() * fxBounds.height;
        const boostedAlpha = (min, max) => Math.min(1, (min + Math.random() * (max - min)) * FX_ALPHA_MULTIPLIER);
        const data = { type: this.arenaKey, fxSprites: [], fxBounds };

        // Sprite-based ambient FX per arena
        const fxMap = {
            volcano: { key: 'fx_ember_rise', count: 7, minSize: 34, maxSize: 62, alphaMin: 0.16, alphaMax: 0.3, vxMin: -10, vxMax: 10, vyMin: -28, vyMax: -12, rotMin: -0.4, rotMax: 0.4 },
            ice: { key: 'fx_snow_drift', count: 7, minSize: 34, maxSize: 58, alphaMin: 0.12, alphaMax: 0.24, vxMin: -10, vxMax: 10, vyMin: 10, vyMax: 22, rotMin: -0.25, rotMax: 0.25 },
            powerplant: { key: 'fx_electric_arc', count: 6, minSize: 40, maxSize: 64, alphaMin: 0.14, alphaMax: 0.26, vxMin: -14, vxMax: 14, vyMin: -4, vyMax: 4, rotMin: -0.35, rotMax: 0.35 },
            jungle: { key: 'fx_falling_leaf', count: 8, minSize: 34, maxSize: 60, alphaMin: 0.14, alphaMax: 0.26, vxMin: -14, vxMax: 14, vyMin: 10, vyMax: 24, rotMin: -0.5, rotMax: 0.5 },
            factory: { key: 'fx_steam_vent', count: 6, minSize: 40, maxSize: 66, alphaMin: 0.12, alphaMax: 0.22, vxMin: -6, vxMax: 6, vyMin: -22, vyMax: -10, rotMin: -0.2, rotMax: 0.2 },
            scrapyard: { key: 'fx_dust_swirl', count: 6, minSize: 34, maxSize: 60, alphaMin: 0.12, alphaMax: 0.22, vxMin: -12, vxMax: 12, vyMin: -8, vyMax: 4, rotMin: -0.45, rotMax: 0.45 },
            cyber: { key: 'fx_glitch_band', count: 6, minSize: 36, maxSize: 62, alphaMin: 0.14, alphaMax: 0.26, vxMin: -18, vxMax: 18, vyMin: -3, vyMax: 3, rotMin: -0.2, rotMax: 0.2 },
            space: { key: 'fx_aurora_wave', count: 5, minSize: 46, maxSize: 76, alphaMin: 0.12, alphaMax: 0.24, vxMin: -8, vxMax: 8, vyMin: -3, vyMax: 3, rotMin: -0.14, rotMax: 0.14 },
            quarry: { key: 'fx_smoke_drift', count: 5, minSize: 36, maxSize: 60, alphaMin: 0.12, alphaMax: 0.22, vxMin: -8, vxMax: 8, vyMin: -10, vyMax: -2, rotMin: -0.2, rotMax: 0.2 },
            rainbow: { key: 'fx_aurora_wave', count: 6, minSize: 40, maxSize: 68, alphaMin: 0.14, alphaMax: 0.26, vxMin: -8, vxMax: 8, vyMin: -4, vyMax: 4, rotMin: -0.16, rotMax: 0.16 },
        };
        const fxConfig = fxMap[this.arenaKey];
        if (fxConfig && this.textures.exists(fxConfig.key)) {
            const count = Math.ceil(fxConfig.count * FX_COUNT_MULTIPLIER);
            for (let i = 0; i < count; i++) {
                const size = (fxConfig.minSize + Math.random() * (fxConfig.maxSize - fxConfig.minSize)) * FX_VISUAL_SCALE;
                const fx = this.add.sprite(
                    randomFxX(),
                    randomFxY(),
                    fxConfig.key,
                    Math.floor(Math.random() * 4)
                ).setDepth(30)
                    .setAlpha(boostedAlpha(fxConfig.alphaMin, fxConfig.alphaMax))
                    .setDisplaySize(size, size);
                data.fxSprites.push({
                    img: fx,
                    frameTimer: 300 + Math.random() * 500,
                    vx: fxConfig.vxMin + Math.random() * (fxConfig.vxMax - fxConfig.vxMin),
                    vy: fxConfig.vyMin + Math.random() * (fxConfig.vyMax - fxConfig.vyMin),
                    rotSpeed: fxConfig.rotMin + Math.random() * (fxConfig.rotMax - fxConfig.rotMin),
                });
            }
        }

        if (this.arenaKey === 'volcano' && this.textures.exists('fx_lava_bubble')) {
            for (let i = 0; i < 4 * FX_COUNT_MULTIPLIER; i++) {
                const fx = this.add.sprite(
                    randomFxX(),
                    randomFxY(),
                    'fx_lava_bubble',
                    Math.floor(Math.random() * 4)
                ).setDepth(29).setAlpha(boostedAlpha(0.18, 0.36)).setDisplaySize(
                    (30 + Math.random() * 24) * FX_VISUAL_SCALE,
                    (30 + Math.random() * 24) * FX_VISUAL_SCALE
                );
                data.fxSprites.push({
                    img: fx,
                    frameTimer: 260 + Math.random() * 300,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -10 - Math.random() * 18,
                    rotSpeed: (Math.random() - 0.5) * 0.35,
                });
            }
        }

        if (this.arenaKey === 'volcano') {
            // Ember particles that float up
            data.embers = [];
            for (let i = 0; i < 12; i++) {
                data.embers.push({
                    x: r.x + Math.random() * r.width,
                    y: r.y + Math.random() * r.height,
                    speed: 20 + Math.random() * 40,
                    size: 1 + Math.random() * 2,
                    alpha: Math.random(),
                });
            }
        } else if (this.arenaKey === 'cyber') {
            // Data stream particles that move along grid lines
            data.streams = [];
            for (let i = 0; i < 8; i++) {
                const horiz = Math.random() < 0.5;
                data.streams.push({
                    x: horiz ? r.x : r.x + Math.floor(Math.random() * (r.width / 80)) * 80,
                    y: horiz ? r.y + Math.floor(Math.random() * (r.height / 80)) * 80 : r.y,
                    horiz,
                    speed: 100 + Math.random() * 150,
                    len: 10 + Math.random() * 30,
                });
            }
        } else if (this.arenaKey === 'space') {
            // Twinkling stars
            data.twinkles = [];
            for (let i = 0; i < 15; i++) {
                data.twinkles.push({
                    x: r.x + Math.random() * r.width,
                    y: r.y + Math.random() * r.height,
                    phase: Math.random() * Math.PI * 2,
                    speed: 1 + Math.random() * 3,
                });
            }
        } else if (this.arenaKey === 'factory') {
            data.steamTimer = 0;
            data.steamVents = [];
            for (let i = 0; i < 3; i++) {
                data.steamVents.push({
                    x: r.x + 80 + Math.random() * (r.width - 160),
                    y: r.y + r.height - 5,
                });
            }
        }

        // Quarry: falling rock timer
        if (this.arenaKey === 'quarry') {
            data.rockTimer = 3000 + Math.random() * 4000;
        }

        return data;
    }

    _updateArenaEffects(delta) {
        if (!this.arenaFxGfx || !this.arenaFxData) return;
        const gfx = this.arenaFxGfx;
        const d = this.arenaFxData;
        const r = this.arenaRect;
        const fxBounds = d.fxBounds || r;
        const dt = delta / 1000;

        // Animate sprite-based FX particles
        if (d.fxSprites) {
            for (const fx of d.fxSprites) {
                fx.img.x += fx.vx * dt;
                fx.img.y += fx.vy * dt;
                fx.img.rotation += fx.rotSpeed * dt;
                fx.frameTimer -= delta;
                if (fx.frameTimer <= 0 && fx.img.setFrame) {
                    fx.frameTimer = 300 + Math.random() * 500;
                    fx.img.setFrame((Number(fx.img.frame.name) + 1) % 4);
                }
                // Wrap around
                if (fx.img.y < fxBounds.y - 30) {
                    fx.img.y = fxBounds.y + fxBounds.height + 20;
                    fx.img.x = fxBounds.x + Math.random() * fxBounds.width;
                }
                if (fx.img.y > fxBounds.y + fxBounds.height + 30) {
                    fx.img.y = fxBounds.y - 20;
                    fx.img.x = fxBounds.x + Math.random() * fxBounds.width;
                }
                if (fx.img.x < fxBounds.x - 30) {
                    fx.img.x = fxBounds.x + fxBounds.width + 20;
                    fx.img.y = fxBounds.y + Math.random() * fxBounds.height;
                }
                if (fx.img.x > fxBounds.x + fxBounds.width + 30) {
                    fx.img.x = fxBounds.x - 20;
                    fx.img.y = fxBounds.y + Math.random() * fxBounds.height;
                }
            }
        }

        gfx.clear();

        if (d.type === 'volcano' && d.embers) {
            for (const e of d.embers) {
                e.y -= e.speed * dt;
                e.x += Math.sin(Date.now() * 0.002 + e.alpha * 10) * 0.5;
                e.alpha -= dt * 0.3;
                if (e.y < r.y || e.alpha <= 0) {
                    e.x = r.x + Math.random() * r.width;
                    e.y = r.y + r.height;
                    e.alpha = 0.5 + Math.random() * 0.5;
                }
                const colors = [COLORS.LAVA, COLORS.ORANGE, COLORS.YELLOW];
                gfx.fillStyle(colors[Math.floor(Math.random() * 3)], e.alpha * 0.6);
                gfx.fillCircle(e.x, e.y, e.size);
            }
            // Lava glow pulse on floor edges
            const pulse = 0.03 + Math.sin(Date.now() * 0.002) * 0.015;
            gfx.fillStyle(COLORS.LAVA, pulse);
            gfx.fillRect(r.x, r.y + r.height - 20, r.width, 20);
            gfx.fillRect(r.x, r.y, r.width, 10);

        } else if (d.type === 'cyber' && d.streams) {
            for (const s of d.streams) {
                if (s.horiz) {
                    s.x += s.speed * dt;
                    if (s.x > r.x + r.width) s.x = r.x;
                } else {
                    s.y += s.speed * dt;
                    if (s.y > r.y + r.height) s.y = r.y;
                }
                gfx.fillStyle(COLORS.NEON_GREEN, 0.25);
                if (s.horiz) {
                    gfx.fillRect(s.x, s.y - 1, s.len, 2);
                } else {
                    gfx.fillRect(s.x - 1, s.y, 2, s.len);
                }
            }
            // Pulsing node glow
            const nodeAlpha = 0.06 + Math.sin(Date.now() * 0.003) * 0.04;
            for (let x = r.x + 40; x < r.x + r.width; x += 80) {
                for (let y = r.y + 40; y < r.y + r.height; y += 80) {
                    gfx.fillStyle(COLORS.NEON_GREEN, nodeAlpha);
                    gfx.fillCircle(x, y, 5);
                }
            }

        } else if (d.type === 'space' && d.twinkles) {
            for (const t of d.twinkles) {
                t.phase += t.speed * dt;
                const alpha = 0.1 + Math.sin(t.phase) * 0.3 + 0.3;
                gfx.fillStyle(0xffffff, alpha);
                gfx.fillCircle(t.x, t.y, 1.5);
                // Cross sparkle
                if (alpha > 0.5) {
                    gfx.lineStyle(1, 0xffffff, alpha * 0.3);
                    gfx.lineBetween(t.x - 4, t.y, t.x + 4, t.y);
                    gfx.lineBetween(t.x, t.y - 4, t.x, t.y + 4);
                }
            }

        } else if (d.type === 'factory') {
            // Periodic steam puffs
            d.steamTimer -= delta;
            if (d.steamTimer <= 0) {
                d.steamTimer = 2000 + Math.random() * 3000;
                const vent = d.steamVents[Math.floor(Math.random() * d.steamVents.length)];
                if (vent) {
                    this.particles.smoke(vent.x, vent.y, 0x889999);
                }
            }
        } else if (d.type === 'scrapyard') {
            if (Math.random() < 0.02) {
                gfx.fillStyle(0x888866, 0.08);
                gfx.fillCircle(r.x + Math.random() * r.width, r.y + Math.random() * r.height, 1 + Math.random() * 2);
            }
        }

        // Quarry: falling rocks
        if (d.rockTimer !== undefined) {
            d.rockTimer -= delta;
            if (d.rockTimer <= 0) {
                d.rockTimer = 2500 + Math.random() * 4000;
                // Drop a rock at random position
                const rx = r.x + 50 + Math.random() * (r.width - 100);
                const ry = r.y + 50 + Math.random() * (r.height - 100);
                // Warning shadow
                const shadow = this.add.circle(rx, ry, 25, 0x000000, 0.3).setDepth(3);
                this.tweens.add({ targets: shadow, scale: { from: 0.3, to: 1 }, alpha: { from: 0.1, to: 0.4 }, duration: 800 });
                // Rock impact after delay
                this.time.delayedCall(800, () => {
                    shadow.destroy();
                    this.particles.explosion(rx, ry, 30, 0x886644);
                    if (this.audio) this.audio.playExplosion();
                    this.cameras.main.shake(100, 0.008);
                    // Damage bots in impact zone
                    const allBots = [this.player, ...this.enemies];
                    for (const bot of allBots) {
                        const dd = Math.sqrt((bot.x - rx) ** 2 + (bot.y - ry) ** 2);
                        if (dd < 35) {
                            bot.takeDamage(Math.round(20 * (1 - dd / 35)), null);
                            bot.applyKnockback(Math.atan2(bot.y - ry, bot.x - rx), 150);
                        }
                    }
                });
            }
        }
    }

    // ── Hazards ──
    // ── Tile Collision Helpers ──

    // Build a Uint8Array of the arena's walkability mask. Called once from
    // create() before the tile grid is generated. White pixels (>=128) are
    // walkable; black pixels are walls. If no mask texture is loaded for
    // this arena, this.walkMask stays null and the legacy ARENA_SHAPES
    // geometry takes over.
    _loadWalkMask() {
        this.walkMask = null;
        const key = `arena_mask_${this.arenaKey}`;
        if (!this.textures.exists(key)) return;
        const src = this.textures.get(key).getSourceImage();
        const W = src.width, H = src.height;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, W, H).data;
        const mask = new Uint8Array(W * H);
        for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
            mask[p] = data[i] >= 128 ? 1 : 0;
        }
        this.walkMask = mask;
        this.walkMaskW = W;
        this.walkMaskH = H;
    }

    // Sample the walk mask at a world-space pixel. Coordinates outside
    // the mask are treated as walls. Returns true when no mask is loaded
    // (caller is expected to have its own fallback).
    _isWalkablePixel(x, y) {
        if (!this.walkMask) return true;
        const mx = Math.floor(x * this.walkMaskW / GAME_WIDTH);
        const my = Math.floor(y * this.walkMaskH / GAME_HEIGHT);
        if (mx < 0 || mx >= this.walkMaskW || my < 0 || my >= this.walkMaskH) return false;
        return this.walkMask[my * this.walkMaskW + mx] === 1;
    }

    // ── Generate arena grid from shape definition ──
    _generateArenaGrid() {
        const cols = this.tileCols;
        const rows = this.tileRows;
        const cx = cols / 2, cy = rows / 2;
        const shape = ARENA_SHAPES[this.arenaKey] || ARENA_SHAPES.scrapyard;

        // Start with all walls
        const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));

        // ── Path A: pixel mask drives floor/wall ──
        // If a walk mask is loaded, sample it at each tile's center pixel.
        // The mask is the single source of truth for walkability; the
        // ARENA_SHAPES geometry is only used when no mask exists.
        if (this.walkMask) {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const px = this.tileOffX + c * TILE_SIZE + TILE_SIZE / 2;
                    const py = this.tileOffY + r * TILE_SIZE + TILE_SIZE / 2;
                    if (this._isWalkablePixel(px, py)) grid[r][c] = 1;
                }
            }
        } else {
            // ── Path B: legacy procedural shape ──
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const nx = (c - cx) / cols;  // normalized -0.5 to 0.5
                    const ny = (r - cy) / rows;
                    let inside = false;

                switch (shape.shape) {
                    case 'circle': {
                        const dist = Math.sqrt(nx * nx + ny * ny);
                        inside = dist < (shape.radiusPct || 0.4);
                        // Lava ring — tiles near the edge become lava
                        if (shape.lavaRing && dist >= (shape.radiusPct - 0.04) && dist < shape.radiusPct) {
                            grid[r][c] = 4; inside = false;
                        }
                        // Bridge override
                        if (shape.bridge === 'bottom' && ny > 0 && Math.abs(nx) < 0.04 && dist < shape.radiusPct + 0.06) {
                            inside = true; grid[r][c] = 1;
                        }
                        break;
                    }
                    case 'oval': {
                        const wp = shape.widthPct || 0.45;
                        const hp = shape.heightPct || 0.35;
                        inside = (nx * nx) / (wp * wp) + (ny * ny) / (hp * hp) < 1;
                        break;
                    }
                    case 'rect': {
                        const hw = (shape.widthPct || 0.5) / 2;
                        const hh = (shape.heightPct || 0.5) / 2;
                        inside = Math.abs(nx) < hw && Math.abs(ny) < hh;
                        // Inner circle cutout
                        if (shape.innerCircle) {
                            const dist = Math.sqrt(nx * nx + ny * ny);
                            if (dist < 0.12) inside = true; // ensure center is open
                        }
                        // Center block
                        if (shape.centerBlock && Math.abs(nx) < 0.06 && Math.abs(ny) < 0.06) {
                            inside = false;
                        }
                        break;
                    }
                    case 'cross': {
                        const arm = shape.armWidth || 0.3;
                        inside = (Math.abs(nx) < arm / 2) || (Math.abs(ny) < arm / 2);
                        // Keep within a reasonable outer bound
                        inside = inside && Math.abs(nx) < 0.45 && Math.abs(ny) < 0.45;
                        if (shape.centerBlock && Math.abs(nx) < 0.06 && Math.abs(ny) < 0.06) {
                            inside = false;
                        }
                        break;
                    }
                    case 'octagon': {
                        const rp = shape.radiusPct || 0.4;
                        const dist = Math.max(Math.abs(nx), Math.abs(ny), (Math.abs(nx) + Math.abs(ny)) * 0.7);
                        inside = dist < rp;
                        break;
                    }
                    case 'pentagon': {
                        const rp = shape.radiusPct || 0.4;
                        const angle = Math.atan2(ny, nx);
                        // 5-sided polygon radius at this angle
                        const n = 5;
                        const polyR = rp * Math.cos(Math.PI / n) / Math.cos((angle % (2 * Math.PI / n)) - Math.PI / n + Math.PI / n);
                        const dist = Math.sqrt(nx * nx + ny * ny);
                        inside = dist < Math.abs(polyR) * 0.85;
                        break;
                    }
                }

                if (inside && grid[r][c] === 0) {
                    grid[r][c] = 1; // floor
                }
            }
        }
        } // end else (legacy procedural shape)

        // Edge margin — ensure 1-tile wall border (legacy mode only;
        // pixel masks already encode their own arena boundaries).
        if (!this.walkMask) {
            for (let r = 0; r < rows; r++) {
                grid[r][0] = 0; grid[r][cols - 1] = 0;
            }
            for (let c = 0; c < cols; c++) {
                grid[0][c] = 0; grid[rows - 1][c] = 0;
            }
        }

        // Find all floor tiles for random placement
        const floorTiles = [];
        for (let r = 2; r < rows - 2; r++) {
            for (let c = 2; c < cols - 2; c++) {
                if (grid[r][c] === 1) floorTiles.push([r, c]);
            }
        }

        // Shuffle helper
        const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
        const available = shuffle([...floorTiles]);
        let idx = 0;

        const placeRandom = (type, count) => {
            for (let i = 0; i < count && idx < available.length; i++) {
                const [pr, pc] = available[idx++];
                // Don't place near edges of the shape (buffer of 2 tiles from any wall)
                let nearWall = false;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (grid[pr + dr]?.[pc + dc] === 0) nearWall = true;
                    }
                }
                if (nearWall) continue; // skip this tile, don't retry (prevents infinite loop)
                grid[pr][pc] = type;
            }
        };

        // Random blockers are only for procedural fallback arenas. Painted
        // arenas already have authored collision in their masks.
        if (!this.walkMask) {
            placeRandom(3, shape.breakables || 10);
            placeRandom(7, shape.tnt || 3);
            if (shape.teleporters) {
                const teleCount = Math.min(shape.teleporters, Math.floor((available.length - idx) / 2));
                placeRandom(8, teleCount);
            }
        }

        // ── Player + enemy spawns ──
        // Walk the columns from each edge inward, looking for floor.
        // The first pass prefers the middle-vertical band (the legacy
        // behavior for procedural shapes); if nothing matches there
        // (e.g. when a hand-painted mask places the arena off-centre)
        // we widen to the full column. Both spawns avoid each other so
        // the player and enemy never share a tile on tiny arenas.
        const findEdgeSpawn = (fromLeft, avoid) => {
            const tryRange = (rStart, rEnd) => {
                const cStart = fromLeft ? 2 : cols - 3;
                const cEnd   = fromLeft ? cols : -1;
                const cStep  = fromLeft ? 1 : -1;
                for (let c = cStart; c !== cEnd; c += cStep) {
                    for (let r = rStart; r < rEnd; r++) {
                        if (grid[r][c] === 1 && (!avoid || avoid.r !== r || avoid.c !== c)) {
                            return { r, c };
                        }
                    }
                }
                return null;
            };
            return tryRange(Math.floor(rows * 0.3), Math.floor(rows * 0.7))
                || tryRange(0, rows);
        };

        const pSpawn = findEdgeSpawn(true, null);
        if (pSpawn) grid[pSpawn.r][pSpawn.c] = 5;
        const eSpawn = findEdgeSpawn(false, pSpawn);
        if (eSpawn) grid[eSpawn.r][eSpawn.c] = 6;

        return grid;
    }

    _findTileSpawns() {
        const spawns = { player: [], enemy: [] };
        for (let row = 0; row < this.tileRows; row++) {
            for (let col = 0; col < this.tileCols; col++) {
                const t = this.tileGrid[row][col];
                const cx = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                const cy = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                if (t === 5) spawns.player.push({ x: cx, y: cy });
                if (t === 6) spawns.enemy.push({ x: cx, y: cy });
            }
        }
        // Fallback
        if (spawns.player.length === 0) spawns.player.push({ x: 150, y: 350 });
        if (spawns.enemy.length === 0) spawns.enemy.push({ x: 850, y: 350 });
        return spawns;
    }

    _isAreaWalkable(x, y, halfW = 16, halfH = halfW) {
        const samples = [
            [0, 0],
            [-halfW, 0], [halfW, 0], [0, -halfH], [0, halfH],
            [-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH],
            [-halfW * 0.6, 0], [halfW * 0.6, 0], [0, -halfH * 0.6], [0, halfH * 0.6],
        ];
        return samples.every(([dx, dy]) => this._isTileWalkable(x + dx, y + dy));
    }

    _isDamageZonePlacementWalkable(x, y, radius) {
        const ring = [
            [0, 0],
            [radius * 0.75, 0], [-radius * 0.75, 0], [0, radius * 0.75], [0, -radius * 0.75],
            [radius * 0.55, radius * 0.55], [radius * 0.55, -radius * 0.55],
            [-radius * 0.55, radius * 0.55], [-radius * 0.55, -radius * 0.55],
        ];
        return ring.every(([dx, dy]) => this._isTileWalkable(x + dx, y + dy));
    }

    _isFireJetPlacementWalkable(x, y, direction, width, length) {
        const edgeX = width * 0.65;
        for (let t = 0; t <= 1; t += 0.25) {
            const py = y + direction * length * t;
            for (const dx of [0, -edgeX, edgeX]) {
                if (!this._isTileWalkable(x + dx, py)) return false;
            }
        }
        return true;
    }

    _isConveyorPlacementWalkable(x, y, width, height) {
        const xs = [x + 8, x + width / 2, x + width - 8];
        const ys = [y + 6, y + height / 2, y + height - 6];
        for (const px of xs) {
            for (const py of ys) {
                if (!this._isTileWalkable(px, py)) return false;
            }
        }
        return true;
    }

    _getRandomWalkablePoint(edge = null, minDistanceFromPlayer = 0, halfW = 16, halfH = halfW, validator = null) {
        const candidates = [];
        const cols = this.tileCols;
        const rows = this.tileRows;
        for (let row = 1; row < rows - 1; row++) {
            for (let col = 1; col < cols - 1; col++) {
                const t = this.tileGrid[row][col];
                if (t < 1 || t === 3 || t === 7) continue;
                const x = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                const y = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                if (!this._isTileWalkable(x, y)) continue;
                if (!this._isAreaWalkable(x, y, halfW, halfH)) continue;
                if (this.player && minDistanceFromPlayer > 0) {
                    const d = Math.hypot(this.player.x - x, this.player.y - y);
                    if (d < minDistanceFromPlayer) continue;
                }
                if (edge) {
                    const left = col < cols * 0.35;
                    const right = col > cols * 0.65;
                    const top = row < rows * 0.35;
                    const bottom = row > rows * 0.65;
                    if (edge === 'left' && !left) continue;
                    if (edge === 'right' && !right) continue;
                    if (edge === 'top' && !top) continue;
                    if (edge === 'bottom' && !bottom) continue;
                }
                if (validator && !validator(x, y)) continue;
                candidates.push({ x, y });
            }
        }
        if (candidates.length === 0 && edge) return this._getRandomWalkablePoint(null, minDistanceFromPlayer, halfW, halfH, validator);
        if (candidates.length === 0) return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    _snapToWalkablePoint(x, y, halfW = 16, halfH = halfW) {
        if (this._isAreaWalkable(x, y, halfW, halfH)) return { x, y };
        let best = null;
        let bestD = Infinity;
        for (let row = 1; row < this.tileRows - 1; row++) {
            for (let col = 1; col < this.tileCols - 1; col++) {
                const t = this.tileGrid[row][col];
                if (t < 1 || t === 3 || t === 7) continue;
                const cx = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                const cy = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                if (!this._isAreaWalkable(cx, cy, halfW, halfH)) continue;
                const d = (cx - x) ** 2 + (cy - y) ** 2;
                if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
            }
        }
        return best || { x, y };
    }

    _isTileWalkable(worldX, worldY) {
        // Pixel-perfect collision when a walk mask is loaded.
        // Tiles still own dynamic blockers (breakables=3, TNT=7), so we
        // check those after the pixel test.
        if (this.walkMask) {
            if (!this._isWalkablePixel(worldX, worldY)) return false;
            const col = Math.floor((worldX - this.tileOffX) / TILE_SIZE);
            const row = Math.floor((worldY - this.tileOffY) / TILE_SIZE);
            if (row < 0 || row >= this.tileRows || col < 0 || col >= this.tileCols) return false;
            const t = this.tileGrid[row][col];
            return t !== 3 && t !== 7;
        }
        const col = Math.floor((worldX - this.tileOffX) / TILE_SIZE);
        const row = Math.floor((worldY - this.tileOffY) / TILE_SIZE);
        if (row < 0 || row >= this.tileRows || col < 0 || col >= this.tileCols) return false;
        const t = this.tileGrid[row][col];
        return t >= 1 && t !== 3 && t !== 7; // floor, hazard, spawn, teleporter — not wall, breakable, or TNT
    }

    _breakTileAt(worldX, worldY) {
        const col = Math.floor((worldX - this.tileOffX) / TILE_SIZE);
        const row = Math.floor((worldY - this.tileOffY) / TILE_SIZE);
        if (row < 0 || row >= this.tileRows || col < 0 || col >= this.tileCols) return;
        const tile = this.tileGrid[row][col];
        if (tile === 3 || tile === 7) {
            this.tileGrid[row][col] = 1; // become floor
            const tx = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
            const ty = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;

            if (tile === 7) {
                // TNT crates remain explosive hazards.
                this._spawnExplosionSprite(tx, ty, 140);
                this.particles.bigExplosion(tx, ty);
                if (this.audio) this.audio.playBombExplosion?.(1);
                this.cameras.main.shake(200, 0.02);

                const allBots = [this.player, ...this.enemies];
                for (const bot of allBots) {
                    const d = Math.sqrt((bot.x - tx) ** 2 + (bot.y - ty) ** 2);
                    if (d < 100) {
                        bot.takeDamage(Math.round(50 * (1 - d / 100)), null);
                        bot.applyKnockback(Math.atan2(bot.y - ty, bot.x - tx), 250);
                    }
                }

                for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
                    const nr = row + dr, nc = col + dc;
                    if (nr >= 0 && nr < this.tileRows && nc >= 0 && nc < this.tileCols) {
                        const adj = this.tileGrid[nr][nc];
                        if (adj === 7 || adj === 3) {
                            this.time.delayedCall(150, () => {
                                this._breakTileAt(this.tileOffX + nc * TILE_SIZE + TILE_SIZE / 2,
                                    this.tileOffY + nr * TILE_SIZE + TILE_SIZE / 2);
                            });
                        }
                    }
                }
                this._damageHazardsAt(tx, ty, 100, null);
            }

            this._spawnHealthPickup(tx, ty);
            this._spawnScrapPickup(tx, ty);

            if (this.tileSprites) {
                const spr = this.tileSprites[`${row},${col}`];
                if (spr) {
                    if (tile === 7) spr.destroy();
                    else this._playBreakableCrateFrame(spr);
                    delete this.tileSprites[`${row},${col}`];
                }
            }

            if (!this.usePaintedBg) {
                const floorGfx = this.add.graphics().setDepth(0);
                floorGfx.fillStyle(this.arenaData.floorColor, 1);
                floorGfx.fillRect(this.tileOffX + col * TILE_SIZE, this.tileOffY + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                floorGfx.lineStyle(1, this.arenaData.wallColor, 0.08);
                floorGfx.strokeRect(this.tileOffX + col * TILE_SIZE, this.tileOffY + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    _constrainBotToTiles(bot) {
        const s = bot.size * 0.55;

        // Wall slide: check X and Y separately so you slide along walls
        // Check X movement
        if (!this._isTileWalkable(bot.x + s, bot.y) || !this._isTileWalkable(bot.x - s, bot.y)) {
            // Blocked horizontally — revert X, keep Y (slide vertically)
            const col = Math.floor((bot.x - this.tileOffX) / TILE_SIZE);
            const tileEdgeR = this.tileOffX + (col + 1) * TILE_SIZE;
            const tileEdgeL = this.tileOffX + col * TILE_SIZE;
            if (!this._isTileWalkable(bot.x + s, bot.y)) {
                bot.x = Math.min(bot.x, tileEdgeR - s - 1);
            }
            if (!this._isTileWalkable(bot.x - s, bot.y)) {
                bot.x = Math.max(bot.x, tileEdgeL + s + 1);
            }
        }

        // Check Y movement
        if (!this._isTileWalkable(bot.x, bot.y + s) || !this._isTileWalkable(bot.x, bot.y - s)) {
            const row = Math.floor((bot.y - this.tileOffY) / TILE_SIZE);
            const tileEdgeB = this.tileOffY + (row + 1) * TILE_SIZE;
            const tileEdgeT = this.tileOffY + row * TILE_SIZE;
            if (!this._isTileWalkable(bot.x, bot.y + s)) {
                bot.y = Math.min(bot.y, tileEdgeB - s - 1);
            }
            if (!this._isTileWalkable(bot.x, bot.y - s)) {
                bot.y = Math.max(bot.y, tileEdgeT + s + 1);
            }
        }

        // Bounds
        const minX = this.tileOffX + TILE_SIZE + s;
        const maxX = this.tileOffX + (this.tileCols - 1) * TILE_SIZE - s;
        const minY = this.tileOffY + TILE_SIZE + s;
        const maxY = this.tileOffY + (this.tileRows - 1) * TILE_SIZE - s;
        bot.x = Math.max(minX, Math.min(maxX, bot.x));
        bot.y = Math.max(minY, Math.min(maxY, bot.y));
    }

    _pushBotsApart() {
        const allBots = [this.player, ...this.enemies];
        for (let i = 0; i < allBots.length; i++) {
            for (let j = i + 1; j < allBots.length; j++) {
                const a = allBots[i], b = allBots[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = (a.size + b.size) * 0.7;
                if (dist < minDist && dist > 0) {
                    const push = (minDist - dist) / 2;
                    const nx = dx / dist, ny = dy / dist;
                    a.x -= nx * push;
                    a.y -= ny * push;
                    b.x += nx * push;
                    b.y += ny * push;
                }
            }
        }
    }

    _checkTeleporters(bot) {
        if (bot._teleportCooldown && Date.now() < bot._teleportCooldown) return;
        const col = Math.floor((bot.x - this.tileOffX) / TILE_SIZE);
        const row = Math.floor((bot.y - this.tileOffY) / TILE_SIZE);
        if (row < 0 || row >= this.tileRows || col < 0 || col >= this.tileCols) return;
        if (this.tileGrid[row][col] !== 8) return;
        this._runTeleporter(bot, {
            x: this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2,
            y: this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2,
        });
    }

    _createHazards() {
        if (this.hazardsInitialized) return;
        this.hazardsInitialized = true;
        const aliasMap = {
            junkPiles: 'explosiveBarrels',
            conveyors: 'spikeTraps',
            pistons: 'spikeTraps',
            fireJets: 'lavaPools',
            laserGrid: 'electricFloor',
            vacuumVents: 'teleporters',
            asteroids: 'explosiveBarrels',
        };
        const hazardTypes = (this.arenaData.hazards || []).map((type) => aliasMap[type] || type);

        for (const type of hazardTypes) {
            switch (type) {
                case 'lavaPools': {
                    for (let i = 0; i < 2; i++) {
                        const radius = 42;
                        const p = this._getHazardSpawnPoint(110, radius, radius + 10, radius + 10,
                            (x, y) => this._isDamageZonePlacementWalkable(x, y, radius));
                        if (!p) continue;
                        this._addHazard({
                            type: 'lava_pool',
                            x: p.x,
                            y: p.y,
                            radius,
                            size: 96,
                            damage: 8,
                            tickRate: 500,
                            lastTick: 0,
                        });
                    }
                    break;
                }
                case 'acidPools': {
                    for (let i = 0; i < 2; i++) {
                        const radius = 42;
                        const p = this._getHazardSpawnPoint(110, radius, radius + 10, radius + 10,
                            (x, y) => this._isDamageZonePlacementWalkable(x, y, radius));
                        if (!p) continue;
                        this._addHazard({
                            type: 'acid_pool',
                            x: p.x,
                            y: p.y,
                            radius,
                            size: 96,
                            damage: 7,
                            tickRate: 500,
                            lastTick: 0,
                            slowPercent: 0.3,
                        });
                    }
                    break;
                }
                case 'electricFloor': {
                    const count = this.isBossFight ? 1 : 2;
                    const minDistance = this.isBossFight ? 170 : 110;
                    for (let i = 0; i < count; i++) {
                        const radius = 46;
                        const p = this._getHazardSpawnPoint(minDistance, radius, radius + 10, radius + 10,
                            (x, y) => this._isDamageZonePlacementWalkable(x, y, radius));
                        if (!p) continue;
                        this._addHazard({
                            type: 'electric_floor',
                            x: p.x,
                            y: p.y,
                            radius,
                            size: 100,
                            damage: 5,
                            tickRate: this.isBossFight ? 700 : 400,
                            lastTick: 0,
                            disableDuration: this.isBossFight ? 140 : 280,
                        });
                    }
                    break;
                }
                case 'spikeTraps': {
                    for (let i = 0; i < 3; i++) {
                        const p = this._getHazardSpawnPoint(100, 28, 28, 28);
                        if (!p) continue;
                        this._addHazard({
                            type: 'spike_trap',
                            x: p.x,
                            y: p.y,
                            radius: 28,
                            damageRadius: 24,
                            size: 76,
                            damage: 14,
                            tickRate: 250,
                            lastTick: 0,
                            active: false,
                            timer: 900 + Math.random() * 1100,
                            activeDuration: 850,
                            raiseDuration: 140,
                            lowerDuration: 120,
                            cooldown: 1500,
                        });
                    }
                    break;
                }
                case 'explosiveBarrels': {
                    for (let i = 0; i < 3; i++) {
                        const p = this._getHazardSpawnPoint(100, 24, 28, 28);
                        if (!p) continue;
                        this._addHazard({
                            type: 'explosive_barrel',
                            x: p.x,
                            y: p.y,
                            radius: 24,
                            size: 72,
                            blastRadius: 110,
                            damage: 52,
                        });
                    }
                    break;
                }
                case 'teleporters': {
                    for (let i = 0; i < 3; i++) {
                        const p = this._getHazardSpawnPoint(120, 30, 30, 30);
                        if (!p) continue;
                        this._addHazard({
                            type: 'teleporter_pad',
                            x: p.x,
                            y: p.y,
                            radius: 30,
                            size: 84,
                        });
                    }
                    break;
                }
            }
        }

        this._createBreakableProps();
    }

    _isHazardPlacementClear(x, y, radius, padding = 26) {
        return this.hazards.every((hazard) =>
            Math.hypot(hazard.x - x, hazard.y - y) > (hazard.radius || 28) + radius + padding
        );
    }

    _getHazardSpawnPoint(minDistanceFromPlayer, radius, halfW = radius, halfH = halfW, validator = null) {
        const isValid = (x, y) =>
            this._isAreaWalkable(x, y, halfW, halfH)
            && this._isHazardPlacementClear(x, y, radius, 34)
            && (!validator || validator(x, y));

        for (let i = 0; i < 8; i++) {
            const p = this._getRandomWalkablePoint(null, minDistanceFromPlayer, halfW, halfH, isValid);
            if (p && isValid(p.x, p.y)) return p;
        }

        const candidates = [];
        for (let row = 1; row < this.tileRows - 1; row++) {
            for (let col = 1; col < this.tileCols - 1; col++) {
                const t = this.tileGrid[row][col];
                if (t < 1 || t === 3 || t === 7) continue;
                const x = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                const y = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                if (this.player && minDistanceFromPlayer > 0) {
                    const d = Math.hypot(this.player.x - x, this.player.y - y);
                    if (d < minDistanceFromPlayer) continue;
                }
                if (!isValid(x, y)) continue;
                candidates.push({ x, y });
            }
        }

        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    _createBreakableProps() {
        const shape = ARENA_SHAPES[this.arenaKey] || {};
        const requested = shape.breakables || 0;
        const count = Math.max(1, Math.min(3, Math.floor(requested / 4)));

        for (let i = 0; i < count; i++) {
            const isBox = Math.random() < 0.6 && this.textures.exists('hazard_box');
            const radius = isBox ? 18 : 20;
            const size = isBox ? 56 : 62;
            const p = this._getHazardSpawnPoint(140, radius, radius + 8, radius + 8);
            if (!p) continue;
            this._addHazard({
                type: 'breakable_prop',
                x: p.x,
                y: p.y,
                radius,
                size,
                assetKey: isBox ? 'hazard_box' : 'hazard_breakable_wall',
                variant: isBox ? 'box' : 'wall',
                dropLoot: true,
            });
        }
    }

    _spawnExplosionSprite(x, y, size = 120) {
        if (!this.textures.exists('proj_explosion')) return null;
        const sprite = this.add.sprite(x, y, 'proj_explosion', 3)
            .setDisplaySize(size, size)
            .setDepth(120);
        this.time.delayedCall(260, () => {
            if (sprite.active) sprite.destroy();
        });
        return sprite;
    }

    _playBreakableCrateFrame(sprite, delay = 110) {
        if (!sprite || !sprite.active) return;
        if (this.textures.exists('hazard_tnt_crate')) {
            const debris = this.add.sprite(sprite.x, sprite.y, 'hazard_tnt_crate', 3)
                .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
                .setDepth(sprite.depth)
                .setAlpha(0.9);
            sprite.destroy();
            this.time.delayedCall(delay, () => {
                if (debris.active) debris.destroy();
            });
            return;
        }
        sprite.setFrame(3);
        sprite.setAlpha(0.9);
        this.time.delayedCall(delay, () => {
            if (sprite.active) sprite.destroy();
        });
    }

    _damageHazardsAt(x, y, radius = 24, source = null) {
        let hitHazard = false;
        for (const hazard of [...this.hazards]) {
            if (hazard._destroyed) continue;
            const hitRadius = radius + (hazard.radius || 24);
            if (Math.hypot(hazard.x - x, hazard.y - y) > hitRadius) continue;
            if (hazard.type === 'explosive_barrel') {
                this._explodeBarrel(hazard, source);
                hitHazard = true;
            } else if (hazard.type === 'breakable_prop') {
                this._breakHazardProp(hazard, source);
                hitHazard = true;
            }
        }
        return hitHazard;
    }

    _breakHazardProp(hazard, source = null) {
        if (!hazard || hazard._destroyed) return;
        hazard._destroyed = true;

        const hx = hazard.x;
        const hy = hazard.y;

        if (hazard.dropLoot) {
            this._spawnHealthPickup(hx, hy);
            this._spawnScrapPickup(hx, hy);
        }

        if (hazard.sprite && hazard.sprite.active) {
            this._playBreakableCrateFrame(hazard.sprite);
        }
        if (hazard.gfx && hazard.gfx !== hazard.sprite && hazard.gfx.active) {
            hazard.gfx.destroy();
        }
        this.hazards = this.hazards.filter((h) => h !== hazard);
    }

    _explodeBarrel(barrel, source = null) {
        if (!barrel || barrel._destroyed) return;
        barrel._destroyed = true;

        const ex = barrel.x;
        const ey = barrel.y;
        const blastRadius = barrel.blastRadius || 110;
        const damage = barrel.damage || 52;

        this._spawnExplosionSprite(ex, ey, Math.max(120, blastRadius * 1.6));
        this.particles.bigExplosion(ex, ey);
        if (this.audio) this.audio.playBombExplosion?.(1);

        const allBots = [this.player, ...this.enemies];
        for (const bot of allBots) {
            const d = Math.hypot(bot.x - ex, bot.y - ey);
            if (d >= blastRadius) continue;
            const falloff = 1 - d / blastRadius;
            bot.takeDamage(Math.round(damage * falloff), source || null);
            bot.applyKnockback(Math.atan2(bot.y - ey, bot.x - ex), 180 * falloff);
        }

        for (let row = 0; row < this.tileRows; row++) {
            for (let col = 0; col < this.tileCols; col++) {
                if (this.tileGrid[row][col] !== 3 && this.tileGrid[row][col] !== 7) continue;
                const tx = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                const ty = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                if (Math.hypot(tx - ex, ty - ey) < blastRadius + 12) {
                    this._breakTileAt(tx, ty);
                }
            }
        }

        if (barrel.sprite && barrel.sprite.active) barrel.sprite.destroy();
        if (barrel.gfx && barrel.gfx !== barrel.sprite && barrel.gfx.active) barrel.gfx.destroy();
        this.hazards = this.hazards.filter((h) => h !== barrel);

        for (const hazard of [...this.hazards]) {
            if (hazard.type !== 'explosive_barrel' || hazard._destroyed) continue;
            if (Math.hypot(hazard.x - ex, hazard.y - ey) <= blastRadius + (hazard.radius || 24)) {
                this._explodeBarrel(hazard, source);
            }
        }
    }

    _runTeleporter(bot, pad) {
        if (bot._teleportCooldown && Date.now() < bot._teleportCooldown) return;
        const minDistance = Math.max(140, bot.size * 3.2);
        const dest = this._getHazardSpawnPoint(
            0,
            Math.max(20, bot.size * 0.6),
            bot.size * 0.6,
            bot.size * 0.6,
            (x, y) => Math.hypot(x - bot.x, y - bot.y) >= minDistance
                && Math.hypot(x - pad.x, y - pad.y) >= minDistance * 0.8
        );
        if (!dest) return;
        const snapped = this._snapToWalkablePoint(dest.x, dest.y, bot.size * 0.6, bot.size * 0.6);
        this.particles.electric(bot.x, bot.y, 12);
        bot.x = snapped.x;
        bot.y = snapped.y;
        bot.moveDir.x = 0;
        bot.moveDir.y = 0;
        bot.vx = 0;
        bot.vy = 0;
        if ('velX' in bot) bot.velX = 0;
        if ('velY' in bot) bot.velY = 0;
        bot._teleportCooldown = Date.now() + 1500;
        this.particles.electric(bot.x, bot.y, 12);
        if (this.audio) this.audio.playEMP();
    }

    _addHazard(hazard) {
        const spriteKey = {
            lava_pool: 'hazard_lava_pool',
            acid_pool: 'hazard_acid_pool',
            electric_floor: 'hazard_electric_floor',
            spike_trap: 'hazard_spike_trap',
            explosive_barrel: 'hazard_explosive_barrel',
            teleporter_pad: 'hazard_teleporter_pad',
            breakable_prop: hazard.assetKey,
        }[hazard.type];
        if (spriteKey && this.textures.exists(spriteKey)) {
            const sprite = this.add.sprite(hazard.x, hazard.y, spriteKey, 0)
                .setDisplaySize(hazard.size, hazard.size)
                .setDepth(hazard.type === 'explosive_barrel' ? 7 : 6);
            hazard.sprite = sprite;
            hazard.gfx = sprite;
            this.hazards.push(hazard);
            return;
        }

        const gfx = this.add.graphics().setDepth(5);

        const dk = (c, n = 70) => { const R = Math.max(0,((c>>16)&0xff)-n); const G = Math.max(0,((c>>8)&0xff)-n); const B = Math.max(0,(c&0xff)-n); return (R<<16)|(G<<8)|B; };
        const lt = (c, n = 50) => { const R = Math.min(255,((c>>16)&0xff)+n); const G = Math.min(255,((c>>8)&0xff)+n); const B = Math.min(255,(c&0xff)+n); return (R<<16)|(G<<8)|B; };
        const WH = 12; // 3D wall height

        switch (hazard.type) {
            case 'wall': {
                const hx = hazard.x, hy = hazard.y, hw = hazard.wallW, hh = hazard.wallH;
                const c = hazard.color;
                // Shadow on floor
                gfx.fillStyle(0x000000, 0.25);
                gfx.fillRect(hx + 5, hy + 5, hw, hh);
                // Right face (3D side)
                gfx.fillStyle(dk(c, 50), 1);
                const rightFace = [
                    { x: hx + hw, y: hy }, { x: hx + hw + WH * 0.5, y: hy - WH * 0.5 },
                    { x: hx + hw + WH * 0.5, y: hy + hh - WH * 0.5 }, { x: hx + hw, y: hy + hh },
                ];
                gfx.fillPoints(rightFace, true);
                gfx.lineStyle(3, 0x000000, 0.6);
                gfx.strokePoints(rightFace, true);
                // Top face (3D top)
                gfx.fillStyle(lt(c, 30), 1);
                const topFace = [
                    { x: hx, y: hy }, { x: hx + WH * 0.5, y: hy - WH * 0.5 },
                    { x: hx + hw + WH * 0.5, y: hy - WH * 0.5 }, { x: hx + hw, y: hy },
                ];
                gfx.fillPoints(topFace, true);
                gfx.lineStyle(3, 0x000000, 0.6);
                gfx.strokePoints(topFace, true);
                // Front face
                gfx.fillStyle(c, 1);
                gfx.fillRect(hx, hy, hw, hh);
                // Highlight band on front
                gfx.fillStyle(lt(c, 40), 0.3);
                gfx.fillRect(hx, hy, hw, hh * 0.25);
                // Front outline
                gfx.lineStyle(4, 0x000000, 0.7);
                gfx.strokeRect(hx, hy, hw, hh);
                break;
            }
            case 'obstacle': {
                // 3D cel-shaded pillar
                const ox = hazard.x, oy = hazard.y, or2 = hazard.radius;
                gfx.fillStyle(0x000000, 0.25);
                gfx.fillCircle(ox + 4, oy + 5, or2);
                gfx.fillStyle(dk(hazard.color), 1);
                gfx.fillCircle(ox, oy, or2);
                gfx.fillStyle(hazard.color, 1);
                gfx.fillCircle(ox, oy, or2 * 0.85);
                gfx.fillStyle(lt(hazard.color), 0.35);
                gfx.fillCircle(ox - or2 * 0.2, oy - or2 * 0.2, or2 * 0.5);
                gfx.lineStyle(4, 0x000000, 0.7);
                gfx.strokeCircle(ox, oy, or2);
                // Specular
                gfx.fillStyle(0xffffff, 0.3);
                gfx.fillCircle(ox - or2 * 0.25, oy - or2 * 0.3, or2 * 0.15);
                break;
            }
            case 'damage_zone':
                gfx.fillStyle(hazard.color, 0.15);
                gfx.fillCircle(hazard.x, hazard.y, hazard.radius);
                gfx.lineStyle(3, hazard.color, 0.4);
                gfx.strokeCircle(hazard.x, hazard.y, hazard.radius);
                gfx.lineStyle(2, 0x000000, 0.2);
                gfx.strokeCircle(hazard.x, hazard.y, hazard.radius + 2);
                break;
            case 'fire_jet':
                gfx.fillStyle(0x000000, 0.3);
                gfx.fillRect(hazard.x - 8 + 2, hazard.y - 5 + 2, 16, 10);
                gfx.fillStyle(COLORS.DARK_GRAY, 1);
                gfx.fillRect(hazard.x - 8, hazard.y - 5, 16, 10);
                gfx.lineStyle(3, 0x000000, 0.6);
                gfx.strokeRect(hazard.x - 8, hazard.y - 5, 16, 10);
                break;
            case 'conveyor':
                gfx.fillStyle(0x000000, 0.2);
                gfx.fillRect(hazard.x + 3, hazard.y + 3, hazard.width, hazard.height);
                gfx.fillStyle(0x444455, 0.7);
                gfx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
                gfx.lineStyle(3, 0x000000, 0.5);
                gfx.strokeRect(hazard.x, hazard.y, hazard.width, hazard.height);
                gfx.lineStyle(2, 0x666677, 0.3);
                for (let cx = hazard.x; cx < hazard.x + hazard.width; cx += 20) {
                    gfx.lineBetween(cx, hazard.y, cx + 10, hazard.y + hazard.height);
                }
                break;
        }

        hazard.gfx = gfx;
        this.hazards.push(hazard);
    }

    _updateHazards(delta) {
        const allBots = [this.player, ...this.enemies];

        for (const h of this.hazards) {
            switch (h.type) {
                case 'lava_pool':
                case 'acid_pool':
                case 'electric_floor': {
                    h.lastTick -= delta;
                    if (h.sprite) {
                        const frameRate = h.type === 'electric_floor' ? 130 : 180;
                        h.sprite.setFrame(Math.floor(Date.now() / frameRate) % 4);
                        h.sprite.setAlpha(0.84 + Math.sin(Date.now() * 0.004 + h.x * 0.01) * 0.12);
                    }

                    let applied = false;
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        if (Math.hypot(dx, dy) >= h.radius + bot.size) continue;
                        if (h.lastTick > 0) continue;

                        bot.takeDamage(h.damage, null);
                        if (h.type === 'lava_pool') {
                            this.particles.fire(bot.x, bot.y, Math.random() * Math.PI * 2, 26);
                        } else if (h.type === 'acid_pool') {
                            bot.addSlow?.(h.slowPercent || 0.3, 900);
                            this.particles.smoke(bot.x, bot.y, 0x88aa44);
                        } else {
                            if (h.disableDuration) bot.disable?.(h.disableDuration);
                            this.particles.electric(bot.x, bot.y, 5);
                        }
                        applied = true;
                    }
                    if (applied || h.lastTick <= 0) {
                        h.lastTick = h.tickRate;
                    }
                    break;
                }
                case 'spike_trap': {
                    h.timer -= delta;
                    h.lastTick -= delta;
                    if (h.timer <= 0) {
                        h.active = !h.active;
                        h.timer = h.active ? h.activeDuration : h.cooldown;
                        h.lastTick = 0;
                    }
                    const raiseDuration = h.raiseDuration || 0;
                    const lowerDuration = h.lowerDuration || 0;
                    const spikesUp = h.active
                        && h.timer <= h.activeDuration - raiseDuration
                        && h.timer > lowerDuration;
                    if (h.sprite) {
                        if (h.active) h.sprite.setFrame(spikesUp ? 2 : 1);
                        else if (h.timer < 420) h.sprite.setFrame(1);
                        else h.sprite.setFrame(0);
                    }
                    if (!spikesUp) break;

                    let applied = false;
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        if (Math.hypot(dx, dy) >= (h.damageRadius || h.radius) + bot.size * 0.35) continue;
                        if (h.lastTick > 0) continue;

                        bot.takeDamage(h.damage, null);
                        bot.applyKnockback(Math.atan2(dy, dx), 120);
                        this.particles.sparks(bot.x, bot.y, COLORS.YELLOW, 8);
                        applied = true;
                    }
                    if (applied || h.lastTick <= 0) {
                        h.lastTick = h.tickRate;
                    }
                    break;
                }
                case 'explosive_barrel':
                    if (h.sprite) {
                        h.sprite.setFrame(0);
                    }
                    break;
                case 'breakable_prop':
                    if (h.sprite) {
                        h.sprite.setFrame(0);
                    }
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        const dist = Math.hypot(dx, dy);
                        const minDist = h.radius + bot.size * 0.72;
                        if (dist > 0 && dist < minDist) {
                            const angle = Math.atan2(dy, dx);
                            bot.x = h.x + Math.cos(angle) * minDist;
                            bot.y = h.y + Math.sin(angle) * minDist;
                        }
                    }
                    break;
                case 'teleporter_pad':
                    if (h.sprite) {
                        h.sprite.setFrame(Math.floor(Date.now() / 160) % 4);
                        h.sprite.setAlpha(0.82 + Math.sin(Date.now() * 0.004 + h.y * 0.01) * 0.14);
                    }
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        if (Math.hypot(dx, dy) < h.radius + bot.size * 0.35) {
                            this._runTeleporter(bot, h);
                        }
                    }
                    break;
                case 'wall':
                    // AABB push bots out of rectangular walls
                    for (const bot of allBots) {
                        const bs = bot.size;
                        const wx1 = h.x - bs, wy1 = h.y - bs;
                        const wx2 = h.x + h.wallW + bs, wy2 = h.y + h.wallH + bs;
                        if (bot.x > wx1 && bot.x < wx2 && bot.y > wy1 && bot.y < wy2) {
                            // Find nearest edge to push out
                            const dLeft = bot.x - wx1, dRight = wx2 - bot.x;
                            const dTop = bot.y - wy1, dBottom = wy2 - bot.y;
                            const minD = Math.min(dLeft, dRight, dTop, dBottom);
                            if (minD === dLeft) bot.x = wx1;
                            else if (minD === dRight) bot.x = wx2;
                            else if (minD === dTop) bot.y = wy1;
                            else bot.y = wy2;
                        }
                    }
                    break;
                case 'obstacle':
                    // Push bots out of obstacles
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < h.radius + bot.size) {
                            const angle = Math.atan2(dy, dx);
                            bot.x = h.x + Math.cos(angle) * (h.radius + bot.size);
                            bot.y = h.y + Math.sin(angle) * (h.radius + bot.size);
                        }
                    }
                    break;
                case 'damage_zone':
                    h.lastTick -= delta;
                    for (const bot of allBots) {
                        const dx = bot.x - h.x;
                        const dy = bot.y - h.y;
                        if (Math.sqrt(dx * dx + dy * dy) < h.radius + bot.size) {
                            if (h.lastTick <= 0) {
                                bot.takeDamage(h.damage, null);
                                if (h.color === COLORS.LAVA) {
                                    this.particles.fire(bot.x, bot.y, Math.random() * Math.PI * 2);
                                } else {
                                    this.particles.electric(bot.x, bot.y, 4);
                                }
                            }
                        }
                    }
                    if (h.lastTick <= 0) h.lastTick = h.tickRate;
                    // Pulsing visual
                    const pulse = 0.15 + Math.sin(Date.now() * 0.003) * 0.1;
                    h.gfx.clear();
                    h.gfx.fillStyle(h.color, pulse);
                    h.gfx.fillCircle(h.x, h.y, h.radius);
                    h.gfx.lineStyle(1, h.color, pulse + 0.2);
                    h.gfx.strokeCircle(h.x, h.y, h.radius);
                    break;
                case 'fire_jet':
                    h.timer -= delta;
                    if (h.timer <= 0) {
                        h.active = !h.active;
                        h.timer = h.active ? h.duration : 2000 + Math.random() * 3000;
                    }
                    if (h.active) {
                        // Fire particles
                        this.particles.fire(h.x, h.y, h.direction * Math.PI / 2, h.length);
                        // Damage bots in jet
                        for (const bot of allBots) {
                            const inX = Math.abs(bot.x - h.x) < h.width;
                            const inY = h.direction > 0
                                ? (bot.y > h.y && bot.y < h.y + h.length)
                                : (bot.y < h.y && bot.y > h.y - h.length);
                            if (inX && inY) {
                                bot.takeDamage(h.damage * (delta / 1000), null);
                            }
                        }
                    }
                    break;
                case 'conveyor':
                    for (const bot of allBots) {
                        if (bot.x > h.x && bot.x < h.x + h.width &&
                            bot.y > h.y && bot.y < h.y + h.height) {
                            bot.x += h.force * h.direction * (delta / 1000);
                        }
                    }
                    break;
            }
        }
    }

    // ── Enemy Spawning ──
    _aiSpeedScale(diff) {
        return Math.min(1.08, 0.78 + (diff.speedMult || 0.5) * 0.28);
    }

    _spawnEnemy() {
        const r = this.arenaRect;
        const diffKey = this.registry.get('difficulty') || 'medium';
        const baseDiff = DIFFICULTY[diffKey];

        // Campaign scaling: enemies get tougher per level
        const levelScale = this.battleMode === 'campaign' ? 1 + (this.levelId - 1) * 0.12 : 1;
        const diff = {
            ...baseDiff,
            hpMult: baseDiff.hpMult * levelScale,
            damageMult: baseDiff.damageMult * levelScale,
            speedMult: Math.min(1.2, baseDiff.speedMult * (1 + (this.levelId - 1) * 0.04)),
            aiReaction: Math.max(300, baseDiff.aiReaction / (1 + (this.levelId - 1) * 0.08)),
            aiAccuracy: Math.min(0.85, baseDiff.aiAccuracy * levelScale),
        };

        // Arena-themed weapon pools — enemies use weapons that match the arena
        const arenaWeapons = {
            scrapyard: ['spinner', 'hammer', 'saw', 'mace'],
            factory:   ['drill', 'saw', 'hammer', 'spinner'],
            volcano:   ['flamethrower', 'axe', 'hammer', 'mace'],
            cyber:     ['tesla', 'plasma', 'emp', 'drill'],
            space:     ['railgun', 'missile', 'plasma', 'tesla'],
            jungle:    ['axe', 'saw', 'mace', 'flipper'],
            ice:       ['hammer', 'flipper', 'drill', 'spinner'],
            powerplant:['tesla', 'emp', 'drill', 'plasma'],
            quarry:    ['hammer', 'mace', 'axe', 'saw'],
            rainbow:   ['plasma', 'tesla', 'missile', 'flamethrower'],
        };
        const fallbackWeapons = ['spinner', 'hammer', 'flipper', 'saw'];
        let pool = arenaWeapons[this.arenaKey] || fallbackWeapons;
        // Campaign levels 4+ add harder weapons from pool
        if (this.battleMode === 'campaign' && this.levelId >= 4) {
            pool = [...pool, 'axe', 'flamethrower', 'mace'];
        }
        const enemyWeapon = pool[Math.floor(Math.random() * pool.length)];

        // Arena-themed skin colors — enemies match the arena palette
        const arenaColors = {
            scrapyard: [0x887755, 0x998866, 0x776644, 0xaa8855, 0x665533],
            factory:   [0x556688, 0x445577, 0x667799, 0x334466, 0x778899],
            volcano:   [0xcc4422, 0xaa3311, 0xff5533, 0xdd5522, 0x993311],
            cyber:     [0x33ff66, 0x22dd55, 0x44ee77, 0x55ff88, 0x11cc44],
            space:     [0x6688bb, 0x5577aa, 0x7799cc, 0x4466aa, 0x88aadd],
            jungle:    [0x448833, 0x337722, 0x559944, 0x226611, 0x66aa55],
            ice:       [0x88bbdd, 0x77aacc, 0x99ccee, 0x6699bb, 0xaaddff],
            powerplant:[0xddcc33, 0xccbb22, 0xeedd44, 0xbbaa11, 0xffee55],
            quarry:    [0x886644, 0x775533, 0x997755, 0x664422, 0xaa8866],
            rainbow:   [0xff44ff, 0x44ffff, 0xffff44, 0xff4444, 0x44ff44],
        };
        const colorPool = arenaColors[this.arenaKey] || [0x888888, 0x999999, 0x777777];
        const enemySkinColor = colorPool[Math.floor(Math.random() * colorPool.length)];

        // Pick a unique AI name
        const namePool = AI_BOT_NAMES[diffKey] || AI_BOT_NAMES.medium;
        let enemyName = namePool[Math.floor(Math.random() * namePool.length)];
        if (this.battleMode === 'campaign') {
            enemyName = `${enemyName} Lv.${this.levelId}`;
        }

        // All 4 chassis types used randomly
        const chassisPool = ['light', 'medium', 'heavy', 'titan'];
        const enemyChassis = chassisPool[Math.floor(Math.random() * chassisPool.length)];
        const ch = CHASSIS[enemyChassis];

        const rawSpawn = this.enemySpawns[Math.floor(Math.random() * this.enemySpawns.length)] || { x: r.x + r.width - 100, y: GAME_HEIGHT / 2 };
        const eSpawn = this._snapToWalkablePoint(
            rawSpawn.x + (Math.random() - 0.5) * 40,
            rawSpawn.y + (Math.random() - 0.5) * 40,
            ch.size * 0.6,
            ch.size * 0.6
        );
        const enemy = new Bot(this,
            eSpawn.x,
            eSpawn.y,
            {
                name: enemyName,
                weapon: enemyWeapon,
                skinColor: enemySkinColor,
                chassis: enemyChassis,
                hp: Math.round(ch.hp * diff.hpMult),
                speed: Math.round(ch.speed * this._aiSpeedScale(diff)),
                size: ch.size,
                armor: ch.armor,
            }
        );
        enemy.damageMult = diff.damageMult;

        if (this.arenaKey === 'ice') enemy.iceSlip = true;
        const ai = new AIController(this, enemy, diff);
        this.enemies.push(enemy);
        this.aiControllers.push(ai);
    }

    spawnMinion(x, y) {
        const diffKey = this.registry.get('difficulty') || 'medium';
        const diff = DIFFICULTY[diffKey];
        const r = this.arenaRect;

        const minionSpawn = this._snapToWalkablePoint(
            x + (Math.random() - 0.5) * 100,
            y + (Math.random() - 0.5) * 100,
            16,
            16
        );
        const minion = new Bot(this,
            minionSpawn.x,
            minionSpawn.y,
            {
                name: 'Minion',
                weapon: 'spinner',
                skinColor: 0x886644,
                chassis: 'light',
                hp: 40,
                speed: 160,
                size: 22,
                armor: 0,
            }
        );
        this._constrainBotToTiles(minion);
        if (this.arenaKey === 'ice') minion.iceSlip = true;

        const ai = new AIController(this, minion, { ...diff, aiReaction: 500, aiAccuracy: 0.5 });
        this.enemies.push(minion);
        this.aiControllers.push(ai);
    }

    // ── HUD ──
    _createHUD() {
        const headerY = 30;
        const footerY = GAME_HEIGHT - 30;

        addRowPanel(this, GAME_WIDTH / 2, headerY, GAME_WIDTH - 18, 56, 78, 0.88);
        this.add.rectangle(GAME_WIDTH / 2, headerY, GAME_WIDTH - 70, 28, 0x000000, 0.34).setDepth(79);
        addRowPanel(this, 156, headerY, 278, 38, 79, 0.82);
        addRowPanel(this, GAME_WIDTH / 2, headerY, 240, 38, 79, 0.84);
        addRowPanel(this, GAME_WIDTH - 156, headerY, 278, 38, 79, 0.82);

        addRowPanel(this, GAME_WIDTH / 2, footerY, GAME_WIDTH - 18, 58, 78, 0.88);
        this.add.rectangle(GAME_WIDTH / 2, footerY, GAME_WIDTH - 70, 30, 0x000000, 0.36).setDepth(79);
        addRowPanel(this, 156, footerY, 278, 38, 79, 0.82);
        addRowPanel(this, GAME_WIDTH / 2, footerY, 342, 38, 79, 0.84);
        addRowPanel(this, GAME_WIDTH - 156, footerY, 278, 38, 79, 0.82);

        this.hudPlayerName = this.add.text(28, 9, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#ffdd66', stroke: '#000000', strokeThickness: 2,
        }).setDepth(81);
        this.hudPlayerHp = this.add.text(284, 12, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(81);
        this.playerHpBar = addHpBar(this, 156, 38, 250, 16, 80, COLORS.GREEN);

        this.battleScrap = 0;

        this.hudEnemyName = this.add.text(GAME_WIDTH - 28, 9, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#ff4444', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(81);
        this.hudEnemyHp = this.add.text(GAME_WIDTH - 284, 12, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0).setDepth(81);
        this.enemyHpBar = addHpBar(this, GAME_WIDTH - 156, 38, 250, 16, 80, COLORS.GREEN);

        this.hudTimer = this.add.text(GAME_WIDTH / 2, headerY, '0:00', {
            fontSize: '20px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(83);

        this.hudCombo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 88, '', {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffaa33',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(81);

        this.bossHpBar = null;

        const weapon = WEAPONS[this.prog.weapon];
        this.hudWeapon = this.add.text(GAME_WIDTH / 2 - 12, footerY, weapon ? weapon.name.toUpperCase() : '', {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0.5).setDepth(83);
        this.hudWeaponSeparator = this.add.text(GAME_WIDTH / 2, footerY, '|', {
            fontSize: '10px', fontFamily: 'monospace', color: '#666666', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(83);
        this.hudWeaponSecondary = this.add.text(GAME_WIDTH / 2 + 12, footerY, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffaa33', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(83);

        if (this.textures.exists('ui_icon_skull')) {
            addIcon(this, 'ui_icon_skull', GAME_WIDTH - 246, footerY, 16, 82);
        }
        this.hudEnemyCount = this.add.text(GAME_WIDTH - 226, footerY, 'x1', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ff6666', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(83);

        this.hudEnergyBarWidth = 170;
        this.hudEnergyBg = this.add.rectangle(156, footerY + 8, this.hudEnergyBarWidth, 8, 0x111122).setDepth(80);
        this.hudEnergyFill = this.add.rectangle(156 - this.hudEnergyBarWidth / 2, footerY + 8, this.hudEnergyBarWidth, 8, 0x3388ff).setOrigin(0, 0.5).setDepth(81);
        this.hudEnergyLabel = this.add.text(68, footerY - 17, 'ENERGY GRID', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffaa33', stroke: '#000000', strokeThickness: 2,
        }).setDepth(83);
        this.hudEnergyValue = this.add.text(244, footerY - 17, '100 / 100', {
            fontSize: '9px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(83);

        this.hudDodgeReady = this.add.text(GAME_WIDTH - 28, footerY, 'DODGE READY', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffdd66', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0.5).setDepth(83);
        this.hudSupportReady = this.add.text(GAME_WIDTH - 226, footerY + 11, '', {
            fontSize: '9px', fontFamily: 'monospace', color: '#999999', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(83);
    }

    _updateHUD() {
        this.hudPlayerName.setText(this.player.name);
        this.hudPlayerHp.setText(`${Math.round(this.player.hp)}/${this.player.maxHp}`);
        if (this.playerHpBar) {
            this._setHudHpBar(this.playerHpBar, this.player.hp, this.player.maxHp);
        }

        const mainEnemy = this.boss || this.enemies[0];
        if (mainEnemy) {
            this.hudEnemyName.setText(mainEnemy.name);
            this.hudEnemyHp.setText(`${Math.round(mainEnemy.hp)}/${mainEnemy.maxHp}`);
            if (this.enemyHpBar) {
                this._setHudHpBar(this.enemyHpBar, mainEnemy.hp, mainEnemy.maxHp);
            }
        } else {
            this.hudEnemyName.setText('ARENA CLEAR');
            this.hudEnemyHp.setText('--');
            if (this.enemyHpBar) this._setHudHpBar(this.enemyHpBar, 0, 1);
        }

        const secs = Math.floor(this.battleTimer / 1000);
        const mins = Math.floor(secs / 60);
        this.hudTimer.setText(`${mins}:${(secs % 60).toString().padStart(2, '0')}`);

        if (this.isSurvival) {
            this.hudCombo.setText(`WAVE ${this.survivalWave}  |  KILLS: ${this.survivalKills}`);
            this.hudCombo.setAlpha(1);
        } else if (this.comboCount > 1) {
            this.hudCombo.setText(`${this.comboCount}x COMBO`);
            this.hudCombo.setAlpha(1);
        } else {
            this.hudCombo.setAlpha(0);
        }

        if (this.hudEnergyFill) {
            const eRatio = Math.max(0, this.player.energy / this.player.maxEnergy);
            this.hudEnergyFill.width = this.hudEnergyBarWidth * eRatio;
        }
        if (this.hudEnergyValue) {
            this.hudEnergyValue.setText(`${Math.round(this.player.energy)} / ${this.player.maxEnergy}`);
        }

        if (this.hudDodgeReady) {
            if (this.player.blocking) {
                this.hudDodgeReady.setText('BLOCKING');
                this.hudDodgeReady.setColor('#ffaa33');
            } else {
                const ready = Date.now() >= this.player.dodgeCooldownEnd && this.player.energy >= 25;
                this.hudDodgeReady.setText(ready ? 'DODGE READY' : 'DODGE RECHARGING');
                this.hudDodgeReady.setColor(ready ? '#ffdd66' : '#555555');
            }
        }

        if (this.hudWeapon) {
            const w = WEAPONS[this.player.weaponKey];
            const secondary = this.player.secondaryWeaponKey ? WEAPONS[this.player.secondaryWeaponKey] : null;
            this.hudWeapon.setText(w ? w.name.toUpperCase() : '');
            this.hudWeaponSecondary.setText(secondary ? `ALT  ${secondary.name.toUpperCase()}` : 'ALT  NONE');
        }

        if (this.hudSupportReady) {
            const active = WEAPONS[this.player.weaponKey];
            if (active?.category === 'bomb') {
                if (this.player.bombActive) {
                    this.hudSupportReady.setText('BOMB LIVE');
                    this.hudSupportReady.setColor('#ffaa33');
                } else if (Date.now() < this.player.bombCooldownEnd) {
                    this.hudSupportReady.setText('BOMB REARM');
                    this.hudSupportReady.setColor('#777777');
                } else if (this.player.energy < (ENERGY_CONFIG.attackCosts.bomb || 30)) {
                    this.hudSupportReady.setText('LOW ENERGY');
                    this.hudSupportReady.setColor('#ff4444');
                } else {
                    this.hudSupportReady.setText('BOMB READY');
                    this.hudSupportReady.setColor('#ffdd66');
                }
            } else {
                this.hudSupportReady.setText('');
                this.hudSupportReady.setColor('#ff4444');
            }
        }

        if (this.hudEnemyCount) {
            this.hudEnemyCount.setText(`x${Math.max(0, this.enemies.filter(e => e.alive).length)}`);
        }
    }

    _setHudHpBar(bar, hp, maxHp) {
        const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
        bar.fill.setScale(ratio, 1);
        bar.fill.setFillStyle(ratio <= 0.3 ? COLORS.RED : COLORS.GREEN, 1);
    }

    // ── Touch Controls ──
    _createTouchControls() {
        if (!this.sys.game.device.input.touch) return;

        const D = 200; // depth for touch UI
        this.touchJoystick = { active: false, dx: 0, dy: 0, baseX: 100, baseY: GAME_HEIGHT - 130 };
        this.touchAttackPressed = false;
        this.touchDodgePressed = false;
        this.touchBombPressed = false;
        this.touchSwapPressed = false;

        if (this._createDomTouchControls()) return;

        // ── Left: Virtual Joystick ──
        const jbx = 100, jby = GAME_HEIGHT - 130;
        this.add.circle(jbx, jby, 55, 0x000000, 0.3).setDepth(D).setStrokeStyle(3, 0x444444, 0.5);
        const joyStick = this.add.circle(jbx, jby, 22, 0x888888, 0.5).setDepth(D + 1);

        // Track joystick pointer separately
        this.input.on('pointermove', (ptr) => {
            if (!ptr.isDown) return;
            // Only left side of screen for joystick
            if (ptr.downX > GAME_WIDTH / 2) return;
            const dx = ptr.x - jbx, dy = ptr.y - jby;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 130) {
                this.touchJoystick.active = true;
                const cd = Math.min(dist, 50);
                const ang = Math.atan2(dy, dx);
                joyStick.setPosition(jbx + Math.cos(ang) * cd, jby + Math.sin(ang) * cd);
                this.touchJoystick.dx = (cd / 50) * Math.cos(ang);
                this.touchJoystick.dy = (cd / 50) * Math.sin(ang);
            }
        });
        this.input.on('pointerup', (ptr) => {
            if (ptr.downX < GAME_WIDTH / 2) {
                this.touchJoystick.active = false;
                this.touchJoystick.dx = 0;
                this.touchJoystick.dy = 0;
                joyStick.setPosition(jbx, jby);
            }
        });

        // ── Right: Action Buttons ──
        const makeBtn = (x, y, r, label, color, onDown) => {
            const bg = this.add.circle(x, y, r, 0x000000, 0.3)
                .setDepth(D).setStrokeStyle(3, color, 0.6).setInteractive();
            this.add.text(x, y, label, {
                fontSize: r > 30 ? '13px' : '10px', fontFamily: 'monospace', color: '#ffffff',
            }).setOrigin(0.5).setDepth(D + 1);
            bg.on('pointerdown', onDown);
            return bg;
        };

        // Attack — big button
        makeBtn(GAME_WIDTH - 90, GAME_HEIGHT - 120, 38, 'ATK', 0xff3333, () => { this.touchAttackPressed = true; });

        // Dodge — above attack
        makeBtn(GAME_WIDTH - 150, GAME_HEIGHT - 160, 28, 'DODGE', 0x33ff88, () => { this.touchDodgePressed = true; });

        // Active weapon helper — attack if bomb is active, otherwise mirrors attack
        makeBtn(GAME_WIDTH - 160, GAME_HEIGHT - 100, 28, 'USE', 0xffaa33, () => { this.touchAttackPressed = true; });

        // Swap — small, below dodge
        makeBtn(GAME_WIDTH - 90, GAME_HEIGHT - 50, 22, 'SWAP', 0x8888ff, () => { this.touchSwapPressed = true; });

        // Block — hold zone (bottom-left, near joystick)
        const blockZone = this.add.circle(200, GAME_HEIGHT - 60, 25, 0x000000, 0.25)
            .setDepth(D).setStrokeStyle(2, 0x3388ff, 0.5).setInteractive();
        this.add.text(200, GAME_HEIGHT - 60, 'BLK', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffaa33',
        }).setOrigin(0.5).setDepth(D + 1);
        blockZone.on('pointerdown', () => { this.player.blocking = true; });
        blockZone.on('pointerup', () => { this.player.blocking = false; });
    }

    _createDomTouchControls() {
        if (typeof document === 'undefined') return false;

        this._destroyDomTouchControls();

        const root = document.createElement('div');
        root.id = 'battle-touch-controls';
        root.setAttribute('aria-hidden', 'true');

        const joystick = document.createElement('div');
        joystick.className = 'touch-joystick';
        const knob = document.createElement('div');
        knob.className = 'touch-joystick-knob';
        joystick.appendChild(knob);
        root.appendChild(joystick);

        const actions = document.createElement('div');
        actions.className = 'touch-actions';
        root.appendChild(actions);

        const makeButton = (label, className, onDown, onUp = null) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `touch-action-btn ${className}`;
            btn.textContent = label;
            const down = (event) => {
                event.preventDefault();
                onDown();
            };
            const up = (event) => {
                event.preventDefault();
                if (onUp) onUp();
            };
            btn.addEventListener('pointerdown', down, { passive: false });
            btn.addEventListener('pointerup', up, { passive: false });
            btn.addEventListener('pointercancel', up, { passive: false });
            actions.appendChild(btn);
            return btn;
        };

        makeButton('DODGE', 'touch-dodge', () => { this.touchDodgePressed = true; });
        makeButton('ATK', 'touch-attack', () => { this.touchAttackPressed = true; });
        makeButton('USE', 'touch-use', () => { this.touchAttackPressed = true; });
        makeButton('SWAP', 'touch-swap', () => { this.touchSwapPressed = true; });
        makeButton('BLK', 'touch-block', () => { if (this.player) this.player.blocking = true; }, () => {
            if (this.player) this.player.blocking = false;
        });

        document.body.appendChild(root);

        let joystickPointerId = null;
        const updateJoystick = (event) => {
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            const dist = Math.hypot(dx, dy);
            const maxDist = 50;
            const clamped = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);
            const knobX = Math.cos(angle) * clamped;
            const knobY = Math.sin(angle) * clamped;

            knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
            this.touchJoystick.active = true;
            this.touchJoystick.dx = maxDist > 0 ? knobX / maxDist : 0;
            this.touchJoystick.dy = maxDist > 0 ? knobY / maxDist : 0;
        };

        const resetJoystick = () => {
            joystickPointerId = null;
            knob.style.transform = 'translate(-50%, -50%)';
            this.touchJoystick.active = false;
            this.touchJoystick.dx = 0;
            this.touchJoystick.dy = 0;
        };

        joystick.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            joystickPointerId = event.pointerId;
            joystick.setPointerCapture(event.pointerId);
            updateJoystick(event);
        }, { passive: false });
        joystick.addEventListener('pointermove', (event) => {
            if (event.pointerId !== joystickPointerId) return;
            event.preventDefault();
            updateJoystick(event);
        }, { passive: false });
        joystick.addEventListener('pointerup', (event) => {
            if (event.pointerId !== joystickPointerId) return;
            event.preventDefault();
            resetJoystick();
        }, { passive: false });
        joystick.addEventListener('pointercancel', (event) => {
            if (event.pointerId !== joystickPointerId) return;
            event.preventDefault();
            resetJoystick();
        }, { passive: false });

        const layoutControls = () => {
            const canvas = this.sys.game.canvas;
            const rect = canvas.getBoundingClientRect();
            const vw = window.innerWidth;
            const leftGutter = Math.max(0, rect.left);
            const rightGutter = Math.max(0, vw - rect.right);
            const controlY = Math.round(window.innerHeight / 2);

            const joystickX = leftGutter >= 132
                ? Math.round(leftGutter / 2)
                : Math.round(rect.left + 82);
            const actionsX = rightGutter >= 156
                ? Math.round(rect.right + rightGutter / 2)
                : Math.round(rect.right - 88);

            joystick.style.left = `${joystickX}px`;
            joystick.style.top = `${controlY}px`;
            actions.style.left = `${actionsX}px`;
            actions.style.top = `${controlY}px`;
        };

        layoutControls();
        window.addEventListener('resize', layoutControls);
        window.addEventListener('orientationchange', layoutControls);

        this.domTouchControls = {
            root,
            layoutControls,
            cleanup: () => {
                window.removeEventListener('resize', layoutControls);
                window.removeEventListener('orientationchange', layoutControls);
                root.remove();
                if (this.player) this.player.blocking = false;
                resetJoystick();
            },
        };
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._destroyDomTouchControls());

        return true;
    }

    _destroyDomTouchControls() {
        if (!this.domTouchControls) return;
        this.domTouchControls.cleanup();
        this.domTouchControls = null;
    }

    // ── Wave Survival ──
    _startSurvivalWave() {
        const wave = this.survivalWave;

        // Wave announcement
        const waveText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, `WAVE ${wave}`, {
            fontSize: '48px', fontFamily: 'monospace', color: '#ff4466',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(200).setAlpha(0);

        this.tweens.add({
            targets: waveText, alpha: 1, scale: { from: 2, to: 1 },
            duration: 400, ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: waveText, alpha: 0, y: waveText.y - 40,
                    duration: 600, delay: 800,
                    onComplete: () => waveText.destroy(),
                });
            },
        });

        // Heal player between waves (partial)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.25);
        this.player.energy = this.player.maxEnergy;

        // Spawn enemies — count increases with wave, difficulty scales
        const enemyCount = Math.min(1 + Math.floor(wave / 2), 5);
        const r = this.arenaRect;

        this.time.delayedCall(1200, () => {
            for (let e = 0; e < enemyCount; e++) {
                const edges = ['right', 'left', 'top', 'bottom'];
                const spawn = this._getRandomWalkablePoint(edges[Math.floor(Math.random() * edges.length)], 180);
                const spawnX = spawn.x;
                const spawnY = spawn.y;

                // Scale difficulty with wave
                const waveDiffMult = Math.min(1 + wave * 0.08, 2.5);
                const diffKey = this.registry.get('difficulty') || 'medium';
                const baseDiff = DIFFICULTY[diffKey];
                const waveDiff = {
                    ...baseDiff,
                    aiReaction: Math.max(200, baseDiff.aiReaction / waveDiffMult),
                    aiAccuracy: Math.min(0.9, baseDiff.aiAccuracy * waveDiffMult),
                    speedMult: Math.min(1.2, baseDiff.speedMult * (1 + wave * 0.03)),
                    hpMult: baseDiff.hpMult * (1 + wave * 0.1),
                    damageMult: baseDiff.damageMult * (1 + wave * 0.05),
                };

                const namePool = AI_BOT_NAMES[diffKey] || AI_BOT_NAMES.medium;
                const enemyName = namePool[Math.floor(Math.random() * namePool.length)];

                const weaponPool = ['spinner', 'hammer', 'flipper', 'saw', 'drill', 'axe'];
                const wIdx = Math.min(Math.floor(wave / 3), weaponPool.length - 1);
                const enemyWeapon = weaponPool[Math.floor(Math.random() * (wIdx + 1))];

                const skinKeys = Object.keys(SKINS);
                const enemySkin = SKINS[skinKeys[Math.floor(Math.random() * skinKeys.length)]];
                const enemySkinColor = enemySkin.color;
                const chassisPool = ['light', 'medium', 'heavy'];
                const enemyChassis = chassisPool[Math.min(Math.floor(wave / 4), 2)];
                const ch = CHASSIS[enemyChassis];

                const enemy = new Bot(this, spawnX, spawnY, {
                    name: `${enemyName} W${wave}`,
                    weapon: enemyWeapon,
                    skinColor: enemySkinColor,
                    chassis: enemyChassis,
                    hp: Math.round(ch.hp * waveDiff.hpMult),
                    speed: Math.round(ch.speed * this._aiSpeedScale(waveDiff)),
                    size: ch.size,
                    armor: ch.armor,
                });

                const ai = new AIController(this, enemy, waveDiff);
                this.enemies.push(enemy);
                this.aiControllers.push(ai);

                // Spawn flash
                this.particles.electric(spawnX, spawnY, 10);
            }
        });
    }

    // ── Health Pickups ──
    _spawnHealthPickup(x, y) {
        if (Math.random() > 0.35) return; // 35% drop chance
        const p = this._snapToWalkablePoint(x, y);
        x = p.x; y = p.y;

        const sizes = [
            { hp: 5, radius: 4, color: 0xff88aa },   // tiny
            { hp: 15, radius: 7, color: 0xff6688 },   // small
            { hp: 30, radius: 10, color: 0xff4466 },   // medium
            { hp: 60, radius: 14, color: 0xff2244 },   // large
        ];
        // Weighted: tiny 40%, small 30%, medium 20%, large 10%
        const roll = Math.random();
        const pick = roll < 0.4 ? sizes[0] : roll < 0.7 ? sizes[1] : roll < 0.9 ? sizes[2] : sizes[3];

        const useSprite = this.textures.exists('heart');
        let visual;
        if (useSprite) {
            visual = this.add.image(x, y, 'heart').setDepth(12);
            visual.setDisplaySize(Math.max(24, pick.radius * 3.2), Math.max(24, pick.radius * 3.2));
            visual._isSprite = true;
        } else {
            visual = this.add.graphics().setDepth(12);
            visual._isSprite = false;
        }
        this.healthPickups.push({
            x, y, hp: pick.hp, radius: pick.radius, color: pick.color, gfx: visual, born: Date.now(),
        });
    }

    _updateHealthPickups() {
        const now = Date.now();
        for (let i = this.healthPickups.length - 1; i >= 0; i--) {
            const pk = this.healthPickups[i];
            const age = now - pk.born;

            // Despawn after 15 seconds
            if (age > 15000) {
                pk.gfx.destroy();
                this.healthPickups.splice(i, 1);
                continue;
            }

            const bob = Math.sin(now * 0.004 + i) * 3;
            const py = pk.y + bob;
            const r = pk.radius;
            const blink = age > 12000 ? (Math.sin(now * 0.02) > 0 ? 1 : 0.3) : 1;

            if (pk.gfx._isSprite) {
                // Sprite-based heart
                pk.gfx.setPosition(pk.x, py);
                pk.gfx.setAlpha(blink);
            } else {
                // Procedural fallback
                const g = pk.gfx;
                g.clear();
                // Shadow
                g.fillStyle(0x000000, 0.2 * blink);
                g.fillCircle(pk.x + 3, pk.y + r + 5, r * 0.7);
                g.fillCircle(pk.x + 5, pk.y + r + 6, r * 0.45);
                // Heart
                g.fillStyle(pk.color, 0.9 * blink);
                g.fillCircle(pk.x - r * 0.3, py - r * 0.15, r * 0.55);
                g.fillCircle(pk.x + r * 0.3, py - r * 0.15, r * 0.55);
                g.fillPoints([
                    { x: pk.x - r * 0.7, y: py },
                    { x: pk.x + r * 0.7, y: py },
                    { x: pk.x, y: py + r * 0.9 },
                ], true);
                g.fillStyle(0xffffff, 0.35 * blink);
                g.fillCircle(pk.x - r * 0.2, py - r * 0.3, r * 0.25);
            }
            // Player pickup check
            const dx = this.player.x - pk.x;
            const dy = this.player.y - py;
            if (Math.sqrt(dx * dx + dy * dy) < this.player.size + pk.radius) {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + pk.hp);
                this.particles.heal(pk.x, py);
                if (this.audio) this.audio.playRepair();
                // Floating heal number
                const healText = this.add.text(pk.x, py - 15, `+${pk.hp}`, {
                    fontSize: '14px', fontFamily: 'monospace', color: '#ffdd66', fontStyle: 'bold',
                    stroke: '#000000', strokeThickness: 3,
                }).setOrigin(0.5).setDepth(150);
                this.tweens.add({
                    targets: healText, y: healText.y - 30, alpha: 0,
                    duration: 600, onComplete: () => healText.destroy(),
                });
                pk.gfx.destroy();
                this.healthPickups.splice(i, 1);
            }
        }
    }

    // ── Scrap Pickups ──
    _spawnScrapPickup(x, y) {
        if (Math.random() > 0.4) return; // 40% drop chance
        const p = this._snapToWalkablePoint(x, y);
        x = p.x; y = p.y;

        const sizes = [
            { scrap: 2, radius: 4 },
            { scrap: 5, radius: 7 },
            { scrap: 10, radius: 10 },
            { scrap: 25, radius: 14 },
        ];
        const roll = Math.random();
        const pick = roll < 0.4 ? sizes[0] : roll < 0.7 ? sizes[1] : roll < 0.9 ? sizes[2] : sizes[3];

        const useSprite = this.textures.exists('ui_icon_scrap');
        let visual;
        const sx = x + (Math.random() - 0.5) * 20;
        if (useSprite) {
            visual = addIcon(this, 'ui_icon_scrap', sx, y, Math.max(24, pick.radius * 3.2), 12);
            visual._isSprite = true;
        } else {
            visual = this.add.graphics().setDepth(12);
            visual._isSprite = false;
        }

        if (!this.scrapPickups) this.scrapPickups = [];
        this.scrapPickups.push({
            x: sx, y, scrap: pick.scrap, radius: pick.radius, gfx: visual, born: Date.now(),
        });
    }

    _updateScrapPickups() {
        if (!this.scrapPickups) return;
        const now = Date.now();

        for (let i = this.scrapPickups.length - 1; i >= 0; i--) {
            const pk = this.scrapPickups[i];
            const age = now - pk.born;
            if (age > 15000) {
                pk.gfx.destroy();
                this.scrapPickups.splice(i, 1);
                continue;
            }

            const bob = Math.sin(now * 0.005 + i) * 3;
            const py = pk.y + bob;
            const blink = age > 12000 ? (Math.sin(now * 0.02) > 0 ? 1 : 0.3) : 1;

            if (pk.gfx._isSprite) {
                pk.gfx.setPosition(pk.x, py);
                pk.gfx.setAlpha(blink);
            } else {
                pk.gfx.clear();
                pk.gfx.fillStyle(0xffdd33, 0.8 * blink);
                pk.gfx.fillCircle(pk.x, py, pk.radius);
                pk.gfx.lineStyle(2, 0x000000, 0.5 * blink);
                pk.gfx.strokeCircle(pk.x, py, pk.radius);
            }

            // Player pickup check
            const dx = this.player.x - pk.x;
            const dy = this.player.y - py;
            if (Math.sqrt(dx * dx + dy * dy) < this.player.size + pk.radius) {
                this.battleScrap += pk.scrap;
                if (this.audio) this.audio.playMenuSelect();
                const scrapText = this.add.text(pk.x, py - 15, `+${pk.scrap}`, {
                    fontSize: '12px', fontFamily: 'monospace', color: '#ffdd33', fontStyle: 'bold',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5).setDepth(150);
                this.tweens.add({
                    targets: scrapText, y: scrapText.y - 25, alpha: 0,
                    duration: 500, onComplete: () => scrapText.destroy(),
                });
                pk.gfx.destroy();
                this.scrapPickups.splice(i, 1);
            }
        }
    }

    // ── Bomberman Bomb ──
    _plantBomb(x, y, owner, bombWeapon = null) {
        const bombGfx = this.add.graphics().setDepth(15);
        const fuseTime = bombWeapon ? (bombWeapon.bombFuse || bombWeapon.projectileLife || 1200) : 2500;
        const blastRadius = bombWeapon ? (bombWeapon.bombRadius || bombWeapon.explosionRadius || 130) : 130;
        const damage = bombWeapon ? bombWeapon.damage : 75;
        const bombColor = bombWeapon ? bombWeapon.color : COLORS.RED;
        const disableDuration = bombWeapon ? (bombWeapon.disableDuration || 0) : 0;
        const stunDuration = bombWeapon ? (bombWeapon.stunDuration || 0) : 0;
        const attackDisableDuration = bombWeapon ? (bombWeapon.attackDisableDuration || 0) : 0;
        const selfDamage = bombWeapon ? (bombWeapon.selfDamage || 0) : 0;
        const cooldown = bombWeapon ? bombWeapon.cooldown : 1200;
        const isSticky = bombWeapon ? (bombWeapon.stickToEnemy || false) : false;

        // Try to use bomb sprite
        const bombSpriteKeys = {
            bomb: 'aux_bomb',
            frag_bomb: 'aux_frag_bomb',
            sticky_bomb: 'aux_sticky_bomb',
            shock_bomb: 'aux_shock_bomb',
            mega_bomb: 'aux_mega_bomb',
            emp: 'aux_emp',
        };
        let bombSpriteImg = null;
        const spriteKey = bombSpriteKeys[bombWeapon?.key]
            || (bombWeapon ? (bombWeapon.bombRadius > 150 ? 'aux_mega_bomb' : (bombWeapon.stickToEnemy ? 'aux_sticky_bomb' : 'aux_frag_bomb')) : 'aux_frag_bomb');
        if (this.textures.exists(spriteKey)) {
            bombSpriteImg = this.add.sprite(x, y, spriteKey, 0)
                .setDisplaySize(44 * AUX_VISUAL_SCALE, 44 * AUX_VISUAL_SCALE)
                .setDepth(15);
        }

        const bomb = { x, y, owner, gfx: bombGfx, sprite: bombSpriteImg, born: Date.now(), fuseTime, blastRadius, damage, stuckTo: null };

        // Ticking animation
        const tickEvent = this.time.addEvent({
            delay: 100,
            repeat: fuseTime / 100,
            callback: () => {
                // Sticky bomb: attach to enemy bots that walk over it
                if (isSticky && !bomb.stuckTo) {
                    const allBots = [this.player, ...this.enemies];
                    for (const bot of allBots) {
                        if (bot === owner) continue;
                        const d = Math.sqrt((bot.x - bomb.x) ** 2 + (bot.y - bomb.y) ** 2);
                        if (d < bot.size + 15) {
                            bomb.stuckTo = bot;
                            if (this.audio) this.audio.playHit(bot.isPlayer);
                            break;
                        }
                    }
                }

                // If stuck to a bot, follow it
                if (bomb.stuckTo && bomb.stuckTo.alive) {
                    bomb.x = bomb.stuckTo.x;
                    bomb.y = bomb.stuckTo.y;
                }

                const bx = bomb.x, by = bomb.y;
                const elapsed = Date.now() - bomb.born;
                const progress = elapsed / fuseTime;
                const pulse = Math.sin(elapsed * 0.01 * (1 + progress * 4)) * 0.15;
                const bombSize = 12 + pulse * 8;

                if (bomb.sprite) {
                    // Sprite-based bomb — show frame based on fuse progress
                    bomb.sprite.setPosition(bx, by);
                    bomb.sprite.setFrame(progress > 0.7 ? 2 : (progress > 0.3 ? 1 : 0));
                    const baseSize = 44 * AUX_VISUAL_SCALE;
                    bomb.sprite.setDisplaySize(
                        baseSize * (1 + pulse * 0.3),
                        baseSize * (1 + pulse * 0.3)
                    );
                    bombGfx.clear();
                } else {
                    bombGfx.clear();
                    bombGfx.fillStyle(0x000000, 0.25);
                    bombGfx.fillCircle(bx + 4, by + bombSize + 4, bombSize * 0.8);
                    bombGfx.fillStyle(bomb.stuckTo ? 0x442200 : 0x222222, 1);
                    bombGfx.fillCircle(bx, by, bombSize);
                    bombGfx.fillStyle(bomb.stuckTo ? bombColor : 0x333333, 0.6);
                    bombGfx.fillCircle(bx - 3, by - 3, bombSize * 0.5);
                    bombGfx.lineStyle(3, 0x000000, 0.8);
                    bombGfx.strokeCircle(bx, by, bombSize);
                    // Fuse spark (procedural only)
                    bombGfx.fillStyle(progress > 0.7 ? COLORS.RED : COLORS.ORANGE, 0.8 + Math.random() * 0.2);
                    bombGfx.fillCircle(bx, by - bombSize - 2, 3 + Math.random() * 2);
                    // Danger ring
                    if (progress > 0.5) {
                        bombGfx.lineStyle(2, COLORS.RED, (progress - 0.5) * 0.4);
                        bombGfx.strokeCircle(bx, by, blastRadius * progress);
                    }
                } // end procedural bomb rendering
            },
        });

        // Explode after fuse time
        this.time.delayedCall(fuseTime, () => {
            tickEvent.remove();
            bombGfx.destroy();
            if (bomb.sprite) bomb.sprite.destroy();
            owner.bombActive = false;
            owner.bombCooldownEnd = Date.now() + cooldown;

            // Explosion at bomb's current position (may have moved if sticky)
            const ex = bomb.x, ey = bomb.y;
            this._spawnExplosionSprite(ex, ey, Math.max(120, blastRadius * AUX_VISUAL_SCALE));
            this.particles.bigExplosion(ex, ey);
            if (this.audio) this.audio.playBombExplosion?.(1);
            this.cameras.main.shake(300, 0.025 + (blastRadius > 150 ? 0.02 : 0));

            // Damage all bots in radius
            const allBots = [this.player, ...this.enemies];
            for (const bot of allBots) {
                const d = Math.sqrt((bot.x - ex) ** 2 + (bot.y - ey) ** 2);
                if (d < blastRadius) {
                    const falloff = 1 - d / blastRadius;
                    let dmg = Math.round(damage * falloff);
                    // Self-damage for mega bomb
                    if (bot === owner && selfDamage > 0) {
                        dmg = Math.round(selfDamage * falloff);
                    }
                    bot.takeDamage(dmg, owner);
                    const knockAngle = Math.atan2(bot.y - ey, bot.x - ex);
                    bot.applyKnockback(knockAngle, 230 * falloff);
                    if (disableDuration > 0 && bot !== owner) {
                        bot.disable(disableDuration);
                        this.particles.electric(bot.x, bot.y, 12);
                    }
                    if (stunDuration > 0 && bot !== owner) {
                        bot.stun(stunDuration);
                        this.particles.electric(bot.x, bot.y, 12);
                    }
                    if (attackDisableDuration > 0 && bot !== owner) {
                        bot.disableAttack?.(attackDisableDuration);
                        this.particles.electric(bot.x, bot.y, 12);
                    }
                }
            }

            // Break breakable tiles in blast radius
            for (let row = 0; row < this.tileRows; row++) {
                for (let col = 0; col < this.tileCols; col++) {
                    if (this.tileGrid[row][col] === 3 || this.tileGrid[row][col] === 7) {
                        const tx = this.tileOffX + col * TILE_SIZE + TILE_SIZE / 2;
                        const ty = this.tileOffY + row * TILE_SIZE + TILE_SIZE / 2;
                        if (Math.sqrt((tx - ex) ** 2 + (ty - ey) ** 2) < blastRadius + 10) {
                            this._breakTileAt(tx, ty);
                        }
                    }
                }
            }
            this._damageHazardsAt(ex, ey, blastRadius, owner);
        });
    }

    // ── Battle End ──
    _endBattle(result) {
        this.battleActive = false;
        this.battleResult = result;
        if (result === 'lose' && this.player) this.player.hp = 0;
        if (result === 'win') {
            const defeatedEnemy = this.boss || this.enemies.find((enemy) => !enemy.alive);
            if (defeatedEnemy) defeatedEnemy.hp = 0;
        }
        if (this.player && this.player.hp < 0) this.player.hp = 0;
        if (this.boss && this.boss.hp < 0) this.boss.hp = 0;
        try {
            this._updateHUD();
        } catch (e) {
            // HUD may already be torn down during scene transitions.
        }

        // Notify remote player
        if (this.isMultiplayer && this.net) {
            if (result === 'lose') this.net.sendDeath();
            this.net.stopSync();
        }

        // Slowmo on battle end
        this.time.timeScale = 0.3;
        this.time.delayedCall(800, () => {
            this.time.timeScale = 1;

            // Calculate rewards
            let xpReward = this.diffSettings.xpReward;
            let scrapReward = this.diffSettings.scrapReward;

            if (this.isMultiplayer) {
                xpReward = result === 'win' ? 150 : 40;
                scrapReward = result === 'win' ? 100 : 20;
            } else if (this.isSurvival) {
                // Survival rewards scale with waves
                xpReward = this.survivalWave * 20 + this.survivalKills * 5;
                scrapReward = this.survivalWave * 15 + this.survivalKills * 3;
                // Save high score
                if (this.survivalWave > (this.prog.data.waveHighScore || 0)) {
                    this.prog.data.waveHighScore = this.survivalWave;
                    this.prog.save();
                }
            }

            if (result === 'win') {
                this.prog.recordWin();
                if (this.isBossFight && this.bossKey) {
                    this.prog.recordBossDefeated(this.bossKey);
                    xpReward *= 3;
                    scrapReward *= 3;
                }
                if (this.battleMode === 'campaign') {
                    this.prog.advanceCampaign(this.worldId, this.levelId);
                }
            } else {
                this.prog.recordLoss();
                if (!this.isMultiplayer) {
                    xpReward = Math.round(xpReward * 0.3);
                    scrapReward = Math.round(scrapReward * 0.2);
                }
            }

            const levelsGained = this.prog.addXP(xpReward);
            this.prog.addScrap(scrapReward + (this.battleScrap || 0));

            // Clean up multiplayer
            if (this.isMultiplayer && this.net) {
                this.net.disconnect();
            }

            this._destroyDomTouchControls();
            this.scene.start('ResultScene', {
                result,
                xpReward,
                scrapReward,
                levelsGained,
                damageDealt: Math.round(this.damageDealt),
                damageReceived: Math.round(this.damageReceived),
                battleTime: Math.round(this.battleTimer / 1000),
                mode: this.battleMode,
                arena: this.arenaKey,
                bossKey: this.bossKey,
                world: this.worldId,
                level: this.levelId,
                isMultiplayer: this.isMultiplayer,
                survivalWave: this.survivalWave,
                survivalKills: this.survivalKills,
            });
        });
    }

    _togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            if (this.audio) this.audio.setMusicDuck(0.5);
            this.pauseOverlay = this.add.container(0, 0).setDepth(900);
            this.pauseOverlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.74));
            this.pauseOverlay.add(addSectionPanel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 404, 132, 0, 0.96));
            this.pauseOverlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'PAUSED', {
                fontSize: '26px', fontFamily: 'monospace', color: '#ffaa33',
                stroke: '#000000', strokeThickness: 4,
            }).setOrigin(0.5));
            this.pauseOverlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 4, 'ESC resumes the fight', {
                fontSize: '12px', fontFamily: 'monospace', color: '#b8c5d0',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));

            const resumeBtn = addButton(this, GAME_WIDTH / 2 - 78, GAME_HEIGHT / 2 + 36, 140, 32, 'RESUME', () => this._togglePause(), { depth: 302 });
            for (const part of resumeBtn._ownedParts) this.pauseOverlay.add(part);

            // Quit button
            const quitBtn = addButton(this, GAME_WIDTH / 2 + 78, GAME_HEIGHT / 2 + 36, 140, 32, 'QUIT', () => {
                if (this.audio) this.audio.setMusicDuck(1);
                this.scene.start('MenuScene');
            }, { depth: 302, textColor: '#ff6666' });
            for (const part of quitBtn._ownedParts) this.pauseOverlay.add(part);
            this.children.bringToTop(this.pauseOverlay);
        } else if (this.pauseOverlay) {
            if (this.audio) this.audio.setMusicDuck(1);
            this.pauseOverlay.destroy();
            this.pauseOverlay = null;
        }
    }

    _showFightText() {
        // Bot entrance animation — slide in from edges
        const playerTarget = { x: this.player.x, y: this.player.y };
        this.player.x = -50;
        this.tweens.add({
            targets: this.player, x: playerTarget.x, y: playerTarget.y,
            duration: 600, ease: 'Back.easeOut',
        });
        this.enemies.forEach((e, i) => {
            const targetX = e.x, targetY = e.y;
            e.x = GAME_WIDTH + 50;
            this.tweens.add({
                targets: e, x: targetX, y: targetY,
                duration: 600, ease: 'Back.easeOut', delay: i * 100,
            });
        });

        // FIGHT text after bots land
        this.time.delayedCall(700, () => {
            const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'FIGHT!', {
                fontSize: '64px', fontFamily: 'monospace', color: '#ff6633',
                stroke: '#000000', strokeThickness: 8,
            }).setOrigin(0.5).setDepth(200).setAlpha(0);

            this.tweens.add({
                targets: text, alpha: 1, scale: { from: 2, to: 1 },
                duration: 300, ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: text, alpha: 0, y: text.y - 50,
                        duration: 500, delay: 400,
                        onComplete: () => text.destroy(),
                    });
                },
            });
        });
    }

    _showBossIntro() {
        this.battleActive = false;
        const boss = this.boss.bossData;

        const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(200);

        const warningText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'WARNING', {
            fontSize: '24px', fontFamily: 'monospace', color: '#ff4444',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(201);

        const bossName = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, boss.name, {
            fontSize: '48px', fontFamily: 'monospace', color: '#ff6633',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(201).setAlpha(0);

        if (this.audio) this.audio.playBossWarning();

        // Flash warning
        this.tweens.add({
            targets: warningText, alpha: 0, duration: 400, yoyo: true, repeat: 2,
            onComplete: () => {
                warningText.destroy();
                this.tweens.add({
                    targets: bossName, alpha: 1, scale: { from: 0.5, to: 1 },
                    duration: 500, ease: 'Back.easeOut',
                    onComplete: () => {
                        this.time.delayedCall(1500, () => {
                            this.tweens.add({
                                targets: [bossName, dim], alpha: 0, duration: 500,
                                onComplete: () => {
                                    bossName.destroy();
                                    dim.destroy();
                                    this.battleActive = true;
                                },
                            });
                        });
                    },
                });
            },
        });
    }

    // ═══════════════════════════════════���══════════
    //  MULTIPLAYER METHODS
    // ══════════════════════════════════════════════

    _setupMultiplayer() {
        this.net = this.registry.get('network');
        if (!this.net || !this.net.connected) {
            // Fallback: no connection, go back to menu
            this.scene.start('MenuScene');
            return;
        }

        const remoteProfile = this.net.remoteProfile || {
            name: 'Opponent', weapon: 'spinner', skinColor: 0xaa5533,
            chassis: 'medium',
        };

        const remoteChassis = CHASSIS[remoteProfile.chassis] || CHASSIS.medium;

        // Spawn remote player bot on the right side
        this.remoteBot = new Bot(this,
            this.arenaRect.x + this.arenaRect.width - 100,
            GAME_HEIGHT / 2 + 20,
            {
                name: remoteProfile.name,
                weapon: remoteProfile.weapon,
                skinColor: remoteProfile.skinColor,
                chassis: remoteProfile.chassis,
                hp: remoteChassis.hp,
                speed: remoteChassis.speed,
                size: remoteChassis.size,
                armor: remoteChassis.armor,
            }
        );
        this.enemies.push(this.remoteBot);

        // ── Network Callbacks ──

        // Remote state update (position, angle, hp)
        this.net.onRemoteState = (state) => {
            if (!this.remoteBot || !this.battleActive) return;
            this._remoteTarget = state;
        };

        // Remote player attacked us
        this.net.onRemoteAttack = (data) => {
            if (!this.remoteBot || !this.battleActive) return;
            // Apply damage to local player (trust remote's calculation for now)
            this.player.takeDamage(data.damage, this.remoteBot);
            this.damageReceived += data.damage;
            this.cameras.main.shake(80, 0.005);

            // Visual effects at remote bot's position
            const weapon = WEAPONS[data.weapon];
            if (weapon) {
                const hitX = (this.remoteBot.x + this.player.x) / 2;
                const hitY = (this.remoteBot.y + this.player.y) / 2;
                this.particles.sparks(hitX, hitY, weapon.color);
            }
            // Apply effects
            if (data.effects) {
                for (const eff of data.effects) {
                    if (eff === 'knockback') {
                        const angle = Math.atan2(
                            this.player.y - this.remoteBot.y,
                            this.player.x - this.remoteBot.x
                        );
                        this.player.applyKnockback(angle, 100);
                    }
                    if (eff === 'stun') this.player.stun(240);
                    if (eff === 'bleed') this.player.addDot(3, 2000);
                }
            }

            // Remote bot attack animation
            this.remoteBot.attackAnim = 1;
        };

        // Remote player died
        this.net.onRemoteDeath = () => {
            if (!this.battleActive) return;
            this.particles.deathExplosion(this.remoteBot.x, this.remoteBot.y, this.remoteBot.skinColor);
            if (this.audio) this.audio.playDeath();
            this.cameras.main.shake(300, 0.02);
            this._endBattle('win');
        };

        // Particle/effect sync
        this.net.onRemoteEffect = (data) => {
            if (data.type === 'sparks' && data.x != null) {
                this.particles.sparks(data.x, data.y, data.color || COLORS.YELLOW);
            } else if (data.type === 'explosion' && data.x != null) {
                this.particles.explosion(data.x, data.y, data.radius || 60);
            }
        };

        // Disconnect handling
        this.net.onDisconnected = () => {
            if (!this.battleActive) return;
            this.battleActive = false;

            const dcText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'OPPONENT DISCONNECTED', {
                fontSize: '28px', fontFamily: 'monospace', color: '#ff4444',
                stroke: '#000000', strokeThickness: 4,
            }).setOrigin(0.5).setDepth(200);

            this.time.delayedCall(2000, () => {
                dcText.destroy();
                // Count as a win
                this.prog.recordWin();
                this.prog.addXP(100);
                this.prog.addScrap(60);
                this.net.disconnect();
                this._destroyDomTouchControls();
                this.scene.start('ResultScene', {
                    result: 'win',
                    xpReward: 100,
                    scrapReward: 60,
                    levelsGained: [],
                    damageDealt: Math.round(this.damageDealt),
                    damageReceived: Math.round(this.damageReceived),
                    battleTime: Math.round(this.battleTimer / 1000),
                    mode: 'multiplayer',
                    arena: this.arenaKey,
                    isMultiplayer: true,
                    disconnected: true,
                });
            });
        };

        // ── Start syncing our state ──
        this.net.startSync(() => ({
            x: this.player.x,
            y: this.player.y,
            angle: this.player.angle,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            moveX: this.player.moveDir.x,
            moveY: this.player.moveDir.y,
            attackAnim: this.player.attackAnim,
            shieldHp: this.player.shieldHp,
            stunned: this.player.stunned,
            disabled: this.player.disabled,
            attackDisabled: this.player.attackDisabled,
        }));

        this._remoteTarget = null;

        // Latency display
        this.latencyHUD = this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 12, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#555555',
        }).setOrigin(1, 0.5).setDepth(81);

        this._showFightText();
    }

    _updateRemoteBot(delta) {
        const target = this._remoteTarget;
        if (!target) return;

        const dt = delta / 1000;
        const lerpSpeed = 12; // Higher = snappier interpolation

        // Smooth interpolation toward the last known remote position
        this.remoteBot.x += (target.x - this.remoteBot.x) * Math.min(1, lerpSpeed * dt);
        this.remoteBot.y += (target.y - this.remoteBot.y) * Math.min(1, lerpSpeed * dt);

        // Angle interpolation (handle wrapping)
        let angleDiff = target.angle - this.remoteBot.angle;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.remoteBot.angle += angleDiff * Math.min(1, lerpSpeed * dt);

        // HP sync (authoritative from remote)
        this.remoteBot.hp = target.hp;
        this.remoteBot.maxHp = target.maxHp;

        // Visual state
        this.remoteBot.attackAnim = target.attackAnim || 0;
        this.remoteBot.shieldHp = target.shieldHp || 0;
        this.remoteBot.stunned = target.stunned || false;
        this.remoteBot.disabled = target.disabled || false;
        this.remoteBot.attackDisabled = target.attackDisabled || false;

        // Movement direction for animations
        this.remoteBot.moveDir.x = target.moveX || 0;
        this.remoteBot.moveDir.y = target.moveY || 0;

        // Constrain to arena
        this.remoteBot.constrainToArena(this.arenaRect);

        // Update latency display
        if (this.latencyHUD) {
            this.latencyHUD.setText(`Ping: ${this.net.latency}ms`);
        }

        // Check remote bot death from local perspective
        if (this.remoteBot.hp <= 0 && this.battleActive) {
            this.particles.deathExplosion(this.remoteBot.x, this.remoteBot.y, this.remoteBot.skinColor);
            if (this.audio) this.audio.playDeath();
            this.cameras.main.shake(300, 0.02);
            this._endBattle('win');
        }
    }

    shutdown() {
        if (this.audio) this.audio.setMusicDuck(1);
        this._destroyDomTouchControls();
        this.particles.destroyAll();
        this.weapons.destroyAll();
        if (this.isMultiplayer && this.net) {
            this.net.stopSync();
        }
    }
}

// Helper
function skinColorFromProg(prog) {
    if (prog.skin === 'custom' && prog.customColor) {
        const [r, g, b] = prog.customColor;
        return (r << 16) | (g << 8) | b;
    }
    return (SKINS[prog.skin] || SKINS.steel).color;
}

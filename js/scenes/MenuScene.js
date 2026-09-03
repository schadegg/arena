import {
    COLORS, GAME_WIDTH, GAME_HEIGHT, ARENAS, DIFFICULTY, WORLDS,
    WEAPONS, CHASSIS, SKINS, ACHIEVEMENTS, DAILY_CHALLENGES,
} from '../constants.js';
import ProgressionSystem from '../systems/ProgressionSystem.js';
import { addBackButton, addButton, addIcon, addMenuBackdrop, addPanel, addPlainSectionPanel, addRowPanel, addSectionPanel, addTrimmedImage, fitTextToWidth } from '../ui.js';

// ── Cel-shaded UI helpers (reusable across scenes) ──
function celPanel(scene, x, y, w, h, baseColor, depth = 0) {
    return addSectionPanel(scene, x + w / 2, y + h / 2, w, h, depth, 0.9);
}

function celPlainPanel(scene, x, y, w, h, baseColor, depth = 0) {
    return addPlainSectionPanel(scene, x + w / 2, y + h / 2, w, h, depth, 0.9);
}

function celButton(scene, x, y, w, h, text, textColor, bgColor, callback, depth = 5) {
    return addButton(scene, x, y, w, h, text, callback, {
        depth,
        textColor,
        fontSize: h > 35 ? '15px' : '11px',
    });
}

function celCircle(g, x, y, r, baseColor) {
    const dk = darken(baseColor, 70);
    const lt = lighten(baseColor, 50);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(x + 3, y + 3, r);
    g.fillStyle(dk, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(baseColor, 1);
    g.fillCircle(x, y, r * 0.9);
    g.fillStyle(lt, 0.35);
    g.fillCircle(x - r * 0.2, y - r * 0.2, r * 0.55);
    g.lineStyle(3, 0x000000, 0.7);
    g.strokeCircle(x, y, r);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(x - r * 0.25, y - r * 0.3, r * 0.15);
}

function darken(c, n) { return (Math.max(0,((c>>16)&0xff)-n)<<16)|(Math.max(0,((c>>8)&0xff)-n)<<8)|Math.max(0,(c&0xff)-n); }
function lighten(c, n) { return (Math.min(255,((c>>16)&0xff)+n)<<16)|(Math.min(255,((c>>8)&0xff)+n)<<8)|Math.min(255,(c&0xff)+n); }

// ── Export helpers for other scenes ──
export { celPanel, celButton, celCircle, darken, lighten };

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    init() {
        if (!this.registry.get('progression')) {
            this.registry.set('progression', new ProgressionSystem());
        }
    }

    create() {
        const prog = this.registry.get('progression');
        const audio = this.registry.get('audio');
        this.cameras.main.fadeIn(400, 0, 0, 0);
        this.bgParticles = [];
        this.selectedDifficulty = this.registry.get('difficulty') || 'medium';

        const ensureMenuMusic = () => {
            if (!audio) return;
            audio.init();
            audio.resume();
            if (audio.currentMusicKey !== 'music_titlescreen' || !audio.currentMusic?.isPlaying) {
                audio.startMenuMusic(this);
            }
        };
        if (audio) {
            ensureMenuMusic();
        }
        this.input.once('pointerdown', ensureMenuMusic);

        addMenuBackdrop(this, { imageKey: 'title_screen', overlayAlpha: 0.34 });
        this.add.rectangle(GAME_WIDTH / 2, 128, GAME_WIDTH, 184, 0x06070a, 0.22);
        // ── Logo ──
        if (this.textures.exists('title_logo')) {
            const logo = addTrimmedImage(this, 'title_logo', GAME_WIDTH / 2, 156, 596, 188, 4, 1);
            this.tweens.add({
                targets: logo,
                scaleX: logo.scaleX * 1.018,
                scaleY: logo.scaleY * 1.018,
                duration: 2200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        } else {
            this.add.text(GAME_WIDTH / 2, 156, 'BATTLEBOTS', {
                fontSize: '76px', fontFamily: 'monospace', color: '#ff6633', stroke: '#000000', strokeThickness: 8,
            }).setOrigin(0.5).setDepth(2);
        }
        this.add.text(GAME_WIDTH / 2, 252, 'v1.0', {
            fontSize: '8px', fontFamily: 'monospace', color: '#7f8894',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(4);

        const unlockHotspot = this.add.zone(26, GAME_HEIGHT - 26, 34, 34)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        unlockHotspot.on('pointerdown', () => {
            if (!prog.unlockAll) return;
            prog.unlockAll();
            const flash = this.add.text(48, GAME_HEIGHT - 28, 'ALL SYSTEMS UNLOCKED', {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ffcc66',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0, 0.5).setDepth(41);
            this.tweens.add({
                targets: flash,
                alpha: 0,
                y: flash.y - 10,
                duration: 900,
                onComplete: () => flash.destroy(),
            });
            if (audio) {
                audio.init();
                audio.resume();
                audio.playLevelUp();
            }
        });

        const btnNames = ['BATTLE', 'CAMPAIGN', 'SURVIVAL', 'CUSTOMIZE', 'MULTIPLAYER', 'SETTINGS'];
        const btnCallbacks = [
            () => this._showArenaSelect('quick'),
            () => this._showCampaignSelect(),
            () => this._showArenaSelect('survival'),
            () => this.scene.start('CustomizeScene'),
            () => this.scene.start('MultiplayerScene'),
            () => this.scene.start('SettingsScene'),
        ];
        const btnW = 156;
        const btnH = 36;
        const gapX = 12;
        const gapY = 50;
        const startX = GAME_WIDTH / 2 - btnW - gapX;
        const startY = 542;
        const footerLeft = startX - btnW / 2;
        const footerRight = startX + 2 * (btnW + gapX) + btnW / 2;
        const footerW = footerRight - footerLeft;
        const footerX = footerLeft + footerW / 2;
        const footerY = 656;
        addRowPanel(this, footerX, footerY, footerW, 50, 1, 0.84);
        this.add.rectangle(footerX, footerY, footerW - 58, 20, 0x070910, 0.36).setDepth(2);

        btnNames.forEach((name, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const bx = startX + col * (btnW + gapX);
            const by = startY + row * gapY;
            celButton(this, bx, by, btnW, btnH, name, '#ffffff', 0x332211, btnCallbacks[i], 10);
        });

        const chassis = CHASSIS[prog.chassis] || CHASSIS.medium;
        const primary = WEAPONS[prog.weapon] || WEAPONS.spinner;
        const secondary = prog.secondaryWeapon ? (WEAPONS[prog.secondaryWeapon] || null) : null;
        const nameLine = this.add.text(footerLeft + 22, footerY - 8, `${prog.botName}  |  ${chassis.name.toUpperCase()} CHASSIS`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(4);
        fitTextToWidth(nameLine, 210, 8);
        const loadoutLine = this.add.text(footerLeft + 22, footerY + 10, `PRIMARY ${primary.name.toUpperCase()}${secondary ? `   |   SECONDARY ${secondary.name.toUpperCase()}` : ''}`, {
            fontSize: '9px', fontFamily: 'monospace', color: '#999999',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(4);
        fitTextToWidth(loadoutLine, 254, 7);

        this._addFooterStatsLine(footerRight - 22, footerY - 8, prog);

        const difficultyLine = this.add.text(footerRight - 22, footerY + 10, `DIFFICULTY ${this.selectedDifficulty.toUpperCase()} | ${prog.wins}W ${prog.losses}L`, {
            fontSize: '9px', fontFamily: 'monospace', color: '#999999',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0.5).setDepth(4);
        fitTextToWidth(difficultyLine, 226, 7);

        const copyrightRight = GAME_WIDTH - 10;
        const copyrightY = GAME_HEIGHT - 8;
        if (this.textures.exists('fit_egg_logo')) {
            const brandMark = addTrimmedImage(this, 'fit_egg_logo', 10, GAME_HEIGHT - 10, 32, 32, 4, 0.4);
            brandMark.setOrigin(0, 1);
        }
        this.add.text(copyrightRight, copyrightY, '© 2026 Fit Egg Arcade', {
            fontSize: '8px', fontFamily: 'monospace', color: '#7f8894',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 1).setDepth(4);

        // Overlays
        this.overlay = null;
    }

    _addFooterStatsLine(rightX, y, prog) {
        const iconSize = 12;
        const textGap = 4;
        const groupGap = 8;
        const separatorGap = 6;
        let cursor = rightX;

        const addRightText = (text, color) => {
            const obj = this.add.text(cursor, y, text, {
                fontSize: '10px',
                fontFamily: 'monospace',
                color,
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(1, 0.5).setDepth(4);
            cursor -= obj.width + textGap;
            return obj;
        };

        const addRightIcon = (key, fallbackWidth = iconSize) => {
            if (this.textures.exists(key)) {
                addIcon(this, key, cursor - iconSize / 2, y, iconSize, 4);
            }
            cursor -= fallbackWidth + groupGap;
        };

        const addSeparator = () => {
            cursor -= separatorGap;
            const sep = this.add.text(cursor, y, '|', {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#777777',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(1, 0.5).setDepth(4);
            cursor -= sep.width + separatorGap;
        };

        addRightText(`${prog.scrap}`, '#ffdc74');
        addRightIcon('ui_icon_scrap');
        addSeparator();
        addRightText(`(${prog.xp}/${prog.xpToNext})`, '#9fd3ff');
        addRightIcon('ui_icon_xp');
        addSeparator();
        addRightText(`LVL ${prog.level}`, '#ffdc74');
        addRightIcon('ui_icon_vip', iconSize);
    }

    update(time, delta) {
        const dt = delta / 1000;
        for (const p of this.bgParticles) {
            p.obj.x += p.vx * dt;
            p.obj.y += p.vy * dt;
            if (p.obj.y < -10) { p.obj.y = GAME_HEIGHT + 10; p.obj.x = Math.random() * GAME_WIDTH; }
            if (p.obj.x < -10) p.obj.x = GAME_WIDTH + 10;
            if (p.obj.x > GAME_WIDTH + 10) p.obj.x = -10;
        }
    }

    // ══════════════════════════════════════
    //  ARENA SELECTION
    // ══════════════════════════════════════
    _showArenaSelect(mode) {
        this._clearOverlay();
        this.overlay = true;
        this._trackOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05060b, 0.94).setInteractive().setDepth(99));
        this._trackOverlay(celPanel(this, GAME_WIDTH / 2 - 250, 26, 500, 48, 0x1a1b2e, 101));
        this._trackOverlay(this.add.text(GAME_WIDTH / 2, 49, mode === 'survival' ? 'WAVE SURVIVAL' : 'QUICK BATTLE', {
            fontSize: '22px', fontFamily: 'monospace', color: '#ffaa33', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(102));

        const arenaKeys = Object.keys(ARENAS);
        arenaKeys.forEach((key, i) => {
            const arena = ARENAS[key];
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = 90 + col * 420;
            const y = 92 + row * 104;
            this._trackOverlay(celPlainPanel(this, x, y, 390, 86, 0x111118, 101));
            if (this.textures.exists(`arena_${key}`)) {
                const img = this.add.image(x + 58, y + 43, `arena_${key}`).setDisplaySize(92, 52).setDepth(102);
                this._trackOverlay(img);
            } else {
                this._trackOverlay(this.add.rectangle(x + 58, y + 43, 92, 52, arena.floorColor).setDepth(102));
            }
            this._trackOverlay(this.add.text(x + 120, y + 18, this._overlayLabel(arena.name), {
                fontSize: '13px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
            }).setDepth(102));
            this._trackOverlay(this.add.text(x + 120, y + 40, arena.description, {
                fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
                stroke: '#000000', strokeThickness: 2,
                wordWrap: { width: 170 },
            }).setDepth(102));

            this._trackOverlay(celButton(this, x + 338, y + 43, 76, 32, 'PLAY', '#ffdd66', 0x224422, () => {
                this._clearOverlay();
                this.scene.start('BattleScene', { mode, arena: key });
            }, 103));
        });

        this._trackOverlay(celButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 44, 220, 38, 'RANDOM ARENA', '#ffaa33', 0x443311, () => {
            const rk = arenaKeys[Math.floor(Math.random() * arenaKeys.length)];
            this._clearOverlay();
            this.scene.start('BattleScene', { mode, arena: rk });
        }, 103));

        this._overlayCloseBtn();
    }

    // ══════════════════════════════════════
    //  CAMPAIGN SELECT
    // ══════════════════════════════════════
    _showCampaignSelect() {
        this._clearOverlay();
        const prog = this.registry.get('progression');
        this.overlay = true;

        this._trackOverlay(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05060b, 0.94).setInteractive().setDepth(99));
        this._trackOverlay(celPanel(this, GAME_WIDTH / 2 - 250, 26, 500, 48, 0x1a1b2e, 101));
        this._trackOverlay(this.add.text(GAME_WIDTH / 2, 49, 'CAMPAIGN', {
            fontSize: '22px', fontFamily: 'monospace', color: '#ffaa33', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(102));

        WORLDS.forEach((world, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = 90 + col * 420;
            const y = 92 + row * 104;
            const unlocked = prog.campaignProgress.world > world.id || prog.campaignProgress.world === world.id;
            const progressWorld = prog.campaignProgress.world === world.id;
            const currentLevel = progressWorld ? prog.campaignProgress.level : world.levels + 1;
            const clearedLevels = unlocked ? Math.min(world.levels, Math.max(0, currentLevel - 1)) : 0;
            const bossUnlocked = unlocked && currentLevel >= world.bossLevel;
            const bossDefeated = prog.data.stats?.bossesDefeated?.includes(world.boss);

            this._trackOverlay(celPlainPanel(this, x, y, 390, 86, unlocked ? 0x111118 : 0x09090d, 101));

            if (this.textures.exists(`arena_${world.arena}`)) {
                const img = this.add.image(x + 58, y + 43, `arena_${world.arena}`).setDisplaySize(92, 52).setDepth(102);
                if (!unlocked) img.setAlpha(0.3);
                this._trackOverlay(img);
            } else {
                this._trackOverlay(this.add.rectangle(x + 58, y + 43, 92, 52, world.color || 0x333333, unlocked ? 1 : 0.3).setDepth(102));
            }

            this._trackOverlay(this.add.text(x + 120, y + 14, `${world.id}. ${this._overlayLabel(world.name)}`, {
                fontSize: '13px', fontFamily: 'monospace', color: unlocked ? '#ffffff' : '#555555',
                stroke: '#000000', strokeThickness: 2,
            }).setDepth(102));

            const progressText = unlocked
                ? `LEVELS ${clearedLevels}/${world.levels}${bossUnlocked ? '  |  BOSS READY' : ''}`
                : 'LOCKED';
            this._trackOverlay(this.add.text(x + 120, y + 35, progressText, {
                fontSize: '10px', fontFamily: 'monospace', color: unlocked ? '#ffaa33' : '#44444d',
                stroke: '#000000', strokeThickness: 1,
            }).setDepth(102));

            this._trackOverlay(this.add.text(x + 120, y + 54, world.description, {
                fontSize: '11px', fontFamily: 'monospace', color: unlocked ? '#ffffff' : '#ffffff',
                stroke: '#000000', strokeThickness: 2,
                wordWrap: { width: 150 },
            }).setDepth(102));

            if (unlocked) {
                const startLevel = progressWorld ? Math.min(prog.campaignProgress.level, world.levels) : 1;
                const playY = bossUnlocked ? y + 28 : y + 43;
                this._trackOverlay(celButton(this, x + 330, playY, 86, 28, 'PLAY', '#ffdd66', 0x224422, () => {
                    this._clearOverlay();
                    this.scene.start('BattleScene', {
                        mode: 'campaign',
                        world: world.id,
                        level: startLevel,
                        arena: world.arena,
                        boss: bossUnlocked && startLevel >= world.bossLevel ? world.boss : null,
                    });
                }, 103));

                if (bossUnlocked) {
                    this._trackOverlay(celButton(this, x + 330, y + 58, 86, 28, 'BOSS', bossDefeated ? '#ff9a52' : '#ffd36b', bossDefeated ? 0x4a2311 : 0x4a3d11, () => {
                        this._clearOverlay();
                        this.scene.start('BattleScene', {
                            mode: 'campaign',
                            world: world.id,
                            level: world.bossLevel,
                            arena: world.arena,
                            boss: world.boss,
                        });
                    }, 103));
                }
            } else {
                this._trackOverlay(this.add.text(x + 330, y + 43, 'LOCKED', {
                    fontSize: '11px', fontFamily: 'monospace', color: '#555555',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5).setDepth(103));
            }
        });

        this._overlayCloseBtn();
    }

    // ══════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════
    _unused_showAchievements() {
        this._clearOverlay();
        const overlay = this.add.container(0, 0).setDepth(100);
        this.overlay = overlay;
        const prog = this.registry.get('progression');
        const unlocked = prog.data.achievements || [];

        overlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setInteractive());
        celPanel(this, GAME_WIDTH / 2 - 200, 15, 400, 40, 0x1a1b2e, 101);
        overlay.add(this.add.text(GAME_WIDTH / 2, 35, 'ACHIEVEMENTS', {
            fontSize: '22px', fontFamily: 'monospace', color: '#ffdd33', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(102));

        const cols = 3;
        ACHIEVEMENTS.forEach((ach, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const ax = 70 + col * 300;
            const ay = 65 + row * 48;
            const done = unlocked.includes(ach.id);

            const pg = this.add.graphics().setDepth(101);
            pg.fillStyle(0x000000, 0.3);
            pg.fillRect(ax + 2, ay + 2, 270, 38);
            pg.fillStyle(done ? 0x1a2a1a : 0x111118, 0.9);
            pg.fillRect(ax, ay, 270, 38);
            pg.lineStyle(2, done ? 0x33ff33 : 0x222233, 0.7);
            pg.strokeRect(ax, ay, 270, 38);
            overlay.add(pg);

            overlay.add(this.add.text(ax + 8, ay + 8, `${ach.icon} ${ach.name}`, {
                fontSize: '10px', fontFamily: 'monospace', color: done ? '#ffffff' : '#555555',
            }).setDepth(102));
            overlay.add(this.add.text(ax + 8, ay + 24, ach.desc, {
                fontSize: '8px', fontFamily: 'monospace', color: done ? '#ffdd66' : '#555555',
            }).setDepth(102));
        });

        overlay.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, `${unlocked.length} / ${ACHIEVEMENTS.length} unlocked`, {
            fontSize: '12px', fontFamily: 'monospace', color: '#ffdd33',
        }).setOrigin(0.5).setDepth(102));

        this._overlayCloseBtn(overlay);
    }

    // ══════════════════════════════════════
    //  DAILY CHALLENGE
    // ══════════════════════════════════════
    _showDaily() {
        this._clearOverlay();
        const overlay = this.add.container(0, 0).setDepth(100);
        this.overlay = overlay;
        const prog = this.registry.get('progression');

        overlay.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setInteractive());
        celPanel(this, GAME_WIDTH / 2 - 220, 60, 440, 180, 0x12131f, 101);

        overlay.add(this.add.text(GAME_WIDTH / 2, 85, 'DAILY CHALLENGE', {
            fontSize: '22px', fontFamily: 'monospace', color: '#ffdd66', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(102));

        const today = new Date().toISOString().slice(0, 10);
        const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
        const challenge = DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];
        const completed = prog.data.lastDailyDate === today && prog.data.dailyCompleted;

        overlay.add(this.add.text(GAME_WIDTH / 2, 130, challenge.desc, {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(102));
        overlay.add(this.add.text(GAME_WIDTH / 2, 165, `Reward: +${challenge.reward.xp} XP  +${challenge.reward.scrap} Scrap`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffdd33',
        }).setOrigin(0.5).setDepth(102));
        overlay.add(this.add.text(GAME_WIDTH / 2, 195, completed ? 'COMPLETED!' : 'In Progress', {
            fontSize: '13px', fontFamily: 'monospace', color: completed ? '#ffdd66' : '#888888',
        }).setOrigin(0.5).setDepth(102));

        this._overlayCloseBtn(overlay);
    }

    // ══════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════
    _overlayCloseBtn() {
        this._trackOverlay(addBackButton(this, () => this._clearOverlay(), { depth: 105 }));
    }

    _overlayLabel(name) {
        if (!name) return '';
        if (name === 'Underground Factory') return 'UNDERGROUND';
        if (name === 'Psychedelic Realm') return 'PSYCHEDELIC';
        return name.toUpperCase();
    }

    _clearOverlay() {
        if (this.overlay) {
            if (this.overlay.destroy) this.overlay.destroy();
            this.overlay = null;
        }
        if (this._overlayExtras) {
            this._overlayExtras.forEach(obj => {
                if (obj && obj.destroy) obj.destroy();
            });
            this._overlayExtras = [];
        }
    }

    _trackOverlay(obj) {
        if (!this._overlayExtras) this._overlayExtras = [];
        if (obj && obj._ownedParts) {
            this._overlayExtras.push(...obj._ownedParts);
        } else {
            this._overlayExtras.push(obj);
        }
        return obj;
    }
}

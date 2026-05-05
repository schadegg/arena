import { GAME_WIDTH, GAME_HEIGHT, WORLDS } from '../constants.js';
import { addButton, addIcon, addMenuBackdrop, addPlainSectionPanel, addSectionPanel, addTrimmedImage } from '../ui.js';

export default class ResultScene extends Phaser.Scene {
    constructor() {
        super('ResultScene');
    }

    init(data) {
        this.result = data.result || 'lose';
        this.xpReward = data.xpReward || 0;
        this.scrapReward = data.scrapReward || 0;
        this.levelsGained = data.levelsGained || [];
        this.damageDealt = data.damageDealt || 0;
        this.damageReceived = data.damageReceived || 0;
        this.battleTime = data.battleTime || 0;
        this.battleMode = data.mode || 'quick';
        this.arenaKey = data.arena || this._getArenaForWorld(this.worldId);
        this.bossKey = data.bossKey;
        this.worldId = data.world;
        this.levelId = data.level;
        this.isMultiplayer = data.isMultiplayer || false;
        this.disconnected = data.disconnected || false;
        this.survivalWave = data.survivalWave || 0;
        this.survivalKills = data.survivalKills || 0;
    }

    create() {
        if (typeof document !== 'undefined') {
            document.getElementById('battle-touch-controls')?.remove();
        }
        this.prog = this.registry.get('progression');
        this.audio = this.registry.get('audio');
        this.cameras.main.fadeIn(300, 0, 0, 0);

        const isWin = this.result === 'win';
        const accent = isWin ? '#ffb34d' : '#ff6b6b';
        const titleKey = isWin ? 'ui_victory' : 'ui_defeat';

        if (this.audio) {
            this.audio.init();
            this.audio.resume();
            if (this.audio.setGameplaySfxEnabled) this.audio.setGameplaySfxEnabled(true);
            if (isWin) this.audio.playVictory();
            else this.audio.playDefeat();
        }

        addMenuBackdrop(this, { overlayAlpha: 0.62 });
        this.add.rectangle(GAME_WIDTH / 2, 118, GAME_WIDTH, 180, isWin ? 0x211006 : 0x1d0708, 0.38).setDepth(0);

        addPlainSectionPanel(this, GAME_WIDTH / 2, 356, 760, 268, 1, 0.9);
        this.add.rectangle(GAME_WIDTH / 2, 190, 720, 2, isWin ? 0xffb34d : 0xff6b6b, 0.8).setDepth(3);

        if (this.textures.exists(titleKey)) {
            addTrimmedImage(this, titleKey, GAME_WIDTH / 2, 104, 780, 156, 5, 1);
        } else {
            this.add.text(GAME_WIDTH / 2, 104, isWin ? 'VICTORY' : 'DEFEAT', {
                fontSize: '72px',
                fontFamily: 'monospace',
                color: isWin ? '#ffdd77' : '#ff6666',
                stroke: '#000000',
                strokeThickness: 6,
            }).setOrigin(0.5).setDepth(5);
        }

        if (this.disconnected) {
            this.add.text(GAME_WIDTH / 2, 164, 'OPPONENT DISCONNECTED', {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#ff9a52',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(5);
        }

        this._summaryCard(304, 326, accent);
        this._rewardsCard(696, 326, isWin ? '#ffd66f' : '#ff8d8d');

        if (this.levelsGained.length > 0 && this.audio) {
            this.time.delayedCall(550, () => this.audio.playLevelUp());
        }

        const btnY = 454;

        if (this.battleMode === 'campaign' && isWin) {
            const world = WORLDS.find((w) => w.id === this.worldId);
            const bossLevel = world ? world.bossLevel : 6;
            if (this.bossKey) {
                this.add.text(GAME_WIDTH / 2, 506, 'WORLD COMPLETE', {
                    fontSize: '18px',
                    fontFamily: 'monospace',
                    color: '#ffde73',
                    stroke: '#000000',
                    strokeThickness: 3,
                }).setOrigin(0.5).setDepth(6);
            } else if (this.levelId >= bossLevel - 1) {
                this.add.text(GAME_WIDTH / 2, 506, 'BOSS NODE UNLOCKED', {
                    fontSize: '17px',
                    fontFamily: 'monospace',
                    color: '#ffb75e',
                    stroke: '#000000',
                    strokeThickness: 3,
                }).setOrigin(0.5).setDepth(6);
            }
        }

        const buttons = this._buildButtons(isWin);
        const btnW = 172;
        const btnH = 40;
        const totalW = buttons.length * btnW + (buttons.length - 1) * 12;
        const startX = (GAME_WIDTH - totalW) / 2 + btnW / 2;

        buttons.forEach((button, index) => {
            addButton(this, startX + index * (btnW + 12), btnY, btnW, btnH, button.text, button.cb, {
                depth: 6,
                fontSize: button.text.length > 14 ? '10px' : '12px',
                textColor: '#ffffff',
            });
        });

        if (isWin) this._victoryParticles();
    }

    _summaryCard(x, y, accent) {
        this._flatPanel(x, y, 332, 182, 3, 0.78);
        this.add.text(x - 138, y - 64, 'BATTLE DATA', {
            fontSize: '15px',
            fontFamily: 'monospace',
            color: accent,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(5);

        const rows = [
            ['TIME', this._formatTime()],
            ['DAMAGE DEALT', `${this.damageDealt}`],
            ['DAMAGE TAKEN', `${this.damageReceived}`],
        ];
        if (this.survivalWave > 0) rows.push(['WAVES CLEARED', `${this.survivalWave}`]);
        if (this.survivalKills > 0) rows.push(['TOTAL KILLS', `${this.survivalKills}`]);
        if (this.battleMode === 'campaign') rows.push(['CAMPAIGN NODE', `WORLD ${this.worldId} / LEVEL ${this.levelId}`]);

        rows.forEach(([label, value], index) => {
            const rowY = y - 30 + index * 20;
            if (index > 0) {
                this.add.rectangle(x, rowY - 10, 276, 1, 0x344252, 0.5).setDepth(5);
            }
            this.add.text(x - 138, rowY, label, {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#999999',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0, 0.5).setDepth(6);
            this.add.text(x + 138, rowY, value, {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(1, 0.5).setDepth(6);
        });
    }

    _rewardsCard(x, y, accent) {
        this._flatPanel(x, y, 332, 182, 3, 0.78);
        this.add.text(x - 138, y - 64, 'REWARDS', {
            fontSize: '15px',
            fontFamily: 'monospace',
            color: accent,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(5);

        this._rewardRow(x, y - 28, 'ui_icon_xp', 'XP EARNED', `+${this.xpReward}`, '#ffb44d');
        this.add.rectangle(x, y - 4, 276, 1, 0x344252, 0.5).setDepth(5);
        this._rewardRow(x, y + 20, 'ui_icon_scrap', 'SCRAP EARNED', `+${this.scrapReward}`, '#ffe066');
        this.add.rectangle(x, y + 44, 276, 1, 0x344252, 0.5).setDepth(5);
        this._progressRow(x, y + 68, accent);
    }

    _rewardRow(x, y, iconKey, label, value, color) {
        if (this.textures.exists(iconKey)) addIcon(this, iconKey, x - 124, y, 24, 6);
        this.add.text(x - 92, y - 8, label, {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#999999',
            stroke: '#000000',
                strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(6);
        this.add.text(x - 92, y + 8, value, {
            fontSize: '16px',
            fontFamily: 'monospace',
            color,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(6);
    }

    _progressRow(x, y, color) {
        if (this.textures.exists('ui_icon_vip')) addIcon(this, 'ui_icon_vip', x - 124, y, 24, 6);
        this.add.text(x - 96, y, `Lvl ${this.prog.level}`, {
            fontSize: '14px',
            fontFamily: 'monospace',
            color,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(6);

        if (this.textures.exists('ui_icon_xp')) addIcon(this, 'ui_icon_xp', x + 18, y, 22, 6);
        this.add.text(x + 44, y, `(${this.prog.xp}/${this.prog.xpToNext})`, {
            fontSize: '13px',
            fontFamily: 'monospace',
            color: '#9fd3ff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(6);
    }

    _flatPanel(x, y, w, h, depth = 0, alpha = 0.86) {
        return addSectionPanel(this, x, y, w, h, depth, alpha);
    }

    _buildButtons(isWin) {
        const buttons = [];

        if (this.battleMode === 'campaign' && isWin) {
            const world = WORLDS.find((w) => w.id === this.worldId);
            const bossLevel = world ? world.bossLevel : 6;
            const bossKey = world ? world.boss : null;

            if (this.bossKey) {
                buttons.push({
                    text: 'REPLAY BOSS',
                    cb: () => this.scene.start('BattleScene', {
                        mode: 'campaign',
                        world: this.worldId,
                        level: bossLevel,
                        arena: this._getArenaForWorld(this.worldId),
                        boss: bossKey,
                    }),
                });
                const nextWorld = WORLDS.find((w) => w.id === this.worldId + 1);
                if (nextWorld) {
                    buttons.push({
                        text: `NEXT ${nextWorld.name.toUpperCase()}`,
                        cb: () => this.scene.start('BattleScene', {
                            mode: 'campaign',
                            world: nextWorld.id,
                            level: 1,
                            arena: nextWorld.arena,
                        }),
                    });
                }
            } else if (this.levelId >= bossLevel - 1) {
                buttons.push({
                    text: 'BOSS FIGHT',
                    cb: () => this.scene.start('BattleScene', {
                        mode: 'campaign',
                        world: this.worldId,
                        level: bossLevel,
                        arena: this._getArenaForWorld(this.worldId),
                        boss: bossKey,
                    }),
                });
            } else {
                buttons.push({
                    text: 'NEXT LEVEL',
                    cb: () => this.scene.start('BattleScene', {
                        mode: 'campaign',
                        world: this.worldId,
                        level: this.levelId + 1,
                        arena: this._getArenaForWorld(this.worldId),
                    }),
                });
            }
        }

        if (this.isMultiplayer) {
            buttons.push({ text: 'NEW MATCH', cb: () => this.scene.start('MultiplayerScene') });
        } else {
            buttons.push({
                text: 'REMATCH',
                cb: () => this.scene.start('BattleScene', {
                    mode: this.battleMode,
                    boss: this.bossKey,
                    arena: this.arenaKey,
                    world: this.worldId,
                    level: this.levelId,
                }),
            });
        }

        buttons.push({ text: 'MENU', cb: () => this.scene.start('MenuScene') });
        return buttons;
    }

    _formatTime() {
        const minutes = Math.floor(this.battleTime / 60);
        const seconds = (this.battleTime % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    _victoryParticles() {
        const colors = [0x33ff33, 0xffdd33, 0xffa033, 0x33ffee];
        for (let i = 0; i < 26; i++) {
            const x = Math.random() * GAME_WIDTH;
            this.time.delayedCall(Math.random() * 800, () => {
                const color = colors[Math.floor(Math.random() * colors.length)];
                const p = this.add.rectangle(x, -10, 4 + Math.random() * 5, 4 + Math.random() * 5, color, 0.8)
                    .setAngle(Math.random() * 360);
                this.tweens.add({
                    targets: p,
                    y: GAME_HEIGHT + 20,
                    x: x + (Math.random() - 0.5) * 150,
                    angle: p.angle + (Math.random() - 0.5) * 600,
                    alpha: 0,
                    duration: 1800 + Math.random() * 1500,
                    ease: 'Quad.easeIn',
                    onComplete: () => p.destroy(),
                });
            });
        }
    }

    _getArenaForWorld(worldId) {
        const arenas = ['scrapyard', 'factory', 'volcano', 'cyber', 'space', 'jungle', 'ice', 'powerplant', 'quarry', 'rainbow'];
        return arenas[(worldId || 1) - 1] || 'scrapyard';
    }
}

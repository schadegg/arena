import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { addBackButton, addMenuBackdrop, addSectionPanel } from '../ui.js';

export default class TutorialScene extends Phaser.Scene {
    constructor() {
        super('TutorialScene');
    }

    create() {
        const audio = this.registry.get('audio');
        if (audio) {
            audio.init();
            audio.resume();
            audio.startMenuMusic();
        }
        this.cameras.main.fadeIn(200, 0, 0, 0);
        addMenuBackdrop(this, { overlayAlpha: 0.58 });
        addSectionPanel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 720, 560, 0, 0.94);

        this.step = 0;
        this.steps = [
            {
                title: 'WELCOME TO BATTLEBOTS!',
                text: 'You control a combat robot in an arena.\nYour goal: destroy your opponent before they destroy you!',
                hint: 'Press SPACE to continue',
            },
            {
                title: 'MOVEMENT',
                text: 'Use W A S D or Arrow Keys to move your bot.\nYour bot faces the direction you move.',
                hint: 'On mobile: use the virtual joystick',
            },
            {
                title: 'ATTACKING',
                text: 'Press SPACE to use your active weapon.\nMelee weapons need close contact.\nRanged weapons fire in your facing direction.',
                hint: 'Get close to enemies for melee, keep distance for ranged',
            },
            {
                title: 'DODGE ROLL',
                text: 'Press SHIFT to dodge roll!\nYou are invincible during the roll.\nCosts energy — watch your energy bar.',
                hint: 'Use dodge to avoid boss attacks and big hits',
            },
            {
                title: 'SWAP WEAPON',
                text: 'Press Q to swap to your alternate loadout.\nIf the active slot is a bomb, SPACE plants it at your position.',
                hint: 'Mix melee, ranged, and bomb loadouts',
            },
            {
                title: 'ENERGY',
                text: 'Attacks and dodges cost energy (blue bar).\nEnergy regenerates over time.\nManage your energy wisely!',
                hint: 'Spamming attacks will drain you fast',
            },
            {
                title: 'GAME MODES',
                text: 'Quick Battle — fight a random opponent\nCampaign — progress through 5 worlds with bosses\nWave Survival — endless waves, how far can you go?\nMultiplayer — fight real players online!',
                hint: 'Start with Quick Battle to learn',
            },
            {
                title: 'READY TO FIGHT!',
                text: 'Earn XP and Scrap from battles.\nUnlock new weapons, chassis, and skins.\nUpgrade your weapons for more power!',
                hint: 'Press SPACE to return to menu',
            },
        ];

        // Mark tutorial as done
        const prog = this.registry.get('progression');
        if (prog) { prog.data.tutorialDone = true; prog.save(); }

        this._showStep();

        this.input.keyboard.on('keydown-SPACE', () => {
            this.step++;
            if (this.step >= this.steps.length) {
                this.scene.start('MenuScene');
            } else {
                this._showStep();
            }
        });

        // Touch support
        this.input.on('pointerdown', () => {
            this.step++;
            if (this.step >= this.steps.length) {
                this.scene.start('MenuScene');
            } else {
                this._showStep();
            }
        });
    }

    _showStep() {
        if (this.content) this.content.destroy();
        this.content = this.add.container(0, 0);

        const s = this.steps[this.step];
        const cx = GAME_WIDTH / 2;

        // Progress dots
        for (let i = 0; i < this.steps.length; i++) {
            const dx = cx - (this.steps.length * 10) / 2 + i * 15;
            const color = i === this.step ? 0xff6633 : (i < this.step ? 0x33ff88 : 0x333344);
            this.content.add(this.add.circle(dx, 40, 4, color));
        }

        // Step counter
        this.content.add(this.add.text(cx, 70, `${this.step + 1} / ${this.steps.length}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#555555',
        }).setOrigin(0.5));

        // Title
        this.content.add(this.add.text(cx, 130, s.title, {
            fontSize: '28px', fontFamily: 'monospace', color: '#ff6633',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5));

        // Main text
        this.content.add(this.add.text(cx, 230, s.text, {
            fontSize: '15px', fontFamily: 'monospace', color: '#cccccc',
            align: 'center', lineSpacing: 8,
        }).setOrigin(0.5));

        // Hint
        this.content.add(this.add.text(cx, 380, s.hint, {
            fontSize: '12px', fontFamily: 'monospace', color: '#888888',
            fontStyle: 'italic',
        }).setOrigin(0.5));

        // Visual for current step
        this._drawStepVisual(this.step);

        // Continue prompt
        const prompt = this.add.text(cx, GAME_HEIGHT - 50, 'Press SPACE or tap to continue', {
            fontSize: '12px', fontFamily: 'monospace', color: '#555555',
        }).setOrigin(0.5);
        this.content.add(prompt);
        this.tweens.add({ targets: prompt, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

        // Back button on first step
        if (this.step === 0) {
            const back = addBackButton(this, () => this.scene.start('MenuScene'), { depth: 5 });
            for (const part of back._ownedParts) this.content.add(part);
        }
    }

    _drawStepVisual(step) {
        const gfx = this.add.graphics();
        this.content.add(gfx);
        const cx = GAME_WIDTH / 2, cy = 470;

        switch (step) {
            case 1: // Movement - draw WASD keys
                ['W', 'A', 'S', 'D'].forEach((key, i) => {
                    const offsets = [[0, -1], [-1, 0], [0, 1], [1, 0]];
                    const kx = cx + offsets[i][0] * 40;
                    const ky = cy + offsets[i][1] * 30;
                    gfx.fillStyle(0x222233, 0.8);
                    gfx.fillRect(kx - 15, ky - 12, 30, 24);
                    gfx.lineStyle(1, 0x555566);
                    gfx.strokeRect(kx - 15, ky - 12, 30, 24);
                });
                break;
            case 2: // Attack - space bar
                gfx.fillStyle(0x222233, 0.8);
                gfx.fillRect(cx - 80, cy - 12, 160, 24);
                gfx.lineStyle(1, 0xff6633);
                gfx.strokeRect(cx - 80, cy - 12, 160, 24);
                break;
            case 5: // Energy - draw energy bar
                gfx.fillStyle(0x333333, 1);
                gfx.fillRect(cx - 100, cy, 200, 8);
                gfx.fillStyle(0x3388ff, 1);
                gfx.fillRect(cx - 100, cy, 140, 8);
                break;
        }
    }
}

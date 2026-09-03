import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import {
    addBackButton,
    addButton,
    addCroppedImage,
    addMenuBackdrop,
    addSectionPanel,
    setButtonTextureForState,
} from '../ui.js';

export default class SettingsScene extends Phaser.Scene {
    constructor() {
        super('SettingsScene');
    }

    create() {
        this.audio = this.registry.get('audio');
        if (this.audio) {
            this.audio.init();
            this.audio.resume();
            this.audio.startMenuMusic(this);
        }
        this.cameras.main.fadeIn(200, 0, 0, 0);

        this.panelWidth = 720;
        this.panelX = GAME_WIDTH / 2;
        this.layout = {
            title: { y: 26, h: 48 },
            audio: { y: 90, h: 150 },
            controls: { y: 250, h: 240 },
            difficulty: { y: 500, h: 130 },
            footer: { y: 645, h: 40 },
        };
        this.palette = {
            accent: '#ffaa33',
            text: '#e8e0d4',
            subtle: '#888888',
            success: '#33dd55',
            danger: '#ff4444',
        };

        addMenuBackdrop(this, { imageKey: 'ui_menu_bg', overlayAlpha: 0.45 });
        addSectionPanel(this, GAME_WIDTH / 2, 50, 500, 48, 1, 0.9);
        this.add.text(GAME_WIDTH / 2, 49, 'SETTINGS', {
            fontSize: '22px',
            fontFamily: 'monospace',
            color: this.palette.accent,
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(2);

        const audio = this._section(
            'audio',
            'ui_icon_audio',
            'AUDIO SYSTEMS',
            'Music and effects apply immediately'
        );
        this._slider(
            audio.contentX,
            audio.contentY + 10,
            'MASTER VOLUME',
            this.audio ? this.audio.volume : 0.5,
            (value) => {
                if (this.audio) this.audio.setVolume(value);
            }
        );
        this._slider(
            audio.contentX,
            audio.contentY + 50,
            'MUSIC VOLUME',
            this.audio ? this.audio.musicVolume : 0.3,
            (value) => {
                if (this.audio) this.audio.setMusicVolume(value);
            }
        );

        const controlsSec = this._section(
            'controls',
            'ui_icon_controls',
            'CONTROL MAP',
            'Keyboard bindings and combat inputs'
        );
        const controls = [
            ['WASD / Arrows', 'Move chassis'],
            ['SPACE', 'Use active weapon'],
            ['SHIFT', 'Dodge / block'],
            ['Q', 'Swap active weapon'],
            ['E', 'Secondary / legacy special'],
            ['ESC', 'Pause / resume'],
        ];
        const keyX = controlsSec.contentX - 180;
        const actionX = controlsSec.contentX - 100;
        controls.forEach(([key, action], index) => {
            const rowY = controlsSec.contentY + index * 30;
            const capWidth = Math.max(70, key.length * 8 + 16);
            addCroppedImage(this, 'ui_keycap', keyX, rowY, capWidth, 22, 1);
            this.add.text(keyX, rowY, key, {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: this.palette.accent,
            }).setOrigin(0.5).setDepth(2);
            this.add.text(actionX, rowY, action, {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: this.palette.text,
            }).setOrigin(0, 0.5).setDepth(2);
        });

        const diffSec = this._section(
            'difficulty',
            'ui_icon_difficulty',
            'DIFFICULTY',
            'Affects enemy aggression and rewards'
        );
        const diffs = [
            { key: 'easy', label: 'EASY' },
            { key: 'medium', label: 'MEDIUM' },
            { key: 'hard', label: 'HARD' },
            { key: 'nightmare', label: 'NIGHTMARE' },
        ];
        const buttonWidth = 130;
        const buttonHeight = 32;
        const buttonGap = 12;
        const totalWidth = diffs.length * buttonWidth + (diffs.length - 1) * buttonGap;
        const startX = diffSec.contentX - totalWidth / 2 + buttonWidth / 2;
        const buttonY = diffSec.contentY + 50;
        const currentDiff = this.registry.get('difficulty') || 'medium';

        diffs.forEach((diff, index) => {
            const buttonX = startX + index * (buttonWidth + buttonGap);
            const selected = diff.key === currentDiff;
            const btn = addButton(this, buttonX, buttonY, buttonWidth, buttonHeight, diff.label, () => {
                this.registry.set('difficulty', diff.key);
                this.scene.restart();
            }, {
                textColor: selected ? this.palette.accent : this.palette.subtle,
                depth: 2,
            });

            if (selected) {
                setButtonTextureForState(this, btn, buttonWidth, buttonHeight, 'hover');
                btn.on('pointerout', () => {
                    setButtonTextureForState(this, btn, buttonWidth, buttonHeight, 'hover');
                });
            }
        });

        addBackButton(this, () => this.scene.start('MenuScene'), { textColor: this.palette.accent, depth: 2 });
        this._btn(
            GAME_WIDTH / 2,
            this.layout.footer.y + this.layout.footer.h / 2,
            'RESET ALL DATA',
            this.palette.danger,
            () => {
                const prog = this.registry.get('progression');
                if (prog) prog.resetSave();
                this.scene.start('MenuScene');
            }
        );
    }

    _color(name) {
        return Phaser.Display.Color.HexStringToColor(this.palette[name]).color;
    }

    _section(layoutKey, iconKey, headerText, hint) {
        const layout = this.layout[layoutKey];
        addSectionPanel(
            this,
            this.panelX,
            layout.y + layout.h / 2,
            this.panelWidth,
            layout.h,
            0,
            0.94
        );

        const headerY = layout.y + 22;
        addCroppedImage(
            this,
            iconKey,
            this.panelX - this.panelWidth / 2 + 28,
            headerY,
            20,
            20,
            1
        );

        this.add.text(this.panelX - this.panelWidth / 2 + 50, headerY, headerText, {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: this.palette.accent,
        }).setOrigin(0, 0.5).setDepth(1);

        if (hint) {
            this.add.text(this.panelX + this.panelWidth / 2 - 20, headerY, hint, {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: this.palette.subtle,
            }).setOrigin(1, 0.5).setDepth(1);
        }

        return { contentX: this.panelX, contentY: layout.y + 50 };
    }

    _slider(x, y, label, initialValue, onChange) {
        this.add.text(x - 280, y, label, {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: this.palette.text,
        }).setOrigin(0, 0.5).setDepth(2);

        const trackWidth = 280;
        const trackX = x - 20;
        addCroppedImage(this, 'ui_slider_track', trackX, y, trackWidth, 8, 2);

        const fillBar = this.add.rectangle(
            trackX - trackWidth / 2,
            y,
            trackWidth * initialValue,
            4,
            this._color('accent')
        ).setOrigin(0, 0.5).setDepth(3);

        const knob = addCroppedImage(
            this,
            'ui_slider_knob',
            trackX - trackWidth / 2 + trackWidth * initialValue,
            y,
            22,
            22,
            4
        ).setInteractive({ useHandCursor: true, draggable: true });

        const valText = this.add.text(x + 230, y, `${Math.round(initialValue * 100)}%`, {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: this.palette.text,
        }).setOrigin(1, 0.5).setDepth(2);

        this.input.setDraggable(knob);
        knob.on('drag', (_, dragX) => {
            const minX = trackX - trackWidth / 2;
            const maxX = trackX + trackWidth / 2;
            knob.x = Math.max(minX, Math.min(maxX, dragX));
            const value = (knob.x - minX) / trackWidth;
            fillBar.width = knob.x - minX;
            valText.setText(`${Math.round(value * 100)}%`);
            onChange(value);
        });
    }

    _btn(x, y, text, color, callback) {
        return addButton(this, x, y, 160, 32, text, callback, {
            textColor: color,
            depth: 2,
        });
    }
}

import { COLORS, GAME_WIDTH, GAME_HEIGHT, WEAPONS, SKINS, CHASSIS, ARMOR_UPGRADES, SPEED_UPGRADES, WEAPON_UPGRADES } from '../constants.js';
import Bot from '../entities/Bot.js';
import { UI_THEME, addBackButton, addButton, addIcon, addMenuBackdrop, addPanel, addPlainSectionPanel, addRowPanel, addSectionPanel, addUiText, fitTextToWidth } from '../ui.js';

export default class CustomizeScene extends Phaser.Scene {
    constructor() {
        super('CustomizeScene');
    }

    create() {
        this.prog = this.registry.get('progression');
        this.audio = this.registry.get('audio');
        this.palette = UI_THEME.colors;
        this.previewAngle = Math.PI;
        if (this.audio) {
            this.audio.init();
            this.audio.resume();
            this.audio.startMenuMusic();
        }
        this.cameras.main.fadeIn(200, 0, 0, 0);

        addMenuBackdrop(this, { overlayAlpha: 0.34 });
        this.layout = {
            title: { x: GAME_WIDTH / 2, y: 50, w: 500, h: 48 },
            tabs: { x: GAME_WIDTH / 2, y: 104, w: 500, h: 30 },
            content: { x: 348, y: 406, w: 620, h: 538 },
            preview: { x: 826, y: 406, w: 250, h: 538 },
        };

        addPanel(this, this.layout.content.x, this.layout.content.y, this.layout.content.w, this.layout.content.h, 2, 0.9);
        this.add.rectangle(this.layout.content.x, this.layout.content.y, this.layout.content.w - 58, this.layout.content.h - 58, 0x071018, 0.22).setDepth(3);

        // Title
        addSectionPanel(this, this.layout.title.x, this.layout.title.y, this.layout.title.w, this.layout.title.h, 2, 0.9);
        addUiText(this, this.layout.title.x, this.layout.title.y - 1, 'CUSTOMIZE YOUR BOT', 'title', {
            style: { fontSize: '22px', color: '#ffaa33' },
            origin: 0.5,
            depth: 3,
            maxWidth: 460,
        });

        // Back button
        addBackButton(this, () => this.scene.start('MenuScene'));
        this._createScrapStatus();

        // Tabs
        this.currentTab = 'weapons';
        this.selectedWeaponKey = this.prog.weapon || 'spinner';
        this.nameInput = this.prog.botName;
        this.nameEditing = false;
        this.tabContainer = this.add.container(0, 0);

        this.tabs = [
            { key: 'weapons', label: 'WEAPONS' },
            { key: 'chassis', label: 'CHASSIS' },
            { key: 'upgrades', label: 'UPGRADES' },
        ];
        this.tabButtons = [];
        this._renderTabButtons();

        // Preview bot
        this.previewPanel = this.layout.preview;
        this.previewViewport = { x: this.previewPanel.x, y: 272, w: 196, h: 170 };
        this.previewInfoPanel = { x: this.previewPanel.x, y: 450, w: 206, h: 118 };
        this.previewNamePanel = { x: this.previewPanel.x, y: 594, w: 206, h: 108 };
        this.previewCenter = { x: this.previewViewport.x, y: this.previewViewport.y + 18 };
        this.previewPrimaryAnchor = { x: this.previewViewport.x - this.previewViewport.w / 2 + 34, y: this.previewViewport.y - this.previewViewport.h / 2 + 34 };
        this.previewSecondaryAnchor = { x: this.previewViewport.x + this.previewViewport.w / 2 - 34, y: this.previewViewport.y - this.previewViewport.h / 2 + 34 };
        addSectionPanel(this, this.previewPanel.x, this.previewPanel.y, this.previewPanel.w, this.previewPanel.h, 2, 0.94);
        this.add.rectangle(this.previewViewport.x, this.previewViewport.y, this.previewViewport.w, this.previewViewport.h, 0x090c12, 0.96).setDepth(3);
        addSectionPanel(this, this.previewInfoPanel.x, this.previewInfoPanel.y, this.previewInfoPanel.w, this.previewInfoPanel.h, 3, 0.92);
        this._createNameEditor();
        addUiText(this, this.previewPanel.x, 164, 'LIVE PREVIEW', 'section', {
            style: { color: this.palette.accent },
            origin: 0.5,
            depth: 4,
        });
        this._drawPreview(true);
        this._nameKeyHandler = (event) => this._handleNameKey(event);
        this.input.keyboard.on('keydown', this._nameKeyHandler);

        // Tab content container
        this.contentContainer = this.add.container(0, 0).setDepth(5);
        this._renderTab();
        this._drawPreview(true);
        this.time.delayedCall(0, () => this._drawPreview(true));

        this.events.once('shutdown', () => {
            if (this.previewBot) this.previewBot.destroy();
            if (this.previewPrimaryWeaponSprite) this.previewPrimaryWeaponSprite.destroy();
            if (this.previewSecondaryWeaponSprite) this.previewSecondaryWeaponSprite.destroy();
            if (this.previewTexts) this.previewTexts.forEach((t) => t.destroy());
            if (this._nameKeyHandler) this.input.keyboard.off('keydown', this._nameKeyHandler);
        });
    }

    update(time, delta) {
        this._syncPreviewIfLoadoutChanged();
        if (!this.previewBot) return;
        this.previewBot.angle = this.previewAngle;
        this.previewBot.moveDir.x = 0;
        this.previewBot.moveDir.y = 0;
        this.previewBot.vx = 0;
        this.previewBot.vy = 0;
        this.previewBot.knockbackVx = 0;
        this.previewBot.knockbackVy = 0;
        this.previewBot.velX = 0;
        this.previewBot.velY = 0;
        this.previewBot.x = this.previewCenter.x;
        this.previewBot.y = this.previewCenter.y;
        this.previewBot.update(delta);
        this.previewBot.x = this.previewCenter.x;
        this.previewBot.y = this.previewCenter.y;
        this.previewBot.container.setPosition(this.previewCenter.x, this.previewCenter.y);
        this._syncPreviewWeaponSprite();
        if (this.previewBot.spriteRenderer?.weaponSprite) {
            this.previewBot.spriteRenderer.weaponSprite.setVisible(false);
        }
        if (this.previewPrimaryWeaponSprite) this.previewPrimaryWeaponSprite.setVisible(true).setDepth(24);
        if (this.previewSecondaryWeaponSprite) this.previewSecondaryWeaponSprite.setVisible(true).setDepth(24);
    }

    _renderTab() {
        this.contentContainer.removeAll(true);
        this.contentContainer.setPosition(0, 0);
        this._updateScrapStatus();

        switch (this.currentTab) {
            case 'weapons': this._renderWeapons(); break;
            case 'chassis': this._renderChassis(); break;
            case 'upgrades': this._renderUpgrades(); break;
        }
    }

    _createScrapStatus() {
        const panelW = 132;
        const panelH = 88;
        const panelRight = this.layout.preview.x + this.layout.preview.w / 2;
        const x = panelRight - panelW / 2;
        const y = 78;
        const rowCenterX = x - 2;
        const iconX = rowCenterX - 46;
        const textX = iconX + 22;
        const textMaxW = panelRight - textX - 8;

        addPanel(this, x, y, panelW, panelH, 2, 0.84);

        this._addStatusIcon('ui_icon_vip', iconX, y - 26, 17, 4, null, 0x9fb0bf)
            ?.setTint(0x9fb0bf)
            ?.setAlpha(0.86);
        this.levelAmountText = this.add.text(textX, y - 26, `Lvl ${this.prog.level}`, {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#d7e0e8',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(4);
        fitTextToWidth(this.levelAmountText, textMaxW, 9);

        this._addStatusIcon('ui_icon_xp', iconX, y, 17, 4, null, 0x9fb0bf)
            ?.setTint(0x9fb0bf)
            ?.setAlpha(0.86);
        this.xpAmountText = this.add.text(textX, y, `(${this.prog.xp}/${this.prog.xpToNext})`, {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#b8c5d0',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(4);
        fitTextToWidth(this.xpAmountText, textMaxW, 8);

        this._addStatusIcon('ui_icon_scrap', iconX, y + 26, 17, 4, null, 0x9fb0bf)
            ?.setTint(0x9fb0bf)
            ?.setAlpha(0.86);
        this.scrapAmountText = this.add.text(textX, y + 26, `${this.prog.scrap}`, {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#d7e0e8',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(4);
        fitTextToWidth(this.scrapAmountText, textMaxW, 9);
    }

    _updateScrapStatus() {
        const panelRight = this.layout.preview.x + this.layout.preview.w / 2;
        const textMaxW = panelRight - (this.levelAmountText?.x || 0) - 10;
        if (this.levelAmountText) {
            this.levelAmountText.setText(`Lvl ${this.prog.level}`);
            fitTextToWidth(this.levelAmountText, textMaxW, 9);
        }
        if (this.xpAmountText) {
            this.xpAmountText.setText(`(${this.prog.xp}/${this.prog.xpToNext})`);
            fitTextToWidth(this.xpAmountText, textMaxW, 8);
        }
        if (this.scrapAmountText) {
            this.scrapAmountText.setText(`${this.prog.scrap}`);
            fitTextToWidth(this.scrapAmountText, textMaxW, 9);
        }
    }

    _renderTabButtons() {
        if (this.tabButtons) {
            this.tabButtons.forEach((part) => part.destroy());
        }
        this.tabButtons = [];

        const TAB_W = 156;
        const TAB_GAP = 16;
        const totalW = this.tabs.length * TAB_W + (this.tabs.length - 1) * TAB_GAP;
        const startX = (GAME_WIDTH - totalW) / 2 + TAB_W / 2;

        this.tabs.forEach((tab, i) => {
            const isCurrent = this.currentTab === tab.key;
            const btn = addButton(this, startX + i * (TAB_W + TAB_GAP), this.layout.tabs.y, TAB_W, 30, tab.label, () => {
                this.currentTab = tab.key;
                this._renderTabButtons();
                this._renderTab();
            }, {
                textColor: isCurrent ? '#ff4444' : '#ffffff',
                fontSize: '10px',
                depth: 4,
            });
            this.tabButtons.push(...btn._ownedParts);
        });
    }

    _renderWeapons() {
        const weapons = Object.entries(WEAPONS);
        if (!WEAPONS[this.selectedWeaponKey]) this.selectedWeaponKey = this.prog.weapon || weapons[0][0];

        const startY = 164;
        const colX = [64, 358];
        const panelWidth = 274;
        const splitIndex = Math.ceil(weapons.length / 2);

        weapons.forEach(([key, weapon], i) => {
            const col = i < splitIndex ? 0 : 1;
            const row = i < splitIndex ? i : i - splitIndex;
            const x = colX[col];
            const y = startY + row * 42;

            const unlocked = this.prog.isWeaponUnlocked(key);
            const available = this.prog.isWeaponAvailable(key);
            const isPrimary = this.prog.weapon === key;
            const isSecondary = this.prog.secondaryWeapon === key;
            const isSelected = this.selectedWeaponKey === key;

            const bgColor = isSelected ? 0x344150 : (isPrimary ? 0x203a25 : (isSecondary ? 0x202744 : (unlocked ? 0x1a1a1a : 0x111111)));
            const borderColor = isPrimary ? COLORS.GREEN
                : (isSecondary ? COLORS.BLUE : (unlocked ? weapon.color : (available ? COLORS.GOLD : COLORS.DARK_GRAY)));

            const bg = this._addContentPanel(x + panelWidth / 2, y, panelWidth, 38, isSelected ? 0.94 : 0.76);
            bg.setTint(bgColor === 0x1a1a1a ? 0x2b2f36 : bgColor);

            // Weapon thumbnail
            const weaponThumb = this._thumbTextureForWeapon(key);
            if (weaponThumb) {
                this.contentContainer.add(
                    this.add.sprite(x + 22, y, weaponThumb, 0)
                        .setDisplaySize(30, 30)
                        .setDepth(6)
                );
            } else {
                this.contentContainer.add(this.add.circle(x + 22, y, 12, borderColor).setStrokeStyle(1, 0x000000));
            }

            // Name
            const nameColor = unlocked ? '#ffffff' : (available ? '#b0b6bf' : '#545b66');
            const nameLabel = this.add.text(x + 46, y - 10, weapon.name, {
                fontSize: '12px', fontFamily: 'monospace', color: nameColor,
                stroke: '#000000', strokeThickness: 2,
            });
            fitTextToWidth(nameLabel, 142, 9);
            this.contentContainer.add(nameLabel);

            // Stats
            const statsText = `DMG ${weapon.damage}   RNG ${this._rangeValueForWeapon(weapon)}   CD ${weapon.cooldown}`;
            const statsLabel = this.add.text(x + 46, y + 4, statsText, {
                fontSize: '9px', fontFamily: 'monospace', color: this.palette.subtle,
                stroke: '#000000', strokeThickness: 2,
            });
            fitTextToWidth(statsLabel, 150, 8);
            this.contentContainer.add(statsLabel);

            // Status
            if (isPrimary) {
                this.contentContainer.add(this.add.text(x + panelWidth - 42, y, 'PRIMARY', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#ffdd66',
                }).setOrigin(0.5));
            } else if (isSecondary) {
                this.contentContainer.add(this.add.text(x + panelWidth - 42, y, 'ALT', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#ffaa33',
                }).setOrigin(0.5));
            } else if (unlocked) {
                this.contentContainer.add(this.add.text(x + panelWidth - 42, y, 'OWNED', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#9fb0bf',
                }).setOrigin(0.5));
            } else if (available) {
                const cost = weapon.cost || 0;
                const actionX = x + panelWidth - 42;
                if (cost > 0) {
                    this._addScrapIcon(actionX - 24, y, 12, 6, this.contentContainer);
                    this.contentContainer.add(this.add.text(actionX - 12, y, `${cost}`, {
                        fontSize: '10px', fontFamily: 'monospace', color: '#ffdd33',
                    }).setOrigin(0, 0.5));
                } else {
                    this.contentContainer.add(this.add.text(actionX, y, 'FREE', {
                        fontSize: '10px', fontFamily: 'monospace', color: '#ffdd33',
                    }).setOrigin(0.5));
                }
            } else {
                this.contentContainer.add(this.add.text(x + panelWidth - 42, y, `Lv.${weapon.unlockLevel}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#555555',
                }).setOrigin(0.5));
            }

            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setAlpha(isSelected ? 1 : 0.9));
            bg.on('pointerout', () => bg.setAlpha(isSelected ? 0.94 : 0.76));
            bg.on('pointerdown', () => {
                this.selectedWeaponKey = key;
                this._renderTab();
            });
        });

        this._renderWeaponDetail();
    }

    _renderWeaponDetail() {
        const key = this.selectedWeaponKey;
        const weapon = WEAPONS[key];
        if (!weapon) return;

        const cx = this.layout.content.x;
        const cy = 616;
        const unlocked = this.prog.isWeaponUnlocked(key);
        const available = this.prog.isWeaponAvailable(key);
        const isPrimary = this.prog.weapon === key;
        const isSecondary = this.prog.secondaryWeapon === key;

        const detail = this._addContentPanel(cx, cy, 570, 96, 0.84);
        detail.setTint(isPrimary ? 0x1c3422 : (isSecondary ? 0x1c243c : 0x222936));

        const thumb = this._thumbTextureForWeapon(key);
        if (thumb) {
            this.contentContainer.add(this.add.sprite(cx - 244, cy - 16, thumb, 0).setDisplaySize(46, 46).setDepth(6));
        } else {
            this.contentContainer.add(this.add.circle(cx - 244, cy - 16, 18, weapon.color).setStrokeStyle(2, 0x000000));
        }

        const title = this.add.text(cx - 206, cy - 36, weapon.name.toUpperCase(), {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        });
        fitTextToWidth(title, 250, 10);
        this.contentContainer.add(title);

        const desc = this.add.text(cx - 206, cy - 18, weapon.description || '', {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: this.palette.subtle,
            stroke: '#000000',
            strokeThickness: 1,
            wordWrap: { width: 270 },
        });
        this.contentContainer.add(desc);

        const stats = `DMG ${weapon.damage}   RANGE ${this._rangeValueForWeapon(weapon)}   COOLDOWN ${weapon.cooldown}ms`;
        this.contentContainer.add(this.add.text(cx - 206, cy + 22, stats, {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#ffdd66',
            stroke: '#000000',
            strokeThickness: 2,
        }));

        const actionX = cx + 204;
        const actionW = 128;
        if (isPrimary) {
            this.contentContainer.add(this.add.text(actionX, cy - 20, 'PRIMARY EQUIPPED', {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#ffdd66',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5));
            if (!isSecondary) {
                this._contentBtn(actionX, cy + 18, actionW, 'SET ALT', '#88aaff', () => {
                    this.prog.setSecondaryWeapon(key);
                    this._renderTab();
                    this._drawPreview();
                });
            }
        } else if (isSecondary) {
            this.contentContainer.add(this.add.text(actionX, cy - 20, 'ALT EQUIPPED', {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#88aaff',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5));
            this._contentBtn(actionX, cy + 18, actionW, 'SET PRIMARY', '#ffdd66', () => {
                this.prog.setWeapon(key);
                this._renderTab();
                this._drawPreview();
            });
        } else if (unlocked) {
            this._contentBtn(actionX, cy - 18, actionW, 'SET PRIMARY', '#ffdd66', () => {
                this.prog.setWeapon(key);
                this._renderTab();
                this._drawPreview();
            });
            this._contentBtn(actionX, cy + 18, actionW, 'SET ALT', '#88aaff', () => {
                this.prog.setSecondaryWeapon(key);
                this._renderTab();
                this._drawPreview();
            });
        } else if (available) {
            const cost = weapon.cost || 0;
            this._contentBtn(actionX, cy - 4, 144, cost > 0 ? `BUY ${cost}` : 'UNLOCK', '#ffdd33', () => {
                if (this.prog.purchaseWeapon(key)) {
                    this._renderTab();
                    this._drawPreview();
                }
            });
            if (cost > 0) this._addScrapIcon(actionX - 52, cy - 4, 13, 7, this.contentContainer);
        } else {
            this.contentContainer.add(this.add.text(actionX, cy - 4, `UNLOCKS AT LEVEL ${weapon.unlockLevel}`, {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#777777',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5));
        }
    }

    _renderChassis() {
        const chassisEntries = Object.entries(CHASSIS);
        const startY = 184;
        const rowPitch = 80;

        chassisEntries.forEach(([key, ch], i) => {
            const x = 78;
            const y = startY + i * rowPitch;
            const equipped = this.prog.chassis === key;
            const available = this.prog.isChassisAvailable ? this.prog.isChassisAvailable(key) : this.prog.level >= (ch.unlockLevel || 1);

            const bg = this._addContentPanel(this.layout.content.x, y, 570, 72, equipped ? 0.92 : 0.78);
            bg.setTint(equipped ? 0x224422 : (available ? 0x2b2f36 : 0x111118));

            const chassisIcon = this._thumbTextureForChassis(key);
            if (chassisIcon) {
                this.contentContainer.add(this.add.sprite(x + 42, y + 1, chassisIcon, 0)
                    .setDisplaySize(46, 46)
                    .setAlpha(available ? 1 : 0.35)
                    .setDepth(6));
            } else {
                this.contentContainer.add(this.add.rectangle(x + 42, y + 1, 34, 34, ch.color)
                    .setAlpha(available ? 1 : 0.35)
                    .setStrokeStyle(2, 0x000000));
            }

            const name = this.add.text(x + 82, y, ch.name, {
                fontSize: '16px', fontFamily: 'monospace', color: available ? '#ffffff' : '#555b64',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5);
            fitTextToWidth(name, 118, 12);
            this.contentContainer.add(name);

            // Stat bars
            this._drawStatBar(x + 220, y - 22, 'HP', ch.hp / 550, COLORS.GREEN, available ? 1 : 0.35, ch.hp);
            this._drawStatBar(x + 220, y - 4, 'SPD', ch.speed / 230, COLORS.CYAN, available ? 1 : 0.35, ch.speed);
            this._drawStatBar(x + 220, y + 14, 'ARM', ch.armor / 0.35, COLORS.ORANGE, available ? 1 : 0.35, `${Math.round(ch.armor * 100)}%`);

            if (equipped) {
                this.contentContainer.add(this.add.text(x + 462, y, 'EQUIPPED', {
                    fontSize: '12px', fontFamily: 'monospace', color: '#ffdd66',
                }).setOrigin(0.5));
            } else if (!available) {
                this.contentContainer.add(this.add.text(x + 462, y, `Lv.${ch.unlockLevel || 1}`, {
                    fontSize: '12px', fontFamily: 'monospace', color: '#555555',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5));
            } else {
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerover', () => bg.setAlpha(0.95));
                bg.on('pointerout', () => bg.setAlpha(0.82));
                bg.on('pointerdown', () => {
                    this.prog.setChassis(key);
                    this._renderTab();
                    this._drawPreview();
                });
                this._contentBtn(x + 462, y, 86, 'SELECT', '#ffffff', () => {
                    this.prog.setChassis(key);
                    this._renderTab();
                    this._drawPreview();
                });
            }
        });

        this._renderCustomColorSection(582);
    }

    _renderCustomColorSection(cy) {
        this._addContentPanel(this.layout.content.x, cy, 570, 108, 0.76);
        this.contentContainer.add(this.add.text(80, cy - 38, 'CUSTOM COLOR', {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffaa33',
        }));

        const customColor = this.prog.customColor || [128, 128, 128];
        const labels = ['R', 'G', 'B'];
        const colors = ['#ff4444', '#ffaa33', '#ffdd66'];
        const swatchColor = (customColor[0] << 16) | (customColor[1] << 8) | customColor[2];
        this.contentContainer.add(this.add.rectangle(100, cy + 12, 48, 48, swatchColor).setStrokeStyle(2, 0x000000));

        labels.forEach((label, i) => {
            const rx = 174 + i * 106;
            const ry = cy - 12;

            this.contentContainer.add(this.add.text(rx, ry, `${label}: ${customColor[i]}`, {
                fontSize: '11px', fontFamily: 'monospace', color: colors[i],
            }));

            this._contentBtn(rx + 18, ry + 40, 28, '-', '#ffffff', () => {
                customColor[i] = Math.max(0, customColor[i] - 15);
                this.prog.setCustomColor([...customColor]);
                this._renderTab();
                this._drawPreview();
            });

            this._contentBtn(rx + 52, ry + 40, 28, '+', '#ffffff', () => {
                customColor[i] = Math.min(255, customColor[i] + 15);
                this.prog.setCustomColor([...customColor]);
                this._renderTab();
                this._drawPreview();
            });
        });

        this._contentBtn(542, cy + 6, 140, 'APPLY CUSTOM', '#ffdd66', () => {
            this.prog.setSkin('custom');
            this.prog.setCustomColor([...customColor]);
            this._renderTab();
            this._drawPreview();
        });
    }

    _drawStatBar(x, y, label, ratio, color, alpha = 1, value = '') {
        this.contentContainer.add(this.add.text(x, y, label, {
            fontSize: '9px', fontFamily: 'monospace', color: this.palette.subtle,
        }).setAlpha(alpha));
        const barWidth = 90;
        const barLeft = x + 42;
        const barBg = addPanel(this, barLeft + barWidth / 2, y + 5, barWidth + 4, 10, 2, 0.66);
        const barFill = this.add.rectangle(barLeft, y + 5, barWidth * Math.min(1, ratio), 6, color)
            .setAlpha(alpha)
            .setOrigin(0, 0.5);
        barBg.setAlpha(barBg.alpha * alpha);
        this.contentContainer.add(barBg);
        this.contentContainer.add(barFill);
        this.contentContainer.add(this.add.text(barLeft + barWidth + 12, y + 5, `${value}`, {
            fontSize: '9px', fontFamily: 'monospace', color: this.palette.text,
            stroke: '#000000', strokeThickness: 2,
        }).setAlpha(alpha).setOrigin(0, 0.5));
    }

    _renderUpgrades() {
        const leftRowCenter = 230;
        const leftRowWidth = 300;
        const leftRowTextX = 92;
        const leftRowActionX = 346;
        const leftRowEdge = leftRowCenter - leftRowWidth / 2;
        const headingIconSize = 18;
        const headingTextX = leftRowEdge + headingIconSize + 10;
        const startY = 168;
        const rowPitch = 36;
        const armorRowStartY = startY + 42;
        const speedY = 390;
        const speedRowStartY = speedY + 42;

        // ── Armor Upgrades ──
        this._addUpgradeHeadingIcon('ui_shield', leftRowEdge, startY + 9, headingIconSize);
        this.contentContainer.add(this.add.text(headingTextX, startY, 'ARMOR PLATING', {
            fontSize: '16px', fontFamily: 'monospace', color: this.palette.accent,
        }));
        const armorLvl = this.prog.data.armorLevel || 0;
        ARMOR_UPGRADES.forEach((upg, i) => {
            const y = armorRowStartY + i * rowPitch;
            const owned = armorLvl > i;
            const canBuy = !owned && armorLvl === i && this.prog.level >= upg.unlockLevel;
            const bg = this._addContentPanel(leftRowCenter, y, leftRowWidth, 30, 0.78);
            bg.setTint(owned ? 0x1a2a1a : 0x111118);
            const label = this.add.text(leftRowTextX, y - 6, `${upg.name}  (+${Math.round(upg.armor * 100)}% armor)`, {
                fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
            });
            fitTextToWidth(label, 168, 9);
            this.contentContainer.add(label);
            if (owned) {
                this.contentContainer.add(this.add.text(leftRowActionX, y, 'OWNED', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#ffffff',
                }).setOrigin(0.5));
            } else if (canBuy) {
                this._contentBtn(leftRowActionX, y, 82, `BUY ${upg.cost}`, '#ffdd33', () => { this.prog.buyArmorUpgrade(); this._renderTab(); });
            } else {
                this.contentContainer.add(this.add.text(leftRowActionX, y, `Lv.${upg.unlockLevel}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#555555',
                }).setOrigin(0.5));
            }
        });

        // ── Speed Upgrades ──
        this._addUpgradeHeadingIcon('ui_wheel', leftRowEdge, speedY + 9, headingIconSize);
        this.contentContainer.add(this.add.text(headingTextX, speedY, 'SPEED BOOST', {
            fontSize: '16px', fontFamily: 'monospace', color: this.palette.info,
        }));
        const speedLvl = this.prog.data.speedLevel || 0;
        SPEED_UPGRADES.forEach((upg, i) => {
            const y = speedRowStartY + i * rowPitch;
            const owned = speedLvl > i;
            const canBuy = !owned && speedLvl === i && this.prog.level >= upg.unlockLevel;
            const bg = this._addContentPanel(leftRowCenter, y, leftRowWidth, 30, 0.78);
            bg.setTint(owned ? 0x1a2a2a : 0x111118);
            const label = this.add.text(leftRowTextX, y - 6, `${upg.name}  (+${upg.speed} speed)`, {
                fontSize: '11px', fontFamily: 'monospace', color: owned ? '#ffffff' : '#ffffff',
            });
            fitTextToWidth(label, 168, 9);
            this.contentContainer.add(label);
            if (owned) {
                this.contentContainer.add(this.add.text(leftRowActionX, y, 'OWNED', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#ffffff',
                }).setOrigin(0.5));
            } else if (canBuy) {
                this._contentBtn(leftRowActionX, y, 82, `BUY ${upg.cost}`, '#ffdd33', () => { this.prog.buySpeedUpgrade(); this._renderTab(); });
            } else {
                this.contentContainer.add(this.add.text(leftRowActionX, y, `Lv.${upg.unlockLevel}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#555555',
                }).setOrigin(0.5));
            }
        });

        // ── Weapon Upgrades (current weapon) ──
        const cardX = 518;
        const cardY = 282;
        const cardW = 236;
        const cardH = 216;
        const wk = this.prog.weapon;
        const wep = WEAPONS[wk];
        const tier = this.prog.getWeaponTier(wk);
        const tierLabels = WEAPON_UPGRADES.tiers;
        this._addContentPanel(cardX, cardY, cardW, cardH, 0.84);
        this.contentContainer.add(this.add.text(cardX, cardY - 84, `WEAPON UPGRADE`, {
            fontSize: '16px', fontFamily: 'monospace', color: this.palette.danger,
        }).setOrigin(0.5));
        const weaponName = this.add.text(cardX, cardY - 58, `${wep ? wep.name.toUpperCase() : wk.toUpperCase()}`, {
            fontSize: '13px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5);
        fitTextToWidth(weaponName, 170, 10);
        this.contentContainer.add(weaponName);
        this.contentContainer.add(this.add.text(cardX, cardY - 24, `Current: ${tierLabels[tier].label}`, {
            fontSize: '11px', fontFamily: 'monospace', color: this.palette.accent,
        }).setOrigin(0.5));
        this.contentContainer.add(this.add.text(cardX, cardY + 8, `DMG  ${Math.round(tierLabels[tier].damageMult * 100)}%`, {
            fontSize: '11px', fontFamily: 'monospace', color: this.palette.text,
        }).setOrigin(0.5));
        this.contentContainer.add(this.add.text(cardX, cardY + 34, `RANGE ${Math.round(tierLabels[tier].rangeMult * 100)}%`, {
            fontSize: '11px', fontFamily: 'monospace', color: this.palette.text,
        }).setOrigin(0.5));
        this.contentContainer.add(this.add.text(cardX, cardY + 60, `COOLDOWN ${Math.round(tierLabels[tier].cooldownMult * 100)}%`, {
            fontSize: '11px', fontFamily: 'monospace', color: this.palette.text,
        }).setOrigin(0.5));
        if (tier < 3) {
            const nextTier = tierLabels[tier + 1];
            const cost = WEAPON_UPGRADES.costs[tier];
            this._contentBtn(cardX, cardY + 94, 204, `UPGRADE TO ${nextTier.label} (${cost})`, '#ffdd33', () => {
                this.prog.buyWeaponUpgrade(wk);
                this._renderTab();
            });
        } else {
            this.contentContainer.add(this.add.text(cardX, cardY + 94, 'MAX LEVEL', {
                fontSize: '14px', fontFamily: 'monospace', color: '#ffdd66',
            }).setOrigin(0.5));
        }
    }

    _addUpgradeHeadingIcon(textureKey, x, y, size) {
        const icon = this._addStatusIcon(textureKey, x, y, size, 6, this.contentContainer, 0x9fb0bf);
        if (icon?.setAlpha) icon.setAlpha(0.92);
        if (icon?.setOrigin) icon.setOrigin(0, 0.5);
        return icon;
    }

    _createNameEditor() {
        const p = this.previewNamePanel;
        addPlainSectionPanel(this, p.x, p.y, p.w, p.h, 3, 0.9);
        this.add.text(p.x, p.y - 38, 'BOT NAME', {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: this.palette.success,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(5);

        this.nameFieldBg = addPanel(this, p.x, p.y - 8, 174, 30, 4, 0.8);
        this.nameDisplay = this.add.text(p.x, p.y - 8, this.prog.botName, {
            fontSize: '13px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(5);

        addButton(this, p.x - 48, p.y + 34, 86, 26, 'EDIT NAME', () => {
            this.nameInput = this.prog.botName;
            this.nameEditing = true;
            this._updateNameEditor();
        }, {
            textColor: '#ffffff',
            fontSize: '8px',
            depth: 4,
        });

        addButton(this, p.x + 48, p.y + 34, 86, 26, 'SAVE NAME', () => {
            this._saveNameInput();
        }, {
            textColor: '#ffdd66',
            fontSize: '8px',
            depth: 4,
        });
    }

    _handleNameKey(event) {
        if (!this.nameEditing) return;
        if (event.key === 'Enter') {
            this._saveNameInput();
            return;
        }
        if (event.key === 'Backspace') {
            this.nameInput = this.nameInput.slice(0, -1);
        } else if (event.key.length === 1 && this.nameInput.length < 15) {
            this.nameInput += event.key;
        }
        this._updateNameEditor();
    }

    _saveNameInput() {
        const nextName = this.nameInput.trim() || this.prog.botName;
        this.prog.setBotName(nextName);
        this.nameInput = this.prog.botName;
        this.nameEditing = false;
        this._drawPreview();
        this._updateNameEditor();
    }

    _updateNameEditor() {
        if (!this.nameDisplay) return;
        const text = this.nameEditing ? `${this.nameInput}_` : this.prog.botName;
        this.nameDisplay.setText(text);
        this.nameDisplay.setFontSize('13px');
        fitTextToWidth(this.nameDisplay, 154, 9);
        this.nameDisplay.setColor(this.nameEditing ? '#ffdd66' : '#ffffff');
        if (this.nameFieldBg) this.nameFieldBg.setAlpha(this.nameEditing ? 0.94 : 0.8);
    }

    _previewSkinColor() {
        const prog = this.prog;
        if (prog.skin === 'custom' && prog.customColor) {
            const [r, g, b] = prog.customColor;
            return (r << 16) | (g << 8) | b;
        }
        return (SKINS[prog.skin] || SKINS.steel).color;
    }

    _previewScaleForChassis(chassisKey) {
        switch (chassisKey) {
        case 'titan': return 1.2;
        case 'heavy': return 1.34;
        case 'medium': return 1.46;
        default: return 1.52;
        }
    }

    _syncPreviewBot(forceRecreate = false) {
        const prog = this.prog;
        const chassisKey = prog.chassis;
        const ch = CHASSIS[chassisKey];
        const skinColor = this._previewSkinColor();
        const needsRecreate = forceRecreate || !this.previewBot || this.previewBot.chassisKey !== chassisKey;

        if (needsRecreate) {
            if (this.previewBot) this.previewBot.destroy();
            this.previewBot = new Bot(this, this.previewCenter.x, this.previewCenter.y, {
                name: prog.botName,
                weapon: prog.weapon,
                secondaryWeapon: prog.secondaryWeapon || null,
                skinColor,
                chassis: chassisKey,
                hp: ch.hp,
                speed: ch.speed,
                size: ch.size,
                armor: ch.armor,
            });
            this.previewBot.angle = this.previewAngle;
            this.previewBot.nameText.setVisible(false);
            this.previewBot.hpBarBg.setVisible(false);
            this.previewBot.hpBarFill.setVisible(false);
            this.previewBot.hpBarShield.setVisible(false);
            this.previewBot.hpBarFrame.setVisible(false);
        }

        this.previewBot.name = prog.botName;
        this.previewBot.weaponKey = prog.weapon;
        this.previewBot.secondaryWeaponKey = prog.secondaryWeapon || null;
        this.previewBot.skinColor = skinColor;
        this.previewBot.angle = this.previewAngle;
        this.previewBot.maxHp = ch.hp;
        this.previewBot.hp = ch.hp;
        this.previewBot.speed = ch.speed;
        this.previewBot.armor = ch.armor;
        this.previewBot.size = ch.size;
        this.previewBot.container.setScale(this._previewScaleForChassis(chassisKey));
        this.previewBot.x = this.previewCenter.x;
        this.previewBot.y = this.previewCenter.y;
        this.previewBot.container.setPosition(this.previewCenter.x, this.previewCenter.y);
        if (this.previewBot.spriteRenderer?.refreshWeapon) {
            this.previewBot.spriteRenderer.refreshWeapon();
        }
        if (this.previewBot.spriteRenderer?.weaponSprite) {
            this.previewBot.spriteRenderer.weaponSprite.setVisible(false);
        }
    }

    _previewLoadoutSignature() {
        const prog = this.prog;
        return [
            prog.weapon || '',
            prog.secondaryWeapon || '',
            prog.chassis || '',
            prog.skin || '',
            Array.isArray(prog.customColor) ? prog.customColor.join(',') : '',
            prog.botName || '',
        ].join('|');
    }

    _syncPreviewIfLoadoutChanged() {
        const signature = this._previewLoadoutSignature();
        if (signature === this.previewLoadoutSignature) return;
        this._drawPreview(true);
    }

    _syncPreviewWeaponSprite() {
        this.previewPrimaryWeaponSprite = this._syncPreviewWeaponIcon(
            this.previewPrimaryWeaponSprite,
            this.prog.weapon || 'spinner',
            this.previewPrimaryAnchor
        );
        this.previewSecondaryWeaponSprite = this._syncPreviewWeaponIcon(
            this.previewSecondaryWeaponSprite,
            this.prog.secondaryWeapon,
            this.previewSecondaryAnchor
        );
    }

    _syncPreviewWeaponIcon(sprite, weaponKey, anchor) {
        const weaponTex = this._thumbTextureForWeapon(weaponKey);
        if (!weaponTex) {
            if (sprite) sprite.destroy();
            return null;
        }

        if (sprite && (!sprite.active || !sprite.scene)) {
            sprite = null;
        }

        if (!sprite || sprite.texture.key !== weaponTex) {
            if (sprite) sprite.destroy();
            sprite = this.add.sprite(anchor.x, anchor.y, weaponTex, 0).setDepth(24);
        }

        sprite.setFrame(0);
        sprite.setDepth(24);
        sprite.setPosition(anchor.x, anchor.y);
        sprite.setRotation(0);
        sprite.setAlpha(1);
        sprite.setScale(1);
        sprite.setDisplaySize(58, 58);
        return sprite;
    }

    _thumbTextureForChassis(chassisKey) {
        if (!chassisKey) return null;
        const idleTex = `chassis_${chassisKey}_idle`;
        return this.textures.exists(idleTex) ? idleTex : null;
    }

    _thumbTextureForWeapon(weaponKey) {
        if (!weaponKey) return null;
        const directTex = `weapon_${weaponKey}`;
        if (this.textures.exists(directTex)) return directTex;
        const auxMap = {
            mines: 'aux_landmine',
            emp: 'aux_emp',
            bomb: 'aux_bomb',
            frag_bomb: 'aux_frag_bomb',
            sticky_bomb: 'aux_sticky_bomb',
            shock_bomb: 'aux_shock_bomb',
            mega_bomb: 'aux_mega_bomb',
        };
        const auxTex = auxMap[weaponKey];
        return auxTex && this.textures.exists(auxTex) ? auxTex : null;
    }

    _drawPreview(forceRecreate = false) {
        this.previewLoadoutSignature = this._previewLoadoutSignature();
        this._syncPreviewBot(forceRecreate);
        this._syncPreviewWeaponSprite();

        const prog = this.prog;
        const weapon = WEAPONS[prog.weapon];
        const secondary = prog.secondaryWeapon ? WEAPONS[prog.secondaryWeapon] : null;
        const ch = CHASSIS[prog.chassis];

        // We'll use scene text instead of graphics text
        // Clear old preview texts
        if (this.previewTexts) this.previewTexts.forEach(t => t.destroy());
        this.previewTexts = [];

        const addInfo = (text, y, color = '#888888', size = '11px', maxWidth = 184) => {
            const t = this.add.text(this.previewPanel.x, y, text, {
                fontSize: size, fontFamily: 'monospace', color,
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(4);
            fitTextToWidth(t, maxWidth, 8);
            this.previewTexts.push(t);
        };

        addInfo(weapon ? weapon.name.toUpperCase() : 'UNKNOWN', 414, this.palette.accent, '11px');
        addInfo(secondary ? `ALT  ${secondary.name.toUpperCase()}` : 'ALT  NONE', 438, this.palette.info, '10px');
        addInfo(ch ? `${ch.name.toUpperCase()}  CHASSIS` : 'UNKNOWN', 462, this.palette.text, '10px');
        addInfo(`HP ${ch.hp}   SPD ${ch.speed}   ARM ${Math.round(ch.armor * 100)}%`, 486, this.palette.subtle, '9px', 190);
        this._updateNameEditor();
    }

    _addContentPanel(x, y, w, h, alpha = 0.82) {
        const panel = (h < 120 ? addRowPanel : addSectionPanel)(this, x, y, w, h, 2, alpha);
        this.contentContainer.add(panel);
        return panel;
    }

    _addScrapIcon(x, y, size, depth = 6, container = this.contentContainer) {
        return this._addStatusIcon('ui_icon_scrap', x, y, size, depth, container, 0xffdd33);
    }

    _addStatusIcon(textureKey, x, y, size, depth = 6, container = this.contentContainer, fallbackColor = 0xffdd33) {
        let icon = null;
        if (this.textures.exists(textureKey)) {
            icon = addIcon(this, textureKey, x, y, size, depth);
        } else {
            icon = this.add.circle(x, y, size / 2, fallbackColor).setDepth(depth);
        }
        if (container && icon) container.add(icon);
        return icon;
    }

    _rangeValueForWeapon(weapon) {
        if (!weapon) return 0;
        if (weapon.category === 'bomb') return weapon.bombRadius || weapon.range || 0;
        if (weapon.category === 'explosive') return weapon.explosionRadius || weapon.range || 0;
        return weapon.range || 0;
    }

    _contentBtn(x, y, width, text, color, callback) {
        const btn = addButton(this, x, y, width, 26, text, callback, {
            textColor: color,
            fontSize: width > 120 ? '10px' : (width > 70 ? '9px' : '8px'),
            depth: 4,
        });
        for (const part of btn._ownedParts) this.contentContainer.add(part);
        return btn;
    }
}

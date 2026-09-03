import { GAME_WIDTH, GAME_HEIGHT, WEAPONS, SKINS, CHASSIS, ARENAS } from '../constants.js';
import NetworkManager from '../systems/NetworkManager.js';
import { addBackButton, addButton, addMenuBackdrop, addPanel, addRowPanel, addSectionPanel } from '../ui.js';

export default class MultiplayerScene extends Phaser.Scene {
    constructor() {
        super('MultiplayerScene');
    }

    init() {
        this.prog = this.registry.get('progression');
        this.audio = this.registry.get('audio');
        this.net = new NetworkManager();
        this.registry.set('network', this.net);
        this.state = 'menu'; // menu, creating, joining, lobby, countdown
        this.joinInput = '';
        this.statusBar = null;
        this.statusText = null;
        this.remoteReady = false;
        this.localReady = false;
        this.selectedArena = 'scrapyard';
        this._arenaPreviewListener = null;
    }

    create() {
        if (this.audio) {
            this.audio.init();
            this.audio.resume();
            this.audio.startMenuMusic(this);
        }
        this.cameras.main.fadeIn(200, 0, 0, 0);

        addMenuBackdrop(this, { overlayAlpha: 0.56 });
        addSectionPanel(this, GAME_WIDTH / 2, 50, 500, 48, 1, 0.9);

        // Title
        this.add.text(GAME_WIDTH / 2, 49, 'MULTIPLAYER', {
            fontSize: '22px', fontFamily: 'monospace', color: '#ffaa33',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(2);

        // Back button
        addBackButton(this, () => {
            this.net.disconnect();
            this.scene.start('MenuScene');
        });

        // Content container (rebuilt per state)
        this.content = this.add.container(0, 0);

        // Status bar at bottom
        this.statusBar = addRowPanel(this, GAME_WIDTH / 2, GAME_HEIGHT - 24, 620, 30, 1, 0.84);
        this.statusBar.setVisible(false);
        this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 25, '', {
            fontSize: '12px', fontFamily: 'monospace', color: '#c7c7c7',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setVisible(false);

        this.latencyText = this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 25, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#888888',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0.5).setVisible(false);

        this._showMenu();
    }

    update(time, delta) {
        // Update latency display
        if (this.net.connected && this.latencyText.visible) {
            this.latencyText.setText(`Ping: ${this.net.latency}ms`);
        } else if (this.latencyText) {
            this.latencyText.setText('');
        }

        // Animate waiting dots
        if (this.state === 'creating' || this.state === 'joining') {
            const dots = '.'.repeat(Math.floor(time / 500) % 4);
            if (this.waitingText) {
                this.waitingText.setText(this._waitingMessage + dots);
            }
        }
    }

    // ── Menu State: Create or Join ──
    _showMenu() {
        this.state = 'menu';
        this.content.removeAll(true);
        this._setStatus('');

        const cy = GAME_HEIGHT / 2 - 8;
        const leftX = GAME_WIDTH / 2 - 175;
        const rightX = GAME_WIDTH / 2 + 175;
        const cardY = cy - 4;
        const cardW = 286;
        const cardH = 208;

        this._contentPanel(leftX, cardY, cardW, cardH, 2, 0.86);
        this._contentPanel(rightX, cardY, cardW, cardH, 2, 0.86);

        this.content.add(this.add.text(leftX, cardY - 72, 'CREATE ROOM', {
            fontSize: '18px', fontFamily: 'monospace', color: '#ffaa33',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));

        this.content.add(this.add.text(leftX, cardY - 28, 'Host a game and share\nroom code with your\nopponent.', {
            fontSize: '11px', fontFamily: 'monospace', color: '#999999', align: 'center',
        }).setOrigin(0.5));

        this._createContentBtn(leftX, cardY + 56, 'CREATE', '#ffdd66', () => {
            this._createRoom();
        }, 154, 38);

        this.content.add(this.add.text(rightX, cardY - 72, 'JOIN ROOM', {
            fontSize: '18px', fontFamily: 'monospace', color: '#ff9933',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));

        this.content.add(this.add.text(rightX, cardY - 28, 'Enter the room code to\njoin an existing match.', {
            fontSize: '11px', fontFamily: 'monospace', color: '#999999', align: 'center',
        }).setOrigin(0.5));

        // Code input
        this.joinInput = '';
        const joinInputBg = addPanel(this, rightX, cardY + 26, 196, 34, 3, 0.92);
        joinInputBg.setTint(0x1c2430);
        this.content.add(joinInputBg);

        this.joinInputText = this.add.text(rightX, cardY + 26, 'Enter code...', {
            fontSize: '16px', fontFamily: 'monospace', color: '#555555',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        this.content.add(this.joinInputText);

        this._createContentBtn(rightX, cardY + 68, 'JOIN', '#ff9933', () => {
            if (this.joinInput.length >= 4) {
                this._joinRoom(this.joinInput);
            }
        }, 154, 38);

        // Keyboard for code input
        this.input.keyboard.removeAllListeners('keydown');
        this.input.keyboard.on('keydown', (event) => {
            if (this.state !== 'menu') return;
            if (event.key === 'Backspace') {
                this.joinInput = this.joinInput.slice(0, -1);
            } else if (event.key.length === 1 && this.joinInput.length < 6) {
                this.joinInput += event.key.toUpperCase();
            }
            this.joinInputText.setText(this.joinInput || 'Enter code...');
            this.joinInputText.setColor(this.joinInput ? '#ffffff' : '#555555');
        });

    }

    // ── Create Room ──
    async _createRoom() {
        this.state = 'creating';
        this.content.removeAll(true);
        this._setStatus('Creating room...');

        this._waitingMessage = 'Waiting for opponent';
        this.waitingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '', {
            fontSize: '14px', fontFamily: 'monospace', color: '#888888',
        }).setOrigin(0.5);
        this.content.add(this.waitingText);

        try {
            const code = await this.net.createRoom();

            // Show room code
            this.content.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 'ROOM CODE', {
                fontSize: '16px', fontFamily: 'monospace', color: '#888888',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));

            // Big code display
            this._contentPanel(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 320, 76, 3, 0.88);

            const codeChars = code.split('');
            codeChars.forEach((ch, i) => {
                const cx = GAME_WIDTH / 2 - 75 + i * 30;
                this.content.add(this.add.text(cx, GAME_HEIGHT / 2 - 30, ch, {
                    fontSize: '36px', fontFamily: 'monospace', color: '#ffaa33',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5));
            });

            this.content.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 'Share this code with your opponent', {
                fontSize: '12px', fontFamily: 'monospace', color: '#999999',
            }).setOrigin(0.5));

            // Copy button
            this._createContentBtn(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'COPY CODE', '#ffaa33', () => {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(code);
                    this._setStatus('Code copied to clipboard!');
                }
            });

            // Cancel button
            this._createContentBtn(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 150, 'CANCEL', '#ff4444', () => {
                this.net.disconnect();
                this._showMenu();
            });

            this._setStatus('Room created. Waiting for opponent...');

            // Set up connection callback
            this.net.onConnected = () => {
                this.net.sendProfile(this._getLocalProfile());
                this._showLobby();
            };

            this.net.onRemoteProfile = (profile) => {
                this.net.remoteProfile = profile;
                if (this.state === 'lobby') this._refreshLobby();
            };

            this.net.onError = (err) => {
                this._setStatus('Error: ' + err);
            };

        } catch (err) {
            this._setStatus('Error: ' + err.message);
            this.content.removeAll(true);
            this.content.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Failed to create room.\n' + err.message, {
                fontSize: '14px', fontFamily: 'monospace', color: '#ff4444', align: 'center',
            }).setOrigin(0.5));
            this._createContentBtn(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'TRY AGAIN', '#ffaa33', () => {
                this._showMenu();
            });
        }
    }

    // ── Join Room ──
    async _joinRoom(code) {
        this.state = 'joining';
        this.content.removeAll(true);
        this._setStatus(`Connecting to room ${code}...`);

        this._waitingMessage = 'Connecting';
        this.waitingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffaa33',
        }).setOrigin(0.5);
        this.content.add(this.waitingText);

        this.net.onRemoteProfile = (profile) => {
            this.net.remoteProfile = profile;
            if (this.state === 'lobby') this._refreshLobby();
        };

        this.net.onError = (err) => {
            this._setStatus('Error: ' + err);
        };

        try {
            await this.net.joinRoom(code);
            this.net.sendProfile(this._getLocalProfile());
            this._showLobby();
        } catch (err) {
            this._setStatus('Error: ' + err.message);
            this.content.removeAll(true);
            this.content.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Failed to join room.\n' + err.message, {
                fontSize: '14px', fontFamily: 'monospace', color: '#ff4444', align: 'center',
            }).setOrigin(0.5));
            this._createContentBtn(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'TRY AGAIN', '#ffaa33', () => {
                this.net.disconnect();
                this._showMenu();
            });
        }
    }

    // ── Lobby: Both connected, pick arena, ready up ──
    _showLobby() {
        this.state = 'lobby';
        this.localReady = false;
        this.remoteReady = false;
        this.content.removeAll(true);
        this._setStatus('Connected! Choose arena and ready up.');

        this.net.onRemoteReady = () => {
            this.remoteReady = true;
            this._checkBothReady();
            this._refreshLobby();
        };
        this.net.onRemoteArena = (arena) => {
            this.selectedArena = arena;
            if (this.state === 'lobby') this._refreshLobby();
        };

        this.net.onDisconnected = () => {
            this._setStatus('Opponent disconnected.');
            this.time.delayedCall(2000, () => this._showMenu());
        };

        this._refreshLobby();
    }

    _refreshLobby() {
        this.content.removeAll(true);
        const local = this._getLocalProfile();
        const remote = this.net.remoteProfile;

        // ── VS Card ──
        const cardY = 180;

        // Local player (left)
        this._contentPanel(GAME_WIDTH / 2 - 170, cardY, 260, 168, 2, 0.84);
        this.content.add(this.add.text(GAME_WIDTH / 2 - 170, cardY - 60, 'YOU', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ffaa33',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));
        this._drawProfileCard(GAME_WIDTH / 2 - 170, cardY, local, '#ffdd66');

        // VS
        this.content.add(this.add.text(GAME_WIDTH / 2, cardY, 'VS', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ff6633',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5));

        // Remote player (right)
        this._contentPanel(GAME_WIDTH / 2 + 170, cardY, 260, 168, 2, 0.84);
        if (remote) {
            this.content.add(this.add.text(GAME_WIDTH / 2 + 170, cardY - 60, 'OPPONENT', {
                fontSize: '12px', fontFamily: 'monospace', color: '#ff4444',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));
            this._drawProfileCard(GAME_WIDTH / 2 + 170, cardY, remote, '#ff4444');
        } else {
            this.content.add(this.add.text(GAME_WIDTH / 2 + 170, cardY, 'Waiting...', {
                fontSize: '14px', fontFamily: 'monospace', color: '#555555',
            }).setOrigin(0.5));
        }

        // ── Arena selector (host only) ──
        const arenaY = 310;
        this._contentPanel(GAME_WIDTH / 2, arenaY + 42, 590, 104, 2, 0.76);
        this.content.add(this.add.text(GAME_WIDTH / 2, arenaY, 'ARENA', {
            fontSize: '14px', fontFamily: 'monospace', color: '#888888',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));

        const arenaKeys = Object.keys(ARENAS);
        arenaKeys.forEach((key, i) => {
            const ax = GAME_WIDTH / 2 - 190 + i * 90;
            const ay = arenaY + 35;
            const arena = ARENAS[key];
            const selected = this.selectedArena === key;

            const bg = addPanel(this, ax, ay, 82, 48, 3, selected ? 0.92 : 0.72);
            if (selected) bg.setTint(arena.accentColor);

            if (this.net.isHost && !this.localReady) {
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerdown', () => {
                    this.selectedArena = key;
                    this._refreshLobby();
                });
            }

            this.content.add(bg);
            this.content.add(this.add.text(ax, ay - 8, arena.name.split(' ')[0], {
                fontSize: '9px', fontFamily: 'monospace', color: selected ? '#ffffff' : '#999999',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));

            // Small arena color preview
            this.content.add(this.add.rectangle(ax, ay + 10, 20, 6, arena.floorColor)
                .setStrokeStyle(1, arena.accentColor));
        });

        if (!this.net.isHost) {
            this.content.add(this.add.text(GAME_WIDTH / 2, arenaY + 70, 'Host selects the arena', {
                fontSize: '10px', fontFamily: 'monospace', color: '#555555',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));
        }

        // ── Ready Button ──
        const readyY = 430;

        if (this.localReady) {
            this.content.add(this.add.text(GAME_WIDTH / 2 - 100, readyY, 'READY!', {
                fontSize: '18px', fontFamily: 'monospace', color: '#ffdd66',
            }).setOrigin(0.5));
        } else {
            this._createContentBtn(GAME_WIDTH / 2 - 100, readyY, 'READY', '#ffdd66', () => {
                this.localReady = true;
                this.net.sendReady();
                this.net.send({ type: 'arena', arena: this.selectedArena });
                this._checkBothReady();
                this._refreshLobby();
            }, 154, 38);
        }

        if (this.remoteReady) {
            this.content.add(this.add.text(GAME_WIDTH / 2 + 100, readyY, 'READY!', {
                fontSize: '18px', fontFamily: 'monospace', color: '#ffdd66',
            }).setOrigin(0.5));
        } else {
            this.content.add(this.add.text(GAME_WIDTH / 2 + 100, readyY, 'Not ready', {
                fontSize: '14px', fontFamily: 'monospace', color: '#555555',
            }).setOrigin(0.5));
        }

        // Disconnect button
        this._createContentBtn(GAME_WIDTH / 2, readyY + 70, 'DISCONNECT', '#ff4444', () => {
            this.net.disconnect();
            this._showMenu();
        }, 172, 38);
    }

    _drawProfileCard(cx, cy, profile, color) {
        // Bot name
        this.content.add(this.add.text(cx, cy - 35, profile.name, {
            fontSize: '16px', fontFamily: 'monospace', color,
        }).setOrigin(0.5));

        // Level
        this.content.add(this.add.text(cx, cy - 15, `Lv.${profile.level}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffaa33',
        }).setOrigin(0.5));

        // Weapon
        const weapon = WEAPONS[profile.weapon];
        this.content.add(this.add.text(cx, cy + 5, weapon ? weapon.name : profile.weapon, {
            fontSize: '11px', fontFamily: 'monospace', color: '#999999',
        }).setOrigin(0.5));

        // Chassis
        const chassis = CHASSIS[profile.chassis];
        this.content.add(this.add.text(cx, cy + 22, chassis ? chassis.name + ' Chassis' : profile.chassis, {
            fontSize: '10px', fontFamily: 'monospace', color: '#666666',
        }).setOrigin(0.5));

        // Stats
        this.content.add(this.add.text(cx, cy + 40, `W:${profile.wins} L:${profile.losses}`, {
            fontSize: '10px', fontFamily: 'monospace', color: '#555555',
        }).setOrigin(0.5));

        // Bot preview (colored diamond)
        const s = 18;
        const previewGfx = this.add.graphics();
        previewGfx.fillStyle(profile.skinColor, 1);
        const points = [];
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (Math.PI / 4) + (Math.PI / 2) * i;
            points.push({ x: cx + Math.cos(a) * s, y: cy + 58 + Math.sin(a) * s });
        }
        previewGfx.fillPoints(points, true);
        previewGfx.lineStyle(1, 0x000000, 0.5);
        previewGfx.strokePoints(points, true);
        this.content.add(previewGfx);
    }

    _checkBothReady() {
        if (this.localReady && this.remoteReady) {
            this._startCountdown();
        }
    }

    _startCountdown() {
        this.state = 'countdown';
        this.content.removeAll(true);
        this._setStatus('Starting...');

        let count = 3;
        const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, count.toString(), {
            fontSize: '72px', fontFamily: 'monospace', color: '#ff6633',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5);
        this.content.add(countText);

        const timer = this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                count--;
                if (count > 0) {
                    countText.setText(count.toString());
                    this.tweens.add({
                        targets: countText, scale: { from: 1.5, to: 1 },
                        duration: 300, ease: 'Back.easeOut',
                    });
                    if (this.audio) this.audio.playMenuSelect();
                } else {
                    countText.setText('FIGHT!');
                    countText.setColor('#ffdd66');
                    if (this.audio) this.audio.playMenuSelect();

                    this.time.delayedCall(500, () => {
                        // Launch battle
                        this.scene.start('BattleScene', {
                            mode: 'multiplayer',
                            arena: this.selectedArena,
                            isHost: this.net.isHost,
                        });
                    });
                }
            },
        });
    }

    // ── Helpers ──

    _setStatus(message) {
        const visible = Boolean(message);
        if (this.statusBar) this.statusBar.setVisible(visible);
        if (this.statusText) {
            this.statusText.setText(message || '');
            this.statusText.setVisible(visible);
        }
        if (this.latencyText) {
            const showLatency = visible && Boolean(this.net?.connected);
            this.latencyText.setVisible(showLatency);
            if (!showLatency) this.latencyText.setText('');
        }
    }

    _getLocalProfile() {
        let skinColor;
        if (this.prog.skin === 'custom' && this.prog.customColor) {
            const [r, g, b] = this.prog.customColor;
            skinColor = (r << 16) | (g << 8) | b;
        } else {
            skinColor = (SKINS[this.prog.skin] || SKINS.steel).color;
        }

        return {
            name: this.prog.botName,
            level: this.prog.level,
            weapon: this.prog.weapon,
            chassis: this.prog.chassis,
            skin: this.prog.skin,
            skinColor,
            wins: this.prog.wins,
            losses: this.prog.losses,
        };
    }

    _createContentBtn(x, y, text, color, callback, width = 190, height = 42) {
        const btn = addButton(this, x, y, width, height, text, callback, {
            textColor: color,
            fontSize: width <= 160 ? '12px' : '13px',
            depth: 5,
        });
        for (const part of btn._ownedParts) this.content.add(part);
    }

    _contentPanel(x, y, w, h, depth = 2, alpha = 0.82) {
        const panel = (h < 120 ? addRowPanel : addSectionPanel)(this, x, y, w, h, depth, alpha);
        this.content.add(panel);
        return panel;
    }

    shutdown() {
        this.input.keyboard.removeAllListeners('keydown');
    }
}

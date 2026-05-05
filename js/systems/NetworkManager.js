/**
 * NetworkManager — PeerJS WebRTC wrapper for real-time multiplayer.
 *
 * Architecture:
 *   - Player A creates a room → gets a 6-char room code
 *   - Player B enters the code → WebRTC data channel connects them directly
 *   - Both players send their bot state at ~20 Hz (position, angle, hp, effects)
 *   - Attacks are sent as events; each side applies damage locally for instant feedback
 *   - The HOST (room creator) is authoritative for hit validation
 */

const SYNC_RATE = 50;        // ms between state broadcasts (20 Hz)
const ROOM_PREFIX = 'battlebots-arena-';   // prefix for PeerJS IDs

export default class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomCode = null;
        this.connected = false;
        this.destroyed = false;

        // Remote player data (received)
        this.remoteState = null;
        this.remoteProfile = null;

        // Local player data (to send)
        this.localProfile = null;

        // Event callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onRemoteState = null;
        this.onRemoteAttack = null;
        this.onRemoteDamage = null;
        this.onRemoteDeath = null;
        this.onRemoteReady = null;
        this.onError = null;
        this.onRemoteProfile = null;
        this.onRemoteArena = null;

        // Sync interval
        this._syncInterval = null;
        this._localStateGetter = null;

        // Latency tracking
        this.latency = 0;
        this._pingTime = 0;
    }

    /**
     * Create a room (become host).
     * Returns a promise that resolves with the room code.
     */
    createRoom() {
        return new Promise((resolve, reject) => {
            this.isHost = true;
            this.roomCode = this._generateCode();
            const peerId = ROOM_PREFIX + this.roomCode;

            this._initPeer(peerId)
                .then(() => {
                    // Wait for someone to connect
                    this.peer.on('connection', (conn) => {
                        this.conn = conn;
                        this._setupConnection(conn);
                    });
                    resolve(this.roomCode);
                })
                .catch(reject);
        });
    }

    /**
     * Join an existing room by code.
     * Returns a promise that resolves when connected.
     */
    joinRoom(code) {
        return new Promise((resolve, reject) => {
            this.isHost = false;
            this.roomCode = code.toUpperCase().trim();
            const myId = ROOM_PREFIX + 'join-' + this._generateCode();
            const hostId = ROOM_PREFIX + this.roomCode;

            this._initPeer(myId)
                .then(() => {
                    const conn = this.peer.connect(hostId, { reliable: true });
                    this.conn = conn;

                    conn.on('open', () => {
                        this._setupConnection(conn);
                        resolve();
                    });

                    conn.on('error', (err) => {
                        reject(new Error('Failed to connect: ' + err.message));
                    });

                    // Timeout
                    setTimeout(() => {
                        if (!this.connected) {
                            reject(new Error('Connection timed out. Check the room code.'));
                        }
                    }, 10000);
                })
                .catch(reject);
        });
    }

    _initPeer(id) {
        return new Promise((resolve, reject) => {
            // PeerJS is loaded globally via CDN
            if (typeof Peer === 'undefined') {
                reject(new Error('PeerJS not loaded. Check your internet connection.'));
                return;
            }

            this.peer = new Peer(id, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ],
                },
            });

            this.peer.on('open', () => resolve());
            this.peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    reject(new Error('Room code already in use. Try again.'));
                } else if (err.type === 'peer-unavailable') {
                    reject(new Error('Room not found. Check the code.'));
                } else {
                    reject(err);
                }
            });
        });
    }

    _setupConnection(conn) {
        this.connected = true;
        this.destroyed = false;

        conn.on('data', (data) => this._handleMessage(data));

        conn.on('close', () => {
            this.connected = false;
            if (this.onDisconnected) this.onDisconnected();
            this.stopSync();
        });

        conn.on('error', (err) => {
            console.warn('Connection error:', err);
            if (this.onError) this.onError(err.message || 'Connection error');
        });

        if (this.onConnected) this.onConnected();

        // Send our profile
        if (this.localProfile) {
            this.send({ type: 'profile', data: this.localProfile });
        }

        // Start latency ping
        this._startPing();
    }

    // ── Messaging ──

    send(msg) {
        if (this.conn && this.conn.open) {
            try {
                this.conn.send(msg);
            } catch (e) {
                console.warn('Send failed:', e);
            }
        }
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case 'state':
                this.remoteState = msg.data;
                if (this.onRemoteState) this.onRemoteState(msg.data);
                break;

            case 'attack':
                if (this.onRemoteAttack) this.onRemoteAttack(msg.data);
                break;

            case 'damage':
                // Host-authoritative damage confirmation
                if (this.onRemoteDamage) this.onRemoteDamage(msg.data);
                break;

            case 'death':
                if (this.onRemoteDeath) this.onRemoteDeath(msg.data);
                break;

            case 'profile':
                this.remoteProfile = msg.data;
                if (this.onRemoteProfile) this.onRemoteProfile(msg.data);
                break;

            case 'arena':
                if (this.onRemoteArena) this.onRemoteArena(msg.arena);
                break;

            case 'ready':
                if (this.onRemoteReady) this.onRemoteReady();
                break;

            case 'ping':
                this.send({ type: 'pong', t: msg.t });
                break;

            case 'pong':
                this.latency = Math.round((Date.now() - msg.t) / 2);
                break;

            case 'effect':
                // Particle/screen effects to mirror
                if (this.onRemoteEffect) this.onRemoteEffect(msg.data);
                break;
        }
    }

    // ── State Sync ──

    /**
     * Start broadcasting local state at SYNC_RATE Hz.
     * @param {Function} stateGetter — called each tick, should return { x, y, angle, hp, ... }
     */
    startSync(stateGetter) {
        this._localStateGetter = stateGetter;
        this.stopSync();
        this._syncInterval = setInterval(() => {
            if (!this.connected || !this._localStateGetter) return;
            const state = this._localStateGetter();
            this.send({ type: 'state', data: state });
        }, SYNC_RATE);
    }

    stopSync() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
    }

    // ── Attack Events ──

    sendAttack(attackData) {
        this.send({ type: 'attack', data: attackData });
    }

    sendDamage(damageData) {
        this.send({ type: 'damage', data: damageData });
    }

    sendDeath() {
        this.send({ type: 'death', data: {} });
    }

    sendReady() {
        this.send({ type: 'ready' });
    }

    sendProfile(profile) {
        this.localProfile = profile;
        this.send({ type: 'profile', data: profile });
    }

    sendEffect(effectData) {
        this.send({ type: 'effect', data: effectData });
    }

    // ── Latency ──

    _startPing() {
        this._pingInterval = setInterval(() => {
            if (!this.connected) return;
            this._pingTime = Date.now();
            this.send({ type: 'ping', t: this._pingTime });
        }, 2000);
    }

    // ── Room Code ──

    _generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    // ── Cleanup ──

    disconnect() {
        this.stopSync();
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }
        if (this.conn) {
            try { this.conn.close(); } catch (e) { /* ignore */ }
            this.conn = null;
        }
        if (this.peer && !this.destroyed) {
            try { this.peer.destroy(); } catch (e) { /* ignore */ }
            this.destroyed = true;
            this.peer = null;
        }
        this.connected = false;
        this.remoteState = null;
        this.remoteProfile = null;
        this.roomCode = null;
    }
}

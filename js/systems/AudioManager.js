// Hybrid audio manager:
// - procedural Web Audio for gameplay SFX
// - asset-backed music / title / boss intro / result stings via Phaser sound
//
// Loop tracks are streamed in one at a time. Phaser decodes every loaded mp3
// into Float32 PCM, so keeping all 12 loops resident costs ~800 MB and gets the
// iOS web content process killed. BootScene preloads only the short stings;
// _playMusic pulls the loop it needs and _releaseTrack drops the previous one.

const ARENA_KEY_PREFIX = 'music_arena_';

// Loops are loaded on demand and evicted; stings stay in the boot payload.
const isEvictableTrack = (key) => key === 'music_titlescreen' || key.startsWith(ARENA_KEY_PREFIX);

const trackUrl = (key) => {
    if (key.startsWith(ARENA_KEY_PREFIX)) {
        return `assets/music/arena_${key.slice(ARENA_KEY_PREFIX.length)}.mp3`;
    }
    if (key === 'music_titlescreen') return 'assets/music/titlescreen.mp3';
    return null;
};

export default class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.volume = 0.5;
        this.musicVolume = 0.3;
        this.musicDuck = 1;
        this.muted = false;
        this.currentMusic = null;
        this.currentMusicKey = null;
        this.activeCues = new Set();
        this.gameplaySfxEnabled = true;
        this.pendingMusicKey = null;
        this._loadingTrackKey = null;
        this._duckRestoreTimer = null;
        this._lastEnemyHitAt = 0;
        this._lastPlayerHitAt = 0;
    }

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.6;
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.musicVolume;
            this.musicGain.connect(this.masterGain);
        } catch (e) {
            console.warn('Web Audio not supported:', e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            const resumePromise = this.ctx.resume();
            if (resumePromise?.catch) resumePromise.catch(() => {});
        }
        const sound = this._soundManager();
        if (sound?.context?.state === 'suspended') {
            sound.context.resume().catch(() => {});
        }
        if (sound?.locked && typeof sound.unlock === 'function') {
            sound.unlock();
        }
        // Phaser sets `locked` from `'ontouchstart' in window`, so on iOS it starts
        // true and is only cleared by Phaser's own document.body listener. Once the
        // context is genuinely running, release the queued sounds ourselves —
        // BaseSoundManager.update() picks this up and flushes lockedActionsQueue.
        if (sound?.locked && sound.context?.state === 'running') {
            sound.unlocked = true;
        }
        if (sound?.locked && !this._waitingForSoundUnlock) {
            this._waitingForSoundUnlock = true;
            sound.once('unlocked', () => {
                this._waitingForSoundUnlock = false;
                this.resume();
                this._retryPendingMusic();
            });
        }
        if (this.currentMusic && !this.currentMusic.isPlaying && !sound?.locked) {
            try {
                this.currentMusic.play();
            } catch (e) {
                if (this.currentMusicKey) this.pendingMusicKey = this.currentMusicKey;
            }
        }
        this._retryPendingMusic();
        this._syncManagedAudio();
    }

    setVolume(v) {
        this.volume = v;
        if (this.masterGain) this.masterGain.gain.value = v;
        this._syncManagedAudio();
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        if (this.musicGain) this.musicGain.gain.value = v;
        this._syncManagedAudio();
    }

    setMusicDuck(multiplier = 1) {
        this.musicDuck = Math.max(0, Math.min(1, multiplier));
        this._syncManagedAudio();
    }

    duckMusic(multiplier = 0.72, duration = 140) {
        if (this.muted) return;
        if (this._duckRestoreTimer) clearTimeout(this._duckRestoreTimer);
        this.setMusicDuck(Math.min(this.musicDuck, multiplier));
        this._duckRestoreTimer = setTimeout(() => {
            this._duckRestoreTimer = null;
            this.setMusicDuck(1);
        }, duration);
    }

    setGameplaySfxEnabled(enabled) {
        this.gameplaySfxEnabled = !!enabled;
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this._syncManagedAudio();
    }

    _soundManager() {
        if (window.game?.sound) return window.game.sound;
        if (typeof Phaser !== 'undefined' && Phaser.GAMES?.[0]?.sound) return Phaser.GAMES[0].sound;
        return null;
    }

    _musicPlaybackVolume() {
        return this.muted ? 0 : this.volume * this.musicVolume * this.musicDuck;
    }

    _cuePlaybackVolume(scale = 1) {
        return this.muted ? 0 : this.volume * Math.max(0.42, this.musicVolume + 0.18) * scale;
    }

    _syncManagedAudio() {
        if (this.currentMusic) {
            this.currentMusic.setMute(this.muted);
            this.currentMusic.setVolume(this._musicPlaybackVolume());
        }
        for (const cue of this.activeCues) {
            cue.setMute(this.muted);
            cue.setVolume(this._cuePlaybackVolume(cue._volumeScale || 1));
        }
    }

    _cleanupCue(cue) {
        if (!cue) return;
        this.activeCues.delete(cue);
        cue.destroy();
    }

    _playCue(key, volumeScale = 1, onDone = null) {
        const sound = this._soundManager();
        if (!sound) return null;

        try {
            const cue = sound.add(key, {
                loop: false,
                volume: this._cuePlaybackVolume(volumeScale),
                mute: this.muted,
            });
            cue._volumeScale = volumeScale;
            this.activeCues.add(cue);
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                if (onDone) onDone();
                this._cleanupCue(cue);
            };
            cue.once('complete', finish);
            cue.once('stop', finish);
            cue.play();
            return cue;
        } catch (e) {
            console.warn(`Missing audio cue: ${key}`, e);
            return null;
        }
    }

    // Prefers the scene that asked for the track. Falling back to "whatever is
    // running" is unreliable during a scene swap: the outgoing scene is still the
    // active one while the incoming scene runs create(), and a load queued on a
    // scene that then shuts down never completes.
    _loaderScene(scene) {
        if (scene?.load && scene.sys?.settings?.status !== Phaser.Scenes.SHUTDOWN) return scene;
        const scenes = window.game?.scene?.getScenes(true);
        return scenes?.length ? scenes[scenes.length - 1] : null;
    }

    _isTrackLoaded(key) {
        return !!window.game?.cache?.audio?.exists(key);
    }

    // Pulls a loop track that BootScene deliberately skipped, then resumes playback.
    _loadTrack(key, scene) {
        if (this._loadingTrackKey === key) return;
        const url = trackUrl(key);
        const loader = this._loaderScene(scene);
        if (!url || !loader) return;

        this._loadingTrackKey = key;
        loader.events.once('shutdown', () => {
            if (this._loadingTrackKey !== key) return;
            // The loader went down with its scene; re-issue against the next one.
            this._loadingTrackKey = null;
            if (this.pendingMusicKey === key) this._playMusic(key);
        });
        loader.load.audio(key, url);
        loader.load.once('complete', () => {
            this._loadingTrackKey = null;
            if (this.pendingMusicKey !== key) return;
            this.pendingMusicKey = null;
            this._playMusic(key);
        });
        if (!loader.load.isLoading()) loader.load.start();
    }

    // Frees the decoded PCM for a loop we are no longer playing.
    _releaseTrack(key) {
        if (!key || !isEvictableTrack(key)) return;
        if (this._loadingTrackKey === key) return;
        this._soundManager()?.removeByKey?.(key);
        window.game?.cache?.audio?.remove(key);
    }

    _playMusic(key, scene) {
        const sound = this._soundManager();
        if (!sound) {
            this.pendingMusicKey = key;
            return null;
        }
        this.pendingMusicKey = key;
        if (!this._isTrackLoaded(key)) {
            // Drop the outgoing loop first so we never hold two decoded tracks at once.
            if (this.currentMusicKey && this.currentMusicKey !== key) this.stopMusic();
            this._loadTrack(key, scene);
            return null;
        }
        if (this.currentMusic && this.currentMusicKey === key && this.currentMusic.isPlaying) {
            this._syncManagedAudio();
            return this.currentMusic;
        }
        if (this.currentMusic && this.currentMusicKey === key && !this.currentMusic.isPlaying) {
            try {
                this.currentMusic.play();
                this._syncManagedAudio();
                return this.currentMusic;
            } catch (e) {
                // Recreate below if the existing sound object cannot restart.
            }
        }

        this.stopMusic();

        try {
            const track = sound.add(key, {
                loop: true,
                volume: this._musicPlaybackVolume(),
                mute: this.muted,
            });
            track.once('destroy', () => {
                if (this.currentMusic === track) {
                    this.currentMusic = null;
                    this.currentMusicKey = null;
                }
            });
            track.play();
            this.currentMusic = track;
            this.currentMusicKey = key;
            if (track.isPlaying) this.pendingMusicKey = null;
            return track;
        } catch (e) {
            console.warn(`Missing music track: ${key}`, e);
            return null;
        }
    }

    _retryPendingMusic() {
        if (!this.pendingMusicKey) return;
        const sound = this._soundManager();
        // A locked manager still queues plays, but a track we have not fetched yet
        // has to go through _loadTrack first, so let that case through.
        if (sound?.locked && this._isTrackLoaded(this.pendingMusicKey)) return;
        const key = this.pendingMusicKey;
        this.pendingMusicKey = null;
        this._playMusic(key);
    }

    // ═══════════════════════════════════════
    //  SOUND PRIMITIVES
    // ═══════════════════════════════════════

    _playTone(freq, duration, type = 'square', gainVal = 0.3, detune = 0) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        gain.gain.setValueAtTime(gainVal, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.onended = () => {
            try {
                osc.disconnect();
                gain.disconnect();
            } catch (e) {}
        };
        osc.start(t);
        osc.stop(t + duration);
    }

    _playNoise(duration, gainVal = 0.2) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(gainVal, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.onended = () => {
            try {
                source.disconnect();
                gain.disconnect();
            } catch (e) {}
        };
        source.start(t);
    }

    _playFilteredNoise(duration, gainVal, freq, q = 1) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(gainVal, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.onended = () => {
            try {
                source.disconnect();
                filter.disconnect();
                gain.disconnect();
            } catch (e) {}
        };
        source.start(t);
    }

    // ═══════════════════════════════════════
    //  PER-WEAPON SOUND EFFECTS
    // ═══════════════════════════════════════

    playWeaponAttack(weaponKey) {
        if (!this.gameplaySfxEnabled) return;
        switch (weaponKey) {
            case 'spinner':
                this._playTone(800, 0.06, 'sawtooth', 0.15);
                this._playTone(600, 0.08, 'sawtooth', 0.12);
                this._playFilteredNoise(0.1, 0.15, 2000, 3);
                break;
            case 'hammer':
                this._playTone(80, 0.25, 'sine', 0.35);
                this._playTone(120, 0.15, 'square', 0.15);
                this._playNoise(0.12, 0.25);
                break;
            case 'flipper':
                this._playTone(200, 0.05, 'sine', 0.2);
                this._playTone(500, 0.15, 'triangle', 0.2);
                this._playTone(900, 0.08, 'sine', 0.1);
                break;
            case 'saw':
                this._playTone(300, 0.12, 'sawtooth', 0.2);
                this._playTone(305, 0.12, 'sawtooth', 0.18);
                this._playFilteredNoise(0.1, 0.12, 3000, 5);
                break;
            case 'drill':
                this._playTone(1200, 0.1, 'sawtooth', 0.12);
                this._playTone(1800, 0.06, 'square', 0.08);
                this._playTone(600, 0.15, 'triangle', 0.1);
                break;
            case 'axe':
                this._playTone(100, 0.2, 'sine', 0.3);
                this._playNoise(0.08, 0.2);
                setTimeout(() => {
                    this._playTone(60, 0.3, 'sine', 0.25);
                    this._playNoise(0.15, 0.3);
                }, 80);
                break;
            case 'mace':
                this._playFilteredNoise(0.15, 0.15, 4000, 2);
                this._playTone(90, 0.2, 'sine', 0.25);
                this._playNoise(0.1, 0.2);
                break;
            case 'flamethrower':
                this._playNoise(0.2, 0.15);
                this._playFilteredNoise(0.25, 0.12, 800, 1);
                this._playTone(120, 0.2, 'sawtooth', 0.06);
                break;
            case 'plasma':
                this._playTone(300, 0.3, 'sine', 0.2);
                this._playTone(600, 0.2, 'sine', 0.15);
                this._playTone(150, 0.15, 'square', 0.1);
                break;
            case 'railgun':
                this._playTone(200, 0.08, 'sine', 0.15);
                setTimeout(() => {
                    this._playTone(2000, 0.15, 'sawtooth', 0.3);
                    this._playTone(100, 0.2, 'sine', 0.25);
                    this._playNoise(0.15, 0.3);
                }, 80);
                break;
            case 'tesla':
                this._playTone(1500, 0.04, 'square', 0.2);
                this._playTone(800, 0.06, 'square', 0.15);
                this._playTone(2000, 0.03, 'sawtooth', 0.1);
                this._playFilteredNoise(0.08, 0.15, 6000, 8);
                break;
            case 'acid':
                this._playFilteredNoise(0.2, 0.12, 3000, 2);
                this._playTone(200, 0.1, 'sine', 0.08);
                this._playTone(400, 0.06, 'triangle', 0.06);
                break;
            case 'missile':
                this._playNoise(0.1, 0.15);
                this._playTone(300, 0.08, 'sawtooth', 0.15);
                this._playTone(500, 0.2, 'sawtooth', 0.1);
                break;
            case 'nuke':
                this._playTone(40, 0.15, 'sine', 0.3);
                setTimeout(() => {
                    this._playNoise(0.6, 0.4);
                    this._playTone(60, 0.5, 'sine', 0.35);
                    this._playTone(30, 0.8, 'sine', 0.25);
                }, 150);
                break;
            case 'mines':
                this._playTone(800, 0.03, 'square', 0.15);
                this._playTone(400, 0.05, 'sine', 0.1);
                setTimeout(() => this._playTone(1200, 0.04, 'sine', 0.08), 100);
                break;
            case 'emp':
                this._playTone(1500, 0.03, 'square', 0.25);
                this._playTone(100, 0.4, 'sine', 0.2);
                this._playFilteredNoise(0.3, 0.15, 5000, 3);
                break;
            case 'shield':
                this._playTone(300, 0.2, 'sine', 0.15);
                this._playTone(450, 0.2, 'sine', 0.12);
                this._playTone(600, 0.2, 'sine', 0.08);
                break;
            case 'repair':
                this._playTone(523, 0.12, 'sine', 0.12);
                setTimeout(() => this._playTone(659, 0.12, 'sine', 0.1), 80);
                setTimeout(() => this._playTone(784, 0.15, 'sine', 0.08), 160);
                break;
            default:
                this._playTone(300, 0.1, 'square', 0.15);
                this._playNoise(0.06, 0.1);
        }
    }

    // ═══════════════════════════════════════
    //  GENERAL GAME SFX
    // ═══════════════════════════════════════

    playHit(targetIsPlayer = false) {
        if (!this.gameplaySfxEnabled) return;
        const now = Date.now();
        if (targetIsPlayer) {
            if (now - this._lastPlayerHitAt < 90) return;
            this._lastPlayerHitAt = now;
            this.duckMusic(0.64, 180);
            this._playTone(118, 0.07, 'triangle', 0.13);
            this._playTone(74, 0.09, 'sine', 0.08);
            this._playFilteredNoise(0.055, 0.075, 520, 1.2);
            return;
        }

        if (now - this._lastEnemyHitAt < 45) return;
        this._lastEnemyHitAt = now;
        this.duckMusic(0.76, 125);
        this._playTone(520, 0.035, 'square', 0.08);
        this._playTone(260, 0.045, 'triangle', 0.05);
        this._playFilteredNoise(0.045, 0.055, 2400, 3);
    }

    playCritHit(targetIsPlayer = false) {
        if (!this.gameplaySfxEnabled) return;
        this.duckMusic(targetIsPlayer ? 0.58 : 0.7, 180);
        this._playTone(targetIsPlayer ? 130 : 360, 0.08, 'square', targetIsPlayer ? 0.15 : 0.13);
        this._playTone(targetIsPlayer ? 80 : 720, 0.07, 'triangle', targetIsPlayer ? 0.1 : 0.09);
        this._playFilteredNoise(0.06, 0.08, targetIsPlayer ? 700 : 3200, 3);
    }

    playMiss() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(150, 0.08, 'triangle', 0.15);
    }

    playExplosion() {
        if (!this.gameplaySfxEnabled) return;
        this._playNoise(0.4, 0.4);
        this._playTone(60, 0.5, 'sine', 0.3);
        this._playTone(40, 0.6, 'sine', 0.2);
    }

    playLaser() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(800, 0.15, 'sawtooth', 0.2);
        this._playTone(400, 0.2, 'sawtooth', 0.15);
    }

    playPlasma() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(300, 0.3, 'sine', 0.25);
        this._playTone(600, 0.2, 'sine', 0.15);
    }

    playFlame() {
        if (!this.gameplaySfxEnabled) return;
        this._playNoise(0.15, 0.1);
    }

    playSwing() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(250, 0.12, 'triangle', 0.2);
    }

    playRailgun() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(100, 0.1, 'sine', 0.3);
        setTimeout(() => {
            this._playTone(1200, 0.3, 'sawtooth', 0.4);
            this._playNoise(0.2, 0.3);
        }, 100);
    }

    playShieldUp() {
        if (!this.gameplaySfxEnabled) return;
        [400, 600, 800].forEach((f, i) => setTimeout(() => this._playTone(f, 0.15, 'sine', 0.2 - i * 0.05), i * 60));
    }

    playShieldBreak() {
        if (!this.gameplaySfxEnabled) return;
        this._playNoise(0.3, 0.3);
        this._playTone(800, 0.1, 'square', 0.2);
        this._playTone(200, 0.3, 'square', 0.15);
    }

    playEMP() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(1000, 0.05, 'square', 0.3);
        this._playTone(100, 0.4, 'sine', 0.25);
        this._playNoise(0.3, 0.15);
    }

    playMinePlace() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(300, 0.1, 'triangle', 0.2);
        this._playTone(200, 0.1, 'triangle', 0.15);
    }

    playRepair() {
        if (!this.gameplaySfxEnabled) return;
        this._playTone(500, 0.1, 'sine', 0.15);
        this._playTone(700, 0.1, 'sine', 0.1);
    }

    playDeath() {
        if (!this.gameplaySfxEnabled) return;
        this._playNoise(0.6, 0.4);
        this._playTone(200, 0.3, 'square', 0.3);
        this._playTone(100, 0.5, 'square', 0.25);
        this._playTone(50, 0.8, 'sine', 0.2);
    }

    playLevelUp() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._playTone(f, 0.2, 'sine', 0.25), i * 100));
    }

    playMenuSelect() {
        this._playTone(600, 0.08, 'sine', 0.15);
    }

    playMenuHover() {
        this._playTone(400, 0.05, 'sine', 0.08);
    }

    playBossWarning() {
        if (!this.gameplaySfxEnabled) return null;
        return this._playCue('music_boss_intro', 0.95);
    }

    playPhaseTransition() {
        if (!this.gameplaySfxEnabled) return;
        this._playNoise(0.5, 0.3);
        this._playTone(150, 0.4, 'sawtooth', 0.3);
        setTimeout(() => {
            this._playTone(300, 0.3, 'sine', 0.25);
            this._playTone(450, 0.3, 'sine', 0.2);
        }, 300);
    }

    playVictory() {
        if (!this.gameplaySfxEnabled) return null;
        return this._playResultCue('music_victory', 0.95);
    }

    playDefeat() {
        if (!this.gameplaySfxEnabled) return null;
        return this._playResultCue('music_defeat', 0.95);
    }

    _playResultCue(key, volumeScale = 1) {
        if (this._duckRestoreTimer) {
            clearTimeout(this._duckRestoreTimer);
            this._duckRestoreTimer = null;
        }

        this.setMusicDuck(0);
        const cue = this._playCue(key, volumeScale, () => this.setMusicDuck(1));
        if (!cue) {
            this.setMusicDuck(1);
            return null;
        }
        return cue;
    }

    playBombExplosion(volumeScale = 1) {
        return this._playCue('sfx_bomb', volumeScale);
    }

    // `scene` is the caller's Phaser scene; it owns the loader used to stream the
    // track in, so pass it whenever one is available.
    startArenaMusic(arenaKey, scene) {
        this._playMusic(`music_arena_${arenaKey || 'scrapyard'}`, scene);
    }

    startMenuMusic(scene) {
        this._playMusic('music_titlescreen', scene);
    }

    startBattleMusic(scene) {
        this.startArenaMusic('scrapyard', scene);
    }

    stopMusic() {
        if (!this.currentMusic) return;
        const stoppedKey = this.currentMusicKey;
        this.currentMusic.stop();
        this.currentMusic.destroy();
        this.currentMusic = null;
        this.currentMusicKey = null;
        this._releaseTrack(stoppedKey);
    }
}

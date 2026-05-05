// BootScene.js v2 — preloads multi-sheet boss assets
//
// Each boss has up to 5 sprite sheets:
//   boss_{key}_idle.png    (4×4 grid, 1024×1024) — 16 directional rotation frames
//   boss_{key}_walk.png    (4×4 grid, 1024×1024)
//   boss_{key}_attack1.png (4×4 grid, 1024×1024)
//   boss_{key}_attack2.png (4×4 grid, 1024×1024)
//   boss_{key}_death.png   (4×1 row, 1024×256)   — 4 progression frames
//
// Each chassis has 1-3 sprite sheets:
//   chassis_{key}_idle.png  (4×4 grid)  — 16 directional facing frames
//   chassis_{key}_walk.png  (4×4 grid)
//   chassis_{key}_attack.png (4×4 grid) — optional
//
// Arena PNGs:
//   arena_{key}.png (16:9 painted backgrounds)

import { ARENAS, BOSSES, CHASSIS } from '../constants.js';

const ARENA_KEYS = Object.keys(ARENAS);
const BOSS_KEYS = Object.keys(BOSSES);
const CHASSIS_KEYS = Object.keys(CHASSIS);

const BOSS_SHEETS = ['idle', 'walk', 'attack1', 'attack2', 'death'];
const CHASSIS_SHEETS = ['idle', 'walk', 'attack'];
const BOSS_ASSET_SLUGS = {
    crusher: 'crusher',
    forgemaster: 'forgemaster',
    magmaCore: 'magma_core',
    virusExe: 'virus_exe',
    titan: 'titan',
    jungleBeast: 'jungle_beast',
    frostCore: 'frost_core',
    voltEngine: 'volt_engine',
    rockGolem: 'rock_golem',
    prismLord: 'prism_lord',
};
const WEAPON_SPRITE_KEYS = [
    'spinner', 'hammer', 'flipper', 'saw', 'drill', 'axe', 'mace',
    'flamethrower', 'plasma', 'railgun', 'tesla', 'acid', 'missile',
];

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        this.load.image('ui_menu_bg', 'assets/ui/ui_menu_bg.png');
        const fallbackBg = this.add.rectangle(w / 2, h / 2, w, h, 0x0a0a0a).setDepth(-10);
        let backdropOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.45).setDepth(-9);
        this.load.once('filecomplete-image-ui_menu_bg', () => {
            if (fallbackBg.active) fallbackBg.destroy();
            if (backdropOverlay.active) backdropOverlay.destroy();
            this.add.image(w / 2, h / 2, 'ui_menu_bg')
                .setDisplaySize(w, h)
                .setDepth(-10);
            backdropOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.45).setDepth(-9);
        });
        this.add.text(w / 2, h / 2 - 60, 'BATTLEBOTS', {
            fontSize: '48px', fontFamily: 'monospace', color: '#ff6633',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(1);

        const loadingText = this.add.text(w / 2, h / 2, 'Loading assets...', {
            fontSize: '16px', fontFamily: 'monospace', color: '#888888',
        }).setOrigin(0.5).setDepth(1);

        this.add.rectangle(w / 2, h / 2 + 40, 300, 8, 0x333333).setDepth(1);
        const bar = this.add.rectangle(w / 2 - 150, h / 2 + 40, 0, 8, 0xff6633).setOrigin(0, 0.5).setDepth(2);

        this.load.on('progress', (v) => { bar.width = 300 * v; });
        this.load.on('fileerror', (file) => {
            // Silently skip — many assets may not exist yet, sprite renderer handles fallback
        });

        // Suppress error logging for assets that aren't there yet
        this.load.on('loaderror', () => {});

        // ── Arena backgrounds + walkability masks ──
        // Masks are 1-bit PNGs at assets/arenas/masks/arena_<key>.png.
        // White = walkable, black = wall. BattleScene reads them per-pixel
        // for collision; missing masks fall back to ARENA_SHAPES geometry.
        ARENA_KEYS.forEach(key => {
            this.load.image(`arena_${key}`, `assets/arenas/arena_${key}.png`);
            this.load.image(`arena_mask_${key}`, `assets/arenas/masks/arena_${key}.png`);
        });

        // ── Boss sprite sheets — multi-sheet per boss ──
        BOSS_KEYS.forEach(key => {
            const slug = BOSS_ASSET_SLUGS[key] || key;
            BOSS_SHEETS.forEach(sheet => {
                const sheetKey = `boss_${key}_${sheet}`;
                const path = `assets/bosses/boss_${slug}_${sheet}.png`;
                if (sheet === 'death') {
                    // Death is a 4×1 row of 256×256 cells
                    this.load.spritesheet(sheetKey, path, { frameWidth: 256, frameHeight: 256 });
                } else {
                    // Rotation sheets are 4×4 grids
                    this.load.spritesheet(sheetKey, path, { frameWidth: 256, frameHeight: 256 });
                }
            });
        });

        // ── Chassis sprite sheets ──
        CHASSIS_KEYS.forEach(key => {
            CHASSIS_SHEETS.forEach(sheet => {
                const sheetKey = `chassis_${key}_${sheet}`;
                const path = `assets/bots/chassis_${key}_${sheet}.png`;
                this.load.spritesheet(sheetKey, path, { frameWidth: 256, frameHeight: 256 });
            });
        });

        // ── Directional manifest — drives frame selection + rotation in
        // BotSpriteRenderer / BossSpriteRenderer. See assets/directional_manifest.json
        // for format. Cached as 'directional_manifest'.
        this.load.json('directional_manifest', 'assets/directional_manifest.json');

        // ── Weapon spritesheets (2×2 grid: idle/activating/active/destroyed) ──
        // All are 960x960, so each frame is 480x480
        WEAPON_SPRITE_KEYS.forEach(key => {
            this.load.spritesheet(`weapon_${key}`, `assets/weapons/weapon_${key}.png`, {
                frameWidth: 480, frameHeight: 480,
            });
        });

        // ── Title screen + logo (single images) ──
        this.load.image('title_screen', 'assets/title/title_screen.png');
        this.load.image('title_logo', 'assets/title/title_logo.png');
        this.load.image('fit_egg_logo', 'assets/title/logo.png');

        // ── UI assets (single images) ──
        // Button/panel/keycap/hp-frame skins are generated procedurally in ui.js.
        this.load.image('ui_icon_scrap', 'assets/ui/ui_icon_scrap.png');
        this.load.image('ui_icon_skull', 'assets/ui/ui_icon_skull.png');
        this.load.image('ui_icon_vip', 'assets/ui/ui_icon_vip.png');
        this.load.image('ui_icon_xp', 'assets/ui/ui_icon_xp.png');
        this.load.image('heart', 'assets/ui/heart.png');
        this.load.image('ui_icon_audio', 'assets/ui/ui_icon_audio.png');
        this.load.image('ui_icon_controls', 'assets/ui/ui_icon_controls.png');
        this.load.image('ui_icon_difficulty', 'assets/ui/ui_icon_difficulty.png');
        this.load.image('ui_icon_gear', 'assets/ui/ui_icon_gear.png');
        this.load.image('ui_shield', 'assets/ui/ui_shield.png');
        this.load.image('ui_wheel', 'assets/ui/ui_wheel.png');
        this.load.image('ui_victory', 'assets/ui/ui_victory.png');
        this.load.image('ui_defeat', 'assets/ui/ui_defeat.png');

        // ── Music / scene stings ──
        this.load.audio('music_titlescreen', 'assets/music/titlescreen.mp3');
        this.load.audio('music_boss_intro', 'assets/music/boss_intro.mp3');
        this.load.audio('music_victory', 'assets/music/victory.mp3');
        this.load.audio('music_defeat', 'assets/music/defeat.mp3');
        this.load.audio('sfx_bomb', 'assets/music/bomb.mp3');
        ARENA_KEYS.forEach(key => {
            this.load.audio(`music_arena_${key}`, `assets/music/arena_${key}.mp3`);
        });

        // ── Hazard spritesheets (2×2 grid: idle/activating/active/destroyed) ──
        ['tnt_crate','breakable_wall','teleporter_pad','lava_pool','acid_pool','electric_floor','spike_trap','explosive_barrel'].forEach(h => {
            this.load.spritesheet(`hazard_${h}`, `assets/hazards/hazard_${h}.png`, {
                frameWidth: 480, frameHeight: 480,
            });
        });
        this.load.spritesheet('hazard_box', 'assets/hazards/hazard_box.png', {
            frameWidth: 745, frameHeight: 696,
        });

        // ── Projectile spritesheets (2×2 grid) ──
        ['plasma','flame','railgun','missile','acid','tesla','bullet','explosion'].forEach(p => {
            this.load.spritesheet(`proj_${p}`, `assets/projectiles/proj_${p}.png`, {
                frameWidth: 480, frameHeight: 480,
            });
        });

        // ── FX spritesheets (2x2 grids) ──
        ['ember_rise','snow_drift','electric_arc','lava_bubble','smoke_drift','steam_vent','dust_swirl','falling_leaf','glitch_band','aurora_wave'].forEach(f => {
            this.load.spritesheet(`fx_${f}`, `assets/fx/fx_${f}.png`, {
                frameWidth: 480, frameHeight: 480,
            });
        });

        // ── Auxiliary spritesheets (2×2 grid: idle/armed/exploding/destroyed) ──
        ['bomb','frag_bomb','sticky_bomb','shock_bomb','mega_bomb','emp','landmine'].forEach(a => {
            this.load.spritesheet(`aux_${a}`, `assets/auxiliary/aux_${a}.png`, {
                frameWidth: 480, frameHeight: 480,
            });
        });
    }

    create() {
        this._generateFallbackTextures();

        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MenuScene');
        });
    }

    _generateFallbackTextures() {
        const floorGfx = this.make.graphics({ add: false });
        floorGfx.fillStyle(0x3d3d3d);
        floorGfx.fillRect(0, 0, 64, 64);
        floorGfx.lineStyle(1, 0x4a4a4a, 0.3);
        floorGfx.strokeRect(0, 0, 64, 64);
        floorGfx.lineBetween(32, 0, 32, 64);
        floorGfx.lineBetween(0, 32, 64, 32);
        floorGfx.generateTexture('floor_tile', 64, 64);

        const hazardGfx = this.make.graphics({ add: false });
        for (let i = 0; i < 8; i++) {
            hazardGfx.fillStyle(i % 2 === 0 ? 0xffaa00 : 0x222222);
            hazardGfx.fillRect(i * 16, 0, 16, 16);
        }
        hazardGfx.generateTexture('hazard_stripe', 128, 16);

        const dotGfx = this.make.graphics({ add: false });
        dotGfx.fillStyle(0xffffff);
        dotGfx.fillCircle(4, 4, 4);
        dotGfx.generateTexture('particle_dot', 8, 8);
    }
}

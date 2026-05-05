// ── Game Dimensions ──
export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 700;
export const ARENA_MARGIN = 60;

// ── Colors ──
export const COLORS = {
    BLACK: 0x000000,
    WHITE: 0xffffff,
    RED: 0xff3333,
    GREEN: 0x33ff33,
    BLUE: 0x3388ff,
    YELLOW: 0xffdd33,
    ORANGE: 0xff8833,
    PURPLE: 0xaa33ff,
    CYAN: 0x33ffee,
    GOLD: 0xffd700,
    DARK_GRAY: 0x333333,
    MID_GRAY: 0x666666,
    LIGHT_GRAY: 0xaaaaaa,
    DARK_RED: 0x991111,
    DARK_BLUE: 0x112244,
    NEON_GREEN: 0x39ff14,
    NEON_PINK: 0xff6ec7,
    STEEL: 0x8899aa,
    RUST: 0xaa5533,
    LAVA: 0xff4400,
    ICE: 0x88ccff,
    TOXIC: 0x66ff22,
};

// ── Weapon Definitions ──
export const WEAPONS = {
    // ── Melee ──
    spinner: {
        name: 'Chainsaw', category: 'melee', damage: 18, range: 80, cooldown: 600,
        knockback: 120, color: COLORS.LIGHT_GRAY, unlockLevel: 1, cost: 0,  // starter
        description: 'Fast chain blade. Balanced speed and damage.',
    },
    hammer: {
        name: 'Hammer', category: 'melee', damage: 35, range: 75, cooldown: 1000,
        knockback: 200, stun: 300, color: COLORS.ORANGE, unlockLevel: 2, cost: 0,
        description: 'Heavy slam. Massive damage and brief stun.',
    },
    flipper: {
        name: 'Gunblade', category: 'melee', damage: 14, range: 78, cooldown: 800,
        knockback: 140, projectileDamage: 12, projectileRange: 220, projectileSpeed: 620,
        projectileLife: 360, color: COLORS.YELLOW, unlockLevel: 5, cost: 0,
        description: 'Modest blade hit with a short bullet shot.',
    },
    saw: {
        name: 'Buzzsaw', category: 'melee', damage: 15, range: 70, cooldown: 450,
        knockback: 50, bleed: { damage: 4, duration: 2500 }, color: COLORS.RED, unlockLevel: 8, cost: 100,
        description: 'Rapid cuts with bleeding. Medium speed.',
    },
    drill: {
        name: 'Drill', category: 'melee', damage: 16, range: 65, cooldown: 400,
        knockback: 40, armorPierce: 0.5, color: COLORS.CYAN, unlockLevel: 12, cost: 200,
        description: 'Pierces armor. Fastest melee weapon.',
    },
    axe: {
        name: 'Battle Axe', category: 'melee', damage: 45, range: 82, cooldown: 1400,
        knockback: 180, critChance: 0.3, critMultiplier: 2.0, color: COLORS.DARK_RED, unlockLevel: 24, cost: 350,
        description: 'Devastating crits. Very slow, very deadly.',
    },
    mace: {
        name: 'Spiked Mace', category: 'melee', damage: 30, range: 85, cooldown: 900,
        knockback: 250, aoeRadius: 70, color: COLORS.MID_GRAY, unlockLevel: 30, cost: 500,
        description: 'Area damage. Hits everything nearby.',
    },

    // ── Ranged ──
    flamethrower: {
        name: 'Flamethrower', category: 'ranged', damage: 6, range: 120, cooldown: 80,
        projectileSpeed: 350, projectileLife: 400, spread: 0.3, burst: 3,
        dot: { damage: 4, duration: 1500 }, color: COLORS.ORANGE, unlockLevel: 16, cost: 400,
        description: 'Stream of fire. Burns enemies over time.',
    },
    plasma: {
        name: 'Plasma Cannon', category: 'ranged', damage: 35, range: 300, cooldown: 1500,
        projectileSpeed: 500, projectileLife: 800, disableDuration: 180,
        color: COLORS.PURPLE, unlockLevel: 34, cost: 600,
        description: 'Powerful energy bolt. High damage, slow fire rate.',
    },
    railgun: {
        name: 'Railgun', category: 'ranged', damage: 45, range: 500, cooldown: 2000,
        projectileSpeed: 1200, projectileLife: 600, piercing: true,
        chargeTime: 800, color: COLORS.GOLD, unlockLevel: 50, cost: 900,
        description: 'Devastating piercing shot. Requires charge-up.',
    },
    tesla: {
        name: 'Tesla Coil', category: 'ranged', damage: 10, range: 150, cooldown: 200,
        projectileSpeed: 620, projectileLife: 260, chainTargets: 3, chainRange: 100, disableDuration: 220,
        color: COLORS.CYAN, unlockLevel: 38, cost: 700,
        description: 'Electric arcs chain between enemies.',
    },
    acid: {
        name: 'Acid Sprayer', category: 'ranged', damage: 8, range: 130, cooldown: 150,
        projectileSpeed: 300, projectileLife: 500, spread: 0.4, burst: 2,
        dot: { damage: 5, duration: 3000 }, slowPercent: 0.4, color: COLORS.TOXIC, unlockLevel: 20, cost: 550,
        description: 'Corrodes and slows. Melts armor over time.',
    },
    missile: {
        name: 'Missile Launcher', category: 'ranged', damage: 65, range: 400, cooldown: 1500,
        projectileSpeed: 250, projectileLife: 2000, homing: true, explosionRadius: 60,
        color: COLORS.RED, unlockLevel: 42, cost: 800,
        description: 'Homing missiles with area explosion.',
    },

    // ── Explosive ──
    mines: {
        name: 'Land Mines', category: 'explosive', damage: 40, range: 0, cooldown: 1200,
        mineCount: 3, mineLife: 10000, triggerRadius: 40, explosionRadius: 70,
        color: COLORS.DARK_GRAY, unlockLevel: 46, cost: 1100,
        description: 'Drop proximity mines. Area denial.',
    },
    emp: {
        name: 'EMP Grenade', category: 'explosive', damage: 15, range: 200, cooldown: 2500,
        projectileSpeed: 300, projectileLife: 1000, explosionRadius: 100, stunDuration: 2700,
        color: COLORS.BLUE, unlockLevel: 45, cost: 1000,
        description: 'Stuns enemy systems temporarily.',
    },

    // ── Bombs (equip as secondary, use with E key) ──
    bomb: {
        name: 'Bomb', category: 'bomb', damage: 38, range: 0, cooldown: 1100,
        bombFuse: 2000, bombRadius: 75, color: COLORS.ORANGE, unlockLevel: 3, cost: 75,
        description: 'Cheap compact bomb. Small blast radius.',
    },
    frag_bomb: {
        name: 'Frag Bomb', category: 'bomb', damage: 75, range: 0, cooldown: 2000,
        bombFuse: 2500, bombRadius: 130, color: COLORS.RED, unlockLevel: 14, cost: 150,
        description: 'Standard frag bomb. Big blast radius.',
    },
    sticky_bomb: {
        name: 'Sticky Bomb', category: 'bomb', damage: 90, range: 0, cooldown: 2500,
        bombFuse: 3500, bombRadius: 100, stickToEnemy: true, color: COLORS.ORANGE, unlockLevel: 22, cost: 400,
        description: 'Sticks to enemies on contact. High damage.',
    },
    shock_bomb: {
        name: 'Shock Bomb', category: 'bomb', damage: 28, range: 0, cooldown: 2600,
        bombFuse: 2600, bombRadius: 120, attackDisableDuration: 1300,
        color: COLORS.CYAN, unlockLevel: 28, cost: 500,
        description: 'Medium blast. Temporarily prevents enemy attacks.',
    },
    mega_bomb: {
        name: 'Mega Bomb', category: 'bomb', damage: 120, range: 0, cooldown: 5000,
        bombFuse: 4000, bombRadius: 200, selfDamage: 30,
        color: COLORS.YELLOW, unlockLevel: 48, cost: 700,
        description: 'Enormous explosion. Massive radius. Hurts you too.',
    },
};

// ── Armor Upgrades ──
export const ARMOR_UPGRADES = [
    { name: 'Plating I', armor: 0.05, cost: 100, unlockLevel: 3 },
    { name: 'Plating II', armor: 0.10, cost: 300, unlockLevel: 12 },
    { name: 'Plating III', armor: 0.15, cost: 600, unlockLevel: 28 },
    { name: 'Plating IV', armor: 0.20, cost: 1000, unlockLevel: 50 },
    { name: 'Plating V', armor: 0.25, cost: 2000, unlockLevel: 80 },
];

// ── Speed Upgrades ──
export const SPEED_UPGRADES = [
    { name: 'Boost I', speed: 10, cost: 100, unlockLevel: 3 },
    { name: 'Boost II', speed: 20, cost: 300, unlockLevel: 12 },
    { name: 'Boost III', speed: 30, cost: 600, unlockLevel: 28 },
    { name: 'Boost IV', speed: 40, cost: 1000, unlockLevel: 50 },
    { name: 'Boost V', speed: 50, cost: 2000, unlockLevel: 80 },
];

// ── Arena Definitions ──
export const ARENAS = {
    scrapyard: {
        name: 'Scrapyard',
        bgColor: 0x2a2a2a,
        floorColor: 0x3d3d3d,
        wallColor: 0x555555,
        accentColor: COLORS.ORANGE,
        hazards: ['explosiveBarrels'],
        description: 'Rusted battleground littered with volatile scrap.',
    },
    factory: {
        name: 'Underground Factory',
        bgColor: 0x1a1a2e,
        floorColor: 0x2a2a3e,
        wallColor: 0x444466,
        accentColor: COLORS.YELLOW,
        hazards: ['acidPools', 'explosiveBarrels'],
        description: 'Corrosive spill zones and volatile factory barrels.',
    },
    volcano: {
        name: 'Volcanic Forge',
        bgColor: 0x2a1010,
        floorColor: 0x3a1515,
        wallColor: 0x663322,
        accentColor: COLORS.LAVA,
        hazards: ['lavaPools', 'spikeTraps'],
        description: 'Molten pools and brutal volcanic traps.',
    },
    cyber: {
        name: 'Cyber Arena',
        bgColor: 0x0a0a1a,
        floorColor: 0x111133,
        wallColor: 0x2233aa,
        accentColor: COLORS.NEON_GREEN,
        hazards: ['teleporters', 'spikeTraps'],
        description: 'Neon-lit arena with warp pads and trap grids.',
    },
    space: {
        name: 'Space Station',
        bgColor: 0x050510,
        floorColor: 0x111122,
        wallColor: 0x334455,
        accentColor: COLORS.ICE,
        hazards: ['teleporters', 'explosiveBarrels'],
        description: 'Warp pads and volatile cargo barrels.',
    },
    jungle: {
        name: 'Jungle Ruins',
        bgColor: 0x0a1a0a,
        floorColor: 0x1a3318,
        wallColor: 0x335522,
        accentColor: 0x44bb22,
        hazards: ['spikeTraps'],
        description: 'Overgrown ruins with hidden impact traps.',
    },
    ice: {
        name: 'Frozen Tundra',
        bgColor: 0x0a1520,
        floorColor: 0x1a3040,
        wallColor: 0x4488aa,
        accentColor: 0x88ddff,
        hazards: ['spikeTraps'],
        description: 'Slippery ice with concealed impact traps.',
    },
    powerplant: {
        name: 'Power Plant',
        bgColor: 0x1a1a00,
        floorColor: 0x2a2a11,
        wallColor: 0x555522,
        accentColor: 0xffff33,
        hazards: ['electricFloor', 'explosiveBarrels'],
        description: 'High voltage arcs and unstable reactors.',
    },
    quarry: {
        name: 'Rock Quarry',
        bgColor: 0x1a1510,
        floorColor: 0x3a3025,
        wallColor: 0x665540,
        accentColor: 0xaa8855,
        hazards: ['explosiveBarrels', 'spikeTraps'],
        description: 'Volatile charges and brutal quarry traps.',
    },
    rainbow: {
        name: 'Psychedelic Realm',
        bgColor: 0x110022,
        floorColor: 0x220044,
        wallColor: 0x6633aa,
        accentColor: 0xff33ff,
        hazards: ['spikeTraps'],
        description: 'Reality bends through shifting trap geometry.',
    },
};

// ── Boss Definitions ──
export const BOSSES = {
    crusher: {
        name: 'THE CRUSHER',
        arena: 'scrapyard',
        hp: 300,
        speed: 1.8,
        size: 60,
        color: 0x885533,
        phases: [
            {
                threshold: 1.0, speed: 1.8, attackPattern: 'slam',
                attackCooldown: 2000, damage: 25, description: 'Ground slam shockwave',
            },
            {
                threshold: 0.6, speed: 2.5, attackPattern: 'charge',
                attackCooldown: 1500, damage: 35, description: 'Bull rush charge attack',
                spawnMinions: true, minionCount: 2,
            },
            {
                threshold: 0.3, speed: 3.2, attackPattern: 'frenzy',
                attackCooldown: 800, damage: 20, description: 'Rapid consecutive slams',
                enraged: true,
            },
        ],
    },
    forgemaster: {
        name: 'FORGE MASTER',
        arena: 'factory',
        hp: 350,
        speed: 2.2,
        size: 55,
        color: 0xcc6600,
        phases: [
            {
                threshold: 1.0, speed: 2.2, attackPattern: 'dualStrike',
                attackCooldown: 1800, damage: 20, description: 'Alternating weapon strikes',
            },
            {
                threshold: 0.5, speed: 2.8, attackPattern: 'factoryHazard',
                attackCooldown: 1200, damage: 30, description: 'Activates factory hazards',
                activateHazards: true,
            },
            {
                threshold: 0.2, speed: 3.5, attackPattern: 'overdrive',
                attackCooldown: 600, damage: 25, description: 'Full machine overdrive',
                enraged: true,
            },
        ],
    },
    magmaCore: {
        name: 'MAGMA CORE',
        arena: 'volcano',
        hp: 400,
        speed: 1.5,
        size: 65,
        color: 0xff3300,
        phases: [
            {
                threshold: 1.0, speed: 1.5, attackPattern: 'lavaShot',
                attackCooldown: 2200, damage: 28, description: 'Shoots lava projectiles',
                armored: true,
            },
            {
                threshold: 0.5, speed: 2.0, attackPattern: 'eruption',
                attackCooldown: 3000, damage: 40, description: 'Arena-wide lava eruption',
                arenaHazard: 'risingLava',
            },
            {
                threshold: 0.25, speed: 2.8, attackPattern: 'meltdown',
                attackCooldown: 1000, damage: 22, description: 'Continuous lava stream',
                enraged: true,
            },
        ],
    },
    virusExe: {
        name: 'VIRUS.EXE',
        arena: 'cyber',
        hp: 280,
        speed: 3.0,
        size: 45,
        color: 0x00ff88,
        phases: [
            {
                threshold: 1.0, speed: 3.0, attackPattern: 'glitch',
                attackCooldown: 1500, damage: 18, description: 'Teleporting glitch strikes',
            },
            {
                threshold: 0.6, speed: 3.5, attackPattern: 'clone',
                attackCooldown: 2000, damage: 15, description: 'Creates hologram clones',
                cloneCount: 2,
            },
            {
                threshold: 0.3, speed: 4.0, attackPattern: 'hack',
                attackCooldown: 1200, damage: 20, description: 'Scrambles player controls',
                hackDuration: 3000, enraged: true,
            },
        ],
    },
    titan: {
        name: 'ZERO-G TITAN',
        arena: 'space',
        hp: 500,
        speed: 1.2,
        size: 75,
        color: 0x6688cc,
        phases: [
            {
                threshold: 1.0, speed: 1.2, attackPattern: 'asteroidThrow',
                attackCooldown: 2500, damage: 35, description: 'Hurls asteroids',
            },
            {
                threshold: 0.5, speed: 1.8, attackPattern: 'gravityWell',
                attackCooldown: 3000, damage: 25, description: 'Creates gravity wells',
                pullForce: 200,
            },
            {
                threshold: 0.2, speed: 2.5, attackPattern: 'split',
                attackCooldown: 1500, damage: 20, description: 'Splits into 3 segments',
                splitCount: 3, enraged: true,
            },
        ],
    },
    jungleBeast: {
        name: 'JUNGLE BEAST', arena: 'jungle', hp: 320, speed: 2.5, size: 55, color: 0x228822,
        phases: [
            { threshold: 1.0, speed: 2.5, attackPattern: 'slam', attackCooldown: 1800, damage: 28, description: 'Vine whip attack' },
            { threshold: 0.5, speed: 3.0, attackPattern: 'charge', attackCooldown: 1400, damage: 35, description: 'Feral charge', spawnMinions: true, minionCount: 2 },
            { threshold: 0.25, speed: 3.5, attackPattern: 'frenzy', attackCooldown: 700, damage: 22, description: 'Berserk rampage', enraged: true },
        ],
    },
    frostCore: {
        name: 'FROST CORE', arena: 'ice', hp: 380, speed: 1.8, size: 60, color: 0x88ccff,
        phases: [
            { threshold: 1.0, speed: 1.8, attackPattern: 'lavaShot', attackCooldown: 2000, damage: 25, description: 'Ice shard barrage' },
            { threshold: 0.5, speed: 2.2, attackPattern: 'eruption', attackCooldown: 2500, damage: 35, description: 'Blizzard storm' },
            { threshold: 0.2, speed: 2.8, attackPattern: 'meltdown', attackCooldown: 900, damage: 20, description: 'Frozen fury', enraged: true },
        ],
    },
    voltEngine: {
        name: 'VOLT ENGINE', arena: 'powerplant', hp: 350, speed: 2.8, size: 50, color: 0xffff33,
        phases: [
            { threshold: 1.0, speed: 2.8, attackPattern: 'glitch', attackCooldown: 1500, damage: 22, description: 'Electric teleport strikes' },
            { threshold: 0.5, speed: 3.2, attackPattern: 'clone', attackCooldown: 2000, damage: 18, description: 'Hologram decoys', cloneCount: 3 },
            { threshold: 0.2, speed: 3.8, attackPattern: 'hack', attackCooldown: 1000, damage: 25, description: 'System overload', hackDuration: 2000, enraged: true },
        ],
    },
    rockGolem: {
        name: 'ROCK GOLEM', arena: 'quarry', hp: 500, speed: 1.2, size: 70, color: 0x886644,
        phases: [
            { threshold: 1.0, speed: 1.2, attackPattern: 'slam', attackCooldown: 2500, damage: 40, description: 'Earthquake slam', armored: true },
            { threshold: 0.5, speed: 1.6, attackPattern: 'asteroidThrow', attackCooldown: 2000, damage: 30, description: 'Boulder throw' },
            { threshold: 0.2, speed: 2.0, attackPattern: 'frenzy', attackCooldown: 1200, damage: 30, description: 'Landslide fury', enraged: true },
        ],
    },
    prismLord: {
        name: 'PRISM LORD', arena: 'rainbow', hp: 420, speed: 2.5, size: 55, color: 0xff33ff,
        phases: [
            { threshold: 1.0, speed: 2.5, attackPattern: 'glitch', attackCooldown: 1600, damage: 25, description: 'Prismatic teleport' },
            { threshold: 0.5, speed: 3.0, attackPattern: 'clone', attackCooldown: 1800, damage: 20, description: 'Rainbow clones', cloneCount: 4 },
            { threshold: 0.2, speed: 3.5, attackPattern: 'hack', attackCooldown: 800, damage: 22, description: 'Reality warp', hackDuration: 3000, enraged: true },
        ],
    },
};

// ── Difficulty Settings ──
export const DIFFICULTY = {
    easy: {
        name: 'Easy', aiReaction: 2500, aiAccuracy: 0.08, speedMult: 0.25,
        hpMult: 0.35, damageMult: 0.12, dodgeChance: 0, xpReward: 50, scrapReward: 30,
    },
    medium: {
        name: 'Medium', aiReaction: 1200, aiAccuracy: 0.3, speedMult: 0.5,
        hpMult: 0.6, damageMult: 0.3, dodgeChance: 0.03, xpReward: 75, scrapReward: 50,
    },
    hard: {
        name: 'Hard', aiReaction: 400, aiAccuracy: 0.65, speedMult: 0.8,
        hpMult: 0.9, damageMult: 0.65, dodgeChance: 0.1, xpReward: 120, scrapReward: 80,
    },
    nightmare: {
        name: 'Nightmare', aiReaction: 150, aiAccuracy: 0.85, speedMult: 1.1,
        hpMult: 1.2, damageMult: 0.9, dodgeChance: 0.25, xpReward: 200, scrapReward: 150,
    },
};

// ── Chassis Types ──
export const CHASSIS = {
    light: { name: 'Light', hp: 200, speed: 230, size: 24, armor: 0, color: COLORS.CYAN, unlockLevel: 1 },
    medium: { name: 'Medium', hp: 280, speed: 185, size: 28, armor: 0.1, color: COLORS.STEEL, unlockLevel: 10 },
    heavy: { name: 'Heavy', hp: 400, speed: 135, size: 34, armor: 0.25, color: COLORS.MID_GRAY, unlockLevel: 20 },
    titan: { name: 'Titan', hp: 550, speed: 105, size: 40, armor: 0.35, color: COLORS.DARK_GRAY, unlockLevel: 50 },
};

// ── Bot Skins ──
export const SKINS = {
    steel: { name: 'Steel', color: 0x8899aa, unlockLevel: 1 },
    rust: { name: 'Rust', color: 0xaa5533, unlockLevel: 1 },
    army: { name: 'Army', color: 0x557744, unlockLevel: 3 },
    fire: { name: 'Fire', color: 0xff4422, unlockLevel: 5 },
    ocean: { name: 'Ocean', color: 0x2266aa, unlockLevel: 7 },
    gold: { name: 'Gold', color: 0xffd700, unlockLevel: 10 },
    neon: { name: 'Neon', color: 0x39ff14, unlockLevel: 12 },
    shadow: { name: 'Shadow', color: 0x222233, unlockLevel: 15 },
    plasma: { name: 'Plasma', color: 0xaa33ff, unlockLevel: 18 },
    inferno: { name: 'Inferno', color: 0xff2200, unlockLevel: 20 },
};

// ── Progression ──
export const LEVEL_XP = (level) => {
    if (level <= 1) return 70;
    if (level === 2) return 90;
    if (level === 3) return 115;
    if (level === 4) return 145;
    if (level === 5) return 180;
    return 225 + (level - 6) * 75;
};

export const DEFAULT_SAVE = {
    level: 1,
    xp: 0,
    wins: 0,
    losses: 0,
    scrap: 0,
    botName: 'NolieBot',
    skin: 'steel',
    weapon: 'spinner',
    secondaryWeapon: null,
    chassis: 'light',
    customColor: null,
    unlockedWeapons: ['spinner'],
    weaponUpgrades: {},  // { spinner: 1, hammer: 2, ... } tier 0-3
    armorLevel: 0,      // index into ARMOR_UPGRADES (0 = none)
    speedLevel: 0,      // index into SPEED_UPGRADES (0 = none)
    achievements: [],
    tutorialDone: false,
    lastDailyDate: null,
    dailyCompleted: false,
    campaignProgress: { world: 1, level: 1 },
    waveHighScore: 0,
    stats: { totalDamageDealt: 0, totalDamageReceived: 0, totalKills: 0, bossesDefeated: [], dodgesUsed: 0 },
};

// ── Energy & Dodge Config ──
export const ENERGY_CONFIG = {
    maxEnergy: 100,
    regenRate: 15,        // per second
    attackCosts: {
        melee: 10,
        ranged: 15,
        explosive: 25,
        utility: 20,
        bomb: 30,
    },
    dodgeCost: 25,
    dodgeCooldown: 800,   // ms
    dodgeSpeed: 500,      // pixels/sec during dodge
    dodgeDuration: 200,   // ms of i-frames
};

// ── Weapon Upgrade Tiers ──
export const WEAPON_UPGRADES = {
    // cost per tier: [tier1, tier2, tier3]
    costs: [100, 300, 750],
    // Multipliers applied per tier
    tiers: [
        { damageMult: 1.0, rangeMult: 1.0, cooldownMult: 1.0, label: 'Stock' },
        { damageMult: 1.15, rangeMult: 1.05, cooldownMult: 0.95, label: 'Mk II' },
        { damageMult: 1.3, rangeMult: 1.1, cooldownMult: 0.88, label: 'Mk III' },
        { damageMult: 1.5, rangeMult: 1.15, cooldownMult: 0.8, label: 'Mk IV' },
    ],
};

// ── Achievements ──
export const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Blood', desc: 'Win your first battle', icon: '🏆' },
    { id: 'win_10', name: 'Veteran', desc: 'Win 10 battles', icon: '⭐' },
    { id: 'win_50', name: 'Champion', desc: 'Win 50 battles', icon: '👑' },
    { id: 'win_100', name: 'Legend', desc: 'Win 100 battles', icon: '🔥' },
    { id: 'no_damage', name: 'Untouchable', desc: 'Win without taking damage', icon: '🛡️' },
    { id: 'speed_kill', name: 'Speed Demon', desc: 'Win in under 15 seconds', icon: '⚡' },
    { id: 'boss_crusher', name: 'Scrapper', desc: 'Defeat The Crusher', icon: '🔨' },
    { id: 'boss_forge', name: 'Forged', desc: 'Defeat Forge Master', icon: '🔧' },
    { id: 'boss_magma', name: 'Fireproof', desc: 'Defeat Magma Core', icon: '🌋' },
    { id: 'boss_virus', name: 'Antivirus', desc: 'Defeat Virus.exe', icon: '💻' },
    { id: 'boss_titan', name: 'Titan Slayer', desc: 'Defeat Zero-G Titan', icon: '🚀' },
    { id: 'all_bosses', name: 'Boss Hunter', desc: 'Defeat all 5 bosses', icon: '💀' },
    { id: 'scrap_1000', name: 'Hoarder', desc: 'Accumulate 1000 scrap', icon: '💰' },
    { id: 'scrap_5000', name: 'Tycoon', desc: 'Accumulate 5000 scrap', icon: '💎' },
    { id: 'level_10', name: 'Rising Star', desc: 'Reach level 10', icon: '📈' },
    { id: 'level_20', name: 'Elite', desc: 'Reach level 20', icon: '🎖️' },
    { id: 'dodge_master', name: 'Dodge Master', desc: 'Use dodge 100 times', icon: '💨' },
    { id: 'combo_5', name: 'Combo King', desc: 'Land a 5-hit combo', icon: '🎯' },
    { id: 'combo_10', name: 'Unstoppable', desc: 'Land a 10-hit combo', icon: '💥' },
    { id: 'all_weapons', name: 'Arsenal', desc: 'Unlock all weapons', icon: '🗡️' },
    { id: 'upgrade_max', name: 'Maxed Out', desc: 'Fully upgrade any weapon', icon: '⚙️' },
    { id: 'wave_10', name: 'Survivor', desc: 'Reach wave 10 in survival', icon: '🌊' },
    { id: 'wave_25', name: 'Endurance', desc: 'Reach wave 25 in survival', icon: '🏅' },
    { id: 'mp_win', name: 'Online Victor', desc: 'Win a multiplayer match', icon: '🌐' },
    { id: 'daily_3', name: 'Dedicated', desc: 'Complete 3 daily challenges', icon: '📅' },
    { id: 'melee_only', name: 'Up Close', desc: 'Win using only melee weapons', icon: '🥊' },
    { id: 'ranged_only', name: 'Sharpshooter', desc: 'Win using only ranged weapons', icon: '🎯' },
    { id: 'kill_1000', name: 'Annihilator', desc: 'Destroy 1000 enemies total', icon: '☠️' },
    { id: 'nightmare_win', name: 'Nightmare Fuel', desc: 'Win on Nightmare difficulty', icon: '😈' },
    { id: 'campaign_done', name: 'Conqueror', desc: 'Complete all campaign worlds', icon: '🗺️' },
];

// ── Daily Challenges (pool to pick from) ──
export const DAILY_CHALLENGES = [
    { desc: 'Win 3 battles', type: 'wins', target: 3, reward: { xp: 100, scrap: 80 } },
    { desc: 'Win on Hard difficulty', type: 'win_hard', target: 1, reward: { xp: 120, scrap: 100 } },
    { desc: 'Deal 500 total damage', type: 'damage', target: 500, reward: { xp: 80, scrap: 60 } },
    { desc: 'Win with a melee weapon', type: 'win_melee', target: 1, reward: { xp: 90, scrap: 70 } },
    { desc: 'Win with a ranged weapon', type: 'win_ranged', target: 1, reward: { xp: 90, scrap: 70 } },
    { desc: 'Land a 5-hit combo', type: 'combo', target: 5, reward: { xp: 110, scrap: 90 } },
    { desc: 'Win without dodging', type: 'win_no_dodge', target: 1, reward: { xp: 100, scrap: 80 } },
    { desc: 'Survive 5 waves', type: 'waves', target: 5, reward: { xp: 130, scrap: 100 } },
    { desc: 'Win in under 30 seconds', type: 'speed_win', target: 1, reward: { xp: 120, scrap: 90 } },
    { desc: 'Use 3 different weapons', type: 'weapon_variety', target: 3, reward: { xp: 100, scrap: 80 } },
];

// ── AI Bot Names (unique per difficulty) ──
export const AI_BOT_NAMES = {
    easy: ['Rusty', 'Clanker', 'Tin Can', 'Scrapheap', 'Wobble', 'Sparky Jr', 'Dent', 'Clunker', 'Bolt', 'Nudge'],
    medium: ['Ironjaw', 'Razorfang', 'StormBolt', 'Grinder', 'ArcWelder', 'Buzzkill', 'HammerDown', 'Rivet', 'Torque', 'Shrapnel'],
    hard: ['Decimator', 'Apex', 'Carnage', 'OmegaForce', 'Havoc', 'NightClaw', 'Warpath', 'Blitz', 'Reaper', 'Vendetta'],
    nightmare: ['OBLIVION', 'EXTINCTION', 'DOOMSDAY', 'APOCALYPSE', 'TERMINUS', 'RAGNAROK', 'NEMESIS', 'VOID', 'CHAOS', 'ULTIMA'],
};

// ── Campaign Worlds ──
export const WORLDS = [
    { id: 1, name: 'Scrapyard', arena: 'scrapyard', levels: 6, bossLevel: 6, boss: 'crusher' },
    { id: 2, name: 'Underground Factory', arena: 'factory', levels: 6, bossLevel: 6, boss: 'forgemaster' },
    { id: 3, name: 'Volcanic Forge', arena: 'volcano', levels: 6, bossLevel: 6, boss: 'magmaCore' },
    { id: 4, name: 'Cyber Arena', arena: 'cyber', levels: 6, bossLevel: 6, boss: 'virusExe' },
    { id: 5, name: 'Space Station', arena: 'space', levels: 6, bossLevel: 6, boss: 'titan' },
    { id: 6, name: 'Jungle Ruins', arena: 'jungle', levels: 6, bossLevel: 6, boss: 'jungleBeast' },
    { id: 7, name: 'Frozen Tundra', arena: 'ice', levels: 6, bossLevel: 6, boss: 'frostCore' },
    { id: 8, name: 'Power Plant', arena: 'powerplant', levels: 6, bossLevel: 6, boss: 'voltEngine' },
    { id: 9, name: 'Rock Quarry', arena: 'quarry', levels: 6, bossLevel: 6, boss: 'rockGolem' },
    { id: 10, name: 'Psychedelic Realm', arena: 'rainbow', levels: 6, bossLevel: 6, boss: 'prismLord' },
];

// ── Online opponent names ──
export const ONLINE_NAMES = [
    'ShadowStriker', 'BotKing92', 'MetalMaster', 'IronClaw', 'CrushBot3000',
    'NeonSlayer', 'VoltEdge', 'ChronoSmash', 'PixelPuncher', 'TurboWreck',
    'GlitchByte', 'HexBlade', 'RustLord', 'QuantumBash', 'SteelViper',
    'ThunderJaw', 'DarkCircuit', 'BlazeCore', 'FrostByte', 'ZeroMercy',
];

export const ONLINE_FLAGS = ['🇺🇸','🇬🇧','🇯🇵','🇩🇪','🇫🇷','🇰🇷','🇧🇷','🇦🇺','🇨🇦','🇲🇽','🇮🇳','🇮🇹','🇪🇸','🇸🇪','🇳🇴'];

// ── Arena Tile System ──
// 0=wall 1=floor 2=hazard 3=breakable 4=lava 5=player_spawn 6=enemy_spawn 7=TNT 8=teleporter
export const TILE_SIZE = 32; // balance between resolution and performance
// Arena shapes — grids generated at runtime by BattleScene._generateArenaGrid()
export const ARENA_SHAPES = {
    scrapyard:  { shape: 'circle', radiusPct: 0.34, obstacles: 8, tnt: 3, breakables: 10 },
    factory:    { shape: 'rect',   widthPct: 0.50, heightPct: 0.45, obstacles: 6, tnt: 4, breakables: 8, centerBlock: true },
    volcano:    { shape: 'circle', radiusPct: 0.32, obstacles: 4, tnt: 2, breakables: 6, lavaRing: true, bridge: 'bottom' },
    cyber:      { shape: 'rect',   widthPct: 0.52, heightPct: 0.48, obstacles: 8, tnt: 3, breakables: 8, teleporters: 4 },
    space:      { shape: 'octagon',radiusPct: 0.35, obstacles: 6, tnt: 2, breakables: 8, teleporters: 4 },
    jungle:     { shape: 'rect',   widthPct: 0.52, heightPct: 0.52, obstacles: 8, tnt: 3, breakables: 10 },
    ice:        { shape: 'oval',   widthPct: 0.42, heightPct: 0.34, obstacles: 4, tnt: 2, breakables: 6 },
    powerplant: { shape: 'rect',   widthPct: 0.52, heightPct: 0.48, obstacles: 6, tnt: 4, breakables: 8, centerBlock: true },
    quarry:     { shape: 'rect',   widthPct: 0.38, heightPct: 0.34, obstacles: 6, tnt: 3, breakables: 8 },
    rainbow:    { shape: 'pentagon',radiusPct: 0.32, obstacles: 4, tnt: 5, breakables: 8 },
};

// Legacy fallback — kept as empty for import compatibility
export const ARENA_LAYOUTS = {
    // No static layouts — grids generated at runtime from ARENA_SHAPES
};

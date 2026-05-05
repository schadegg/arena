import {
    DEFAULT_SAVE,
    LEVEL_XP,
    WEAPONS,
    SKINS,
    CHASSIS,
    ARMOR_UPGRADES,
    SPEED_UPGRADES,
    WEAPON_UPGRADES,
    WORLDS,
} from '../constants.js';

const SAVE_KEY = 'battlebots_save_v2';

export default class ProgressionSystem {
    constructor() {
        this.data = this.load();
    }

    _sanitizeData(data) {
        const validWeapons = new Set(Object.keys(WEAPONS));
        const validChassis = new Set(Object.keys(CHASSIS));
        const sanitized = { ...data };
        const parsedLevel = Number(sanitized.level);
        sanitized.level = Number.isFinite(parsedLevel) ? Math.max(1, parsedLevel) : DEFAULT_SAVE.level;
        sanitized.unlockedWeapons = [...new Set((sanitized.unlockedWeapons || []).filter((key) => validWeapons.has(key)))];
        if (!sanitized.unlockedWeapons.includes(DEFAULT_SAVE.weapon)) {
            sanitized.unlockedWeapons.unshift(DEFAULT_SAVE.weapon);
        }
        for (const [key, weapon] of Object.entries(WEAPONS)) {
            if ((weapon.cost || 0) === 0
                    && weapon.unlockLevel <= sanitized.level
                    && !sanitized.unlockedWeapons.includes(key)) {
                sanitized.unlockedWeapons.push(key);
            }
        }
        sanitized.weapon = validWeapons.has(sanitized.weapon) ? sanitized.weapon : DEFAULT_SAVE.weapon;
        sanitized.chassis = validChassis.has(sanitized.chassis) ? sanitized.chassis : DEFAULT_SAVE.chassis;
        if (!this._isChassisAvailableForLevel(sanitized.chassis, sanitized.level)) {
            sanitized.chassis = DEFAULT_SAVE.chassis;
        }
        sanitized.secondaryWeapon = validWeapons.has(sanitized.secondaryWeapon) ? sanitized.secondaryWeapon : null;
        if (sanitized.weapon === sanitized.secondaryWeapon) {
            sanitized.secondaryWeapon = null;
        }
        if (!sanitized.unlockedWeapons.includes(sanitized.weapon)) {
            sanitized.unlockedWeapons.push(sanitized.weapon);
        }
        if (sanitized.secondaryWeapon && !sanitized.unlockedWeapons.includes(sanitized.secondaryWeapon)) {
            sanitized.unlockedWeapons.push(sanitized.secondaryWeapon);
        }
        sanitized.weaponUpgrades = Object.fromEntries(
            Object.entries(sanitized.weaponUpgrades || {}).filter(([key]) => validWeapons.has(key))
        );
        return sanitized;
    }

    _isChassisAvailableForLevel(chassis, level) {
        const def = CHASSIS[chassis];
        return !!def && level >= (def.unlockLevel || 1);
    }

    load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                return this._sanitizeData({ ...structuredClone(DEFAULT_SAVE), ...saved });
            }
        } catch (e) {
            console.warn('Failed to load save:', e);
        }
        return this._sanitizeData(structuredClone(DEFAULT_SAVE));
    }

    save() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Failed to save:', e);
        }
    }

    get level() { return this.data.level; }
    get xp() { return this.data.xp; }
    get xpToNext() { return LEVEL_XP(this.data.level); }
    get xpProgress() { return this.data.xp / this.xpToNext; }
    get wins() { return this.data.wins; }
    get losses() { return this.data.losses; }
    get scrap() { return this.data.scrap; }
    get botName() { return this.data.botName; }
    get skin() { return this.data.skin; }
    get weapon() { return this.data.weapon; }
    get chassis() { return this.data.chassis; }
    get customColor() { return this.data.customColor; }
    get campaignProgress() { return this.data.campaignProgress; }
    get stats() { return this.data.stats; }

    setBotName(name) { this.data.botName = name.substring(0, 15); this.save(); }
    setSkin(skin) { this.data.skin = skin; this.save(); }
    setWeapon(weapon) {
        if (!WEAPONS[weapon] || !this.isWeaponUnlocked(weapon)) return false;
        const previousPrimary = this.data.weapon;
        if (weapon === previousPrimary) return true;
        this.data.weapon = weapon;
        if (this.data.secondaryWeapon === this.data.weapon) {
            this.data.secondaryWeapon = previousPrimary !== weapon ? previousPrimary : null;
        }
        this.save();
        return true;
    }
    setSecondaryWeapon(weapon) {
        if (!weapon) {
            this.data.secondaryWeapon = null;
            this.save();
            return true;
        }
        if (!WEAPONS[weapon] || !this.isWeaponUnlocked(weapon)) return false;
        if (weapon === this.data.weapon) return false;
        const previousSecondary = this.data.secondaryWeapon;
        this.data.secondaryWeapon = weapon;
        if (previousSecondary === this.data.weapon) this.data.weapon = previousSecondary;
        this.save();
        return true;
    }

    // Armor/Speed upgrades
    buyArmorUpgrade() {
        const next = (this.data.armorLevel || 0);
        if (next >= ARMOR_UPGRADES.length) return false;
        const upgrade = ARMOR_UPGRADES[next];
        if (this.data.level < upgrade.unlockLevel) return false;
        if (!this.spendScrap(upgrade.cost)) return false;
        this.data.armorLevel = next + 1;
        this.save();
        return true;
    }

    buySpeedUpgrade() {
        const next = (this.data.speedLevel || 0);
        if (next >= SPEED_UPGRADES.length) return false;
        const upgrade = SPEED_UPGRADES[next];
        if (this.data.level < upgrade.unlockLevel) return false;
        if (!this.spendScrap(upgrade.cost)) return false;
        this.data.speedLevel = next + 1;
        this.save();
        return true;
    }

    getArmorBonus() {
        const lvl = this.data.armorLevel || 0;
        return lvl > 0 && lvl <= ARMOR_UPGRADES.length ? ARMOR_UPGRADES[lvl - 1].armor : 0;
    }

    getSpeedBonus() {
        const lvl = this.data.speedLevel || 0;
        return lvl > 0 && lvl <= SPEED_UPGRADES.length ? SPEED_UPGRADES[lvl - 1].speed : 0;
    }

    // Weapon tier upgrades
    getWeaponTier(weaponKey) {
        return (this.data.weaponUpgrades || {})[weaponKey] || 0;
    }

    buyWeaponUpgrade(weaponKey) {
        const tier = this.getWeaponTier(weaponKey);
        if (tier >= 3) return false;
        const costs = WEAPON_UPGRADES.costs;
        if (!costs || tier >= costs.length) return false;
        if (!this.spendScrap(costs[tier])) return false;
        if (!this.data.weaponUpgrades) this.data.weaponUpgrades = {};
        this.data.weaponUpgrades[weaponKey] = tier + 1;
        this.save();
        return true;
    }
    get secondaryWeapon() { return this.data.secondaryWeapon; }
    setChassis(chassis) {
        if (!this.isChassisAvailable(chassis)) return false;
        this.data.chassis = chassis;
        this.save();
        return true;
    }
    setCustomColor(color) { this.data.customColor = color; this.save(); }

    addXP(amount) {
        this.data.xp += amount;
        const levelsGained = [];
        while (this.data.xp >= this.xpToNext) {
            this.data.xp -= this.xpToNext;
            this.data.level++;
            levelsGained.push(this.data.level);
            // Free weapons unlock at level thresholds; paid weapons become purchasable.
            for (const [key, w] of Object.entries(WEAPONS)) {
                if ((w.cost || 0) === 0 && w.unlockLevel <= this.data.level && !this.data.unlockedWeapons.includes(key)) {
                    this.data.unlockedWeapons.push(key);
                }
            }
        }
        this.save();
        return levelsGained;
    }

    addScrap(amount) {
        this.data.scrap += amount;
        this.save();
    }

    spendScrap(amount) {
        if (this.data.scrap < amount) return false;
        this.data.scrap -= amount;
        this.save();
        return true;
    }

    purchaseWeapon(weaponKey) {
        const weapon = WEAPONS[weaponKey];
        if (!weapon) return false;
        if (this.data.unlockedWeapons.includes(weaponKey)) return false;
        if (this.data.level < weapon.unlockLevel) return false;
        if (weapon.cost > 0 && !this.spendScrap(weapon.cost)) return false;
        this.data.unlockedWeapons.push(weaponKey);
        this.save();
        return true;
    }

    isWeaponUnlocked(key) {
        return this.data.unlockedWeapons.includes(key);
    }

    isWeaponAvailable(key) {
        const w = WEAPONS[key];
        return w && this.data.level >= w.unlockLevel;
    }

    getUnlockedWeapons() {
        return this.data.unlockedWeapons;
    }

    getAvailableSkins() {
        return Object.entries(SKINS)
            .filter(([, s]) => s.unlockLevel <= this.data.level)
            .map(([key]) => key);
    }

    isChassisAvailable(key) {
        return this._isChassisAvailableForLevel(key, this.data.level);
    }

    getAvailableChassis() {
        return Object.entries(CHASSIS)
            .filter(([, chassis]) => (chassis.unlockLevel || 1) <= this.data.level)
            .map(([key]) => key);
    }

    recordWin() { this.data.wins++; this.save(); }
    recordLoss() { this.data.losses++; this.save(); }

    addDamageDealt(amount) { this.data.stats.totalDamageDealt += amount; }
    addDamageReceived(amount) { this.data.stats.totalDamageReceived += amount; }

    advanceCampaign(world, level) {
        const cp = this.data.campaignProgress;
        if (world > cp.world || (world === cp.world && level >= cp.level)) {
            if (level >= 6) {
                // Beat the boss (level 6) — unlock next world
                cp.world = world + 1;
                cp.level = 1;
            } else {
                cp.world = world;
                cp.level = level + 1;
            }
        }
        this.save();
    }

    recordBossDefeated(bossKey) {
        if (!this.data.stats.bossesDefeated.includes(bossKey)) {
            this.data.stats.bossesDefeated.push(bossKey);
            this.save();
        }
    }

    unlockAll() {
        this.data.level = 120;
        this.data.xp = 0;
        this.data.scrap = Math.max(this.data.scrap || 0, 25000);
        this.data.unlockedWeapons = Object.keys(WEAPONS);
        this.data.armorLevel = ARMOR_UPGRADES.length;
        this.data.speedLevel = SPEED_UPGRADES.length;
        this.data.weaponUpgrades = {};
        for (const key of Object.keys(WEAPONS)) {
            this.data.weaponUpgrades[key] = 3;
        }
        this.data.tutorialDone = true;
        this.data.campaignProgress = { world: WORLDS.length + 1, level: 1 };
        if (!this.data.stats) this.data.stats = { totalDamageDealt: 0, totalDamageReceived: 0, totalKills: 0, bossesDefeated: [], dodgesUsed: 0 };
        this.data.stats.bossesDefeated = WORLDS.map((world) => world.boss).filter(Boolean);
        this.save();
    }

    resetSave() {
        this.data = structuredClone(DEFAULT_SAVE);
        this.save();
    }
}

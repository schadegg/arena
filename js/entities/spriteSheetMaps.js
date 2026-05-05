const cloneStandardPairs = () => ({
    E: [10, 11],
    SE: [12, 13],
    S: [14, 15],
    SW: [0, 1],
    W: [2, 3],
    NW: [4, 5],
    N: [6, 7],
    NE: [8, 9],
});

const STANDARD_DIRECTION_PAIRS = Object.freeze(cloneStandardPairs());

// The sheets are painted as 3/4 isometric views, so world-facing needs a
// quarter-turn screen projection before we select a directional frame pair.
export const ISOMETRIC_FACING_OFFSET = Math.PI / 4;
export const EIGHT_WAY_DIRECTIONS = Object.freeze(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

export const CHASSIS_SHEET_LAYOUTS = Object.freeze({
    light: {
        idle: cloneStandardPairs(),
        walk: cloneStandardPairs(),
        attack: { E: [9, 4], SE: [5, 14], S: [0, 15], SW: [6, 1], W: [11, 3], NW: [12, 7], N: [2, 8], NE: [13, 10] },
    },
    medium: {
        idle: cloneStandardPairs(),
        walk: cloneStandardPairs(),
        attack: { E: [8, 2], SE: [11, 14], S: [15, 3], SW: [5, 12], W: [7, 4], NW: [10, 13], N: [1, 6], NE: [0, 9] },
    },
    heavy: {
        idle: cloneStandardPairs(),
        walk: cloneStandardPairs(),
        attack: { E: [13, 5], SE: [14, 4], S: [15, 6], SW: [0, 1], W: [2, 7], NW: [9, 3], N: [11, 10], NE: [12, 8] },
    },
    titan: {
        idle: cloneStandardPairs(),
        walk: cloneStandardPairs(),
        attack: { E: [9, 8], SE: [0, 15], S: [7, 1], SW: [2, 3], W: [14, 13], NW: [4, 5], N: [11, 6], NE: [12, 10] },
    },
});

export const BOSS_SHEET_LAYOUTS = Object.freeze({
    crusher: {
        idle: cloneStandardPairs(),
        walk: { E: [6, 15], SE: [3, 5], S: [14, 0], SW: [7, 10], W: [12, 13], NW: [2, 4], N: [11, 1], NE: [8, 9] },
        attack1: { E: [1, 0], SE: [2, 3], S: [4, 13], SW: [12, 11], W: [6, 9], NW: [15, 14], N: [10, 7], NE: [5, 8] },
        attack2: { E: [0, 5], SE: [9, 1], S: [10, 15], SW: [7, 8], W: [13, 6], NW: [11, 4], N: [2, 12], NE: [3, 14] },
    },
    forgemaster: {
        idle: cloneStandardPairs(),
        walk: { E: [5, 11], SE: [12, 3], S: [1, 2], SW: [0, 10], W: [4, 6], NW: [9, 13], N: [8, 7], NE: [15, 14] },
        attack1: { E: [0, 10], SE: [8, 1], S: [6, 4], SW: [2, 13], W: [3, 5], NW: [7, 11], N: [12, 14], NE: [9, 15] },
        attack2: { E: [0, 11], SE: [4, 8], S: [12, 2], SW: [7, 1], W: [6, 5], NW: [9, 13], N: [10, 15], NE: [14, 3] },
    },
    magma_core: {
        idle: cloneStandardPairs(),
        walk: { E: [10, 11], SE: [12, 13], S: [8, 14], SW: [0, 15], W: [6, 5], NW: [4, 7], N: [9, 2], NE: [1, 3] },
        attack1: { E: [2, 1], SE: [0, 7], S: [12, 14], SW: [6, 3], W: [5, 13], NW: [9, 10], N: [11, 15], NE: [8, 4] },
        attack2: { E: [12, 11], SE: [13, 10], S: [15, 9], SW: [0, 1], W: [2, 3], NW: [14, 4], N: [6, 7], NE: [5, 8] },
    },
    virus_exe: {
        idle: cloneStandardPairs(),
        walk: { E: [13, 9], SE: [7, 4], S: [0, 1], SW: [10, 8], W: [2, 14], NW: [11, 5], N: [3, 12], NE: [6, 15] },
        attack1: { E: [0, 5], SE: [6, 2], S: [3, 10], SW: [12, 14], W: [13, 15], NW: [7, 11], N: [1, 9], NE: [8, 4] },
        attack2: { E: [0, 13], SE: [9, 12], S: [1, 11], SW: [14, 15], W: [6, 8], NW: [5, 7], N: [10, 3], NE: [4, 2] },
    },
    titan: {
        idle: cloneStandardPairs(),
        walk: { E: [1, 10], SE: [8, 5], S: [13, 0], SW: [7, 11], W: [3, 4], NW: [2, 9], N: [15, 14], NE: [6, 12] },
        attack1: { E: [0, 9], SE: [14, 6], S: [13, 1], SW: [8, 2], W: [12, 7], NW: [4, 10], N: [15, 3], NE: [11, 5] },
        attack2: { E: [1, 7], SE: [2, 8], S: [3, 0], SW: [15, 6], W: [10, 11], NW: [4, 14], N: [5, 13], NE: [9, 12] },
    },
    frost_core: {
        idle: cloneStandardPairs(),
        walk: { E: [4, 8], SE: [6, 9], S: [0, 15], SW: [11, 3], W: [2, 14], NW: [12, 7], N: [5, 10], NE: [1, 13] },
        attack1: { E: [2, 8], SE: [3, 0], S: [1, 4], SW: [5, 14], W: [11, 6], NW: [15, 7], N: [10, 12], NE: [13, 9] },
        attack2: { E: [0, 2], SE: [1, 4], S: [7, 13], SW: [10, 15], W: [3, 8], NW: [5, 11], N: [9, 14], NE: [12, 6] },
    },
    jungle_beast: {
        idle: cloneStandardPairs(),
        walk: { E: [0, 4], SE: [2, 5], S: [3, 1], SW: [7, 9], W: [10, 12], NW: [6, 8], N: [13, 11], NE: [15, 14] },
        attack1: { E: [0, 1], SE: [2, 12], S: [4, 15], SW: [3, 13], W: [10, 9], NW: [8, 5], N: [14, 6], NE: [11, 7] },
        attack2: { E: [0, 2], SE: [15, 14], S: [13, 7], SW: [3, 5], W: [4, 8], NW: [12, 1], N: [9, 11], NE: [10, 6] },
    },
    prism_lord: {
        idle: cloneStandardPairs(),
        walk: { E: [5, 9], SE: [15, 0], S: [8, 1], SW: [2, 4], W: [13, 3], NW: [6, 10], N: [7, 14], NE: [12, 11] },
        attack1: { E: [7, 8], SE: [0, 13], S: [14, 11], SW: [12, 5], W: [15, 3], NW: [4, 1], N: [2, 6], NE: [10, 9] },
        attack2: { E: [1, 8], SE: [0, 7], S: [6, 15], SW: [9, 12], W: [5, 14], NW: [4, 3], N: [11, 10], NE: [13, 2] },
    },
    rock_golem: {
        idle: cloneStandardPairs(),
        walk: { E: [12, 13], SE: [0, 14], S: [7, 15], SW: [6, 5], W: [10, 2], NW: [1, 9], N: [4, 8], NE: [3, 11] },
        attack1: { E: [11, 14], SE: [0, 2], S: [8, 4], SW: [9, 13], W: [5, 1], NW: [7, 3], N: [15, 10], NE: [6, 12] },
        attack2: { E: [15, 0], SE: [1, 3], S: [2, 5], SW: [7, 13], W: [9, 4], NW: [6, 14], N: [10, 11], NE: [12, 8] },
    },
    volt_engine: {
        idle: cloneStandardPairs(),
        walk: { E: [5, 6], SE: [0, 14], S: [15, 8], SW: [7, 1], W: [2, 3], NW: [10, 11], N: [9, 4], NE: [13, 12] },
        attack1: { E: [3, 1], SE: [0, 2], S: [9, 11], SW: [15, 13], W: [7, 10], NW: [4, 8], N: [12, 14], NE: [5, 6] },
        attack2: { E: [2, 15], SE: [1, 0], S: [8, 3], SW: [12, 9], W: [14, 4], NW: [11, 6], N: [10, 7], NE: [5, 13] },
    },
});

export function directionKeyFromWorldAngle(worldAngle, angleOffset = ISOMETRIC_FACING_OFFSET) {
    const fullTurn = Math.PI * 2;
    const sectorSize = Math.PI / 4;
    let normalized = (worldAngle + angleOffset) % fullTurn;
    if (normalized < 0) normalized += fullTurn;
    const sector = Math.round(normalized / sectorSize) % EIGHT_WAY_DIRECTIONS.length;
    return EIGHT_WAY_DIRECTIONS[sector];
}

export function directionalFramesForSheet(layouts, sheetName, worldAngle) {
    const directionKey = directionKeyFromWorldAngle(worldAngle);
    const sheetLayouts = layouts?.[sheetName] || STANDARD_DIRECTION_PAIRS;
    return sheetLayouts?.[directionKey] || STANDARD_DIRECTION_PAIRS[directionKey] || STANDARD_DIRECTION_PAIRS.S;
}

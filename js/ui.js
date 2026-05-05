const UI_CROPS = {
    ui_button_normal: { x: 291, y: 288, w: 444, h: 448 },
    ui_button_hover: { x: 291, y: 288, w: 444, h: 448 },
    ui_panel_dark: { x: 178, y: 76, w: 1005, h: 623 },
    ui_hp_bar_frame: { x: 51, y: 213, w: 1258, h: 358 },
    ui_icon_scrap: { x: 93, y: 83, w: 839, h: 894 },
    ui_icon_skull: { x: 170, y: 85, w: 691, h: 820 },
    ui_icon_xp: { x: 210, y: 52, w: 619, h: 938 },
    heart: { x: 0, y: 0, w: 1024, h: 1024 },
};

const UI_NINE_SLICES = {
    ui_button_normal: { left: 55, right: 55, top: 55, bottom: 55 },
    ui_button_hover: { left: 55, right: 55, top: 55, bottom: 55 },
    ui_panel_dark: { left: 68, right: 68, top: 14, bottom: 14 },
    ui_hp_bar_frame: { left: 132, right: 132, top: 10, bottom: 10 },
    ui_panel_section: { left: 64, right: 64, top: 64, bottom: 64 },
    ui_panel_section__rowcrop: { left: 64, right: 64, top: 64, bottom: 16 },
    ui_keycap: { left: 32, right: 32, top: 16, bottom: 16 },
};

const AUTO_CROP_CACHE = new Map();
const PROCESSED_SOURCE_CACHE = new Map();
const COLOR_KEY_CONFIG = {
    title_logo: [{ r: 255, g: 0, b: 255, tolerance: 32 }],
    ui_settings: [{ r: 255, g: 255, b: 255, tolerance: 26 }],
    ui_victory: [{ r: 255, g: 255, b: 255, tolerance: 26 }],
    ui_defeat: [{ r: 255, g: 255, b: 255, tolerance: 26 }],
};

function colorDistance(r, g, b, color) {
    return Math.max(
        Math.abs(r - color.r),
        Math.abs(g - color.g),
        Math.abs(b - color.b)
    );
}

function shouldColorKey(key, r, g, b) {
    const palette = COLOR_KEY_CONFIG[key];
    if (!palette) return false;
    return palette.some((color) => colorDistance(r, g, b, color) <= color.tolerance);
}

function getProcessedSourceImage(scene, key) {
    const cacheKey = key;
    if (PROCESSED_SOURCE_CACHE.has(cacheKey)) return PROCESSED_SOURCE_CACHE.get(cacheKey);

    const texture = scene.textures.get(key);
    if (!texture) return null;
    const src = texture.getSourceImage();
    if (!src) return null;

    const needsColorKey = !!COLOR_KEY_CONFIG[key];
    if (!needsColorKey) {
        PROCESSED_SOURCE_CACHE.set(cacheKey, src);
        return src;
    }

    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        if (shouldColorKey(key, data[i], data[i + 1], data[i + 2])) {
            data[i + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    PROCESSED_SOURCE_CACHE.set(cacheKey, canvas);
    return canvas;
}

function getTextureBounds(scene, key) {
    if (UI_CROPS[key]) return UI_CROPS[key];
    if (AUTO_CROP_CACHE.has(key)) return AUTO_CROP_CACHE.get(key);

    const src = getProcessedSourceImage(scene, key);
    if (!src) return null;

    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);

    const { data } = ctx.getImageData(0, 0, src.width, src.height);
    let minX = src.width;
    let minY = src.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
            const alpha = data[(y * src.width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    const bounds = maxX >= minX && maxY >= minY
        ? {
            x: Math.max(0, minX - 1),
            y: Math.max(0, minY - 1),
            w: Math.min(src.width - Math.max(0, minX - 1), maxX - minX + 3),
            h: Math.min(src.height - Math.max(0, minY - 1), maxY - minY + 3),
        }
        : { x: 0, y: 0, w: src.width, h: src.height };

    AUTO_CROP_CACHE.set(key, bounds);
    return bounds;
}

function addCanvasTexture(scene, textureKey, width, height, drawFn) {
    if (scene.textures.exists(textureKey)) return textureKey;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, canvas);
    scene.textures.addCanvas(textureKey, canvas);
    return textureKey;
}

export const UI_THEME = Object.freeze({
    fontFamily: 'monospace',
    stroke: '#000000',
    strokeThickness: 2,
    colors: Object.freeze({
        text: '#ffffff',
        subtle: '#ffffff',
        accent: '#ffaa33',
        success: '#ffdd66',
        danger: '#ff4444',
        info: '#ffaa33',
        warning: '#ffd66f',
        panelTop: '#1d2531',
        panelBottom: '#0f141c',
        insetTop: '#131923',
        insetBottom: '#090d13',
        edgeLight: '#425468',
        edgeDark: '#04070b',
        shadow: '#020406',
        hpFrameTop: '#4a5766',
        hpFrameBottom: '#1a232d',
    }),
});

function mergeStyle(base, overrides = {}) {
    return { ...base, ...overrides };
}

export function makeTextStyle(role = 'body', overrides = {}) {
    const base = {
        fontFamily: UI_THEME.fontFamily,
        color: UI_THEME.colors.text,
        stroke: UI_THEME.stroke,
        strokeThickness: UI_THEME.strokeThickness,
    };
    const styles = {
        title: { fontSize: '30px', color: UI_THEME.colors.accent, strokeThickness: 4 },
        heading: { fontSize: '18px', color: UI_THEME.colors.accent, strokeThickness: 3 },
        section: { fontSize: '14px', color: UI_THEME.colors.accent, strokeThickness: 2 },
        body: { fontSize: '12px', color: UI_THEME.colors.text },
        value: { fontSize: '12px', color: '#ffffff' },
        small: { fontSize: '10px', color: UI_THEME.colors.subtle },
        hint: { fontSize: '10px', color: UI_THEME.colors.subtle },
        success: { fontSize: '12px', color: UI_THEME.colors.success },
        danger: { fontSize: '12px', color: UI_THEME.colors.danger },
        info: { fontSize: '12px', color: UI_THEME.colors.info },
        button: { fontSize: '12px', color: '#ffffff', strokeThickness: 3 },
        buttonSmall: { fontSize: '10px', color: '#ffffff', strokeThickness: 3 },
    };
    return mergeStyle({ ...base, ...(styles[role] || styles.body) }, overrides);
}

export function fitTextToWidth(textObj, maxWidth, minSize = 8) {
    if (!textObj || !maxWidth) return textObj;
    let size = parseInt(textObj.style.fontSize, 10);
    if (Number.isNaN(size)) size = 12;
    while (size > minSize && textObj.width > maxWidth) {
        size -= 1;
        textObj.setFontSize(`${size}px`);
    }
    return textObj;
}

export function addUiText(scene, x, y, text, role = 'body', options = {}) {
    const label = scene.add.text(x, y, text, makeTextStyle(role, options.style));
    if (options.origin !== undefined) label.setOrigin(options.origin);
    else if (options.originX !== undefined || options.originY !== undefined) {
        label.setOrigin(options.originX ?? 0, options.originY ?? 0);
    }
    if (options.depth !== undefined) label.setDepth(options.depth);
    if (options.alpha !== undefined) label.setAlpha(options.alpha);
    if (options.maxWidth) fitTextToWidth(label, options.maxWidth, options.minFontSize || 8);
    return label;
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function fillRoundedRect(ctx, x, y, w, h, r, fillStyle) {
    roundedRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function strokeRoundedRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1) {
    roundedRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function verticalGradient(ctx, h, top, bottom) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    return grad;
}

function panelCornerRadius(family, w, h) {
    const minSide = Math.min(w, h);
    if (family === 'section' || family === 'section_plain') return Math.max(5, Math.min(8, Math.floor(minSide * 0.08)));
    if (family === 'panel') return Math.max(5, Math.min(8, Math.floor(minSide * 0.07)));
    if (family === 'row') return Math.max(4, Math.min(7, Math.floor(minSide * 0.07)));
    if (family === 'button') return Math.max(3, Math.min(5, Math.floor(minSide * 0.07)));
    if (family === 'keycap') return Math.max(3, Math.min(5, Math.floor(minSide * 0.08)));
    if (family === 'slider_track') return Math.max(3, Math.min(5, Math.floor(minSide * 0.20)));
    if (family === 'hp_frame') return Math.max(4, Math.min(6, Math.floor(minSide * 0.08)));
    return Math.max(4, Math.min(8, Math.floor(minSide * 0.07)));
}

function proceduralTextureKey(scene, family, width, height, state = 'normal') {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    const key = `proc_${family}_${state}_${w}x${h}`;
    return addCanvasTexture(scene, key, w, h, (ctx, canvas) => {
        ctx.imageSmoothingEnabled = false;
        const colors = UI_THEME.colors;

        if (family === 'slider_knob') {
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const outer = Math.min(canvas.width, canvas.height) / 2 - 1;
            ctx.beginPath();
            ctx.arc(cx, cy, outer, 0, Math.PI * 2);
            ctx.fillStyle = verticalGradient(ctx, canvas.height, '#f8c982', '#6a3318');
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, outer - 2, 0, Math.PI * 2);
            ctx.fillStyle = verticalGradient(ctx, canvas.height, '#2b313d', '#10151b');
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, outer - 6, 0, Math.PI * 2);
            ctx.fillStyle = verticalGradient(ctx, canvas.height, '#ffcf79', '#c85c21');
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx - outer * 0.18, cy - outer * 0.25, outer * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fill();
            return;
        }

        const radius = panelCornerRadius(family, w, h);
        let top = colors.panelTop;
        let bottom = colors.panelBottom;
        let accent = colors.accent;
        let innerTop = colors.insetTop;
        let innerBottom = colors.insetBottom;
        let borderLight = colors.edgeLight;
        let borderDark = colors.edgeDark;

        if (family === 'button') {
            if (state === 'hover') {
                top = '#303844';
                bottom = '#181f2a';
                accent = '#ffd082';
                borderLight = '#5e7388';
            } else {
                top = '#202833';
                bottom = '#111821';
                accent = '#ffb563';
            }
        } else if (family === 'keycap') {
            top = '#232936';
            bottom = '#10141d';
            accent = '#6f8298';
        } else if (family === 'slider_track') {
            top = '#171c24';
            bottom = '#0b0f15';
            accent = '#2a3645';
        } else if (family === 'hp_frame') {
            top = colors.hpFrameTop;
            bottom = colors.hpFrameBottom;
            innerTop = '#2c100b';
            innerBottom = '#120606';
            accent = '#d8843f';
            borderLight = '#697787';
        } else if (family === 'row') {
            top = '#141b24';
            bottom = '#0a0f16';
            accent = '#6d5235';
            borderLight = '#2f3f50';
        }

        fillRoundedRect(ctx, 0, 0, w, h, radius, verticalGradient(ctx, h, top, bottom));
        fillRoundedRect(ctx, 2, 2, w - 4, Math.max(3, Math.floor(h * 0.22)), Math.max(3, radius - 2), 'rgba(255,255,255,0.055)');
        fillRoundedRect(ctx, 3, 3, w - 6, h - 6, Math.max(3, radius - 2), verticalGradient(ctx, h - 6, innerTop, innerBottom));

        if (family === 'section' || family === 'section_plain') {
            fillRoundedRect(ctx, 10, 8, w - 20, 5, 3, 'rgba(255,181,99,0.12)');
        } else if (family === 'row') {
            fillRoundedRect(ctx, 10, Math.max(4, h - 8), w - 20, 2, 1, 'rgba(255,181,99,0.08)');
        } else if (family === 'button') {
            fillRoundedRect(ctx, 7, 5, w - 14, Math.max(4, Math.floor(h * 0.18)), 3, 'rgba(255,255,255,0.075)');
            fillRoundedRect(ctx, 10, Math.max(8, h - 9), w - 20, 2, 1, 'rgba(255,181,99,0.16)');
        } else if (family === 'keycap') {
            fillRoundedRect(ctx, 5, 5, w - 10, Math.max(4, Math.floor(h * 0.24)), 3, 'rgba(255,255,255,0.08)');
        } else if (family === 'slider_track') {
            fillRoundedRect(ctx, 2, 2, w - 4, h - 4, Math.max(2, radius - 3), verticalGradient(ctx, h - 4, '#0c1016', '#1d2630'));
        } else if (family === 'hp_frame') {
            fillRoundedRect(ctx, 6, 6, w - 12, h - 12, Math.max(2, radius - 4), verticalGradient(ctx, h - 12, innerTop, innerBottom));
            fillRoundedRect(ctx, 9, Math.max(7, h - 12), w - 18, 3, 2, 'rgba(216,132,63,0.2)');
        }

        strokeRoundedRect(ctx, 1, 1, w - 2, h - 2, Math.max(3, radius - 1), borderLight, family === 'row' ? 1 : 2);
        strokeRoundedRect(ctx, 2, 2, w - 4, h - 4, Math.max(3, radius - 2), borderDark, 1);

        if (family === 'section' || family === 'hp_frame') {
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(7, h - 7);
            ctx.lineTo(7, h - 15);
            ctx.lineTo(15, h - 7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(w - 7, 7);
            ctx.lineTo(w - 7, 15);
            ctx.lineTo(w - 15, 7);
            ctx.stroke();
        }
    });
}

function proceduralTextureForMissingKey(scene, key, width, height) {
    switch (key) {
    case 'ui_panel_dark':
        return proceduralTextureKey(scene, 'panel', width, height, 'normal');
    case 'ui_panel_section':
        return proceduralTextureKey(scene, 'section', width, height, 'normal');
    case 'ui_panel_section__rowcrop':
    case 'ui_keycap':
        return proceduralTextureKey(scene, 'keycap', width, height, 'normal');
    case 'ui_slider_track':
        return proceduralTextureKey(scene, 'slider_track', width, height, 'normal');
    case 'ui_slider_knob':
        return proceduralTextureKey(scene, 'slider_knob', width, height, 'normal');
    case 'ui_hp_bar_frame':
        return proceduralTextureKey(scene, 'hp_frame', width, height, 'normal');
    default:
        return null;
    }
}

export function getCroppedTextureKey(scene, key) {
    const bounds = getTextureBounds(scene, key);
    if (!bounds) return key;

    const src = getProcessedSourceImage(scene, key);
    if (!UI_CROPS[key] && bounds.x === 0 && bounds.y === 0 && bounds.w === src.width && bounds.h === src.height) {
        return key;
    }

    const textureKey = `${key}__crop_${bounds.x}_${bounds.y}_${bounds.w}_${bounds.h}`;
    return addCanvasTexture(scene, textureKey, bounds.w, bounds.h, (ctx) => {
        ctx.drawImage(src, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    });
}

function getSizedTextureKey(scene, key, width, height) {
    const slice = UI_NINE_SLICES[key];
    if (!slice) return getCroppedTextureKey(scene, key);

    const bounds = getTextureBounds(scene, key);
    if (!bounds) return key;

    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    const textureKey = `${key}__ns_${w}x${h}`;
    if (scene.textures.exists(textureKey)) return textureKey;

    const src = getProcessedSourceImage(scene, key);
    const left = Math.min(slice.left, Math.floor(bounds.w / 2) - 1);
    const right = Math.min(slice.right, Math.floor(bounds.w / 2) - 1);
    const top = Math.min(slice.top, Math.floor(bounds.h / 2) - 1);
    const bottom = Math.min(slice.bottom, Math.floor(bounds.h / 2) - 1);
    const minW = left + right + 1;
    const minH = top + bottom + 1;
    const outW = Math.max(w, minW);
    const outH = Math.max(h, minH);

    const centerSW = Math.max(1, bounds.w - left - right);
    const centerSH = Math.max(1, bounds.h - top - bottom);
    const centerDW = Math.max(1, outW - left - right);
    const centerDH = Math.max(1, outH - top - bottom);

    return addCanvasTexture(scene, textureKey, outW, outH, (ctx) => {
        // Corners
        ctx.drawImage(src, bounds.x, bounds.y, left, top, 0, 0, left, top);
        ctx.drawImage(src, bounds.x + bounds.w - right, bounds.y, right, top, outW - right, 0, right, top);
        ctx.drawImage(src, bounds.x, bounds.y + bounds.h - bottom, left, bottom, 0, outH - bottom, left, bottom);
        ctx.drawImage(src, bounds.x + bounds.w - right, bounds.y + bounds.h - bottom, right, bottom, outW - right, outH - bottom, right, bottom);

        // Edges
        ctx.drawImage(src, bounds.x + left, bounds.y, centerSW, top, left, 0, centerDW, top);
        ctx.drawImage(src, bounds.x + left, bounds.y + bounds.h - bottom, centerSW, bottom, left, outH - bottom, centerDW, bottom);
        ctx.drawImage(src, bounds.x, bounds.y + top, left, centerSH, 0, top, left, centerDH);
        ctx.drawImage(src, bounds.x + bounds.w - right, bounds.y + top, right, centerSH, outW - right, top, right, centerDH);

        // Center
        ctx.drawImage(src, bounds.x + left, bounds.y + top, centerSW, centerSH, left, top, centerDW, centerDH);
    });
}

export function addCroppedImage(scene, key, x, y, w, h, depth = 0, alpha = 1) {
    const fallbackKey = !scene.textures.exists(key) ? proceduralTextureForMissingKey(scene, key, w, h) : null;
    const textureKey = fallbackKey || getSizedTextureKey(scene, key, w, h);
    const img = scene.add.image(x, y, textureKey).setDepth(depth).setAlpha(alpha);
    img.setDisplaySize(w, h);
    return img;
}

export function addTrimmedImage(scene, key, x, y, maxW, maxH, depth = 0, alpha = 1) {
    const textureKey = getCroppedTextureKey(scene, key);
    const src = scene.textures.get(textureKey).getSourceImage();
    const scale = Math.min(maxW / src.width, maxH / src.height);
    const img = scene.add.image(x, y, textureKey).setDepth(depth).setAlpha(alpha);
    img.setDisplaySize(Math.max(1, src.width * scale), Math.max(1, src.height * scale));
    return img;
}

export function addPanel(scene, x, y, w, h, depth = 0, alpha = 0.95) {
    return scene.add.image(x, y, proceduralTextureKey(scene, 'panel', w, h, 'normal'))
        .setDepth(depth)
        .setAlpha(alpha)
        .setDisplaySize(w, h);
}

export function addSectionPanel(scene, x, y, w, h, depth = 0, alpha = 0.96) {
    return scene.add.image(x, y, proceduralTextureKey(scene, 'section', w, h, 'normal'))
        .setDepth(depth)
        .setAlpha(alpha)
        .setDisplaySize(w, h);
}

export function addPlainSectionPanel(scene, x, y, w, h, depth = 0, alpha = 0.96) {
    return scene.add.image(x, y, proceduralTextureKey(scene, 'section_plain', w, h, 'normal'))
        .setDepth(depth)
        .setAlpha(alpha)
        .setDisplaySize(w, h);
}

export function addRowPanel(scene, x, y, w, h, depth = 0, alpha = 0.92) {
    return scene.add.image(x, y, proceduralTextureKey(scene, h < 120 ? 'row' : 'section', w, h, 'normal'))
        .setDepth(depth)
        .setAlpha(alpha)
        .setDisplaySize(w, h);
}

export function addMenuBackdrop(scene, options = {}) {
    const width = options.width || scene.scale.width;
    const height = options.height || scene.scale.height;
    const centerX = options.x || width / 2;
    const centerY = options.y || height / 2;
    const requestedImageKey = options.imageKey || null;
    const imageKey = requestedImageKey && scene.textures.exists(requestedImageKey)
        ? requestedImageKey
        : (scene.textures.exists('ui_menu_bg')
            ? 'ui_menu_bg'
            : (scene.textures.exists('title_screen') ? 'title_screen' : null));

    if (imageKey) {
        scene.add.image(centerX, centerY, imageKey)
            .setDisplaySize(width, height)
            .setDepth(options.depth ?? -10)
            .setAlpha(options.imageAlpha ?? 1);
    } else {
        scene.add.rectangle(centerX, centerY, width, height, 0x06080d, 1)
            .setDepth(options.depth ?? -10);
    }

    return scene.add.rectangle(
        centerX,
        centerY,
        width,
        height,
        options.overlayColor ?? 0x000000,
        options.overlayAlpha ?? 0.5
    ).setDepth(options.overlayDepth ?? ((options.depth ?? -10) + 1));
}

export function addTitleStamp(scene, key, x, y, maxW, maxH, depth = 0, alpha = 1, fallbackText = '', fallbackStyle = null) {
    if (scene.textures.exists(key)) {
        return addTrimmedImage(scene, key, x, y, maxW, maxH, depth, alpha);
    }

    if (!fallbackText) return null;
    return addUiText(scene, x, y, fallbackText, 'title', {
        style: fallbackStyle || {},
        origin: 0.5,
        depth,
        maxWidth: maxW,
        minFontSize: 16,
    });
}

export function setButtonTextureForState(scene, btn, w, h, state) {
    if (btn?._setProcState) {
        btn._setProcState(state);
        return;
    }
    const key = state === 'hover' ? 'ui_button_hover' : 'ui_button_normal';
    if (scene.textures.exists(key)) {
        btn.setTexture(getSizedTextureKey(scene, key, w, h));
    }
}

export function addButton(scene, x, y, w, h, text, callback, options = {}) {
    const depth = options.depth || 0;
    const fontSize = options.fontSize || (w < 90 ? '10px' : (text.length > 14 ? '11px' : '13px'));
    const normalKey = proceduralTextureKey(scene, 'button', w, h, 'normal');
    const hoverKey = proceduralTextureKey(scene, 'button', w, h, 'hover');
    const normal = scene.add.image(x, y, normalKey).setDepth(depth);
    normal.setInteractive({ useHandCursor: true });
    normal._setProcState = (state) => {
        normal.setTexture(state === 'hover' ? hoverKey : normalKey);
    };

    const label = addUiText(scene, x, y, text, w < 100 ? 'buttonSmall' : 'button', {
        style: {
            fontSize,
            color: options.textColor || '#ffffff',
            strokeThickness: options.strokeThickness || 3,
        },
        origin: 0.5,
        depth: depth + 1,
        maxWidth: w - 18,
        minFontSize: 8,
    });

    normal.on('pointerover', () => {
        setButtonTextureForState(scene, normal, w, h, 'hover');
        label.setScale(1.04);
    });
    normal.on('pointerout', () => {
        setButtonTextureForState(scene, normal, w, h, 'normal');
        label.setScale(1);
    });
    let activePointerId = null;
    const fire = (pointer) => {
        if (activePointerId !== null && pointer?.id === activePointerId) return;
        activePointerId = pointer?.id ?? -1;
        const audio = scene.registry.get('audio');
        if (audio) {
            audio.init();
            audio.resume();
            audio.playMenuSelect();
        }
        scene.time.delayedCall(1, () => {
            callback();
            activePointerId = null;
        });
    };
    normal.on('pointerdown', fire);
    normal.on('pointerup', (pointer) => {
        if (activePointerId !== null) return;
        fire(pointer);
    });

    normal._ownedParts = [normal, label];
    return normal;
}

export function addBackButton(scene, callback, options = {}) {
    return addButton(
        scene,
        options.x ?? 72,
        options.y ?? 38,
        options.width ?? 118,
        options.height ?? 34,
        'BACK',
        callback,
        {
            textColor: options.textColor || '#ff6633',
            fontSize: options.fontSize || '10px',
            depth: options.depth ?? 4,
        }
    );
}

export function addHpBar(scene, x, y, w, h, depth = 0, fillColor = 0x33ff55) {
    const innerW = Math.max(8, w - 18);
    const innerH = Math.max(4, Math.floor(h * 0.44));
    const bg = scene.add.rectangle(x, y, innerW, innerH, 0x180607, 0.96)
        .setDepth(depth).setOrigin(0.5);
    const fill = scene.add.rectangle(x - innerW / 2, y, innerW, innerH, fillColor, 1)
        .setDepth(depth + 1).setOrigin(0, 0.5);
    const frame = scene.add.graphics().setDepth(depth + 2);
    frame.lineStyle(2, 0x536273, 0.9);
    frame.strokeRect(x - w / 2, y - h / 2, w, h);
    frame.lineStyle(1, 0x05080d, 1);
    frame.strokeRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4);
    frame.lineStyle(1, 0xffa34c, 0.45);
    frame.lineBetween(x - w / 2 + 8, y + h / 2 - 5, x + w / 2 - 8, y + h / 2 - 5);
    return { bg, fill, frame, width: innerW };
}

export function addIcon(scene, key, x, y, size, depth = 0) {
    return addCroppedImage(scene, key, x, y, size, size, depth, 1);
}

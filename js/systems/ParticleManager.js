import { COLORS } from '../constants.js';

export default class ParticleManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
    }

    // ── Core particle spawner ──
    spawn(config) {
        const {
            x, y, count = 10, speed = 200, speedVariance = 0.5,
            angle = 0, spread = Math.PI * 2, life = 500, lifeVariance = 0.3,
            size = 4, sizeVariance = 0.5, sizeEnd = 0,
            colors = [0xffffff], gravity = 0, fadeOut = true,
            shape = 'circle', friction = 0.98,
        } = config;

        for (let i = 0; i < count; i++) {
            const a = angle + (Math.random() - 0.5) * spread;
            const s = speed * (1 + (Math.random() - 0.5) * speedVariance);
            const l = life * (1 + (Math.random() - 0.5) * lifeVariance);
            const sz = Math.max(1, size * (1 + (Math.random() - 0.5) * sizeVariance));
            const color = colors[Math.floor(Math.random() * colors.length)];

            const gfx = this.scene.add.graphics();
            gfx.setDepth(100);

            const p = {
                gfx, x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: l, maxLife: l,
                size: sz, startSize: sz, endSize: sizeEnd,
                color, gravity, fadeOut, shape, friction,
            };
            this._drawParticle(p);
            this.particles.push(p);
        }
    }

    _drawParticle(p) {
        p.gfx.clear();
        p.gfx.fillStyle(p.color, p.fadeOut ? (p.life / p.maxLife) : 1);
        if (p.shape === 'circle') {
            p.gfx.fillCircle(0, 0, p.size);
        } else {
            p.gfx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        p.gfx.setPosition(p.x, p.y);
    }

    update(delta) {
        const dt = delta / 1000;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if (p.life <= 0) {
                p.gfx.destroy();
                this.particles.splice(i, 1);
                continue;
            }

            p.vx *= p.friction;
            p.vy *= p.friction;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            const progress = 1 - p.life / p.maxLife;
            p.size = p.startSize + (p.endSize - p.startSize) * progress;

            this._drawParticle(p);
        }
    }

    // ── Preset Effects ──

    sparks(x, y, color = COLORS.YELLOW, count = 12) {
        this.spawn({
            x, y, count, speed: 250, colors: [color, COLORS.WHITE, COLORS.ORANGE],
            life: 300, size: 3, spread: Math.PI * 2, gravity: 300, shape: 'square',
        });
    }

    explosion(x, y, radius = 60, color = COLORS.ORANGE) {
        // Fire core
        this.spawn({
            x, y, count: 20, speed: radius * 3, colors: [COLORS.YELLOW, COLORS.WHITE],
            life: 200, size: 6, sizeEnd: 0, spread: Math.PI * 2,
        });
        // Outer fire
        this.spawn({
            x, y, count: 30, speed: radius * 2, colors: [color, COLORS.RED, COLORS.YELLOW],
            life: 400, size: 8, sizeEnd: 1, spread: Math.PI * 2, gravity: 100,
        });
        // Smoke
        this.spawn({
            x, y, count: 15, speed: radius, colors: [0x444444, 0x666666, 0x888888],
            life: 800, size: 12, sizeEnd: 20, spread: Math.PI * 2, gravity: -50,
            friction: 0.95,
        });
        // Debris
        this.spawn({
            x, y, count: 8, speed: radius * 4, colors: [0x333333, 0x555555],
            life: 600, size: 3, spread: Math.PI * 2, gravity: 400, shape: 'square',
        });
    }

    bigExplosion(x, y) {
        this.explosion(x, y, 120, COLORS.RED);
        // Screen flash
        const flash = this.scene.add.rectangle(500, 350, 1000, 700, 0xffffff, 0.6).setDepth(200);
        this.scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    }

    fire(x, y, angle, length = 80) {
        this.spawn({
            x, y, count: 3, speed: 200 + Math.random() * 100,
            angle, spread: 0.5,
            colors: [COLORS.ORANGE, COLORS.YELLOW, COLORS.RED, 0xff6600],
            life: 250, size: 5, sizeEnd: 1, gravity: -80,
        });
    }

    electric(x, y, count = 8) {
        this.spawn({
            x, y, count, speed: 350, colors: [COLORS.CYAN, COLORS.WHITE, COLORS.BLUE],
            life: 150, size: 2, sizeEnd: 0, spread: Math.PI * 2, shape: 'square',
        });
    }

    plasma(x, y, angle) {
        this.spawn({
            x, y, count: 5, speed: 100, angle: angle + Math.PI, spread: 0.8,
            colors: [COLORS.PURPLE, 0xdd66ff, 0xff88ff],
            life: 300, size: 4, sizeEnd: 0,
        });
    }

    acid(x, y) {
        this.spawn({
            x, y, count: 6, speed: 80, colors: [COLORS.TOXIC, 0x88ff33, COLORS.GREEN],
            life: 600, size: 4, sizeEnd: 6, gravity: 50, friction: 0.96,
        });
    }

    smoke(x, y, color = 0x555555) {
        this.spawn({
            x, y, count: 4, speed: 30, colors: [color, 0x444444, 0x666666],
            life: 800, size: 8, sizeEnd: 15, gravity: -40, friction: 0.97,
        });
    }

    heal(x, y) {
        this.spawn({
            x, y, count: 8, speed: 60, colors: [COLORS.GREEN, COLORS.NEON_GREEN, 0x88ff88],
            life: 600, size: 3, sizeEnd: 0, gravity: -100, spread: Math.PI * 2,
        });
    }

    shieldEffect(x, y) {
        this.spawn({
            x, y, count: 12, speed: 100, colors: [COLORS.BLUE, COLORS.CYAN, 0x88bbff],
            life: 400, size: 3, sizeEnd: 0, spread: Math.PI * 2,
        });
    }

    shieldBreak(x, y) {
        this.spawn({
            x, y, count: 25, speed: 300, colors: [COLORS.BLUE, COLORS.CYAN, 0x88bbff],
            life: 500, size: 4, sizeEnd: 0, spread: Math.PI * 2, gravity: 200,
            shape: 'square',
        });
    }

    minePlace(x, y) {
        this.spawn({
            x, y, count: 6, speed: 50, colors: [COLORS.DARK_GRAY, COLORS.MID_GRAY],
            life: 300, size: 2, spread: Math.PI * 2,
        });
    }

    trail(x, y, color, angle) {
        this.spawn({
            x, y, count: 1, speed: 20, angle: angle + Math.PI, spread: 0.3,
            colors: [color], life: 200, size: 3, sizeEnd: 0, friction: 0.9,
        });
    }

    deathExplosion(x, y, botColor) {
        // Use a tighter death burst without the lingering circular smoke layer.
        if (this.scene._spawnExplosionSprite) {
            this.scene._spawnExplosionSprite(x, y, 104);
        }
        this.spawn({
            x, y, count: 18, speed: 240, colors: [botColor, COLORS.ORANGE, COLORS.YELLOW, COLORS.WHITE],
            life: 260, size: 5, sizeEnd: 0, spread: Math.PI * 2, shape: 'square',
        });
        this.spawn({
            x, y, count: 12, speed: 400, colors: [botColor, COLORS.MID_GRAY, COLORS.DARK_GRAY],
            life: 1000, size: 5, sizeEnd: 2, spread: Math.PI * 2, gravity: 500,
            shape: 'square', friction: 0.99,
        });
    }

    bossPhaseTransition(x, y, color) {
        // Shockwave ring (simulated with expanding particles)
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
            this.spawn({
                x, y, count: 2, speed: 400, angle: a, spread: 0.1,
                colors: [color, COLORS.WHITE],
                life: 500, size: 5, sizeEnd: 1,
            });
        }
        this.spawn({
            x, y, count: 30, speed: 150, colors: [color, COLORS.WHITE, COLORS.YELLOW],
            life: 600, size: 6, sizeEnd: 0, spread: Math.PI * 2,
        });
    }

    lavaEruption(x, y) {
        this.spawn({
            x, y, count: 20, speed: 400, angle: -Math.PI / 2, spread: 0.8,
            colors: [COLORS.LAVA, COLORS.ORANGE, COLORS.YELLOW, COLORS.RED],
            life: 800, size: 6, sizeEnd: 3, gravity: 500,
        });
    }

    destroyAll() {
        for (const p of this.particles) {
            p.gfx.destroy();
        }
        this.particles = [];
    }
}

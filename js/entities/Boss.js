import { COLORS, BOSSES, WEAPONS } from '../constants.js';
import Bot from './Bot.js';
import { BossSpriteRenderer } from './BossSpriteRenderer.js';

export default class Boss extends Bot {
    constructor(scene, x, y, bossKey) {
        const bossData = BOSSES[bossKey];
        const diff = scene.diffSettings || { hpMult: 0.6, damageMult: 0.3, speedMult: 0.5, aiAccuracy: 0.3 };
        const hpScale = 1.5 + diff.hpMult * 0.78 + ((scene.worldId || 1) - 1) * 0.04;
        const speedScale = 0.98 + diff.speedMult * 0.16;

        super(scene, x, y, {
            name: bossData.name,
            hp: Math.round(bossData.hp * hpScale),
            speed: Math.round(bossData.phases[0].speed * 60 * speedScale),
            size: bossData.size,
            skinColor: bossData.color,
            weapon: 'hammer',
            chassis: 'heavy',
            armor: 0.24 + diff.damageMult * 0.12,
        });

        this.bossKey = bossKey;
        this.bossData = bossData;
        this.maxHp = this.hp;
        this.currentPhase = 0;
        this.phaseTransitioning = false;
        this.damageScale = 1.35 + diff.damageMult * 1.45;
        this.speedScale = speedScale;
        this.cooldownScale = Math.max(0.62, 0.94 - diff.aiAccuracy * 0.18);
        this.telegraphScale = Math.max(0.72, 1.02 - diff.aiAccuracy * 0.25);

        // Boss-specific state
        this.attackTimer = 0;
        this.specialTimer = 0;
        this.chargeTarget = null;
        this.charging = false;
        this.chargeSpeed = 0;
        this.minions = [];
        this.enraged = false;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.postAttackTimer = 0;
        this.actionCycles = Object.create(null);

        // Override name text size
        this.nameText.setFontSize(14);
        this.nameText.setColor('#ff4444');
        this.nameText.setText(bossData.name);

        // Sprite-based rendering (falls back to programmatic if assets missing)
        if (this.spriteRenderer) this.spriteRenderer.destroy();
        this.spriteRenderer = new BossSpriteRenderer(this);
        this.target = null;
    }

    get phase() {
        return this.bossData.phases[this.currentPhase];
    }

    update(delta, target, arenaRect) {
        if (this.hp <= 0) {
            if (this.spriteRenderer) this.spriteRenderer.update(delta);
            return;
        }
        this.target = target;

        const dt = delta / 1000;
        const now = Date.now();

        // Check phase transitions
        const hpRatio = this.hp / this.maxHp;
        for (let i = this.bossData.phases.length - 1; i > this.currentPhase; i--) {
            if (hpRatio <= this.bossData.phases[i].threshold) {
                this._transitionToPhase(i);
            }
        }

        // Update speed from current phase
        this.speed = this.phase.speed * 60 * this.speedScale;
        if (this.enraged) this.speed *= 1.22;
        this.postAttackTimer = Math.max(0, this.postAttackTimer - delta);

        // AI behavior based on phase attack pattern
        if (target && !this.phaseTransitioning) {
            this._executeBehavior(delta, target, arenaRect);
        }

        // Call parent update (movement, effects, drawing)
        super.update(delta);

        if (arenaRect) this.constrainToArena(arenaRect);

        // Draw boss-specific visuals
        this._drawBossExtras();
    }

    _transitionToPhase(phaseIdx) {
        if (this.phaseTransitioning) return;
        this.phaseTransitioning = true;
        this.currentPhase = phaseIdx;
        const phase = this.phase;

        this.scene.particles.bossPhaseTransition(this.x, this.y, this.bossData.color);
        this.scene.audio.playPhaseTransition();
        this.attackTimer = 0;
        this.specialTimer = 450;
        this.strafeDir *= -1;

        if (phase.enraged) {
            this.enraged = true;
        }

        // Flash
        const flash = this.scene.add.rectangle(500, 350, 1000, 700, this.bossData.color, 0.3).setDepth(200);
        this.scene.tweens.add({
            targets: flash, alpha: 0, duration: 500,
            onComplete: () => {
                flash.destroy();
                this.phaseTransitioning = false;
            },
        });

        // Phase text announcement
        const phaseText = this.scene.add.text(500, 250, `PHASE ${this.currentPhase + 1}`, {
            fontSize: '36px', fontFamily: 'monospace', color: '#ff4444',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(200);

        const descText = this.scene.add.text(500, 290, phase.description, {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffaa44',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(200);

        this.scene.tweens.add({
            targets: [phaseText, descText], alpha: 0, y: '-=30',
            duration: 2000, delay: 1000, ease: 'Power2',
            onComplete: () => { phaseText.destroy(); descText.destroy(); },
        });

        // Spawn minions if needed
        if (phase.spawnMinions && this.scene.spawnMinion) {
            for (let i = 0; i < (phase.minionCount || 2) + (this.enraged ? 1 : 0); i++) {
                this.scene.spawnMinion(this.x, this.y);
            }
        }
    }

    _predictTarget(target, seconds = 0.2) {
        const lead = Math.max(0.14, seconds);
        const moveX = target.moveDir?.x || 0;
        const moveY = target.moveDir?.y || 0;
        return {
            x: target.x + moveX * target.speed * lead,
            y: target.y + moveY * target.speed * lead,
        };
    }

    _cooldown(ms, scale = 1) {
        return ms * this.cooldownScale * scale;
    }

    _scaledDamage(base) {
        return Math.round(base * this.damageScale);
    }

    _nextActionVariant(key, count) {
        return Math.floor(Math.random() * count);
    }

    _randomAttackType() {
        return Math.random() < 0.5 ? 1 : 2;
    }

    _snapArenaPoint(x, y, radius = this.size * 0.65) {
        if (!this.scene._snapToWalkablePoint) return { x, y };
        return this.scene._snapToWalkablePoint(x, y, radius, radius);
    }

    _bodyHitRadius(scale = 0.9) {
        return Math.max(20, this.size * scale);
    }

    _targetGrazeRadius(target) {
        return Math.min(10, Math.max(4, (target?.size || 32) * 0.22));
    }

    _impactRadius(requested, attackType = 1) {
        const cap = this._bodyHitRadius(attackType === 2 ? 0.62 : 0.72);
        return Math.min(requested, cap);
    }

    _executeBehavior(delta, target, arenaRect) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToTarget = Math.atan2(dy, dx);
        this.angle = angleToTarget;

        this.attackTimer -= delta;
        this.specialTimer -= delta;

        if (this.postAttackTimer > 0) {
            this._runRecoveryPattern(angleToTarget, dist);
            return;
        }

        const phase = this.phase;

        switch (phase.attackPattern) {
            case 'slam':
                this._behaviorSlam(dist, angleToTarget, target, delta);
                break;
            case 'charge':
                this._behaviorCharge(dist, angleToTarget, target, delta);
                break;
            case 'frenzy':
                this._behaviorFrenzy(dist, angleToTarget, target, delta);
                break;
            case 'dualStrike':
                this._behaviorDualStrike(dist, angleToTarget, target, delta);
                break;
            case 'factoryHazard':
            case 'overdrive':
                this._behaviorAggressive(dist, angleToTarget, target, delta);
                break;
            case 'lavaShot':
                this._behaviorRanged(dist, angleToTarget, target, delta);
                break;
            case 'eruption':
            case 'meltdown':
                this._behaviorEruption(dist, angleToTarget, target, delta);
                break;
            case 'glitch':
                this._behaviorGlitch(dist, angleToTarget, target, delta);
                break;
            case 'clone':
            case 'hack':
                this._behaviorGlitch(dist, angleToTarget, target, delta);
                break;
            case 'asteroidThrow':
            case 'gravityWell':
            case 'split':
                this._behaviorRanged(dist, angleToTarget, target, delta);
                break;
            default:
                this._behaviorAggressive(dist, angleToTarget, target, delta);
        }
    }

    _behaviorSlam(dist, angle, target, delta) {
        const predicted = this._predictTarget(target, 0.18);
        const intercept = Math.atan2(predicted.y - this.y, predicted.x - this.x);
        const attackMin = Math.max(42, this.size * 0.58);
        const attackMax = Math.max(64, this.size * 1.34);

        if (dist > attackMax + 58) {
            this.moveDir.x = Math.cos(intercept) * 0.76;
            this.moveDir.y = Math.sin(intercept) * 0.76;
        } else if (dist > attackMax) {
            this.moveDir.x = Math.cos(intercept + this.strafeDir * 0.52) * 0.46;
            this.moveDir.y = Math.sin(intercept + this.strafeDir * 0.52) * 0.46;
        } else if (dist < attackMin) {
            this.moveDir.x = -Math.cos(angle - this.strafeDir * 0.3) * 0.54;
            this.moveDir.y = -Math.sin(angle - this.strafeDir * 0.3) * 0.54;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.82) * 0.42;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.82) * 0.42;
        }

        if (dist >= attackMin && dist <= attackMax && this.attackTimer <= 0) {
            this._slamAttack(target);
            this.attackTimer = this._cooldown(this.phase.attackCooldown);
            this._setPostAttackRecovery(this.enraged ? 320 : 460);
        }
    }

    _behaviorCharge(dist, angle, target, delta) {
        if (this.charging) {
            this.moveDir.x = Math.cos(this.chargeAngle) * 3.6;
            this.moveDir.y = Math.sin(this.chargeAngle) * 3.6;
            this.chargeTimer -= delta;
            if (this.chargeTimer <= 0) {
                this.charging = false;
                if (dist <= this._bodyHitRadius(1.05) + this._targetGrazeRadius(target)) {
                    target.takeDamage(this._scaledDamage(this.phase.damage), this);
                    target.applyKnockback(angle, 300);
                }
                this._setPostAttackRecovery(520);
            }
            return;
        }

        if (dist > 96 && dist < 165 && this.attackTimer <= 0) {
            const predicted = this._predictTarget(target, 0.28);
            this.charging = true;
            this.chargeAngle = Math.atan2(predicted.y - this.y, predicted.x - this.x);
            this.chargeTimer = 820 * this.telegraphScale;
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 1.1);
            this.scene.particles.sparks(this.x, this.y, COLORS.RED, 20);
        } else if (dist > 74) {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.28) * 0.62;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.28) * 0.62;
        } else if (dist < 42) {
            this.moveDir.x = -Math.cos(angle) * 0.9;
            this.moveDir.y = -Math.sin(angle) * 0.9;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.9) * 0.36;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.9) * 0.36;
        }

        if (dist >= 46 && dist <= 68 && this.attackTimer <= 0) {
            this._slamAttack(target);
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.82);
            this._setPostAttackRecovery(520);
        }
    }

    _behaviorFrenzy(dist, angle, target, delta) {
        const predicted = this._predictTarget(target, 0.14);
        const intercept = Math.atan2(predicted.y - this.y, predicted.x - this.x);

        if (dist > 76) {
            this.moveDir.x = Math.cos(intercept + this.strafeDir * 0.18) * 0.9;
            this.moveDir.y = Math.sin(intercept + this.strafeDir * 0.18) * 0.9;
        } else if (dist < 40) {
            this.moveDir.x = -Math.cos(angle - this.strafeDir * 0.38) * 0.82;
            this.moveDir.y = -Math.sin(angle - this.strafeDir * 0.38) * 0.82;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.92) * 0.62;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.92) * 0.62;
        }

        if (dist >= 42 && dist <= 62 && this.attackTimer <= 0) {
            this._slamAttack(target);
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.72);
            if (Math.random() < 0.4) {
                this.attackTimer *= 0.3;
            }
            this._setPostAttackRecovery(this.enraged ? 260 : 360);
        }
    }

    _behaviorDualStrike(dist, angle, target, delta) {
        if (dist > 78) {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.28) * 0.7;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.28) * 0.7;
        } else if (dist < 48) {
            this.moveDir.x = -Math.cos(angle) * 0.68;
            this.moveDir.y = -Math.sin(angle) * 0.68;
        } else if (this.attackTimer <= 0) {
            this._meleeAttack(target, this.phase.damage * 0.65);
            setTimeout(() => {
                if (this.alive && target.alive) {
                    this._meleeAttack(target, this.phase.damage * 0.65);
                }
            }, 200);
            if (this.enraged) {
                setTimeout(() => {
                    if (this.alive && target.alive) this._meleeAttack(target, this.phase.damage * 0.45);
                }, 360);
            }
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.78);
            this._setPostAttackRecovery(620);
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.8) * 0.4;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.8) * 0.4;
        }
    }

    _behaviorAggressive(dist, angle, target, delta) {
        if (dist > 80) {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.24) * 0.76;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.24) * 0.76;
        } else if (dist < 50) {
            this.moveDir.x = -Math.cos(angle - this.strafeDir * 0.26) * 0.76;
            this.moveDir.y = -Math.sin(angle - this.strafeDir * 0.26) * 0.76;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.82) * 0.42;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.82) * 0.42;
        }

        if (dist >= 50 && dist <= 74 && this.attackTimer <= 0) {
            this._meleeAttack(target, this.phase.damage);
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.84);
            this._setPostAttackRecovery(520);
        }
    }

    _behaviorRanged(dist, angle, target, delta) {
        const predicted = this._predictTarget(target, 0.14);
        const leadAngle = Math.atan2(predicted.y - this.y, predicted.x - this.x);

        if (dist < 70) {
            this.moveDir.x = -Math.cos(leadAngle) * 0.82;
            this.moveDir.y = -Math.sin(leadAngle) * 0.82;
        } else if (dist > 108) {
            this.moveDir.x = Math.cos(leadAngle) * 0.5;
            this.moveDir.y = Math.sin(leadAngle) * 0.5;
        } else {
            const perpAngle = leadAngle + this.strafeDir * Math.PI / 2;
            this.moveDir.x = Math.cos(perpAngle) * 0.66;
            this.moveDir.y = Math.sin(perpAngle) * 0.66;
        }

        if (dist >= 46 && dist <= 108 && this.attackTimer <= 0) {
            if (this.phase.attackPattern === 'gravityWell') {
                this._performAttack2(target, {
                    radius: 46,
                    windup: 360,
                    damageScale: 0.9,
                    knockback: 110,
                });
            } else if (this.phase.attackPattern === 'split') {
                const variant = this._nextActionVariant('split', 3);
                if (variant === 0 && this._spawnEnemyAction(this.phase.splitCount || 2, 120)) {
                    this._setPostAttackRecovery(380);
                } else if (variant === 1) {
                    this._performAttack2(target, {
                        radius: 44,
                        windup: 300,
                        damageScale: 0.88,
                        spacing: 46,
                        knockback: 170,
                    });
                } else {
                    this._performAttack1(target, {
                        radius: 48,
                        windup: 340,
                        damageScale: 1.08,
                        knockback: 220,
                    });
                }
            } else {
                const variant = this._nextActionVariant(this.phase.attackPattern, 2);
                if (variant === 0) {
                    this._performAttack1(target, {
                        radius: this.phase.attackPattern === 'asteroidThrow' ? 50 : 42,
                        windup: this.phase.attackPattern === 'asteroidThrow' ? 340 : 260,
                        damageScale: this.phase.attackPattern === 'asteroidThrow' ? 1.08 : 1,
                        knockback: this.phase.attackPattern === 'asteroidThrow' ? 220 : 160,
                    });
                } else {
                    this._performAttack2(target, {
                        radius: this.phase.attackPattern === 'asteroidThrow' ? 44 : 40,
                        windup: this.phase.attackPattern === 'asteroidThrow' ? 300 : 230,
                        damageScale: this.phase.attackPattern === 'asteroidThrow' ? 0.92 : 0.82,
                        spacing: 46,
                        knockback: this.phase.attackPattern === 'asteroidThrow' ? 170 : 140,
                    });
                }
                if (this.enraged) {
                    this.scene.time.delayedCall(180, () => {
                        if (this.alive && target.alive) {
                            this._performAttack2(target, {
                                radius: 38,
                                windup: 220,
                                damageScale: 0.72,
                                knockback: 140,
                            });
                        }
                    });
                }
            }
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.88);
            this._setPostAttackRecovery(320);
        }
    }

    _behaviorEruption(dist, angle, target, delta) {
        if (dist < 66) {
            this.moveDir.x = -Math.cos(angle) * 0.86;
            this.moveDir.y = -Math.sin(angle) * 0.86;
        } else if (dist > 104) {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.22) * 0.42;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.22) * 0.42;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.94) * 0.54;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.94) * 0.54;
        }

        if (dist >= 44 && dist <= 104 && this.attackTimer <= 0) {
            this._performAttack2(target, {
                lead: 0.16,
                radius: 42,
                windup: 500,
                damageScale: 0.55,
                spacing: 46,
                pattern: 'ring',
                knockback: 90,
            });
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.92);
            this._setPostAttackRecovery(760);
        }

        if (dist < 62 && this.attackTimer > 250) {
            this._meleeAttack(target, this.phase.damage * 0.7);
            this._setPostAttackRecovery(260);
        }
    }

    _behaviorGlitch(dist, angle, target, delta) {
        if (this.specialTimer <= 0) {
            this.specialTimer = this.enraged ? 900 : 1250;
            this.strafeDir *= -1;
        }

        if (dist > 86) {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 0.42) * 0.48;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 0.42) * 0.48;
        } else {
            this.moveDir.x = Math.cos(angle + this.strafeDir * 1.04) * 0.56;
            this.moveDir.y = Math.sin(angle + this.strafeDir * 1.04) * 0.56;
        }

        if (dist >= 44 && dist <= 64 && this.attackTimer <= 0) {
            this._meleeAttack(target, this.phase.damage);
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.76);
            this._setPostAttackRecovery(320);

        } else if (this.attackTimer <= 0 && dist >= 42 && dist <= 92) {
            if (this.phase.attackPattern === 'clone') {
                const variant = this._nextActionVariant('clone', 3);
                if (variant === 0 && this._spawnEnemyAction(this.phase.cloneCount || 2, 110)) {
                    this._setPostAttackRecovery(260);
                } else if (variant === 1) {
                    this._performAttack2(target, {
                        radius: 44,
                        windup: 280,
                        damageScale: 0.8,
                        knockback: 110,
                    });
                } else {
                    this._performAttack1(target, {
                        radius: 38,
                        windup: 230,
                        damageScale: 0.82,
                        knockback: 120,
                    });
                }
            } else if (this.phase.attackPattern === 'hack') {
                const variant = this._nextActionVariant('hack', 2);
                if (variant === 0) {
                    this._performAttack2(target, {
                        radius: 46,
                        windup: 300,
                        damageScale: 0.85,
                        knockback: 110,
                    });
                } else {
                    this._performAttack1(target, {
                        radius: 40,
                        windup: 220,
                        damageScale: 0.76,
                        knockback: 95,
                    });
                }
            } else if (this.phase.attackPattern === 'glitch') {
                const variant = this._nextActionVariant('glitch', 2);
                if (variant === 0) {
                    this._performAttack1(target, {
                        radius: 38,
                        windup: 230,
                        damageScale: 0.82,
                        knockback: 120,
                    });
                } else {
                    this._performAttack2(target, {
                        radius: 42,
                        windup: 260,
                        damageScale: 0.78,
                        knockback: 105,
                    });
                }
            } else {
                this._performAttack2(target, {
                    radius: 42,
                    windup: 260,
                    damageScale: 0.78,
                    knockback: 105,
                });
            }
            this.attackTimer = this._cooldown(this.phase.attackCooldown, 0.9);
            this._setPostAttackRecovery(220);
        }
    }

    _spawnEnemyAction(count = 1, spread = 120) {
        if (!this.scene.spawnMinion) return false;
        const aliveAdds = this.scene.enemies.filter((enemy) => enemy !== this && enemy.alive).length;
        const maxAdds = this.enraged ? 6 : 4;
        const spawnTotal = Math.max(0, Math.min(count, maxAdds - aliveAdds));
        if (spawnTotal <= 0) return false;

        if (this.spriteRenderer) this.spriteRenderer.triggerAttack(this._randomAttackType());
        for (let i = 0; i < spawnTotal; i++) {
            const angle = (Math.PI * 2 * i) / spawnTotal + Math.random() * 0.45;
            const point = this._snapArenaPoint(
                this.x + Math.cos(angle) * spread,
                this.y + Math.sin(angle) * spread,
                18
            );
            this.scene.spawnMinion(point.x, point.y);
        }
        this.scene.particles.electric(this.x, this.y, 18);
        this.scene.audio.playPhaseTransition();
        this.attackAnim = 1;
        return true;
    }

    _damageBreakableTiles(x, y, radius) {
        if (!this.scene._breakTileAt) return;
        const sampleCount = Math.max(8, Math.ceil(radius / 10));
        this.scene._breakTileAt(x, y);
        for (let i = 0; i < sampleCount; i++) {
            const angle = (Math.PI * 2 * i) / sampleCount;
            const px = x + Math.cos(angle) * radius * 0.82;
            const py = y + Math.sin(angle) * radius * 0.82;
            this.scene._breakTileAt(px, py);
        }
    }

    _queueBossImpact(target, positions, options = {}) {
        const attackType = options.attackType || 1;
        const visualAttackType = options.visualAttackType || this._randomAttackType();
        const windup = options.windup || 260;
        const radius = this._impactRadius(options.radius || 58, attackType);
        const damage = this._scaledDamage(this.phase.damage * (options.damageScale || 1));
        const telegraphs = [];

        if (this.spriteRenderer) this.spriteRenderer.triggerAttack(visualAttackType);
        for (const pos of positions) {
            const point = this._snapArenaPoint(pos.x, pos.y, radius * 0.68);
            telegraphs.push({ point });
        }

        this.scene.time.delayedCall(windup, () => {
            if (!this.alive) return;
            for (const { point } of telegraphs) {
                this.scene.particles.explosion(point.x, point.y, radius, this.bossData.color);

                this.scene._damageHazardsAt?.(point.x, point.y, radius, this);
                this._damageBreakableTiles(point.x, point.y, radius);

                const dx = target.x - point.x;
                const dy = target.y - point.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const hitRadius = radius + this._targetGrazeRadius(target);
                if (dist <= hitRadius && target.alive) {
                    target.takeDamage(damage, this);
                    if (options.knockback) {
                        target.applyKnockback(Math.atan2(target.y - point.y, target.x - point.x), options.knockback);
                    }
                    if (options.stun) {
                        target.stun(options.stun);
                    }
                }
            }
            this.scene.audio.playExplosion();
        });
        this.attackAnim = 1;
    }

    _performAttack1(target, options = {}) {
        const lead = options.lead ?? 0.18;
        const predicted = this._predictTarget(target, lead);
        this._queueBossImpact(target, [predicted], {
            ...options,
            attackType: 1,
        });
    }

    _performAttack2(target, options = {}) {
        const lead = options.lead ?? 0.16;
        const spacing = options.spacing ?? 48;
        const predicted = this._predictTarget(target, lead);
        const approach = Math.atan2(predicted.y - this.y, predicted.x - this.x);
        const perp = approach + Math.PI / 2;
        const positions = options.pattern === 'ring'
            ? [
                predicted,
                { x: predicted.x + Math.cos(approach) * spacing, y: predicted.y + Math.sin(approach) * spacing },
                { x: predicted.x - Math.cos(approach) * spacing, y: predicted.y - Math.sin(approach) * spacing },
                { x: predicted.x + Math.cos(perp) * spacing, y: predicted.y + Math.sin(perp) * spacing },
                { x: predicted.x - Math.cos(perp) * spacing, y: predicted.y - Math.sin(perp) * spacing },
            ]
            : [
                predicted,
                { x: predicted.x + Math.cos(perp) * spacing, y: predicted.y + Math.sin(perp) * spacing },
                { x: predicted.x - Math.cos(perp) * spacing, y: predicted.y - Math.sin(perp) * spacing },
            ];
        this._queueBossImpact(target, positions, {
            ...options,
            attackType: 2,
        });
    }

    _runRecoveryPattern(angleToTarget, dist) {
        if (dist < 92) {
            this.moveDir.x = -Math.cos(angleToTarget - this.strafeDir * 0.42) * 0.86;
            this.moveDir.y = -Math.sin(angleToTarget - this.strafeDir * 0.42) * 0.86;
        } else {
            this.moveDir.x = Math.cos(angleToTarget + this.strafeDir * 0.9) * 0.52;
            this.moveDir.y = Math.sin(angleToTarget + this.strafeDir * 0.9) * 0.52;
        }
    }

    _setPostAttackRecovery(duration) {
        this.postAttackTimer = Math.max(this.postAttackTimer, duration);
        this.strafeDir *= -1;
    }

    _slamAttack(target) {
        if (this.spriteRenderer) this.spriteRenderer.triggerAttack(this._randomAttackType());
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const impactRadius = this._bodyHitRadius(1.05);

        this.scene._damageHazardsAt?.(this.x, this.y, impactRadius, this);
        this._damageBreakableTiles(this.x, this.y, impactRadius);

        if (dist <= impactRadius + this._targetGrazeRadius(target)) {
            target.takeDamage(this._scaledDamage(this.phase.damage), this);
            target.applyKnockback(Math.atan2(dy, dx), 250);
            target.stun(140);
        }

        // Shockwave particles
        this.scene.particles.explosion(this.x, this.y, impactRadius, this.bossData.color);
        this.scene.audio.playExplosion();
        this.attackAnim = 1;
    }

    _meleeAttack(target, damage) {
        if (this.spriteRenderer) this.spriteRenderer.triggerAttack(this._randomAttackType());
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const reach = this._bodyHitRadius(0.72);
        const hitRadius = this._bodyHitRadius(0.58);
        const hitX = this.x + Math.cos(this.angle) * reach;
        const hitY = this.y + Math.sin(this.angle) * reach;
        const hitDist = Math.hypot(target.x - hitX, target.y - hitY);

        this.scene._damageHazardsAt?.(hitX, hitY, hitRadius, this);
        this._damageBreakableTiles(hitX, hitY, hitRadius);

        if (hitDist <= hitRadius + this._targetGrazeRadius(target)) {
            target.takeDamage(this._scaledDamage(damage), this);
            target.applyKnockback(Math.atan2(dy, dx), 150);
            this.scene.particles.sparks(
                (this.x + target.x) / 2, (this.y + target.y) / 2,
                this.bossData.color
            );
        }
        this.attackAnim = 1;
    }

    _rangedAttack(angle, target) {
        this._performAttack2(target, {
            radius: 40,
            windup: 260,
            damageScale: 1,
            knockback: 150,
            effect: 'explosion',
        });
    }

    _drawBossExtras() {
        if (this.spriteRenderer && this.spriteRenderer.sprite) return;
        // Enrage aura
        if (this.enraged) {
            const t = Date.now() * 0.003;
            const alpha = 0.2 + Math.sin(t) * 0.1;
            this.gfx.lineStyle(3, COLORS.RED, alpha);
            this.gfx.strokeCircle(0, 0, this.size + 15 + Math.sin(t * 2) * 3);
        }

        // Phase indicator dots
        const dotY = this.size + 8;
        for (let i = 0; i < this.bossData.phases.length; i++) {
            const color = i <= this.currentPhase ? COLORS.RED : COLORS.DARK_GRAY;
            this.gfx.fillStyle(color, 0.8);
            const dotX = (i - (this.bossData.phases.length - 1) / 2) * 10;
            this.gfx.fillCircle(dotX, dotY, 3);
        }
    }

    destroy() {
        for (const minion of this.minions) {
            if (minion.container) minion.destroy();
        }
        super.destroy();
    }
}

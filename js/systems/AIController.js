import { WEAPONS } from '../constants.js';

const AI_MELEE_PROFILES = {
    spinner: { reachScale: 0.44, attackPad: 18, idealMinScale: 0.58, idealMaxScale: 0.9 },
    hammer: { reachScale: 0.46, attackPad: 20, idealMinScale: 0.62, idealMaxScale: 0.92 },
    flipper: { reachScale: 0.42, attackPad: 18, idealMinScale: 0.6, idealMaxScale: 0.9 },
    saw: { reachScale: 0.42, attackPad: 18, idealMinScale: 0.58, idealMaxScale: 0.9 },
    drill: { reachScale: 0.46, attackPad: 18, idealMinScale: 0.58, idealMaxScale: 0.88 },
    axe: { reachScale: 0.48, attackPad: 20, idealMinScale: 0.62, idealMaxScale: 0.9 },
    mace: { reachScale: 0.5, attackPad: 22, idealMinScale: 0.58, idealMaxScale: 0.88 },
};

const AI_RANGED_PROFILES = {
    flamethrower: { rangeScale: 0.72, idealMin: 72, idealMax: 116, reactionScale: 1.14, leadSeconds: 0.1 },
    acid: { rangeScale: 0.7, idealMin: 82, idealMax: 126, reactionScale: 1.18, leadSeconds: 0.12 },
    plasma: { rangeScale: 0.78, idealMin: 130, idealMax: 240, reactionScale: 1.2, leadSeconds: 0.24 },
    railgun: { rangeScale: 0.76, idealMin: 220, idealMax: 340, reactionScale: 1.22, leadSeconds: 0.28 },
    tesla: { rangeScale: 0.82, idealMin: 92, idealMax: 142, reactionScale: 1.18, leadSeconds: 0.08 },
    missile: { rangeScale: 0.7, idealMin: 150, idealMax: 260, reactionScale: 1.16, leadSeconds: 0.22 },
};

export default class AIController {
    constructor(scene, bot, difficulty) {
        this.scene = scene;
        this.bot = bot;
        this.difficulty = difficulty;
        this.state = 'idle';
        this.stateTimer = 0;
        this.decisionTimer = 0;
        this.dodgeDir = Math.random() < 0.5 ? 1 : -1;
        this.lastTargetPos = { x: bot.x, y: bot.y };
        this.personality = this._pickPersonality();
    }

    _pickPersonality() {
        const weapon = WEAPONS[this.bot.weaponKey] || WEAPONS.spinner;
        if (weapon.category === 'ranged') return Math.random() < 0.55 ? 'tactical' : 'defensive';
        return ['aggressive', 'defensive', 'tactical', 'berserker'][Math.floor(Math.random() * 4)];
    }

    update(delta, target, arenaRect) {
        if (!target || this.bot.hp <= 0 || this.bot.disabled || this.bot.stunned) return;

        this.decisionTimer -= delta;
        this.stateTimer -= delta;
        this.bot.blocking = false;

        const weapon = WEAPONS[this.bot.weaponKey] || WEAPONS.spinner;
        const profile = this._getWeaponProfile(weapon);
        const predicted = this._predictTarget(target, profile);
        const dx = predicted.x - this.bot.x;
        const dy = predicted.y - this.bot.y;
        const dist = Math.hypot(target.x - this.bot.x, target.y - this.bot.y);
        const angleToTarget = Math.atan2(dy, dx);

        if (this.decisionTimer <= 0 || this.stateTimer <= 0) {
            const thinkRate = Math.max(120, this.difficulty.aiReaction * (weapon.category === 'melee' ? 0.75 : 0.88));
            this.decisionTimer = this.stateTimer <= 0 ? thinkRate * 0.6 : thinkRate;
            this._makeDecision(target, weapon, profile, dist);
        }

        switch (this.state) {
            case 'chase':
                this._runChaseState(angleToTarget, dist, profile);
                break;
            case 'pressure':
                this._runEngagementState(angleToTarget, dist, profile, {
                    strafe: 0.22,
                    inwardBias: 0.18,
                    approachMax: 0.9,
                    closeRetreat: 0.5,
                });
                if (dist < profile.attackRange * 1.02 && this._attackRoll()) this.bot.wantsAttack = true;
                break;
            case 'attack':
                this._runAttackState(angleToTarget, dist, profile);
                break;
            case 'circle':
                this._runCircleState(angleToTarget, dist, profile, 0.9);
                break;
            case 'flank':
                this._runCircleState(angleToTarget + this.dodgeDir * 0.35, dist, profile, 1);
                break;
            case 'retreat':
                this._runRetreatState(angleToTarget, dist, profile);
                break;
            case 'dodge':
                this._runDodgeState(angleToTarget);
                break;
            case 'block':
                this.bot.moveDir.x = 0;
                this.bot.moveDir.y = 0;
                this.bot.angle = angleToTarget;
                this.bot.blocking = true;
                if (this.stateTimer <= 0) this.state = 'attack';
                break;
            case 'bomb':
                this.bot.moveDir.x = 0;
                this.bot.moveDir.y = 0;
                this.bot.angle = angleToTarget;
                this.bot.wantsBomb = true;
                this.state = 'retreat';
                this.stateTimer = 700;
                break;
            default:
                this.bot.moveDir.x = 0;
                this.bot.moveDir.y = 0;
        }

        this._avoidArenaEdges(arenaRect);
        this._preferWalkableRoute();
        this.lastTargetPos.x = target.x;
        this.lastTargetPos.y = target.y;
    }

    _getWeaponProfile(weapon) {
        if (weapon.category === 'melee') {
            const melee = AI_MELEE_PROFILES[weapon.key] || AI_MELEE_PROFILES.spinner;
            const attackRange = weapon.range * melee.reachScale + this.bot.size * 0.62 + melee.attackPad;
            return {
                weapon,
                attackRange,
                idealMin: attackRange * melee.idealMinScale,
                idealMax: attackRange * melee.idealMaxScale,
                reactionRange: attackRange * 1.38,
                leadSeconds: 0.14,
            };
        }

        const ranged = AI_RANGED_PROFILES[weapon.key] || {};
        const attackRange = Math.min(weapon.range * (ranged.rangeScale || 0.74), 340);
        return {
            weapon,
            attackRange,
            idealMin: ranged.idealMin || Math.max(95, attackRange * 0.52),
            idealMax: ranged.idealMax || attackRange * 0.82,
            reactionRange: attackRange * (ranged.reactionScale || 1.25),
            leadSeconds: ranged.leadSeconds || (weapon.projectileSpeed ? Math.min(0.42, 180 / weapon.projectileSpeed) : 0.18),
        };
    }

    _predictTarget(target, profile) {
        const moveX = target.moveDir?.x || 0;
        const moveY = target.moveDir?.y || 0;
        const moveScale = (target.speed || 0) * profile.leadSeconds;
        return {
            x: target.x + moveX * moveScale,
            y: target.y + moveY * moveScale,
        };
    }

    _attackRoll() {
        return Math.random() < Math.min(0.96, 0.45 + this.difficulty.aiAccuracy * 0.7);
    }

    _makeDecision(target, weapon, profile, dist) {
        const hpRatio = this.bot.hp / this.bot.maxHp;
        const targetLow = target.hp < target.maxHp * 0.35;
        const targetAttacking = target.attackAnim > 0.15 || target.charging || target.dodging;
        const canBomb = !this.bot.bombActive && this.bot.energy >= 30;
        const canDodge = !this.bot.dodging && Date.now() >= this.bot.dodgeCooldownEnd && this.bot.energy >= 25;

        if (targetAttacking && dist < profile.reactionRange) {
            if (canDodge && Math.random() < Math.min(0.9, this.difficulty.dodgeChance * 3.2 + 0.18)) {
                this.state = 'dodge';
                this.stateTimer = 260;
                this.dodgeDir = Math.random() < 0.5 ? 1 : -1;
                return;
            }
            if (weapon.category === 'melee' && Math.random() < 0.3 + this.difficulty.aiAccuracy * 0.4) {
                this.state = 'block';
                this.stateTimer = 320;
                return;
            }
        }

        if (canBomb && dist < Math.max(120, profile.idealMin) && Math.random() < 0.08 + this.difficulty.aiAccuracy * 0.08) {
            this.state = 'bomb';
            return;
        }

        if (weapon.category === 'ranged') {
            if (dist < profile.idealMin * 0.85) {
                this.state = hpRatio < 0.45 || targetAttacking ? 'dodge' : 'retreat';
                this.stateTimer = 380;
                return;
            }
            if (dist <= profile.idealMax * 1.08) {
                const r = Math.random();
                this.state = r < 0.48 ? 'attack' : r < 0.78 ? 'circle' : 'flank';
                this.stateTimer = 520;
                this.dodgeDir = Math.random() < 0.5 ? 1 : -1;
                return;
            }
            this.state = this.personality === 'tactical' ? 'flank' : 'chase';
            this.stateTimer = 460;
            return;
        }

        if (dist > profile.attackRange * 1.14) {
            this.state = this.personality === 'berserker' || targetLow ? 'pressure' : 'chase';
            this.stateTimer = 360;
            return;
        }

        if (hpRatio < 0.28 && !targetLow) {
            this.state = Math.random() < 0.55 ? 'retreat' : 'circle';
            this.stateTimer = 420;
            return;
        }

        const r = Math.random();
        if (this.personality === 'tactical') {
            this.state = r < 0.4 ? 'attack' : r < 0.7 ? 'flank' : 'circle';
        } else if (this.personality === 'defensive') {
            this.state = r < 0.38 ? 'attack' : r < 0.62 ? 'block' : 'circle';
        } else if (this.personality === 'berserker') {
            this.state = r < 0.8 ? 'pressure' : 'attack';
        } else {
            this.state = r < 0.58 ? 'attack' : r < 0.8 ? 'pressure' : 'circle';
        }
        this.stateTimer = 420;
    }

    _runAttackState(angleToTarget, dist, profile) {
        this.bot.angle = angleToTarget;

        if (profile.weapon.category === 'melee') {
            this._runEngagementState(angleToTarget, dist, profile, {
                strafe: 0.16,
                inwardBias: 0.08,
                approachMax: 0.72,
                closeRetreat: 0.46,
            });
        } else {
            this._runEngagementState(angleToTarget, dist, profile, {
                strafe: 0.48,
                inwardBias: 0,
                approachMax: 0.62,
                closeRetreat: 0.78,
            });
        }

        if (dist < profile.attackRange * 1.04 && this._attackRoll()) {
            this.bot.wantsAttack = true;
        }
    }

    _runCircleState(angleToTarget, dist, profile, speed) {
        this._runEngagementState(angleToTarget, dist, profile, {
            strafe: speed * 0.54,
            inwardBias: profile.weapon.category === 'melee' ? 0.06 : 0,
            approachMax: profile.weapon.category === 'melee' ? 0.68 : 0.54,
            closeRetreat: profile.weapon.category === 'melee' ? 0.48 : 0.64,
        });

        if (dist < profile.attackRange * 1.02 && this._attackRoll()) this.bot.wantsAttack = true;
        if (this.stateTimer <= 0) this.dodgeDir *= -1;
    }

    _runRetreatState(angleToTarget, dist, profile) {
        if (dist < profile.idealMin * 1.08) {
            this._runEngagementState(angleToTarget, dist, profile, {
                strafe: 0.26,
                inwardBias: 0,
                approachMax: 0.4,
                closeRetreat: 0.82,
            });
        } else {
            this._runEngagementState(angleToTarget, dist, profile, {
                strafe: 0.5,
                inwardBias: 0,
                approachMax: 0.28,
                closeRetreat: 0.42,
            });
        }

        if (profile.weapon.category !== 'melee' && dist >= profile.idealMin * 1.08 && this._attackRoll()) {
            this.bot.wantsAttack = true;
        }
    }

    _runDodgeState(angleToTarget) {
        const dodgeAngle = angleToTarget + (Math.PI / 2) * this.dodgeDir;
        const dx = Math.cos(dodgeAngle);
        const dy = Math.sin(dodgeAngle);

        if (!this.bot.dodging) {
            const ok = this.bot.startDodge(dx, dy);
            if (!ok) this._moveAt(dodgeAngle, 1);
        } else {
            this.bot.moveDir.x = dx;
            this.bot.moveDir.y = dy;
        }
        this.bot.angle = angleToTarget;

        if (this.stateTimer <= 0) {
            this.state = 'attack';
            this.stateTimer = 260;
        }
    }

    _pressureAngle(angleToTarget) {
        return angleToTarget + this.dodgeDir * 0.18;
    }

    _runChaseState(angleToTarget, dist, profile) {
        if (dist <= profile.idealMax) {
            this._runEngagementState(angleToTarget, dist, profile, {
                strafe: 0.18,
                inwardBias: 0.08,
                approachMax: 0.58,
                closeRetreat: 0.42,
            });
            if (dist < profile.attackRange * 1.02 && this._attackRoll()) this.bot.wantsAttack = true;
            return;
        }

        const farSpan = Math.max(1, profile.reactionRange * 1.45 - profile.idealMax);
        const farT = this._clamp((dist - profile.idealMax) / farSpan, 0, 1);
        const speed = 0.52 + farT * 0.34;
        this._moveAt(angleToTarget, speed);
    }

    _runEngagementState(angleToTarget, dist, profile, opts = {}) {
        const strafeBase = opts.strafe ?? 0.34;
        const approachMax = opts.approachMax ?? 0.72;
        const closeRetreat = opts.closeRetreat ?? 0.54;
        const inwardBias = opts.inwardBias ?? 0;

        let radial = inwardBias;
        if (dist > profile.idealMax) {
            const span = Math.max(1, profile.reactionRange - profile.idealMax);
            radial = this._clamp((dist - profile.idealMax) / span, 0.22, approachMax);
        } else if (dist < profile.idealMin) {
            const span = Math.max(1, profile.idealMin);
            radial = -this._clamp((profile.idealMin - dist) / span, 0.24, closeRetreat);
        }

        const inBand = dist >= profile.idealMin * 0.92 && dist <= profile.idealMax * 1.08;
        const strafe = strafeBase * (inBand ? 1 : 0.42);
        const perp = angleToTarget + Math.PI / 2;
        const moveX = Math.cos(angleToTarget) * radial + Math.cos(perp) * strafe * this.dodgeDir;
        const moveY = Math.sin(angleToTarget) * radial + Math.sin(perp) * strafe * this.dodgeDir;
        this._setMoveVector(moveX, moveY, angleToTarget);
    }

    _setMoveVector(x, y, facingAngle = this.bot.angle) {
        const mag = Math.hypot(x, y);
        if (mag < 0.03) {
            this.bot.moveDir.x = 0;
            this.bot.moveDir.y = 0;
            this.bot.angle = facingAngle;
            return;
        }

        const speed = Math.min(0.95, mag);
        const dx = x / mag;
        const dy = y / mag;
        if (!this._isWalkableStep(dx, dy)) {
            this.dodgeDir *= -1;
            this._moveAt(Math.atan2(y, x) + this.dodgeDir * 0.45, Math.min(0.62, speed));
            return;
        }

        this.bot.moveDir.x = dx * speed;
        this.bot.moveDir.y = dy * speed;
        this.bot.angle = facingAngle;
    }

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    _strafe(angleToTarget, speed, allowFlip = true) {
        const strafeAngle = angleToTarget + (Math.PI / 2) * this.dodgeDir;
        const dx = Math.cos(strafeAngle);
        const dy = Math.sin(strafeAngle);

        if (!this._isWalkableStep(dx, dy)) {
            if (allowFlip) {
                this.dodgeDir *= -1;
                return this._strafe(angleToTarget, speed, false);
            }
            this.bot.moveDir.x = 0;
            this.bot.moveDir.y = 0;
            return;
        }

        this.bot.moveDir.x = dx * speed;
        this.bot.moveDir.y = dy * speed;
    }

    _moveAt(angle, speed) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        if (!this._isWalkableStep(dx, dy)) {
            this._strafe(angle, 0.8);
            return;
        }

        this.bot.moveDir.x = dx * speed;
        this.bot.moveDir.y = dy * speed;
        this.bot.angle = angle;
    }

    _isWalkableStep(dx, dy) {
        if (!this.scene._isAreaWalkable) return true;
        const lookAhead = this.bot.size + 18;
        return this.scene._isAreaWalkable(
            this.bot.x + dx * lookAhead,
            this.bot.y + dy * lookAhead,
            this.bot.size * 0.55,
            this.bot.size * 0.55
        );
    }

    _preferWalkableRoute() {
        if (!this.scene._isAreaWalkable) return;
        const moveLen = Math.hypot(this.bot.moveDir.x, this.bot.moveDir.y);
        if (moveLen < 0.01) return;
        if (this._isWalkableStep(this.bot.moveDir.x / moveLen, this.bot.moveDir.y / moveLen)) return;

        this.dodgeDir *= -1;
        const angle = this.bot.angle + (Math.PI / 2) * this.dodgeDir;
        this.bot.moveDir.x = Math.cos(angle) * 0.85;
        this.bot.moveDir.y = Math.sin(angle) * 0.85;
    }

    _avoidArenaEdges(arenaRect) {
        if (!arenaRect) return;
        const margin = 48;
        if (this.bot.x < arenaRect.x + margin) this.bot.moveDir.x = Math.max(this.bot.moveDir.x, 0.45);
        if (this.bot.x > arenaRect.x + arenaRect.width - margin) this.bot.moveDir.x = Math.min(this.bot.moveDir.x, -0.45);
        if (this.bot.y < arenaRect.y + margin) this.bot.moveDir.y = Math.max(this.bot.moveDir.y, 0.45);
        if (this.bot.y > arenaRect.y + arenaRect.height - margin) this.bot.moveDir.y = Math.min(this.bot.moveDir.y, -0.45);
    }
}

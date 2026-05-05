import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import CustomizeScene from './scenes/CustomizeScene.js';
import BattleScene from './scenes/BattleScene.js';
import ResultScene from './scenes/ResultScene.js';
import MultiplayerScene from './scenes/MultiplayerScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import AudioManager from './systems/AudioManager.js';
import ProgressionSystem from './systems/ProgressionSystem.js';

const config = {
    type: Phaser.AUTO,
    width: 1000,
    height: 700,
    parent: 'game-container',
    backgroundColor: '#0a0a0a',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
        activePointers: 4,
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
        },
    },
    scene: [BootScene, MenuScene, CustomizeScene, BattleScene, ResultScene, MultiplayerScene, SettingsScene, TutorialScene],
};

const game = new Phaser.Game(config);
window.game = game;

// Register shared systems in the registry
const audio = new AudioManager();
game.registry.set('audio', audio);
game.registry.set('progression', new ProgressionSystem());
game.registry.set('difficulty', 'medium');

const preventMobileBrowserGestures = () => {
    const prevent = (event) => event.preventDefault();
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });
};

const installAudioUnlock = () => {
    let unlocked = false;
    const unlock = () => {
        audio.init();
        audio.resume();
        const scene = game.scene.getScenes(true)[0];
        if (!audio.currentMusic && scene?.scene?.key === 'MenuScene') {
            audio.startMenuMusic();
        } else if (audio.currentMusic && !audio.currentMusic.isPlaying) {
            audio.resume();
        }
        unlocked = true;
    };

    const unlockOnce = () => unlock();
    const events = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
    events.forEach((eventName) => {
        window.addEventListener(eventName, unlockOnce, { passive: false });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && unlocked) unlock();
    });
};

preventMobileBrowserGestures();
installAudioUnlock();

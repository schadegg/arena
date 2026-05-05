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
game.registry.set('audio', new AudioManager());
game.registry.set('progression', new ProgressionSystem());
game.registry.set('difficulty', 'medium');

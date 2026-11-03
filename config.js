// ===== Game settings =====
// To swap an image: put a PNG or WebP in assets/fruits/ and change "file" below.
// The game uses WebP copies (about 8x smaller, loads faster); the PNG originals are kept.
// ratio = how big the item LOOKS, as a part of the game width (0.5 = half the width):
//         its visible part has the area of a circle with this diameter.
// score = points you get when this item is created by a merge
// color = placeholder circle color (used until images are ready)

// Makes EVERY item bigger or smaller at once.
// 1.0 = the ratios below. 1.2 = all items 20% bigger. 0.9 = 10% smaller.
const SIZE_SCALE = 1.0;

const CONFIG = {
  width: 400,          // game area width  (game units, not screen pixels)
  height: 600,         // game area height
  wall: 20,            // thickness of the walls
  dropY: 68,           // height where the next item waits before dropping (tall poses need room)
  dropCooldown: 500,   // ms to wait between drops
  dropTypes: 5,        // only the first 5 (smallest) types are dropped

  // Visible size: the person (not the empty background) gets the same area as
  // a circle of this diameter. So a thin pose is drawn longer and a chunky
  // pose shorter, and each type LOOKS bigger than the one before.
  // Smallest = 1/10 of the width, largest = 1/2, each 1.175 times the one before.
  fruits: [
    { file: 'assets/fruits/01.webp', ratio: 0.100, score: 1,  color: '#e74c3c' },
    { file: 'assets/fruits/02.webp', ratio: 0.117, score: 3,  color: '#e67e22' },
    { file: 'assets/fruits/03.webp', ratio: 0.138, score: 6,  color: '#f1c40f' },
    { file: 'assets/fruits/04.webp', ratio: 0.162, score: 10, color: '#2ecc71' },
    { file: 'assets/fruits/05.webp', ratio: 0.190, score: 15, color: '#1abc9c' },
    { file: 'assets/fruits/06.webp', ratio: 0.224, score: 21, color: '#3498db' },
    { file: 'assets/fruits/07.webp', ratio: 0.263, score: 28, color: '#9b59b6' },
    { file: 'assets/fruits/08.webp', ratio: 0.309, score: 36, color: '#e84393' },
    { file: 'assets/fruits/09.webp', ratio: 0.362, score: 45, color: '#8e6e53' },
    { file: 'assets/fruits/10.webp', ratio: 0.426, score: 55, color: '#34495e' },
    { file: 'assets/fruits/11.webp', ratio: 0.500, score: 66, color: '#c0392b' },
  ],

  // How items move. Smaller gravity + more air friction = slower, softer ("fuwa") falls.
  physics: {
    gravity: 0.6,        // 1 = Matter.js normal gravity. Smaller = falls more slowly
    airFriction: 0.02,   // slows items down in the air (Matter.js normal = 0.01)
    bounce: 0.3,         // 0 = no bounce, 1 = very bouncy
    friction: 0.5,       // how much items grip each other when sliding
  },

  bonusScore: 100,       // points when two of the largest type vanish
  dangerLineY: 90,       // the top line (game over if an item stays above it)
  gameOverSeconds: 2,    // how long an item may stay above the line

  // What Mokumoku says when tapped on the home screen (one is picked at random).
  // {best} is replaced with the player's best score. Add or change lines freely.
  mokumokuLines: [
    'むにゃ…あと5分だけモク…',
    'ふわぁ…おはよモク',
    '同じ人どうしを、くっつけてねモク',
    'びんからあふれたら、おしまいモクよ',
    'いちばん大きい人どうしで、ボーナスモク！',
    '図鑑、ぜんぶうまるモクかな？',
    'きょうも いい空モクね',
    'もくもく…もくもく…',
    'BEST {best} 点！すごいモクね',
    '11人ぜんぶ、あつめてみてモク',
    'あそびかたは、むずかしくないモクよ',
    'あそんでくれて、ありがとうモク',
    'あそんでくれて、うれしいモク',
    'ぼくに言ってほしいこと募集中モク',
    'こいつ進路決まってないのにこんなゲーム作ってるモクよ',
    'このゲーム、まだまだ進化するモクよ',
    'たまに開発者の自我が出てくるモク',
    '語尾は開発者のイメージモク',
    'とりあえず語尾にモクってつけとけばいいモク',
    '浮き続けるの結構疲れるモク',
    'うまくいかないときは、深呼吸モク',
    '鬱'
  ],
  // Tutorial: Mokumoku explains the game step by step.
  // wait = what moves on to the next step:
  //   'tap'   = tap the game board (or the bubble)
  //   'drop'  = drop a character
  //   'merge' = make two characters merge
  // highlight = what glows while this step is shown: 'next', 'ring', 'rim' (the jar's mouth)
  tutorialSteps: [
    { text: 'ようこそモク！ぼくはもくもく。遊び方を教えるモク', wait: 'tap' },
    { text: 'すきな場所をタップするモク。ぼくが人を落とすモクよ', wait: 'drop' },
    { text: '同じ人どうしがくっつくと進化するモク！となりに落としてみてモク', wait: 'merge' },
    { text: 'やったモク！進化すると点数がもらえるモクよ', wait: 'tap' },
    { text: 'つぎに落とす人は、ここ（NEXT）に出るモク', wait: 'tap', highlight: 'next' },
    { text: 'しんかの輪で、だれに進化するか見られるモク', wait: 'tap', highlight: 'ring' },
    { text: 'びんの口からあふれて2秒たつと、ゲームオーバーモク！', wait: 'tap', highlight: 'rim' },
    { text: 'いちばん大きい人どうしは、消えてボーナスモク。さあ、はじめるモク！', wait: 'tap' },
  ],

  // Said instead when tapped many times quickly
  mokumokuTickleLines: [
    'くすぐったいモクよ〜',
    'わわっ、ゆらさないでモク〜',
    'もう起きてるモクってば〜',
  ],

  // Online ranking (Google Spreadsheet + Apps Script web app).
  // '' = not connected yet: the ranking panel says so.
  rankingUrl: 'https://script.google.com/macros/s/AKfycby5HeGbFowKOYXJi4TUfvU9fiDoaKXQhFnNCMX_vRvpH5chA5NjivC3IgGksN8radm7dg/exec',

  // Sound files (made by tools/make-sounds.js). WAV plays in every browser.
  // null = no sound for that event (the game then does not try to load a file).
  sounds: {
    drop: 'assets/sounds/drop.wav',
    merge: 'assets/sounds/merge.wav',
    gameover: 'assets/sounds/gameover.wav',
    bgm: 'assets/sounds/bgm.wav',
    tap: 'assets/sounds/tap.wav', // buttons
  },
};

// size = visible size in game units (see "ratio" above) = width x ratio x SIZE_SCALE.
// The rest of the game only uses "size".
for (const fruit of CONFIG.fruits) {
  fruit.size = Math.round(CONFIG.width * fruit.ratio * SIZE_SCALE);
}

// Node (tests) can require() this file. Browsers skip this line.
if (typeof module !== 'undefined') module.exports = CONFIG;

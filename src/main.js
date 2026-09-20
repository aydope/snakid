"use strict";

var COLS = 20;
var ROWS = 12;
var TILE = 40;
var WIDTH = COLS * TILE;
var HEIGHT = ROWS * TILE;

var DEATH_DURATION = 800; // ms of the death animation before the popup
var MAX_QUEUED_INPUTS = 2; // buffered direction changes per tick
var SWIPE_THRESHOLD = 24; // px
var RESUME_GRACE_MS = 600; // breathing room after resuming from pause
var SPEED_STEP_EVERY = 5; // +1 fps every N points ...
var SPEED_STEP_MAX = 5; // ... up to this many extra fps

var STORAGE_KEYS = {
  name: "snakid_playerName",
  speed: "snakid_speed",
  sound: "snakid_sound",
  best: "snakid_best",
};

var speedSettings = {
  slow: { fps: 7, label: "Slow" },
  normal: { fps: 10, label: "Normal" },
  fast: { fps: 15, label: "Fast" },
};

var DIRECTIONS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

var KEY_MAP = {
  ArrowUp: DIRECTIONS.up,
  KeyW: DIRECTIONS.up,
  ArrowDown: DIRECTIONS.down,
  KeyS: DIRECTIONS.down,
  ArrowLeft: DIRECTIONS.left,
  KeyA: DIRECTIONS.left,
  ArrowRight: DIRECTIONS.right,
  KeyD: DIRECTIONS.right,
};

function storageGet(key, fallback) {
  try {
    var value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}

// Global State
var doc = document;
var animationFrameId = null;
var isGameRunning = false;
var gameInstance = null;
var lastFrameTime = 0;
var tickAccumulator = 0;
var pendingStart = false; // name modal opened from "Start" -> start after save
var bestScore = 0;

var playerName = storageGet(STORAGE_KEYS.name, "");
var gameSpeed = storageGet(STORAGE_KEYS.speed, "normal");
if (!Object.prototype.hasOwnProperty.call(speedSettings, gameSpeed)) {
  gameSpeed = "normal";
}
var soundEnabled = storageGet(STORAGE_KEYS.sound, "on") !== "off";

var reducedMotion =
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Performance monitoring (real render FPS)
var fpsCounter = 0;
var lastFpsUpdate = 0;

var canvas = doc.getElementById("gameCanvas");
var ctx = canvas.getContext("2d");
var overlay = doc.getElementById("overlay");
var pauseOverlay = doc.getElementById("pauseOverlay");
var gameControls = doc.getElementById("gameControls");
var gameOverModal = doc.getElementById("gameOverModal");
var gameOverTitle = doc.getElementById("gameOverTitle");
var instructionsPopup = doc.getElementById("instructionsPopup");
var nameModal = doc.getElementById("nameModal");
var nameInput = doc.getElementById("nameInput");
var saveNameBtn = doc.getElementById("saveNameBtn");
var finalScore = doc.getElementById("finalScore");
var bestScoreText = doc.getElementById("bestScoreText");
var newRecordBadge = doc.getElementById("newRecordBadge");
var scoreDisplay = doc.getElementById("scoreDisplay");
var bestDisplay = doc.getElementById("bestDisplay");
var statsBar = doc.getElementById("statsBar");
var fpsValue = doc.getElementById("fpsValue");
var playerNameDisplay = doc.getElementById("playerNameDisplay");
var playerNameValue = doc.getElementById("playerNameValue");
var menuPlayerName = doc.getElementById("menuPlayerName");
var changeNameBtn = doc.getElementById("changeNameBtn");
var mobileControls = doc.getElementById("mobileControls");
var sideMenu = doc.getElementById("sideMenu");
var menuBackdrop = doc.getElementById("menuBackdrop");
var menuToggleBtn = doc.getElementById("menuToggle");
var soundToggle = doc.getElementById("soundToggle");
var soundLabel = doc.getElementById("soundLabel");

function isVisible(el) {
  return !!el && !el.classList.contains("hidden");
}

function showFlex(el) {
  el.classList.remove("hidden");
  el.classList.add("flex");
}

function hideFlex(el) {
  el.classList.add("hidden");
  el.classList.remove("flex");
}

function isMenuOpen() {
  return !sideMenu.classList.contains("translate-x-full");
}

function isAnyDialogOpen() {
  return (
    isMenuOpen() ||
    isVisible(nameModal) ||
    isVisible(instructionsPopup) ||
    isVisible(gameOverModal)
  );
}

function loadImage(src) {
  var img = new Image();
  img.onerror = function () {
    console.warn("Failed to load image: " + src);
  };
  img.src = src;
  return img;
}

function loadTextures() {
  var base = "src/assets/pic/texture/";
  var load = function (name) {
    return loadImage(base + name);
  };
  return {
    head: {
      up: load("head_up.png"),
      down: load("head_down.png"),
      left: load("head_left.png"),
      right: load("head_right.png"),
    },
    tail: {
      up: load("tail_up.png"),
      down: load("tail_down.png"),
      left: load("tail_left.png"),
      right: load("tail_right.png"),
    },
    body: {
      vertical: load("body_vertical.png"),
      horizontal: load("body_horizontal.png"),
      tr: load("body_tr.png"),
      tl: load("body_tl.png"),
      br: load("body_br.png"),
      bl: load("body_bl.png"),
    },
  };
}

// Loaded once (previously re-created on every new game)
var textures = loadTextures();
var appleImage = loadImage("src/assets/pic/texture/apple.png");

// Draws a sprite; falls back to a plain tile if the image is missing/broken
function drawSprite(img, x, y, fallbackColor) {
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, TILE, TILE);
    return;
  }
  ctx.fillStyle = fallbackColor;
  ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
}

var crunchSound = new Audio("src/assets/sound/crunch.wav");
crunchSound.volume = 0.3;
var audioCtx = null;

function playCrunchSound() {
  if (!soundEnabled) return;
  try {
    crunchSound.currentTime = 0;
    var p = crunchSound.play();
    if (p && p.catch) p.catch(function () {});
  } catch (e) {
    /* ignore */
  }
}

// A short synthesized "descending buzz", so death no longer reuses the crunch
function playDeathSound() {
  if (!soundEnabled) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.45);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch (e) {
    /* ignore */
  }
}

function vibrate(ms) {
  if (!soundEnabled || !navigator.vibrate) return;
  try {
    navigator.vibrate(ms);
  } catch (e) {
    /* ignore */
  }
}

function updateSoundUI() {
  if (soundLabel) {
    soundLabel.textContent =
      "Sound & vibration: " + (soundEnabled ? "On" : "Off");
  }
  if (soundToggle) {
    soundToggle.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  storageSet(STORAGE_KEYS.sound, soundEnabled ? "on" : "off");
  updateSoundUI();
}

function getBestScore() {
  var value = parseInt(storageGet(STORAGE_KEYS.best, "0"), 10);
  return isNaN(value) || value < 0 ? 0 : value;
}

function saveBestScore(score) {
  if (score > getBestScore()) storageSet(STORAGE_KEYS.best, String(score));
}

function updateBestDisplay() {
  if (bestDisplay) bestDisplay.textContent = bestScore;
}

function initialize() {
  applyGameSpeed();
  updateSoundUI();
  updatePlayerNameUI();
  detectMobileDevice();
  bestScore = getBestScore();
  updateBestDisplay();
  bindInputs(); // bound ONCE (previously re-bound on every game start)

  if (!playerName) {
    setTimeout(function () {
      if (!isVisible(nameModal) && !isGameRunning) showNameModal(true);
    }, 500);
  }
}

function showNameModal(startAfterSave) {
  pendingStart = startAfterSave === true;
  closeMenu();
  pauseGame();
  showFlex(nameModal);
  nameInput.value = playerName || "";
  saveNameBtn.textContent = pendingStart ? "Save & Play" : "Save";
  setTimeout(function () {
    nameInput.focus();
  }, 100);
}

function hideNameModal() {
  hideFlex(nameModal);
  pendingStart = false;
}

function savePlayerName() {
  var name = nameInput.value.trim();

  if (name.length < 1) {
    nameInput.classList.add("border-red-500");
    nameInput.placeholder = "Please enter a name!";
    setTimeout(function () {
      nameInput.classList.remove("border-red-500");
      nameInput.placeholder = "Player name...";
    }, 1500);
    return;
  }

  playerName = name;
  storageSet(STORAGE_KEYS.name, playerName);
  var shouldStart = pendingStart && !isGameRunning;
  hideNameModal();
  updatePlayerNameUI();

  if (shouldStart) startGame();
}

function updatePlayerNameUI() {
  if (playerName) {
    playerNameDisplay.classList.remove("hidden");
    if (playerNameValue) playerNameValue.textContent = playerName;
    menuPlayerName.textContent = playerName;
    changeNameBtn.textContent = "Change Name";
  } else {
    playerNameDisplay.classList.add("hidden");
    menuPlayerName.textContent = "Not set";
    changeNameBtn.textContent = "Set Name";
  }
}

function handleStartClick() {
  if (!playerName) {
    showNameModal(true);
  } else {
    startGame();
  }
}

function applyGameSpeed() {
  var speed = speedSettings[gameSpeed];

  ["speedSlow", "speedNormal", "speedFast"].forEach(function (id) {
    var btn = doc.getElementById(id);
    if (btn) {
      btn.classList.remove("bg-emerald-500/20", "text-emerald-400");
      btn.classList.add("bg-gray-800", "text-gray-300");
    }
  });

  var activeButton = doc.getElementById("speed" + speed.label);
  if (activeButton) {
    activeButton.classList.remove("bg-gray-800", "text-gray-300");
    activeButton.classList.add("bg-emerald-500/20", "text-emerald-400");
  }
}

function setGameSpeed(speed) {
  if (!Object.prototype.hasOwnProperty.call(speedSettings, speed)) return;
  gameSpeed = speed;
  storageSet(STORAGE_KEYS.speed, speed);
  applyGameSpeed();
}

function detectMobileDevice() {
  var isTouch = window.matchMedia
    ? window.matchMedia("(pointer: coarse)").matches
    : "ontouchstart" in window;
  if (!mobileControls) return;
  if (isTouch) {
    mobileControls.classList.remove("hidden");
  } else {
    mobileControls.classList.add("hidden");
  }
}

function openMenu() {
  pauseGame();
  sideMenu.classList.remove("translate-x-full");
  menuBackdrop.classList.remove("hidden");
  if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  sideMenu.classList.add("translate-x-full");
  menuBackdrop.classList.add("hidden");
  if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (isMenuOpen()) {
    closeMenu();
  } else {
    openMenu();
  }
}

function toggleInstructions(show) {
  if (show) {
    showFlex(instructionsPopup);
  } else {
    hideFlex(instructionsPopup);
  }
}

// Vector2
function Vector2(x, y) {
  this.x = x;
  this.y = y;
}

Vector2.prototype.add = function (vector) {
  return new Vector2(this.x + vector.x, this.y + vector.y);
};

Vector2.prototype.subtract = function (vector) {
  return new Vector2(this.x - vector.x, this.y - vector.y);
};

Vector2.prototype.equals = function (vector) {
  return this.x === vector.x && this.y === vector.y;
};

function textureKey(delta) {
  if (delta.x === 1) return "left";
  if (delta.x === -1) return "right";
  if (delta.y === 1) return "up";
  return "down";
}

function Snake() {
  this.reset();
}

Snake.prototype.reset = function () {
  this.body = [new Vector2(5, 6), new Vector2(4, 6), new Vector2(3, 6)];
  this.direction = new Vector2(0, 0); // (0,0) = waiting for the first input
  this.heading = new Vector2(1, 0); // last applied direction (blocks reversing)
  this.queue = []; // buffered direction changes
  this.shouldGrow = false;
};

Snake.prototype.isMoving = function () {
  return this.direction.x !== 0 || this.direction.y !== 0;
};

// Buffers a direction change. Validated against the LAST QUEUED direction (or
// the last applied one), so two quick key presses can no longer reverse the
// snake into itself, and "left" as the very first input is ignored.
Snake.prototype.queueDirection = function (dx, dy) {
  var ref = this.queue.length
    ? this.queue[this.queue.length - 1]
    : this.heading;

  if (ref.x === -dx && ref.y === -dy) return; // no 180 degree turns

  if (this.queue.length === 0 && !this.isMoving()) {
    this.queue.push(new Vector2(dx, dy)); // first input: any non-reverse dir
    return;
  }

  if (ref.x === dx && ref.y === dy) return; // already heading that way
  if (this.queue.length >= MAX_QUEUED_INPUTS) return;
  this.queue.push(new Vector2(dx, dy));
};

Snake.prototype.applyQueuedDirection = function () {
  if (this.queue.length) {
    this.direction = this.queue.shift();
    this.heading = this.direction;
  }
};

Snake.prototype.nextHead = function () {
  return this.body[0].add(this.direction);
};

Snake.prototype.occupies = function (cell, ignoreTail) {
  var end = ignoreTail ? this.body.length - 1 : this.body.length;
  for (var i = 0; i < end; i++) {
    if (this.body[i].equals(cell)) return true;
  }
  return false;
};

Snake.prototype.move = function () {
  this.body.unshift(this.nextHead());
  if (this.shouldGrow) {
    this.shouldGrow = false;
  } else {
    this.body.pop();
  }
};

Snake.prototype.grow = function () {
  this.shouldGrow = true;
};

Snake.prototype.draw = function () {
  var body = this.body;
  var last = body.length - 1;
  if (last < 1) return;

  // tail -> head, so the head is always drawn on top
  for (var i = last; i >= 0; i--) {
    var x = body[i].x * TILE;
    var y = body[i].y * TILE;

    if (i === 0) {
      var headKey = textureKey(body[1].subtract(body[0]));
      drawSprite(textures.head[headKey], x, y, "#2f9e44");
    } else if (i === last) {
      var tailKey = textureKey(body[last - 1].subtract(body[last]));
      drawSprite(textures.tail[tailKey], x, y, "#2f9e44");
    } else {
      this.drawBodySegment(i, x, y);
    }
  }
};

Snake.prototype.drawBodySegment = function (index, x, y) {
  var prev = this.body[index + 1].subtract(this.body[index]);
  var next = this.body[index - 1].subtract(this.body[index]);
  var bodyTextures = textures.body;

  if (prev.x === next.x) {
    drawSprite(bodyTextures.vertical, x, y, "#37b24d");
    return;
  }

  if (prev.y === next.y) {
    drawSprite(bodyTextures.horizontal, x, y, "#37b24d");
    return;
  }

  var cornerType = this.getCornerType(prev, next);
  if (cornerType) drawSprite(bodyTextures[cornerType], x, y, "#37b24d");
};

Snake.prototype.getCornerType = function (prev, next) {
  var px = prev.x;
  var py = prev.y;
  var nx = next.x;
  var ny = next.y;

  if ((px === -1 && ny === -1) || (py === -1 && nx === -1)) return "tl";
  if ((px === -1 && ny === 1) || (py === 1 && nx === -1)) return "bl";
  if ((px === 1 && ny === -1) || (py === -1 && nx === 1)) return "tr";
  if ((px === 1 && ny === 1) || (py === 1 && nx === 1)) return "br";
  return null;
};

function Fruit() {
  this.position = new Vector2(-1, -1);
}

Fruit.prototype.draw = function () {
  drawSprite(
    appleImage,
    this.position.x * TILE,
    this.position.y * TILE,
    "#e03131",
  );
};

// Picks a random FREE cell. Returns false when the board is completely full
// (the old rejection-sampling loop would spin forever in that case).
Fruit.prototype.randomize = function (snake) {
  var taken = {};
  snake.body.forEach(function (segment) {
    taken[segment.x + "," + segment.y] = true;
  });

  var free = [];
  for (var y = 0; y < ROWS; y++) {
    for (var x = 0; x < COLS; x++) {
      if (!taken[x + "," + y]) free.push(new Vector2(x, y));
    }
  }

  if (free.length === 0) return false;
  this.position = free[Math.floor(Math.random() * free.length)];
  return true;
};

function Game() {
  this.snake = new Snake();
  this.fruit = new Fruit();
  this.fruit.randomize(this.snake);
  this.score = 0;
  this.bestAtStart = bestScore;
  this.isPaused = false;
  this.isDead = false;
  this.death = null; // { startTime, won, headPos }
}

// Base speed + a small bonus that grows with the score
Game.prototype.currentFps = function () {
  var bonus = Math.min(
    Math.floor(this.score / SPEED_STEP_EVERY),
    SPEED_STEP_MAX,
  );
  return speedSettings[gameSpeed].fps + bonus;
};

Game.prototype.update = function () {
  if (this.isDead || this.isPaused) return;

  var snake = this.snake;
  snake.applyQueuedDirection();
  if (!snake.isMoving()) return;

  // Collisions are checked BEFORE moving: the snake never leaves the board
  // and never overlaps itself. The tail cell is free unless we're growing.
  var head = snake.nextHead();
  var hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
  var hitSelf = !hitWall && snake.occupies(head, !snake.shouldGrow);
  if (hitWall || hitSelf) {
    this.triggerEnd(false);
    return;
  }

  snake.move();

  if (head.equals(this.fruit.position)) this.eatFruit();
};

Game.prototype.eatFruit = function () {
  this.snake.grow();
  this.score += 1;
  playCrunchSound();
  this.updateScoreDisplay();

  if (!this.fruit.randomize(this.snake)) {
    this.triggerEnd(true); // no free cell left: perfect game
  }
};

Game.prototype.triggerEnd = function (won) {
  var head = this.snake.body[0];
  this.isDead = true;
  this.death = {
    startTime: performance.now(),
    won: won,
    headPos: { x: head.x, y: head.y },
  };
  if (!won) {
    playDeathSound();
    vibrate(200);
  }
};

Game.prototype.updateScoreDisplay = function () {
  if (scoreDisplay) scoreDisplay.textContent = this.score;
  if (this.score > bestScore) {
    bestScore = this.score;
    updateBestDisplay();
  }
};

Game.prototype.draw = function () {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.save();

  // Real screen shake: the whole scene moves, not only the overlay
  if (this.isDead && this.death && !this.death.won && !reducedMotion) {
    var elapsed = performance.now() - this.death.startTime;
    var progress = Math.min(elapsed / DEATH_DURATION, 1);
    ctx.translate(
      Math.sin(elapsed * 0.05) * (10 * (1 - progress)),
      Math.cos(elapsed * 0.07) * (8 * (1 - progress)),
    );
  }

  this.drawBackground();
  this.fruit.draw();
  this.snake.draw();
  if (this.isDead) this.drawDeathEffect();

  ctx.restore();
};

Game.prototype.drawBackground = function () {
  var darkGreen = "rgb(167, 209, 61)";
  var lightGreen = "rgb(175, 215, 70)";

  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? lightGreen : darkGreen;
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }
};

Game.prototype.drawDeathEffect = function () {
  var death = this.death;
  if (!death) return;

  var progress = Math.min(
    (performance.now() - death.startTime) / DEATH_DURATION,
    1,
  );
  var rgb = death.won ? "0, 200, 120" : "255, 0, 0";

  ctx.fillStyle = "rgba(" + rgb + ", " + 0.3 * (1 - progress) + ")";
  ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40);

  if (reducedMotion) return;

  var headX = death.headPos.x * TILE + TILE / 2;
  var headY = death.headPos.y * TILE + TILE / 2;

  for (var i = 0; i < 8; i++) {
    var angle = (i / 8) * Math.PI * 2;
    var distance = progress * 80;
    var alpha = 1 - progress;

    ctx.fillStyle = death.won
      ? "rgba(255, 215, " + i * 25 + ", " + alpha + ")"
      : "rgba(255, " + (100 + i * 20) + ", 0, " + alpha + ")";
    ctx.beginPath();
    ctx.arc(
      headX + Math.cos(angle) * distance,
      headY + Math.sin(angle) * distance,
      4 * (1 - progress),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
};

// Called by the game loop once the death animation has finished
Game.prototype.finish = function () {
  var won = !!(this.death && this.death.won);
  var isRecord = this.score > 0 && this.score > this.bestAtStart;

  isGameRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  saveBestScore(this.score);
  bestScore = getBestScore();
  updateBestDisplay();

  finalScore.textContent = this.score;
  gameOverTitle.textContent = won ? "You Win!" : "Game Over";
  bestScoreText.textContent = "Best: " + bestScore;
  if (isRecord) {
    newRecordBadge.classList.remove("hidden");
  } else {
    newRecordBadge.classList.add("hidden");
  }

  statsBar.classList.add("hidden");
  setPauseOverlay(false);
  showFlex(gameOverModal);

  // Modal entrance animation
  var modalContent = gameOverModal.querySelector(".bg-gray-900");
  if (modalContent) {
    modalContent.style.transform = "scale(0.8)";
    modalContent.style.opacity = "0";
    requestAnimationFrame(function () {
      modalContent.style.transform = "scale(1)";
      modalContent.style.opacity = "1";
    });
  }
};

// Pause
function setPauseOverlay(visible) {
  if (!pauseOverlay) return;
  if (visible) {
    showFlex(pauseOverlay);
  } else {
    hideFlex(pauseOverlay);
  }
}

function pauseGame() {
  if (!isGameRunning || !gameInstance) return;
  if (gameInstance.isDead || gameInstance.isPaused) return;
  gameInstance.isPaused = true;
  setPauseOverlay(true);
}

function resumeGame() {
  if (!gameInstance || !gameInstance.isPaused || isAnyDialogOpen()) return;
  gameInstance.isPaused = false;
  setPauseOverlay(false);
  tickAccumulator = -RESUME_GRACE_MS;
}

function togglePause() {
  if (!gameInstance || !isGameRunning) return;
  if (gameInstance.isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function setupCanvas() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in logical 800x480 units
}

function startGame() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  overlay.classList.add("hidden");
  gameControls.classList.remove("hidden");
  hideFlex(gameOverModal);
  setPauseOverlay(false);
  statsBar.classList.remove("hidden");

  setupCanvas();
  bestScore = getBestScore();
  gameInstance = new Game();
  gameInstance.updateScoreDisplay();
  updateBestDisplay();
  isGameRunning = true;

  lastFrameTime = 0;
  tickAccumulator = 0;
  fpsCounter = 0;
  lastFpsUpdate = 0;

  animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGame() {
  isGameRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameInstance = null;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  setPauseOverlay(false);
  overlay.classList.remove("hidden");
  gameControls.classList.add("hidden");
  statsBar.classList.add("hidden");
}

function restartGame() {
  hideFlex(gameOverModal);
  startGame();
}

function goToHome() {
  hideFlex(gameOverModal);
  stopGame();
}

// Logic runs on a fixed tick (speed setting), rendering runs every frame, so
// the death animation stays smooth even on the Slow setting.
function gameLoop(timestamp) {
  if (!isGameRunning || !gameInstance) return;
  animationFrameId = requestAnimationFrame(gameLoop);

  // FPS counter (real render frames per second)
  if (!lastFpsUpdate) lastFpsUpdate = timestamp;
  fpsCounter++;
  if (timestamp - lastFpsUpdate >= 1000) {
    if (fpsValue) fpsValue.textContent = fpsCounter;
    fpsCounter = 0;
    lastFpsUpdate = timestamp;
  }

  var delta = lastFrameTime ? Math.min(timestamp - lastFrameTime, 250) : 0;
  lastFrameTime = timestamp;

  var game = gameInstance;

  if (!game.isPaused && !game.isDead) {
    tickAccumulator += delta;
    var interval = 1000 / game.currentFps();
    if (tickAccumulator >= interval) {
      tickAccumulator -= interval;
      if (tickAccumulator > interval) tickAccumulator = 0; // don't spiral
      game.update();
    }
  }

  game.draw();

  if (
    game.isDead &&
    performance.now() - game.death.startTime >= DEATH_DURATION
  ) {
    game.finish();
  }
}

// Input (all handlers are bound once, from initialize())
function steer(dx, dy) {
  if (!gameInstance || !isGameRunning || gameInstance.isPaused) return;
  if (gameInstance.isDead) return;
  gameInstance.snake.queueDirection(dx, dy);
}

function handleKeyDown(e) {
  var tag = e.target && e.target.tagName;
  var isTyping = tag === "INPUT" || tag === "TEXTAREA";

  if (e.key === "Escape") {
    if (isVisible(instructionsPopup)) {
      toggleInstructions(false);
    } else if (isMenuOpen()) {
      closeMenu();
    } else if (isVisible(nameModal)) {
      if (playerName) hideNameModal();
    } else if (isGameRunning) {
      togglePause();
    }
    return;
  }

  if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

  if (isVisible(gameOverModal)) {
    if (e.code === "KeyR") restartGame();
    return;
  }

  if (!isGameRunning || !gameInstance || isAnyDialogOpen()) return;

  if (e.code === "Space" || e.code === "KeyP") {
    e.preventDefault();
    // a focused button would otherwise also "click" on Space
    if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
    togglePause();
    return;
  }

  var dir = KEY_MAP[e.code];
  if (!dir) return;
  e.preventDefault(); // stop arrow keys from scrolling the page
  steer(dir[0], dir[1]);
}

function bindInputs() {
  // Keyboard
  doc.addEventListener("keydown", handleKeyDown);

  // Name input: Enter saves
  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      savePlayerName();
    }
  });

  // Swipe (responds while moving the finger, not only on release)
  var touchStart = null;

  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      var t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      if (!touchStart) return;
      var t = e.touches[0];
      var dx = t.clientX - touchStart.x;
      var dy = t.clientY - touchStart.y;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        steer(dx > 0 ? 1 : -1, 0);
      } else {
        steer(0, dy > 0 ? 1 : -1);
      }
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchend",
    function (e) {
      e.preventDefault();
      touchStart = null;
    },
    { passive: false },
  );

  // On-screen D-pad (reads data-dir instead of matching SVG path strings)
  doc.querySelectorAll(".control-btn").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      var dir = DIRECTIONS[btn.getAttribute("data-dir")];
      if (dir) steer(dir[0], dir[1]);
    });
  });

  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) pauseGame();
  });
}

window.addEventListener("load", function () {
  if (!doc.body.classList.contains("active")) {
    doc.body.classList.add("active");
  }
  initialize();
});

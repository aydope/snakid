"use strict";

// =============================================================================
// Global State
// =============================================================================
var doc = document;
var gameFps = 10;
var frameInterval = 1000 / gameFps;
var lastFrameTime = 0;
var animationFrameId = null;
var isGameRunning = false;
var gameInstance = null;
var playerName = localStorage.getItem("snakid_playerName") || "";
var gameSpeed = localStorage.getItem("snakid_speed") || "normal";

// =============================================================================
// Performance Monitoring
// =============================================================================
var fpsCounter = 0;
var fpsDisplay = 0;
var lastFpsUpdate = 0;
var pingDisplay = 0;

// =============================================================================
// DOM Elements
// =============================================================================
var canvas = doc.querySelector("canvas");
var ctx = canvas ? canvas.getContext("2d") : null;
var overlay = doc.getElementById("overlay");
var gameControls = doc.getElementById("gameControls");
var gameOverModal = doc.getElementById("gameOverModal");
var instructionsPopup = doc.getElementById("instructionsPopup");
var nameModal = doc.getElementById("nameModal");
var nameInput = doc.getElementById("nameInput");
var finalScore = doc.getElementById("finalScore");
var scoreDisplay = doc.getElementById("scoreDisplay");
var statsBar = doc.getElementById("statsBar");
var fpsValue = doc.getElementById("fpsValue");
var pingValue = doc.getElementById("pingValue");
var playerNameDisplay = doc.getElementById("playerNameDisplay");
var playerNameValue = doc.getElementById("playerNameValue");
var menuPlayerName = doc.getElementById("menuPlayerName");
var changeNameBtn = doc.getElementById("changeNameBtn");
var mobileControls = doc.getElementById("mobileControls");

// =============================================================================
// Speed Settings
// =============================================================================
var speedSettings = {
  slow: { fps: 7, label: "Slow" },
  normal: { fps: 10, label: "Normal" },
  fast: { fps: 15, label: "Fast" },
};

// =============================================================================
// Apple Image Preload
// =============================================================================
var appleImage = loadImage("src/assets/pic/texture/apple.png");

// =============================================================================
// Initialization
// =============================================================================
function initialize() {
  applyGameSpeed();
  updatePlayerNameUI();
  detectMobileDevice();

  if (!playerName) {
    setTimeout(function () {
      showNameModal();
    }, 500);
  }
}

// =============================================================================
// Player Name Functions
// =============================================================================
function showNameModal() {
  nameModal.classList.remove("hidden");
  nameModal.classList.add("flex");
  nameInput.value = playerName || "";
  setTimeout(function () {
    nameInput.focus();
  }, 100);
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
  localStorage.setItem("snakid_playerName", playerName);
  nameModal.classList.add("hidden");
  nameModal.classList.remove("flex");
  updatePlayerNameUI();

  if (!isGameRunning) {
    startGame();
  }
}

function updatePlayerNameUI() {
  if (playerName) {
    playerNameDisplay.classList.remove("hidden");
    if (playerNameValue) {
      playerNameValue.textContent = playerName;
    }
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
    showNameModal();
  } else {
    startGame();
  }
}

// =============================================================================
// Speed Functions
// =============================================================================
function applyGameSpeed() {
  var speed = speedSettings[gameSpeed];
  gameFps = speed.fps;
  frameInterval = 1000 / gameFps;

  var speedSlow = doc.getElementById("speedSlow");
  var speedNormal = doc.getElementById("speedNormal");
  var speedFast = doc.getElementById("speedFast");

  var buttons = [speedSlow, speedNormal, speedFast];

  buttons.forEach(function (btn) {
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
  gameSpeed = speed;
  localStorage.setItem("snakid_speed", speed);
  applyGameSpeed();
}

// =============================================================================
// Mobile Detection
// =============================================================================
function detectMobileDevice() {
  var isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  if (isMobile && mobileControls) {
    mobileControls.classList.remove("hidden");
  } else if (mobileControls) {
    mobileControls.classList.add("hidden");
  }
}

// =============================================================================
// Menu Functions
// =============================================================================
function toggleMenu() {
  var menu = doc.getElementById("sideMenu");
  var backdrop = doc.getElementById("menuBackdrop");
  var isOpen = !menu.classList.contains("translate-x-full");

  if (isOpen) {
    menu.classList.add("translate-x-full");
    backdrop.classList.add("hidden");
  } else {
    menu.classList.remove("translate-x-full");
    backdrop.classList.remove("hidden");
  }
}

// =============================================================================
// Image Loader
// =============================================================================
function loadImage(src) {
  var img = new Image();
  img.onerror = function () {
    console.warn("Failed to load image: " + src);
  };
  img.src = src;
  return img;
}

// =============================================================================
// Vector2 Class
// =============================================================================
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

// =============================================================================
// Snake Class
// =============================================================================
function Snake() {
  this.body = [new Vector2(5, 6), new Vector2(4, 6), new Vector2(3, 6)];
  this.direction = new Vector2(0, 0);
  this.shouldGrow = false;
  this.textures = this.loadTextures();
  this.crunchSound = new Audio("src/assets/sound/crunch.wav");
  this.crunchSound.volume = 0.3;
  this.deathSound = new Audio("src/assets/sound/crunch.wav");
  this.deathSound.volume = 0.5;
}

Snake.prototype.loadTextures = function () {
  var basePath = "src/assets/pic/texture/";
  var load = function (name) {
    return loadImage(basePath + name);
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
};

Snake.prototype.draw = function () {
  if (this.body.length === 0) return;

  this.updateHeadTexture();
  this.updateTailTexture();

  for (var i = 0; i < this.body.length; i++) {
    var segment = this.body[i];
    var x = segment.x * 40;
    var y = segment.y * 40;

    if (i === 0) {
      ctx.drawImage(this.headTexture, x, y);
      continue;
    }

    if (i === this.body.length - 1) {
      ctx.drawImage(this.tailTexture, x, y);
      continue;
    }

    this.drawBodySegment(i, x, y);
  }
};

Snake.prototype.drawBodySegment = function (index, x, y) {
  var prev = this.body[index + 1].subtract(this.body[index]);
  var next = this.body[index - 1].subtract(this.body[index]);
  var bodyTextures = this.textures.body;

  if (prev.x === next.x) {
    ctx.drawImage(bodyTextures.vertical, x, y);
    return;
  }

  if (prev.y === next.y) {
    ctx.drawImage(bodyTextures.horizontal, x, y);
    return;
  }

  var cornerType = this.getCornerType(prev, next);
  if (cornerType) {
    ctx.drawImage(bodyTextures[cornerType], x, y);
  }
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

Snake.prototype.updateHeadTexture = function () {
  if (this.body.length < 2) return;

  var direction = this.body[1].subtract(this.body[0]);
  var headTextures = this.textures.head;

  if (direction.equals(new Vector2(1, 0))) {
    this.headTexture = headTextures.left;
  } else if (direction.equals(new Vector2(-1, 0))) {
    this.headTexture = headTextures.right;
  } else if (direction.equals(new Vector2(0, 1))) {
    this.headTexture = headTextures.up;
  } else if (direction.equals(new Vector2(0, -1))) {
    this.headTexture = headTextures.down;
  }
};

Snake.prototype.updateTailTexture = function () {
  if (this.body.length < 2) return;

  var direction = this.body[this.body.length - 2].subtract(
    this.body[this.body.length - 1],
  );
  var tailTextures = this.textures.tail;

  if (direction.equals(new Vector2(1, 0))) {
    this.tailTexture = tailTextures.left;
  } else if (direction.equals(new Vector2(-1, 0))) {
    this.tailTexture = tailTextures.right;
  } else if (direction.equals(new Vector2(0, 1))) {
    this.tailTexture = tailTextures.up;
  } else if (direction.equals(new Vector2(0, -1))) {
    this.tailTexture = tailTextures.down;
  }
};

Snake.prototype.move = function () {
  if (this.direction.x === 0 && this.direction.y === 0) return;

  var newHead = this.body[0].add(this.direction);

  if (this.shouldGrow) {
    this.body = [newHead].concat(this.body);
  } else {
    this.body = [newHead].concat(this.body.slice(0, -1));
  }

  this.shouldGrow = false;
};

Snake.prototype.grow = function () {
  this.shouldGrow = true;
};

Snake.prototype.playCrunchSound = function () {
  this.crunchSound.currentTime = 0;
  this.crunchSound.play().catch(function () {});
};

Snake.prototype.playDeathSound = function () {
  this.deathSound.currentTime = 0;
  this.deathSound.play().catch(function () {});
};

Snake.prototype.reset = function () {
  this.body = [new Vector2(5, 6), new Vector2(4, 6), new Vector2(3, 6)];
  this.direction = new Vector2(0, 0);
  this.shouldGrow = false;
};

// =============================================================================
// Fruit Class
// =============================================================================
function Fruit(snakeBody) {
  this.position = null;
  this.randomizePosition(snakeBody || []);
}

Fruit.prototype.draw = function () {
  var x = this.position.x * 40;
  var y = this.position.y * 40;
  ctx.drawImage(appleImage, x, y);
};

Fruit.prototype.randomizePosition = function (snakeBody) {
  var self = this;
  do {
    self.position = new Vector2(
      Math.floor(Math.random() * 20),
      Math.floor(Math.random() * 12),
    );
  } while (
    snakeBody.some(function (segment) {
      return segment.equals(self.position);
    })
  );
};

// =============================================================================
// Game Class
// =============================================================================
function Game() {
  this.snake = new Snake();
  this.fruit = new Fruit(this.snake.body);
  this.score = 0;
  this.deathAnimation = null;
  this.isDead = false;
}

Game.prototype.update = function () {
  if (this.isDead) return;
  this.snake.move();
  this.checkFruitCollision();
  this.checkGameOver();
};

Game.prototype.draw = function () {
  this.drawBackground();
  this.fruit.draw();
  this.snake.draw();

  if (this.isDead) {
    this.drawDeathEffect();
  }

  this.updateScoreDisplay();
};

Game.prototype.checkFruitCollision = function () {
  if (this.fruit.position.equals(this.snake.body[0])) {
    this.fruit.randomizePosition(this.snake.body);
    this.snake.grow();
    this.snake.playCrunchSound();
    this.score = this.snake.body.length - 3;
  }

  for (var i = 1; i < this.snake.body.length; i++) {
    if (this.snake.body[i].equals(this.fruit.position)) {
      this.fruit.randomizePosition(this.snake.body);
    }
  }
};

Game.prototype.checkGameOver = function () {
  var head = this.snake.body[0];
  var hitWall = head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 12;

  var hitSelf = false;
  for (var i = 1; i < this.snake.body.length; i++) {
    if (this.snake.body[i].equals(head)) {
      hitSelf = true;
      break;
    }
  }

  if (hitWall || hitSelf) {
    this.triggerDeath();
  }
};

Game.prototype.triggerDeath = function () {
  this.isDead = true;
  this.snake.playDeathSound();

  this.deathAnimation = {
    startTime: performance.now(),
    duration: 800,
    headPos: {
      x: this.snake.body[0].x,
      y: this.snake.body[0].y,
    },
  };

  var self = this;
  setTimeout(function () {
    self.showGameOver();
  }, 800);
};

Game.prototype.drawDeathEffect = function () {
  if (!this.deathAnimation) return;

  var elapsed = performance.now() - this.deathAnimation.startTime;
  var progress = Math.min(elapsed / this.deathAnimation.duration, 1);

  // Screen shake
  var shakeX = Math.sin(elapsed * 0.05) * (10 * (1 - progress));
  var shakeY = Math.cos(elapsed * 0.07) * (8 * (1 - progress));

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Red flash overlay
  ctx.fillStyle = "rgba(255, 0, 0, " + 0.3 * (1 - progress) + ")";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Death particles
  var headX = this.deathAnimation.headPos.x * 40 + 20;
  var headY = this.deathAnimation.headPos.y * 40 + 20;

  for (var i = 0; i < 8; i++) {
    var angle = (i / 8) * Math.PI * 2;
    var distance = progress * 80;
    var particleX = headX + Math.cos(angle) * distance;
    var particleY = headY + Math.sin(angle) * distance;
    var alpha = 1 - progress;

    ctx.fillStyle = "rgba(255, " + (100 + i * 20) + ", 0, " + alpha + ")";
    ctx.beginPath();
    ctx.arc(particleX, particleY, 4 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

Game.prototype.showGameOver = function () {
  isGameRunning = false;
  this.isDead = false;
  this.deathAnimation = null;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  finalScore.textContent = this.score;
  statsBar.classList.add("hidden");
  gameOverModal.classList.remove("hidden");
  gameOverModal.classList.add("flex");

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

Game.prototype.reset = function () {
  this.snake.reset();
  this.fruit.randomizePosition(this.snake.body);
  this.score = 0;
  this.isDead = false;
  this.deathAnimation = null;
};

Game.prototype.drawBackground = function () {
  var darkGreen = "rgb(167, 209, 61)";
  var lightGreen = "rgb(175, 215, 70)";

  for (var row = 0; row < 12; row++) {
    for (var col = 0; col < 20; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? lightGreen : darkGreen;
      ctx.fillRect(col * 40, row * 40, 40, 40);
    }
  }
};

Game.prototype.updateScoreDisplay = function () {
  this.score = this.snake.body.length - 3;
  if (scoreDisplay) {
    scoreDisplay.textContent = this.score;
  }
};

// =============================================================================
// Start Game
// =============================================================================
function startGame() {
  overlay.classList.add("hidden");
  gameControls.classList.remove("hidden");
  gameOverModal.classList.add("hidden");
  gameOverModal.classList.remove("flex");
  statsBar.classList.remove("hidden");
  isGameRunning = true;

  canvas.width = 20 * 40;
  canvas.height = 12 * 40;

  gameInstance = new Game();

  // Bind input handlers
  bindTouchControls();
  bindButtonControls();
  bindKeyboardControls();

  // Start ping measurement
  setInterval(measurePing, 1000);

  // Cancel previous animation frame if exists
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  lastFrameTime = 0;
  fpsCounter = 0;
  fpsDisplay = 0;
  lastFpsUpdate = 0;

  animationFrameId = requestAnimationFrame(gameLoop);
}

// =============================================================================
// Input Handlers
// =============================================================================
var touchStart = { x: 0, y: 0 };

function bindTouchControls() {
  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      touchStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    { passive: false },
  );

  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    var touch = e.changedTouches[0];
    var deltaX = touch.clientX - touchStart.x;
    var deltaY = touch.clientY - touchStart.y;
    var threshold = 30;

    if (!gameInstance) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > threshold && gameInstance.snake.direction.x !== -1) {
        gameInstance.snake.direction = new Vector2(1, 0);
      } else if (deltaX < -threshold && gameInstance.snake.direction.x !== 1) {
        gameInstance.snake.direction = new Vector2(-1, 0);
      }
    } else {
      if (deltaY > threshold && gameInstance.snake.direction.y !== -1) {
        gameInstance.snake.direction = new Vector2(0, 1);
      } else if (deltaY < -threshold && gameInstance.snake.direction.y !== 1) {
        gameInstance.snake.direction = new Vector2(0, -1);
      }
    }
  });
}

function bindButtonControls() {
  var buttons = doc.querySelectorAll(".control-btn");

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!gameInstance) return;

      var svgPath = btn.querySelector("svg path");
      if (!svgPath) return;

      var pathData = svgPath.getAttribute("d") || "";
      var direction = gameInstance.snake.direction;

      if (pathData.indexOf("M12 19V5") !== -1) {
        // Up button
        if (direction.y !== 1)
          gameInstance.snake.direction = new Vector2(0, -1);
      } else if (pathData.indexOf("M12 5v14") !== -1) {
        // Down button
        if (direction.y !== -1)
          gameInstance.snake.direction = new Vector2(0, 1);
      } else if (pathData.indexOf("M15 19l-7-7") !== -1) {
        // Left button
        if (direction.x !== 1)
          gameInstance.snake.direction = new Vector2(-1, 0);
      } else if (pathData.indexOf("M9 5l7 7") !== -1) {
        // Right button
        if (direction.x !== -1)
          gameInstance.snake.direction = new Vector2(1, 0);
      }
    });
  });
}

function bindKeyboardControls() {
  doc.addEventListener("keydown", function (e) {
    if (!gameInstance) return;

    var direction = gameInstance.snake.direction;
    var newDirection = null;

    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        if (direction.y !== 1) newDirection = new Vector2(0, -1);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        if (direction.y !== -1) newDirection = new Vector2(0, 1);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        if (direction.x !== 1) newDirection = new Vector2(-1, 0);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        if (direction.x !== -1) newDirection = new Vector2(1, 0);
        break;
    }

    if (newDirection) {
      // Prevent page scrolling for arrow keys
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) !==
        -1
      ) {
        e.preventDefault();
      }
      gameInstance.snake.direction = newDirection;
    }
  });
}

// =============================================================================
// Ping Measurement
// =============================================================================
function measurePing() {
  var startTime = performance.now();
  requestAnimationFrame(function () {
    pingDisplay = Math.round(performance.now() - startTime);
    if (pingValue) {
      pingValue.textContent = pingDisplay;
    }
  });
}

// =============================================================================
// Game Loop
// =============================================================================
function gameLoop(timestamp) {
  if (!isGameRunning) return;

  // Update FPS counter
  fpsCounter++;
  if (timestamp - lastFpsUpdate >= 1000) {
    fpsDisplay = fpsCounter;
    fpsCounter = 0;
    lastFpsUpdate = timestamp;
    if (fpsValue) {
      fpsValue.textContent = fpsDisplay;
    }
  }

  if (timestamp - lastFrameTime >= frameInterval) {
    gameInstance.update();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameInstance.draw();
    lastFrameTime = timestamp;
  }

  animationFrameId = requestAnimationFrame(gameLoop);
}

// =============================================================================
// Stop Game
// =============================================================================
function stopGame() {
  isGameRunning = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  overlay.classList.remove("hidden");
  gameControls.classList.add("hidden");
  statsBar.classList.add("hidden");
}

// =============================================================================
// Restart Game
// =============================================================================
function restartGame() {
  gameOverModal.classList.add("hidden");
  gameOverModal.classList.remove("flex");
  stopGame();
  setTimeout(function () {
    startGame();
  }, 100);
}

// =============================================================================
// Go to Home
// =============================================================================
function goToHome() {
  gameOverModal.classList.add("hidden");
  gameOverModal.classList.remove("flex");
  stopGame();
}

// =============================================================================
// Toggle Instructions
// =============================================================================
function toggleInstructions(show) {
  if (show) {
    instructionsPopup.classList.remove("hidden");
    instructionsPopup.classList.add("flex");
  } else {
    instructionsPopup.classList.add("hidden");
    instructionsPopup.classList.remove("flex");
  }
}

// =============================================================================
// Page Load Handler
// =============================================================================
window.addEventListener("load", function () {
  if (!doc.body.classList.contains("active")) {
    doc.body.classList.add("active");
  }
  initialize();
});

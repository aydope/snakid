"use strict";

// === Global Constants ===
const $ = document;
const FPS = 10;
const FRAME_INTERVAL = 1000 / FPS;
let lastFrameTime = 0;

// === DOM Elements ===
const canvas = $.querySelector("canvas");
const ctx = canvas?.getContext("2d");
const overlay = $.getElementById("overlay");
const startButton = $.getElementById("startBtn");
const gameControls = $.getElementById("gameControls");
const instructionsPopup = $.getElementById("instructionsPopup");

// === Game Config ===
const startGame = () => {
  overlay.classList.add("hidden");
  gameControls.classList.remove("hidden");

  // === Game Config ===
  const CELL_SIZE = 40;
  const GRID_SIZE = 20;
  const appleImage = loadImage("src/assets/pic/texture/apple.png");

  // 🧩 Utility Class: Vector2
  class Vector2 {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    add(vector) {
      return new Vector2(this.x + vector.x, this.y + vector.y);
    }
    subtract(vector) {
      return new Vector2(this.x - vector.x, this.y - vector.y);
    }
    equals(vector) {
      return this.x === vector.x && this.y === vector.y;
    }
  }

  // 🐍 Class: Snake
  class Snake {
    constructor() {
      this.body = [new Vector2(5, 10), new Vector2(4, 10), new Vector2(3, 10)];
      this.direction = new Vector2(0, 0);
      this.shouldGrow = false;

      this.textures = this.loadTextures();
      this.crunchSound = new Audio("src/assets/sound/crunch.wav");
    }

    loadTextures() {
      const basePath = "src/assets/pic/texture/";
      const load = (name) => loadImage(`${basePath}${name}`);

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

    draw() {
      this.updateHeadTexture();
      this.updateTailTexture();

      this.body.forEach((segment, i) => {
        const x = segment.x * CELL_SIZE;
        const y = segment.y * CELL_SIZE;

        if (i === 0) return ctx.drawImage(this.headTexture, x, y);
        if (i === this.body.length - 1)
          return ctx.drawImage(this.tailTexture, x, y);

        this.drawBodySegment(i, x, y);
      });
    }

    drawBodySegment(index, x, y) {
      const prev = this.body[index + 1].subtract(this.body[index]);
      const next = this.body[index - 1].subtract(this.body[index]);
      const { body } = this.textures;

      if (prev.x === next.x) return ctx.drawImage(body.vertical, x, y);
      if (prev.y === next.y) return ctx.drawImage(body.horizontal, x, y);

      const corner = this.getCornerType(prev, next);
      if (corner) ctx.drawImage(body[corner], x, y);
    }

    getCornerType(prev, next) {
      const { x: px, y: py } = prev;
      const { x: nx, y: ny } = next;

      if ((px === -1 && ny === -1) || (py === -1 && nx === -1)) return "tl";
      if ((px === -1 && ny === 1) || (py === 1 && nx === -1)) return "bl";
      if ((px === 1 && ny === -1) || (py === -1 && nx === 1)) return "tr";
      if ((px === 1 && ny === 1) || (py === 1 && nx === 1)) return "br";
      return null;
    }

    updateHeadTexture() {
      const direction = this.body[1].subtract(this.body[0]);
      const { head } = this.textures;

      if (direction.equals(new Vector2(1, 0))) this.headTexture = head.left;
      else if (direction.equals(new Vector2(-1, 0)))
        this.headTexture = head.right;
      else if (direction.equals(new Vector2(0, 1))) this.headTexture = head.up;
      else if (direction.equals(new Vector2(0, -1)))
        this.headTexture = head.down;
    }

    updateTailTexture() {
      const direction = this.body.at(-2).subtract(this.body.at(-1));
      const { tail } = this.textures;

      if (direction.equals(new Vector2(1, 0))) this.tailTexture = tail.left;
      else if (direction.equals(new Vector2(-1, 0)))
        this.tailTexture = tail.right;
      else if (direction.equals(new Vector2(0, 1))) this.tailTexture = tail.up;
      else if (direction.equals(new Vector2(0, -1)))
        this.tailTexture = tail.down;
    }

    move() {
      const newHead = this.body[0].add(this.direction);
      this.body = this.shouldGrow
        ? [newHead, ...this.body]
        : [newHead, ...this.body.slice(0, -1)];
      this.shouldGrow = false;
    }

    grow() {
      this.shouldGrow = true;
    }

    playCrunch() {
      this.crunchSound.play();
    }

    reset() {
      this.body = [new Vector2(5, 10), new Vector2(4, 10), new Vector2(3, 10)];
      this.direction = new Vector2(0, 0);
    }
  }

  // 🍎 Class: Fruit
  class Fruit {
    constructor() {
      this.randomizePosition();
    }

    draw() {
      const x = this.position.x * CELL_SIZE;
      const y = this.position.y * CELL_SIZE;
      ctx.drawImage(appleImage, x, y);
    }

    randomizePosition() {
      const randomCoord = (max) =>
        Math.min(8, Math.max(0, Math.floor(Math.random() * max)));
      this.position = new Vector2(
        randomCoord(GRID_SIZE),
        randomCoord(GRID_SIZE)
      );
    }
  }

  // 🕹️ Class: Game
  class Game {
    constructor() {
      this.snake = new Snake();
      this.fruit = new Fruit();
    }

    update() {
      this.snake.move();
      this.checkFruitCollision();
      this.checkGameOver();
    }

    draw() {
      this.drawBackground();
      this.fruit.draw();
      this.snake.draw();
      this.drawScore();
    }

    checkFruitCollision() {
      if (this.fruit.position.equals(this.snake.body[0])) {
        this.fruit.randomizePosition();
        this.snake.grow();
        this.snake.playCrunch();
      }

      this.snake.body.slice(1).forEach((segment) => {
        if (segment.equals(this.fruit.position)) this.fruit.randomizePosition();
      });
    }

    checkGameOver() {
      const head = this.snake.body[0];
      const hitWall = head.x < 0 || head.x > 17 || head.y < 0 || head.y > 11;
      const hitSelf = this.snake.body
        .slice(1)
        .some((segment) => segment.equals(head));

      if (hitWall || hitSelf) this.reset();
    }

    reset() {
      this.snake.reset();
    }

    drawBackground() {
      const grassColor = "rgb(167, 209, 61)";
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if ((row + col) % 2 === 0) {
            ctx.fillStyle = grassColor;
            ctx.fillRect(
              col * CELL_SIZE,
              row * CELL_SIZE,
              CELL_SIZE,
              CELL_SIZE
            );
          }
        }
      }
    }

    drawScore() {
      const score = this.snake.body.length - 3;
      ctx.font = "25px PoetsenOne";
      ctx.fillStyle = "rgb(56, 74, 12)";
      ctx.fillText(score, canvas.width - 35, 35);
    }
  }

  // 📱 Input Handlers
  const game = new Game();
  let touchStart = { x: 0, y: 0 };

  $.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  });

  $.addEventListener("touchend", (e) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 50 && game.snake.direction.x !== -1)
        game.snake.direction = new Vector2(1, 0);
      else if (deltaX < -50 && game.snake.direction.x !== 1)
        game.snake.direction = new Vector2(-1, 0);
    } else {
      if (deltaY > 50 && game.snake.direction.y !== -1)
        game.snake.direction = new Vector2(0, 1);
      else if (deltaY < -50 && game.snake.direction.y !== 1)
        game.snake.direction = new Vector2(0, -1);
    }
  });

  $.addEventListener("keydown", ({ key }) => {
    const { direction } = game.snake;
    const controls = {
      ArrowUp: new Vector2(0, -1),
      ArrowRight: new Vector2(1, 0),
      ArrowDown: new Vector2(0, 1),
      ArrowLeft: new Vector2(-1, 0),
    };

    const newDir = controls[key];
    if (!newDir) return;

    if (
      (key === "ArrowUp" && direction.y !== 1) ||
      (key === "ArrowDown" && direction.y !== -1) ||
      (key === "ArrowLeft" && direction.x !== 1) ||
      (key === "ArrowRight" && direction.x !== -1)
    ) {
      game.snake.direction = newDir;
    }
  });

  // 🔁 Game Loop
  const loop = (timestamp) => {
    if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
      game.update();
      ctx.fillStyle = "rgb(175, 215, 70)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.draw();
      lastFrameTime = timestamp;
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};

// 🧭 Helper Functions

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function stopGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  overlay.classList.remove("hidden");
  gameControls.classList.add("hidden");
}

function toggleInstructions(show) {
  instructionsPopup.classList.toggle("hidden", !show);
}

// ⏳ Loader
window.addEventListener("load", () => {
  !$.body.classList.contains("active") ? $.body.classList.add("active") : null;
});

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "running" | "gameover";

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  speed: number;
}

interface Obstacle {
  x: number;
  y: number;
  radius: number;
  velocity: number;
  drift: number;
  hue: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
}

interface UIState {
  phase: Phase;
  score: number;
  best: number;
  level: number;
  lives: number;
}

interface GameRuntime {
  phase: Phase;
  ctx: CanvasRenderingContext2D;
  player: Player;
  obstacles: Obstacle[];
  particles: Particle[];
  keys: Record<string, boolean>;
  score: number;
  best: number;
  level: number;
  lives: number;
  lastSpawn: number;
  spawnInterval: number;
  lastTime: number;
  lastUiUpdate: number;
  invulnerableFor: number;
}

const WIDTH = 720;
const HEIGHT = 480;
const MAX_PARTICLES = 120;
const INITIAL_LIVES = 3;

const KEY_MAP: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  a: "left",
  d: "right",
  A: "left",
  D: "right",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createStarField(): Particle[] {
  const stars: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: 0,
      vy: 20 + Math.random() * 60,
      life: Math.random(),
      ttl: 1 + Math.random() * 2,
    });
  }
  return stars;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const loopRef = useRef<number | null>(null);
  const bestScoreRef = useRef(0);
  const [ui, setUi] = useState<UIState>({
    phase: "idle",
    score: 0,
    best: 0,
    level: 1,
    lives: INITIAL_LIVES,
  });

  const stopLoop = useCallback(() => {
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const endGame = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.phase = "gameover";
    stopLoop();
    bestScoreRef.current = Math.max(bestScoreRef.current, Math.floor(runtime.score));
    setUi({
      phase: "gameover",
      score: Math.floor(runtime.score),
      best: bestScoreRef.current,
      level: runtime.level,
      lives: 0,
    });
  }, [stopLoop]);

  const loop = useCallback(
    (timestamp: number) => {
      const runtime = runtimeRef.current;
      if (!runtime || runtime.phase !== "running") {
        return;
      }

      const delta = (timestamp - runtime.lastTime) / 1000;
      runtime.lastTime = timestamp;

      const ctx = runtime.ctx;
      const player = runtime.player;

      // Update inputs
      const movingLeft = runtime.keys.left ?? false;
      const movingRight = runtime.keys.right ?? false;
      if (movingLeft && !movingRight) {
        player.vx = clamp(player.vx - player.speed * delta * 2.5, -player.speed, player.speed);
      } else if (movingRight && !movingLeft) {
        player.vx = clamp(player.vx + player.speed * delta * 2.5, -player.speed, player.speed);
      } else {
        player.vx *= 0.85;
        if (Math.abs(player.vx) < 2) player.vx = 0;
      }

      player.x = clamp(player.x + player.vx * delta, 32, WIDTH - 32 - player.width);

      // Spawn new hazards
      runtime.lastSpawn += delta;
      const targetInterval = Math.max(0.35, 1.15 - runtime.level * 0.08);
      runtime.spawnInterval = targetInterval;
      if (runtime.lastSpawn >= runtime.spawnInterval) {
        runtime.lastSpawn = 0;
        runtime.obstacles.push({
          x: 48 + Math.random() * (WIDTH - 96),
          y: -30,
          radius: 18 + Math.random() * 18,
          velocity: 180 + runtime.level * 40 + Math.random() * (runtime.level * 20),
          drift: (Math.random() - 0.5) * (60 + runtime.level * 10),
          hue: 210 + Math.random() * 120,
        });
      }

      // Update hazards
      runtime.obstacles = runtime.obstacles.filter((obs) => {
        obs.y += obs.velocity * delta;
        obs.x += obs.drift * delta;
        return obs.y - obs.radius <= HEIGHT + 60;
      });

      // Collision detection
      if (runtime.invulnerableFor > 0) {
        runtime.invulnerableFor = Math.max(0, runtime.invulnerableFor - delta);
      } else {
        for (const obs of runtime.obstacles) {
          const closestX = clamp(obs.x, player.x, player.x + player.width);
          const closestY = clamp(obs.y, player.y, player.y + player.height);
          const dx = obs.x - closestX;
          const dy = obs.y - closestY;
          if (dx * dx + dy * dy <= obs.radius * obs.radius) {
            runtime.lives -= 1;
            runtime.invulnerableFor = 1.25;
            if (runtime.lives <= 0) {
              endGame();
              break;
            }
          }
        }
      }

      if (runtime.phase !== "running") {
        return;
      }

      // Update score & difficulty
      runtime.score += delta * (12 + runtime.level * 4);
      runtime.level = Math.min(12, 1 + Math.floor(runtime.score / 40));

      // Update star particles
      runtime.particles.forEach((star) => {
        star.y += star.vy * delta;
        star.life += delta;
        if (star.y > HEIGHT) {
          star.y = -Math.random() * 40;
          star.x = Math.random() * WIDTH;
          star.life = Math.random();
        }
      });

      // Render
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "rgba(18, 28, 65, 0.95)");
      gradient.addColorStop(1, "rgba(4, 7, 19, 0.95)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      runtime.particles.forEach((star) => {
        ctx.globalAlpha = 0.3 + 0.4 * Math.sin((star.life / star.ttl) * Math.PI);
        ctx.fillStyle = "#7fa9ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, 1.8 + (star.life % 0.3), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      runtime.obstacles.forEach((obs) => {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        ctx.rotate(((obs.y + timestamp) / 300) % (Math.PI * 2));
        const glow = ctx.createRadialGradient(0, 0, obs.radius * 0.3, 0, 0, obs.radius);
        glow.addColorStop(0, `rgba(${obs.hue - 40}, ${obs.hue - 80}, 255, 0.9)`);
        glow.addColorStop(1, "rgba(15, 22, 42, 0.05)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
      ctx.rotate(player.vx / player.speed * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, -player.height / 2);
      ctx.lineTo(player.width / 2, player.height / 2);
      ctx.lineTo(-player.width / 2, player.height / 2);
      ctx.closePath();
      ctx.fillStyle = runtime.invulnerableFor > 0 ? "rgba(219, 239, 255, 0.92)" : "#79b7ff";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#9ae9ff";
      ctx.beginPath();
      ctx.ellipse(
        player.x + player.width / 2,
        HEIGHT - 18,
        40 + Math.abs(player.vx) * 0.09,
        12,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      if (timestamp - runtime.lastUiUpdate >= 120) {
        runtime.lastUiUpdate = timestamp;
        setUi({
          phase: "running",
          score: Math.floor(runtime.score),
          best: Math.max(bestScoreRef.current, Math.floor(runtime.score)),
          level: runtime.level,
          lives: runtime.lives,
        });
      }

      loopRef.current = requestAnimationFrame(loop);
    },
    [endGame]
  );

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    stopLoop();

    const player: Player = {
      x: WIDTH / 2 - 24,
      y: HEIGHT - 120,
      width: 48,
      height: 56,
      vx: 0,
      speed: 420,
    };

    const runtime: GameRuntime = {
      phase: "running",
      ctx,
      player,
      obstacles: [],
      particles: createStarField(),
      keys: {},
      score: 0,
      best: bestScoreRef.current,
      level: 1,
      lives: INITIAL_LIVES,
      lastSpawn: 0,
      spawnInterval: 1,
      lastTime: performance.now(),
      lastUiUpdate: 0,
      invulnerableFor: 0,
    };

    runtimeRef.current = runtime;
    setUi({
      phase: "running",
      score: 0,
      best: bestScoreRef.current,
      level: 1,
      lives: INITIAL_LIVES,
    });

    loopRef.current = requestAnimationFrame(loop);
  }, [loop, stopLoop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.key];
      if (action) {
        runtimeRef.current?.keys && (runtimeRef.current.keys[action] = true);
        event.preventDefault();
      }

      if (event.key === " " || event.key === "Spacebar") {
        const runtime = runtimeRef.current;
        if (!runtime || runtime.phase !== "running") {
          startGame();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.key];
      if (action && runtimeRef.current?.keys) {
        runtimeRef.current.keys[action] = false;
        event.preventDefault();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      const runtime = runtimeRef.current;
      if (!canvas || !runtime || runtime.phase !== "running") return;
      const rect = canvas.getBoundingClientRect();
      const normalized = ((event.clientX - rect.left) / rect.width) * WIDTH;
      runtime.player.x = clamp(normalized - runtime.player.width / 2, 32, WIDTH - 32 - runtime.player.width);
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointermove", handlePointerMove);
      stopLoop();
    };
  }, [startGame, stopLoop]);

  return (
    <div className="card">
      <div className="status-row">
        <div>
          <h1>Nebula&nbsp;Dash</h1>
          <p>Surf the cosmic tide, dodge plasma storms, and chase a new personal record.</p>
        </div>
        <div className="status-value">{ui.score.toString().padStart(4, "0")}</div>
      </div>

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
        {ui.phase !== "running" && (
          <div className="overlay">
            {ui.phase === "idle" ? (
              <>
                <h2>Press Space to Launch</h2>
                <p>Use ← → or drag to steer. Survive as long as you can.</p>
                <button type="button" onClick={startGame}>
                  Begin Run
                </button>
              </>
            ) : (
              <>
                <h2>Run Terminated</h2>
                <p>Score: {ui.score} · Best: {Math.max(ui.best, ui.score)}</p>
                <button type="button" onClick={startGame}>
                  Retry
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Mission Status</div>
        <div className="status-row">
          <div>
            <div className="section-title">Level</div>
            <div className="status-value">{ui.level}</div>
          </div>
          <div>
            <div className="section-title">Lives</div>
            <div className="status-value">{"❤".repeat(Math.max(ui.lives, 0)) || "—"}</div>
          </div>
          <div>
            <div className="section-title">Best</div>
            <div className="status-value">{ui.best.toString().padStart(4, "0")}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Flight Controls</div>
        <div className="controls-grid">
          <span>
            <span className="keycap">←</span>
            <span className="keycap">→</span>
            Steer starship
          </span>
          <span>
            <span className="keycap">A</span>
            <span className="keycap">D</span>
            Alternative keys
          </span>
          <span>
            <span className="keycap">Space</span>
            Launch / retry
          </span>
          <span>Pointer / touch to glide directly</span>
        </div>
      </div>
    </div>
  );
}

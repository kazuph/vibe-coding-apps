import type { ControlSource, ControlState } from '../control/types'
import { cloneControlState } from '../control/types'
import { EnemyManager } from './enemies'
import { Hud } from './hud'
import { MAX_FUEL, PlayerController } from './player'
import { WeaponSystem } from './weapon'
import { GameWorld } from './world'

export interface DebugState {
  running: boolean
  gameOver: boolean
  score: number
  kills: number
  enemyCount: number
  enemyShotsFired: number
  shotsFired: number
  hits: number
  damageFlash: number
  player: {
    position: { x: number; y: number; z: number }
    velocityY: number
    yaw: number
    pitch: number
    fuel: number
  }
  control: ControlState
}

export interface DebugGameApi {
  debugState(): DebugState
  restart(): void
  dispose(): void
}

interface ResettableSource extends ControlSource {
  resetTimeline(): void
}

const FIXED_DT = 1 / 60
const MAX_FRAME_DT = 0.25

export class GameLoop {
  private readonly world: GameWorld
  private readonly player = new PlayerController()
  private readonly enemies: EnemyManager
  private readonly weapon = new WeaponSystem()
  private readonly hud: Hud
  private running = false
  private gameOver = false
  private score = 0
  private damageFlash = 0
  private accumulator = 0
  private lastTime = performance.now()
  private elapsed = 0
  private control = cloneControlState()
  private animationId = 0

  constructor(
    container: HTMLElement,
    private readonly source: ControlSource,
  ) {
    this.world = new GameWorld(container)
    this.enemies = new EnemyManager(this.world.scene)
    this.hud = new Hud(container, () => this.restart())
  }

  async start(): Promise<void> {
    await this.source.start()
    this.running = true
    this.lastTime = performance.now()
    window.__game = {
      debugState: () => this.debugState(),
      restart: () => this.restart(),
      dispose: () => this.dispose(),
    }
    this.animationId = requestAnimationFrame(this.frame)
  }

  restart(): void {
    if (hasResetTimeline(this.source)) this.source.resetTimeline()
    this.player.reset()
    this.enemies.reset()
    this.weapon.reset()
    this.score = 0
    this.damageFlash = 0
    this.elapsed = 0
    this.accumulator = 0
    this.gameOver = false
  }

  showControlsBriefly(): void {
    this.hud.showControlsBriefly()
  }

  debugState(): DebugState {
    return {
      running: this.running,
      gameOver: this.gameOver,
      score: this.score,
      kills: this.enemies.kills,
      enemyCount: this.enemies.aliveCount(),
      enemyShotsFired: this.enemies.shotsFired,
      shotsFired: this.weapon.shotsFired,
      hits: this.weapon.hits,
      damageFlash: this.damageFlash,
      player: {
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
        },
        velocityY: this.player.velocity.y,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        fuel: this.player.fuel,
      },
      control: cloneControlState(this.control),
    }
  }

  dispose(): void {
    this.running = false
    cancelAnimationFrame(this.animationId)
    this.source.dispose()
    this.hud.dispose()
    this.world.dispose()
    delete window.__game
  }

  private frame = (time: number): void => {
    if (!this.running) return
    const dt = Math.min(MAX_FRAME_DT, (time - this.lastTime) / 1000)
    this.lastTime = time
    this.accumulator += dt

    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT)
      this.accumulator -= FIXED_DT
    }

    this.world.update(dt, this.elapsed, this.player, this.control)
    this.hud.update(this.debugState(), this.control)
    this.world.render()
    this.animationId = requestAnimationFrame(this.frame)
  }

  private step(dt: number): void {
    this.elapsed += dt
    this.control = this.source.latest()
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8)

    if (!this.gameOver) {
      this.player.update(this.control, dt, this.world.city.colliders)
      this.weapon.update(dt, this.control, this.player, this.world, this.enemies, () => {
        this.score += 100
      })
      this.enemies.update(dt, this.elapsed, this.player.position)
    } else if (this.control.fire) {
      this.restart()
    }

    if (this.player.fuel > MAX_FUEL) this.player.fuel = MAX_FUEL
  }
}

function hasResetTimeline(source: ControlSource): source is ResettableSource {
  return typeof (source as Partial<ResettableSource>).resetTimeline === 'function'
}

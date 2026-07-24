import * as THREE from 'three'
import type { ControlState } from '../control/types'
import type { EnemyManager } from './enemies'
import type { GameWorld } from './world'
import type { PlayerController } from './player'

const FIRE_INTERVAL = 1 / 8
const AIM_CONE = 18 * Math.PI / 180

interface Tracer {
  line: THREE.Line
  ttl: number
}

export class WeaponSystem {
  private cooldown = 0
  private tracers: Tracer[] = []
  shotsFired = 0
  hits = 0

  reset(): void {
    this.cooldown = 0
    this.shotsFired = 0
    this.hits = 0
    for (const tracer of this.tracers) tracer.line.removeFromParent()
    this.tracers = []
  }

  update(
    dt: number,
    control: ControlState,
    player: PlayerController,
    world: GameWorld,
    enemies: EnemyManager,
    onKillScore: () => void,
  ): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (control.fire && this.cooldown === 0) {
      this.cooldown = FIRE_INTERVAL
      this.fire(control, player, world, enemies, onKillScore)
    }

    this.tracers = this.tracers.filter((tracer) => {
      tracer.ttl -= dt
      const material = tracer.line.material as THREE.LineBasicMaterial
      material.opacity = Math.max(0, tracer.ttl / 0.12)
      if (tracer.ttl <= 0) {
        tracer.line.removeFromParent()
        return false
      }
      return true
    })
  }

  private fire(
    control: ControlState,
    player: PlayerController,
    world: GameWorld,
    enemies: EnemyManager,
    onKillScore: () => void,
  ): void {
    this.shotsFired += 1
    world.weapon.onFire()

    const origin = player.position.clone()
    const direction = aimDirection(player, control.aim)
    const ray = new THREE.Ray(origin, direction)
    const beforeKills = enemies.kills
    const hit = enemies.hit(ray)
    if (hit) this.hits += 1
    if (enemies.kills > beforeKills) onKillScore()
    this.addTracer(world.scene, origin, direction, hit ? 24 : 42)
  }

  private addTracer(scene: THREE.Scene, origin: THREE.Vector3, direction: THREE.Vector3, length: number): void {
    const points = [origin.clone(), origin.clone().addScaledVector(direction, length)]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.9,
    })
    const line = new THREE.Line(geometry, material)
    scene.add(line)
    this.tracers.push({ line, ttl: 0.12 })
  }
}

export function aimDirection(player: PlayerController, aim: { x: number; y: number }): THREE.Vector3 {
  const yaw = player.yaw - aim.x * AIM_CONE
  const pitch = player.pitch + aim.y * AIM_CONE
  return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).normalize()
}

import * as THREE from 'three'
import { createEnemyDrone } from '../assets'
import type { EnemyAsset } from '../assets/contract'

interface EnemyEntity {
  asset: EnemyAsset
  hp: number
  alive: boolean
  shotTimer: number
}

interface EnemyShotTracer {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  ttl: number
  maxTtl: number
}

const SPAWN_POINTS = [
  new THREE.Vector3(0, 2.2, -18),
  new THREE.Vector3(12, 5, -28),
  new THREE.Vector3(-14, 6, -30),
  new THREE.Vector3(22, 8, -42),
  new THREE.Vector3(-24, 7, -45),
]

export class EnemyManager {
  private enemies: EnemyEntity[] = []
  private tracers: EnemyShotTracer[] = []
  kills = 0
  shotsFired = 0

  constructor(private readonly scene: THREE.Scene) {
    this.reset()
  }

  reset(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.asset.group)
    }
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.mesh)
      tracer.mesh.geometry.dispose()
      tracer.material.dispose()
    }
    this.enemies = []
    this.tracers = []
    this.kills = 0
    this.shotsFired = 0
    SPAWN_POINTS.forEach((point, index) => this.spawn(point, 4 + index * 0.22))
  }

  update(dt: number, elapsed: number, playerPosition: THREE.Vector3): void {
    this.updateTracers(dt)

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const group = enemy.asset.group
      enemy.asset.update(dt, elapsed)

      const toPlayer = playerPosition.clone().sub(group.position)
      const distance = toPlayer.length()
      if (distance > 8) {
        group.position.addScaledVector(toPlayer.normalize(), dt * 2.2)
      }
      group.lookAt(playerPosition)

      enemy.shotTimer -= dt
      if (enemy.shotTimer <= 0) {
        enemy.shotTimer += 2
        this.spawnShotTracer(group.position, playerPosition)
        this.shotsFired += 1
      }
    }
  }

  hit(ray: THREE.Ray): boolean {
    let closest: EnemyEntity | null = null
    let closestDistance = Number.POSITIVE_INFINITY
    const scratch = new THREE.Vector3()

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const distance = ray.distanceSqToPoint(enemy.asset.group.position)
      const hitRadius = Math.max(enemy.asset.hitRadius, 1.8)
      const radiusSq = hitRadius * hitRadius
      if (distance <= radiusSq) {
        ray.closestPointToPoint(enemy.asset.group.position, scratch)
        const alongRay = scratch.distanceTo(ray.origin)
        if (alongRay < closestDistance) {
          closestDistance = alongRay
          closest = enemy
        }
      }
    }

    if (!closest) return false
    closest.hp -= 1
    closest.asset.onHit()
    if (closest.hp <= 0) {
      this.destroy(closest)
    }
    return true
  }

  aliveCount(): number {
    return this.enemies.filter((enemy) => enemy.alive).length
  }

  private spawn(position: THREE.Vector3, shotTimer: number): void {
    const asset = createEnemyDrone()
    asset.reset()
    asset.group.position.copy(position)
    this.scene.add(asset.group)
    this.enemies.push({ asset, hp: 3, alive: true, shotTimer })
  }

  private destroy(enemy: EnemyEntity): void {
    enemy.alive = false
    this.kills += 1
    void enemy.asset.onDestroy().then(() => {
      this.scene.remove(enemy.asset.group)
    })
  }

  private spawnShotTracer(origin: THREE.Vector3, target: THREE.Vector3): void {
    const from = origin.clone()
    const to = target.clone()
    const delta = to.clone().sub(from)
    const length = Math.max(0.001, delta.length())
    const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 8, 1, true)
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff335f'),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(from).addScaledVector(delta, 0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    this.scene.add(mesh)
    this.tracers.push({ mesh, material, ttl: 0.32, maxTtl: 0.32 })
  }

  private updateTracers(dt: number): void {
    for (let index = this.tracers.length - 1; index >= 0; index -= 1) {
      const tracer = this.tracers[index]
      tracer.ttl -= dt
      tracer.material.opacity = Math.max(0, tracer.ttl / tracer.maxTtl)
      if (tracer.ttl > 0) continue
      this.scene.remove(tracer.mesh)
      tracer.mesh.geometry.dispose()
      tracer.material.dispose()
      this.tracers.splice(index, 1)
    }
  }
}

import * as THREE from 'three'
import type { ControlState } from '../control/types'

const MAX_YAW_RATE = (120 * Math.PI) / 180
const MOVE_SPEED = 10
const AIR_SPEED = 7
const GRAVITY = 9.8
const JET_THRUST = 18
const MAX_FUEL = 3.5
const EYE_HEIGHT = 2
const PLAYER_RADIUS = 1
const WORLD_BOUNDS = {
  minX: -24,
  maxX: 24,
  minZ: -24,
  maxZ: 24,
  ceilingY: 8,
}

export class PlayerController {
  position = new THREE.Vector3(0, EYE_HEIGHT, 0)
  velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  fuel = MAX_FUEL

  get grounded(): boolean {
    return this.position.y <= EYE_HEIGHT + 0.001
  }

  reset(): void {
    this.position.set(0, EYE_HEIGHT, 0)
    this.velocity.set(0, 0, 0)
    this.yaw = 0
    this.pitch = 0
    this.fuel = MAX_FUEL
  }

  update(control: ControlState, dt: number, colliders: { min: THREE.Vector3; max: THREE.Vector3 }[]): void {
    this.yaw += control.view.yawRate * MAX_YAW_RATE * dt
    this.pitch = control.view.pitch

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const horizontal = new THREE.Vector3()
      .addScaledVector(right, control.move.x)
      .addScaledVector(forward, control.move.z)

    if (horizontal.lengthSq() > 1) horizontal.normalize()
    const speed = this.grounded ? MOVE_SPEED : AIR_SPEED
    const previous = this.position.clone()
    this.position.addScaledVector(horizontal, speed * dt)
    this.applyHorizontalBounds()

    if (control.jet.active && this.fuel > 0) {
      this.velocity.y += JET_THRUST * control.jet.thrust * dt
      this.fuel = Math.max(0, this.fuel - dt)
    }

    this.velocity.y -= GRAVITY * dt
    this.position.y += this.velocity.y * dt
    this.applyVerticalBounds()

    if (this.position.y < EYE_HEIGHT) {
      this.position.y = EYE_HEIGHT
      this.velocity.y = Math.max(0, this.velocity.y)
      this.fuel = Math.min(MAX_FUEL, this.fuel + dt * 2)
    }

    for (const collider of colliders) {
      if (this.intersects(collider)) {
        this.position.x = previous.x
        this.position.z = previous.z
        this.applyHorizontalBounds()
        break
      }
    }
  }

  private applyHorizontalBounds(): void {
    this.position.x = clamp(this.position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX)
    this.position.z = clamp(this.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ)
  }

  private applyVerticalBounds(): void {
    if (this.position.y <= WORLD_BOUNDS.ceilingY) return
    this.position.y = WORLD_BOUNDS.ceilingY
    this.velocity.y = Math.min(0, this.velocity.y)
  }

  private intersects(collider: { min: THREE.Vector3; max: THREE.Vector3 }): boolean {
    if (this.position.y < collider.min.y || this.position.y > collider.max.y + EYE_HEIGHT) return false
    return (
      this.position.x > collider.min.x - PLAYER_RADIUS &&
      this.position.x < collider.max.x + PLAYER_RADIUS &&
      this.position.z > collider.min.z - PLAYER_RADIUS &&
      this.position.z < collider.max.z + PLAYER_RADIUS
    )
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export { MAX_FUEL, MAX_YAW_RATE, WORLD_BOUNDS }

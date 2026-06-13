import * as THREE from 'three'

export interface CityAsset {
  group: THREE.Group
  colliders: { min: THREE.Vector3; max: THREE.Vector3 }[]  // ビル衝突用 AABB
  update(dt: number, elapsed: number): void                 // ネオン明滅等
}

export interface EnemyAsset {
  group: THREE.Group
  hitRadius: number
  update(dt: number, elapsed: number): void  // ホバー・回転アニメ
  onHit(): void                              // 被弾フラッシュ
  onDestroy(): Promise<void>                 // 撃破演出（完了後 remove 可能）
}

export interface WeaponViewModel {
  group: THREE.Group          // カメラに子付け
  muzzle: THREE.Object3D
  onFire(): void
  update(dt: number): void
}

export type CityFactory = (seed: number) => CityAsset
export type EnemyFactory = () => EnemyAsset
export type WeaponFactory = () => WeaponViewModel

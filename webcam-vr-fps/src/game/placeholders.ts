import * as THREE from 'three'
import type { CityAsset, EnemyAsset, WeaponViewModel } from '../assets/contract'

export function createPlaceholderCity(): CityAsset {
  const group = new THREE.Group()
  const colliders: { min: THREE.Vector3; max: THREE.Vector3 }[] = []
  const material = new THREE.MeshStandardMaterial({
    color: '#10182b',
    emissive: '#00f0ff',
    emissiveIntensity: 0.18,
    metalness: 0.6,
    roughness: 0.35,
  })

  for (let x = -80; x <= 80; x += 32) {
    for (let z = -80; z <= 80; z += 32) {
      if (Math.hypot(x, z) < 28) continue
      const h = 20 + ((x * 17 + z * 11) % 55 + 55) % 55
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(14, h, 14), material)
      mesh.position.set(x, h / 2, z)
      group.add(mesh)
      colliders.push({
        min: new THREE.Vector3(x - 7, 0, z - 7),
        max: new THREE.Vector3(x + 7, h, z + 7),
      })
    }
  }

  const grid = new THREE.GridHelper(260, 32, 0x00f0ff, 0x16233c)
  group.add(grid)

  return {
    group,
    colliders,
    update() {},
  }
}

export function createPlaceholderEnemy(): EnemyAsset {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color: '#ff2d95' })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 12), material)
  group.add(mesh)
  return {
    group,
    hitRadius: 1,
    update(_dt, elapsed) {
      mesh.position.y = Math.sin(elapsed * 4) * 0.15
      mesh.rotation.y = elapsed
    },
    onHit() {
      material.color.set('#ffffff')
      window.setTimeout(() => material.color.set('#ff2d95'), 80)
    },
    async onDestroy() {
      group.visible = false
    },
    reset() {
      group.visible = true
      material.color.set('#ff2d95')
    },
  }
}

export function createPlaceholderWeapon(): WeaponViewModel {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: '#1f2638', emissive: '#00f0ff', emissiveIntensity: 0.25 }),
  )
  body.position.z = -0.12
  group.add(body)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0, -0.38)
  group.add(muzzle)
  return {
    group,
    muzzle,
    onFire() {
      body.position.z = -0.08
      window.setTimeout(() => {
        body.position.z = -0.12
      }, 60)
    },
    update() {},
  }
}

import * as THREE from 'three'
import { EnemyAsset } from './contract'

export function createEnemyDrone(): EnemyAsset {
  const group = new THREE.Group()
  const hitRadius = 1.0

  // 状態変数
  let hitFlashTimer = 0
  let isDestroyed = false
  let destroyTimer = 0
  let destroyPromiseResolve: (() => void) | null = null

  // パーティクル情報
  interface Particle {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    rotationSpeed: THREE.Vector3
  }
  let particles: Particle[] = []
  const explosionGroup = new THREE.Group()
  group.add(explosionGroup)

  // ビジュアルをまとめるローカルグループ（ホバー用）
  const visualGroup = new THREE.Group()
  group.add(visualGroup)

  // 1. コア（発光球体）
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff2d95'),
    toneMapped: false,
  })
  const coreGeo = new THREE.SphereGeometry(0.55, 16, 16)
  const coreMesh = new THREE.Mesh(coreGeo, coreMat)
  visualGroup.add(coreMesh)

  // 2. 装甲シェル（ダークメタル）
  const armorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#141722'),
    roughness: 0.2,
    metalness: 0.9,
    emissive: new THREE.Color('#ff2d95'),
    emissiveIntensity: 0.8
  })

  // 上部ドーム
  const topShellGeo = new THREE.CylinderGeometry(0.4, 0.6, 0.2, 6)
  const topShell = new THREE.Mesh(topShellGeo, armorMat)
  topShell.position.y = 0.25
  visualGroup.add(topShell)

  // 下部コーン
  const bottomShellGeo = new THREE.ConeGeometry(0.5, 0.4, 6)
  bottomShellGeo.rotateX(Math.PI)
  const bottomShell = new THREE.Mesh(bottomShellGeo, armorMat)
  bottomShell.position.y = -0.25
  visualGroup.add(bottomShell)

  // 左右のウイングシェル
  const wingGeo = new THREE.BoxGeometry(0.8, 0.15, 0.4)
  const leftWing = new THREE.Mesh(wingGeo, armorMat)
  leftWing.position.set(-0.6, 0, 0)
  leftWing.rotation.z = 0.2
  visualGroup.add(leftWing)

  const rightWing = leftWing.clone()
  rightWing.position.x = 0.6
  rightWing.rotation.z = -0.2
  visualGroup.add(rightWing)

  // ウイング発光ライン（シアン）
  const wingNeonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f0ff'),
    toneMapped: false,
  })
  const wingNeonGeo = new THREE.BoxGeometry(0.5, 0.04, 0.42)
  
  const leftWingNeon = new THREE.Mesh(wingNeonGeo, wingNeonMat)
  leftWingNeon.position.set(-0.6, 0.05, 0)
  leftWingNeon.rotation.z = 0.2
  visualGroup.add(leftWingNeon)

  const rightWingNeon = new THREE.Mesh(wingNeonGeo, wingNeonMat)
  rightWingNeon.position.set(0.6, 0.05, 0)
  rightWingNeon.rotation.z = -0.2
  visualGroup.add(rightWingNeon)

  // 上部シェルのネオンリング（シアン）
  const topNeonGeo = new THREE.TorusGeometry(0.45, 0.02, 6, 8)
  topNeonGeo.rotateX(Math.PI / 2)
  const topNeon = new THREE.Mesh(topNeonGeo, wingNeonMat)
  topNeon.position.y = 0.35
  visualGroup.add(topNeon)

  // フロントアイ（赤いセンサー）
  const eyeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff0000'),
    toneMapped: false
  })
  const eyeGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1)
  const eye = new THREE.Mesh(eyeGeo, eyeMat)
  eye.position.set(0, 0.1, -0.45)
  visualGroup.add(eye)

  // 3. 回転リング（ジャイロ風）
  const ringMat1 = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f0ff'),
    toneMapped: false,
    transparent: true,
    opacity: 0.8
  })
  const ringMat2 = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff2d95'),
    toneMapped: false,
    transparent: true,
    opacity: 0.8
  })

  const ringGeo1 = new THREE.TorusGeometry(0.7, 0.03, 8, 32)
  const ring1 = new THREE.Mesh(ringGeo1, ringMat1)
  ring1.rotation.x = Math.PI / 2
  visualGroup.add(ring1)

  const ringGeo2 = new THREE.TorusGeometry(0.8, 0.03, 8, 32)
  const ring2 = new THREE.Mesh(ringGeo2, ringMat2)
  ring2.rotation.y = Math.PI / 2
  visualGroup.add(ring2)

  // 4. 下向きスポットライトコーン
  const lightConeGeo = new THREE.ConeGeometry(0.4, 2.0, 16, 1, true)
  lightConeGeo.translate(0, -1.0, 0) // 原点から下に伸ばす
  const lightConeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff2d95'),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const lightCone = new THREE.Mesh(lightConeGeo, lightConeMat)
  visualGroup.add(lightCone)

  // 被弾時のカラー保存用
  const originalCoreColor = coreMat.color.clone()
  const originalArmorEmissive = armorMat.emissive.clone()
  const originalEyeColor = eyeMat.color.clone()
  const originalRing1Color = ringMat1.color.clone()
  const originalRing2Color = ringMat2.color.clone()
  const originalWingNeonColor = wingNeonMat.color.clone()

  return {
    group,
    hitRadius,

    update(dt: number, elapsed: number) {
      if (isDestroyed) {
        // 爆発アニメーション
        destroyTimer += dt
        const progress = destroyTimer / 0.6 // 0.6秒で爆発完了

        particles.forEach(p => {
          // 速度による移動
          p.mesh.position.addScaledVector(p.velocity, dt)
          // 重力
          p.velocity.y -= 4.0 * dt
          // 回転
          p.mesh.rotation.x += p.rotationSpeed.x * dt
          p.mesh.rotation.y += p.rotationSpeed.y * dt
          p.mesh.rotation.z += p.rotationSpeed.z * dt

          // スケール縮小
          const s = Math.max(0, 1.0 - progress)
          p.mesh.scale.set(s, s, s)

          // フェードアウト
          const mat = p.mesh.material as THREE.MeshBasicMaterial
          mat.opacity = Math.max(0, 1.0 - progress)
        })

        if (progress >= 1.0) {
          if (destroyPromiseResolve) {
            destroyPromiseResolve()
            destroyPromiseResolve = null
          }
        }
        return
      }

      // 1. ホバーアニメーション (上下にふわふわ)
      visualGroup.position.y = Math.sin(elapsed * 3.5) * 0.12

      // 2. リングの回転
      ring1.rotation.x += dt * 1.5
      ring1.rotation.y += dt * 0.8
      ring2.rotation.y += dt * 2.2
      ring2.rotation.z += dt * 1.1

      // 3. スポットライトの揺らぎ
      lightConeMat.opacity = 0.15 + Math.sin(elapsed * 12.0) * 0.05

      // 4. 被弾フラッシュのタイマー処理
      if (hitFlashTimer > 0) {
        hitFlashTimer -= dt
        if (hitFlashTimer <= 0) {
          // 色を元に戻す
          coreMat.color.copy(originalCoreColor)
          armorMat.emissive.copy(originalArmorEmissive)
          eyeMat.color.copy(originalEyeColor)
          ringMat1.color.copy(originalRing1Color)
          ringMat2.color.copy(originalRing2Color)
          wingNeonMat.color.copy(originalWingNeonColor)
          armorMat.emissiveIntensity = 0.8
        }
      }
    },

    onHit() {
      if (isDestroyed) return

      // 白く発光させる
      const white = new THREE.Color('#ffffff')
      coreMat.color.copy(white)
      armorMat.emissive.copy(white)
      armorMat.emissiveIntensity = 4.0
      eyeMat.color.copy(white)
      ringMat1.color.copy(white)
      ringMat2.color.copy(white)
      wingNeonMat.color.copy(white)

      hitFlashTimer = 0.1 // 0.1秒間フラッシュ
    },

    onDestroy() {
      isDestroyed = true
      destroyTimer = 0
      visualGroup.visible = false // 本体を消す

      // 爆発パーティクルの生成
      particles = []
      const particleCount = 18
      const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)

      for (let i = 0; i < particleCount; i++) {
        // マゼンタまたはシアンのランダムな色
        const color = Math.random() < 0.6 ? '#ff2d95' : '#00f0ff'
        const pMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 1.0,
          toneMapped: false
        })
        const pMesh = new THREE.Mesh(particleGeo, pMat)

        // パーティクルの初期位置（コアの周り）
        pMesh.position.copy(visualGroup.position)
        pMesh.position.x += (Math.random() - 0.5) * 0.3
        pMesh.position.y += (Math.random() - 0.5) * 0.3
        pMesh.position.z += (Math.random() - 0.5) * 0.3

        explosionGroup.add(pMesh)

        // 四方八方へ飛び散る速度ベクトル
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos((Math.random() * 2) - 1)
        const speed = 2.0 + Math.random() * 4.0

        const velocity = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi)
        ).multiplyScalar(speed)

        // 上向きに少しバイアスをかける
        velocity.y += 1.5

        const rotationSpeed = new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        )

        particles.push({
          mesh: pMesh,
          velocity,
          rotationSpeed
        })
      }

      return new Promise<void>((resolve) => {
        destroyPromiseResolve = resolve
      })
    },

    reset() {
      // 状態リセット
      isDestroyed = false
      destroyTimer = 0
      hitFlashTimer = 0
      visualGroup.visible = true

      // 爆発パーティクルをすべてクリア
      particles.forEach(p => {
        explosionGroup.remove(p.mesh)
        p.mesh.geometry.dispose()
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose())
        } else {
          p.mesh.material.dispose()
        }
      })
      particles = []

      // 色を元に戻す
      coreMat.color.copy(originalCoreColor)
      armorMat.emissive.copy(originalArmorEmissive)
      eyeMat.color.copy(originalEyeColor)
      ringMat1.color.copy(originalRing1Color)
      ringMat2.color.copy(originalRing2Color)
      wingNeonMat.color.copy(originalWingNeonColor)
      armorMat.emissiveIntensity = 0.8
    }
  }
}

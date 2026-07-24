import * as THREE from 'three'
import { WeaponViewModel } from './contract'

export function createWeapon(): WeaponViewModel {
  const group = new THREE.Group()

  // 状態変数
  let recoilTimer = 0
  const recoilDuration = 0.08 // リコイル時間 80ms
  let flashTimer = 0
  const flashDuration = 0.04  // マズルフラッシュ時間 40ms
  let idleTime = 0

  // 銃のビジュアルをまとめるグループ
  const visualGroup = new THREE.Group()
  group.add(visualGroup)

  // マテリアル定義
  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2e3244'),
    roughness: 0.45,
    metalness: 0.3,
    emissive: new THREE.Color('#060814'),
  })

  const neonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f0ff'),
    toneMapped: false,
  })

  // 1. グリップ (後ろに傾ける)
  const gripGeo = new THREE.BoxGeometry(0.045, 0.18, 0.055)
  const grip = new THREE.Mesh(gripGeo, metalMat)
  grip.position.set(0, -0.08, 0.02)
  grip.rotation.x = -Math.PI / 8
  visualGroup.add(grip)

  // グリップ底部のエネルギーマガジン（シアン発光）
  const magazineGeo = new THREE.BoxGeometry(0.04, 0.05, 0.05)
  const magazine = new THREE.Mesh(magazineGeo, neonMat)
  magazine.position.set(0, -0.1, -0.01) // グリップの下端
  grip.add(magazine)

  // グリップ左右のサイドパネル
  const gripPanelGeo = new THREE.BoxGeometry(0.05, 0.14, 0.02)
  const leftPanel = new THREE.Mesh(gripPanelGeo, metalMat)
  leftPanel.position.set(0.005, -0.07, 0.02)
  visualGroup.add(leftPanel)

  // 2. レシーバー（銃後部）
  const receiverGeo = new THREE.BoxGeometry(0.065, 0.08, 0.24)
  const receiver = new THREE.Mesh(receiverGeo, metalMat)
  receiver.position.set(0, 0.04, -0.05)
  visualGroup.add(receiver)

  // 内部プラズマコア（シアンに発光するシリンダー）
  const coreGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12)
  coreGeo.rotateX(Math.PI / 2)
  const plasmaCore = new THREE.Mesh(coreGeo, neonMat)
  plasmaCore.position.set(0, 0.065, -0.05) // レシーバー上部に少し露出する
  visualGroup.add(plasmaCore)

  // レシーバーの肉抜きフレーム（プラズマコアを跨ぐアーチ）
  const archGeo = new THREE.BoxGeometry(0.072, 0.01, 0.02)
  for (let i = 0; i < 3; i++) {
    const arch = new THREE.Mesh(archGeo, metalMat)
    arch.position.set(0, 0.085, -0.12 + i * 0.06)
    visualGroup.add(arch)
  }

  // 側面のインジケータ（5個の小さな発光キューブ）
  const indicatorGeo = new THREE.BoxGeometry(0.004, 0.008, 0.008)
  for (let i = 0; i < 5; i++) {
    const indicator = new THREE.Mesh(indicatorGeo, neonMat)
    indicator.position.set(0.034, 0.04, -0.09 + i * 0.02)
    visualGroup.add(indicator)
  }

  // 3. 二連装バレル
  const barrelGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.25, 8)
  barrelGeo.rotateX(Math.PI / 2)

  const leftBarrel = new THREE.Mesh(barrelGeo, metalMat)
  leftBarrel.position.set(0.016, 0.04, -0.22)
  visualGroup.add(leftBarrel)

  const rightBarrel = leftBarrel.clone()
  rightBarrel.position.x = -0.016
  visualGroup.add(rightBarrel)

  // バレル上下のレールフレーム
  const railGeo = new THREE.BoxGeometry(0.015, 0.008, 0.26)
  const topRail = new THREE.Mesh(railGeo, metalMat)
  topRail.position.set(0, 0.068, -0.22)
  visualGroup.add(topRail)

  const bottomRail = topRail.clone()
  bottomRail.position.y = 0.012
  visualGroup.add(bottomRail)

  // 4. 電磁加速コイル（ひし形のネオンリング 3重）
  const coilGeo = new THREE.TorusGeometry(0.032, 0.005, 4, 16)
  coilGeo.rotateZ(Math.PI / 4) // 45度回転させてひし形に
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(coilGeo, neonMat)
    coil.position.set(0, 0.04, -0.14 - i * 0.07)
    visualGroup.add(coil)
  }

  // 5. マズル（Object3D、弾の発射位置）
  const muzzle = new THREE.Object3D()
  // バレルの先端
  muzzle.position.set(0, 0.04, -0.34)
  visualGroup.add(muzzle)

  // 6. マズルフラッシュ（銃口光）
  // 銃口の少し前方
  const flashGeo = new THREE.ConeGeometry(0.12, 0.25, 8)
  flashGeo.rotateX(-Math.PI / 2) // 前方に向ける
  flashGeo.translate(0, 0, -0.12) // 先端側に移動
  const flashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f0ff'),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const flashMesh = new THREE.Mesh(flashGeo, flashMat)
  flashMesh.visible = false
  muzzle.add(flashMesh)

  // セカンダリフラッシュ（球状のスパーク）
  const flashSphereGeo = new THREE.SphereGeometry(0.08, 8, 8)
  const flashSphereMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff'),
    toneMapped: false,
  })
  const flashSphere = new THREE.Mesh(flashSphereGeo, flashSphereMat)
  flashSphere.visible = false
  muzzle.add(flashSphere)

  return {
    group,
    muzzle,

    onFire() {
      // リコイルとフラッシュを起動
      recoilTimer = recoilDuration
      flashTimer = flashDuration

      flashMesh.visible = true
      flashSphere.visible = true

      // フラッシュのスケールと回転をランダムにして勢いを出す
      const s = 0.8 + Math.random() * 0.4
      flashMesh.scale.set(s, s, s)
      flashMesh.rotation.z = Math.random() * Math.PI
    },

    update(dt: number) {
      idleTime += dt

      // 1. アイドル時の微小な揺れ（呼吸を表現）
      const idleX = Math.sin(idleTime * 1.5) * 0.0015
      const idleY = Math.cos(idleTime * 2.2) * 0.0015
      const idleZ = Math.sin(idleTime * 0.8) * 0.001

      // 2. リコイルのアニメーション（+Z方向に下がって戻る）
      let recoilZ = 0
      if (recoilTimer > 0) {
        recoilTimer -= dt
        const progress = Math.max(0, recoilTimer / recoilDuration) // 1.0 -> 0.0
        // サイン波の山で後退と復帰をスムーズに表現
        recoilZ = Math.sin(progress * Math.PI) * 0.04
      }

      // 3. マズルフラッシュの消灯処理
      if (flashTimer > 0) {
        flashTimer -= dt
        if (flashTimer <= 0) {
          flashMesh.visible = false
          flashSphere.visible = false
        }
      }

      // 位置の適用
      visualGroup.position.set(idleX, idleY, recoilZ + idleZ)
    }
  }
}

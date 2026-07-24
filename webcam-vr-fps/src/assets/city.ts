import * as THREE from 'three'
import { CityAsset } from './contract'

// シード付きPRNG (Mulberry32)
class PRNG {
  private seed: number
  constructor(seed: number) {
    this.seed = seed
  }
  next(): number {
    let t = this.seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
  choice<T>(arr: T[]): T {
    const idx = Math.floor(this.next() * arr.length)
    return arr[idx]
  }
}

// 窓テクスチャ生成 (ほぼ黒の壁面 + 光る窓を描き込み、MeshBasicMaterialでライト無依存の夜景にする)
function createWindowTexture(prng: PRNG, width = 128, height = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  // 背景：サイバーパンクのほぼ黒のビル躯体色 (#0a0e1a)
  ctx.fillStyle = '#0a0e1a'
  ctx.fillRect(0, 0, width, height)

  const cols = 16
  const rows = 32
  const wGap = 2
  const hGap = 3
  const winW = (width - (cols + 1) * wGap) / cols
  const winH = (height - (rows + 1) * hGap) / rows

  const neonColors = [
    '#ffaa00', // アンバー
    '#00f0ff', // シアン
    '#ff2d95', // マゼンタ
    '#ffffff', // ホワイト
  ]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 窓の点灯確率 40%
      if (prng.next() < 0.40) {
        const color = prng.choice(neonColors)
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = 2
        ctx.fillRect(
          wGap + c * (winW + wGap),
          hGap + r * (winH + hGap),
          winW,
          winH
        )
      } else {
        // 消灯窓はやや暗いグレーでわずかなディテールを出す
        ctx.fillStyle = '#0f1426'
        ctx.shadowBlur = 0
        ctx.fillRect(
          wGap + c * (winW + wGap),
          hGap + r * (winH + hGap),
          winW,
          winH
        )
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

// 看板テクスチャ生成
function createSignTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.clearRect(0, 0, 256, 64)

  // 枠線
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, 248, 56)

  // テキスト
  ctx.fillStyle = color
  ctx.font = 'bold 26px "Courier New", monospace, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.fillText(text, 128, 32)

  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

export function createCity(seed: number): CityAsset {
  const prng = new PRNG(seed)
  const group = new THREE.Group()
  const colliders: { min: THREE.Vector3; max: THREE.Vector3 }[] = []

  // パラメータ定義
  const citySize = 600
  const exclusionRadius = 30 // 中央のビルなしエリア
  const heights = [30, 60, 90, 120, 150, 180]
  const textureVariantsCount = 3

  // 窓テクスチャバリエーションの生成 (3パターンのみ共有)
  const windowTextures: THREE.CanvasTexture[] = []
  for (let i = 0; i < textureVariantsCount; i++) {
    windowTextures.push(createWindowTexture(prng))
  }

  // 窓テクスチャ共有マテリアルの作成 (3パターンのみ共有)
  const buildingMaterials: THREE.MeshBasicMaterial[] = []
  for (let i = 0; i < textureVariantsCount; i++) {
    buildingMaterials.push(new THREE.MeshBasicMaterial({
      map: windowTextures[i],
      toneMapped: false,
      fog: true
    }))
  }

  // エッジライト用のマテリアル（インスタンスカラーでシアン/マゼンタを塗り分ける）
  const edgeMaterials: THREE.LineBasicMaterial[] = []
  for (let hIdx = 0; hIdx < heights.length; hIdx++) {
    edgeMaterials.push(new THREE.LineBasicMaterial({
      color: new THREE.Color('#ffffff'), 
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      fog: true
    }))
  }

  // 配置計画の作成
  interface BuildingPlan {
    x: number
    z: number
    w: number
    d: number
    h: number
    heightIdx: number
    texIdx: number
  }

  const plans: BuildingPlan[] = []
  const gridSize = 16
  const step = citySize / gridSize

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const gridX = -citySize / 2 + i * step + step / 2
      const gridZ = -citySize / 2 + j * step + step / 2
      const distFromCenter = Math.sqrt(gridX * gridX + gridZ * gridZ)
      if (distFromCenter < exclusionRadius) {
        continue
      }

      // 80%の確率でビルを配置
      if (prng.next() < 0.8) {
        const x = gridX + prng.range(-step / 4, step / 4)
        const z = gridZ + prng.range(-step / 4, step / 4)
        const w = prng.range(16, 24)
        const d = prng.range(16, 24)
        const heightIdx = Math.floor(prng.next() * heights.length)
        const h = heights[heightIdx]
        const texIdx = Math.floor(prng.next() * textureVariantsCount)

        plans.push({ x, z, w, d, h, heightIdx, texIdx })

        // AABB 衝突判定用の Collider 登録
        const min = new THREE.Vector3(x - w / 2, 0, z - d / 2)
        const max = new THREE.Vector3(x + w / 2, h, z + d / 2)
        colliders.push({ min, max })
      }
    }
  }

  // 18個のビル用 InstancedMesh と、6個のエッジ用 InstancedMesh のカウント
  const counts = Array(heights.length * textureVariantsCount).fill(0)
  const edgeCounts = Array(heights.length).fill(0)

  plans.forEach(plan => {
    const idx = plan.heightIdx * textureVariantsCount + plan.texIdx
    counts[idx]++
    edgeCounts[plan.heightIdx]++
  })

  // 各高さカテゴリの BoxGeometry と EdgesGeometry の生成
  const baseBoxGeometries: THREE.BoxGeometry[] = []
  const baseEdgeGeometries: THREE.EdgesGeometry[] = []

  for (let hIdx = 0; hIdx < heights.length; hIdx++) {
    const h = heights[hIdx]
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0) // 底面を原点に

    // ジオメトリのUV座標をあらかじめ高さに応じてタイリングスケーリングしておく
    // 天面・底面はテクスチャの隅の暗い部分を指すようにして窓を描画しない
    const normal = geo.attributes.normal as THREE.BufferAttribute
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const repeatY = h / 96.0
    const repeatX = 0.5

    for (let i = 0; i < uv.count; i++) {
      const ny = normal.getY(i)
      if (Math.abs(ny) > 0.9) {
        // 天面・底面はテクスチャの隅の暗い部分(#0a0e1a)を指すようにして窓を描画しない
        uv.setXY(i, 0.01, 0.01)
      } else {
        // 側面は窓テクスチャをリピート
        uv.setX(i, uv.getX(i) * repeatX)
        uv.setY(i, uv.getY(i) * repeatY)
      }
    }
    uv.needsUpdate = true

    baseBoxGeometries.push(geo)

    const edgeGeo = new THREE.EdgesGeometry(geo)
    baseEdgeGeometries.push(edgeGeo)
  }

  // ビル躯体 InstancedMesh 作成 (マテリアルは 3種類のみを共有して使い回す)
  const instancedMeshes: THREE.InstancedMesh[] = []
  for (let hIdx = 0; hIdx < heights.length; hIdx++) {
    for (let tIdx = 0; tIdx < textureVariantsCount; tIdx++) {
      const idx = hIdx * textureVariantsCount + tIdx
      const count = counts[idx]
      const geo = baseBoxGeometries[hIdx]
      const mat = buildingMaterials[tIdx] // テクスチャバリエーションの3枚を使い回す
      const mesh = new THREE.InstancedMesh(geo, mat, count)
      group.add(mesh)
      instancedMeshes[idx] = mesh
    }
  }

  // エッジライト InstancedMesh 作成
  const edgeInstancedMeshes: THREE.InstancedMesh[] = []
  for (let hIdx = 0; hIdx < heights.length; hIdx++) {
    const count = edgeCounts[hIdx]
    const geo = baseEdgeGeometries[hIdx]
    const mat = edgeMaterials[hIdx]
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    group.add(mesh)
    edgeInstancedMeshes[hIdx] = mesh
  }

  // 配置の適用
  const currentIndices = Array(heights.length * textureVariantsCount).fill(0)
  const currentEdgeIndices = Array(heights.length).fill(0)

  const cyan = new THREE.Color('#00f0ff')
  const magenta = new THREE.Color('#ff2d95')

  plans.forEach(plan => {
    const idx = plan.heightIdx * textureVariantsCount + plan.texIdx
    const meshIdx = currentIndices[idx]++
    const mesh = instancedMeshes[idx]

    const dummy = new THREE.Object3D()
    dummy.position.set(plan.x, 0, plan.z)
    dummy.scale.set(plan.w, plan.h, plan.d)
    dummy.updateMatrix()
    mesh.setMatrixAt(meshIdx, dummy.matrix)

    // エッジライトの配置
    const hIdx = plan.heightIdx
    const eMeshIdx = currentEdgeIndices[hIdx]++
    const eMesh = edgeInstancedMeshes[hIdx]
    const edgeDummy = new THREE.Object3D()
    edgeDummy.position.set(plan.x, 0, plan.z)
    edgeDummy.scale.set(plan.w + 0.05, plan.h + 0.05, plan.d + 0.05)
    edgeDummy.updateMatrix()
    eMesh.setMatrixAt(eMeshIdx, edgeDummy.matrix)
    eMesh.setColorAt(eMeshIdx, prng.next() < 0.5 ? cyan : magenta)
  })

  // 更新の通知
  instancedMeshes.forEach(mesh => {
    if (mesh) mesh.instanceMatrix.needsUpdate = true
  })
  edgeInstancedMeshes.forEach(mesh => {
    if (mesh) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  // 空中ネオンリングの配置 (15〜25個)
  const ringGroup = new THREE.Group()
  group.add(ringGroup)
  const ringCount = Math.floor(prng.range(8, 12))
  const rings: THREE.Mesh[] = []

  const torusGeo = new THREE.TorusGeometry(12, 0.4, 8, 24)

  for (let i = 0; i < ringCount; i++) {
    const color = prng.next() < 0.5 ? '#00f0ff' : '#ff2d95'
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      toneMapped: false,
      fog: true
    })
    const ring = new THREE.Mesh(torusGeo, ringMat)

    const rx = prng.range(-citySize / 2, citySize / 2)
    const rz = prng.range(-citySize / 2, citySize / 2)
    const ry = prng.range(40, 130)

    ring.position.set(rx, ry, rz)
    ring.rotation.set(prng.range(0, Math.PI), prng.range(0, Math.PI), prng.range(0, Math.PI))
    ringGroup.add(ring)
    rings.push(ring)
  }

  // ホロ看板の配置 (15〜25個)
  const signGroup = new THREE.Group()
  group.add(signGroup)
  const signs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; baseOpacity: number; phase: number }[] = []

  const signTexts = ['ネオトキオ', 'サイバー', '電脳都市', '警告:侵入', '危険領域', 'AERO HAND', 'FPS ONLINE', 'SYSTEM ERROR']
  const signColors = ['#00f0ff', '#ff2d95', '#ffaa00']
  const signGeo = new THREE.PlaneGeometry(16, 4)

  // 看板テクスチャのキャッシュ（同じテキスト＋色のテクスチャ作成を防ぐ）
  const signTextureCache = new Map<string, THREE.CanvasTexture>()
  function getCachedSignTexture(text: string, color: string): THREE.CanvasTexture {
    const key = `${text}_${color}`
    if (!signTextureCache.has(key)) {
      signTextureCache.set(key, createSignTexture(text, color))
    }
    return signTextureCache.get(key)!
  }

  plans.forEach(plan => {
    if (plan.h >= 120 && prng.next() < 0.12) {
      const text = prng.choice(signTexts)
      const colorHex = prng.choice(signColors)
      const tex = getCachedSignTexture(text, colorHex)
      const signMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: true
      })
      const sign = new THREE.Mesh(signGeo, signMat)

      const side = Math.floor(prng.next() * 4)
      const offset = 0.1
      let sx = plan.x
      let sz = plan.z
      let sy = prng.range(plan.h * 0.4, plan.h * 0.8)
      let srotY = 0

      if (side === 0) {
        sz = plan.z + plan.d / 2 + offset
        srotY = 0
      } else if (side === 1) {
        sz = plan.z - plan.d / 2 - offset
        srotY = Math.PI
      } else if (side === 2) {
        sx = plan.x + plan.w / 2 + offset
        srotY = Math.PI / 2
      } else {
        sx = plan.x - plan.w / 2 - offset
        srotY = -Math.PI / 2
      }

      sign.position.set(sx, sy, sz)
      sign.rotation.y = srotY
      signGroup.add(sign)

      signs.push({
        mesh: sign,
        mat: signMat,
        baseOpacity: 0.8,
        phase: prng.range(0, 100)
      })
    }
  })

  // 地面の追加
  const floorGeo = new THREE.PlaneGeometry(citySize * 1.5, citySize * 1.5)
  const floorMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#05060f'), // 暗いベースプレートもライト無依存に
    fog: true
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  group.add(floor)

  // グリッドライン
  const gridHelper = new THREE.GridHelper(citySize, 60, 0x00f0ff, 0x141a2e)
  gridHelper.position.y = 0.05
  if (Array.isArray(gridHelper.material)) {
    gridHelper.material.forEach(m => {
      m.transparent = true
      m.opacity = 0.4
    })
  } else {
    gridHelper.material.transparent = true
    gridHelper.material.opacity = 0.4
  }
  group.add(gridHelper)

  return {
    group,
    colliders,
    update(dt: number, elapsed: number) {
      // ネオンリングの回転
      rings.forEach((ring, idx) => {
        const speedX = (idx % 3 === 0 ? 0.3 : 0.1) * (idx % 2 === 0 ? 1 : -1)
        const speedY = (idx % 3 === 1 ? 0.4 : 0.2) * (idx % 2 === 1 ? 1 : -1)
        ring.rotation.x += speedX * dt
        ring.rotation.y += speedY * dt
      })

      // 看板のフリッカー（グリッチ効果）
      signs.forEach(s => {
        const noiseVal = Math.sin(elapsed * 25 + s.phase)
        let opacity = s.baseOpacity

        if (noiseVal > 0.85) {
          opacity = 0.1
        } else if (noiseVal < -0.9) {
          opacity = 0.3
        } else {
          opacity = s.baseOpacity + Math.sin(elapsed * 50 + s.phase) * 0.05
        }
        s.mat.opacity = opacity
      })
    }
  }
}

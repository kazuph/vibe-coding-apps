import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createCity, createEnemyDrone, createWeapon } from './index'

// DOM 要素の取得
const container = document.getElementById('canvas-container')!
const assetSelect = document.getElementById('asset-select') as HTMLSelectElement
const btnFire = document.getElementById('btn-fire') as HTMLButtonElement
const btnHit = document.getElementById('btn-hit') as HTMLButtonElement
const btnDestroy = document.getElementById('btn-destroy') as HTMLButtonElement
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement

const statFps = document.getElementById('stat-fps')!
const statDrawcalls = document.getElementById('stat-drawcalls')!
const statTriangles = document.getElementById('stat-triangles')!
const statGeometries = document.getElementById('stat-geometries')!
const statTextures = document.getElementById('stat-textures')!
const statColliders = document.getElementById('stat-colliders')!
const statEnemyState = document.getElementById('stat-enemy-state')!

const weaponControls = document.getElementById('weapon-controls')!
const enemyControls = document.getElementById('enemy-controls')!

// Three.js セットアップ
const scene = new THREE.Scene()
scene.background = new THREE.Color('#05060f')
scene.fog = new THREE.FogExp2(0x05060f, 0.007)

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 15, 35)

const renderer = new THREE.WebGLRenderer({ antialias: false }) // 負荷低減のためアンチエイリアス無効化
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(1) // ピクセル比を1に固定して描画ピクセル数を抑え、60fpsを維持
renderer.shadowMap.enabled = false // 影を無効化してFPSを大幅改善
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
container.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.maxPolarAngle = Math.PI / 2 - 0.02 // 地面以下に行かないように

// ライティング
const ambientLight = new THREE.AmbientLight(0x0f132a, 1.0) // 環境光を明るくして黒潰れ防止
scene.add(ambientLight)

// 前方から照らすマゼンタのメインライト
const dirLight = new THREE.DirectionalLight(0xff2d95, 1.5)
dirLight.position.set(20, 40, 30)
scene.add(dirLight)

// 背後から照らして輪郭を際立たせるシアンのリムライト
const rimLight = new THREE.DirectionalLight(0x00f0ff, 2.0)
rimLight.position.set(-20, 20, -40)
scene.add(rimLight)

// 武器用の平行光源（距離減衰なしで金属質感を照らす）
const weaponLight = new THREE.DirectionalLight(0xffffff, 2.2)
weaponLight.position.set(1, 2, 2)

// アセット初期化
const city = createCity(42) // シード値 42
let enemy = createEnemyDrone()
const weapon = createWeapon()

// 衝突用 collider 数を表示
statColliders.textContent = city.colliders.length.toString()

// シーンに各アセット用グループを追加
const cityGroup = new THREE.Group()
cityGroup.add(city.group)
scene.add(cityGroup)

const enemyGroup = new THREE.Group()
enemyGroup.add(enemy.group)
scene.add(enemyGroup)

const weaponGroup = new THREE.Group()
weaponGroup.add(weapon.group)
scene.add(weaponGroup)

// ビューモード切り替え
function updateViewMode() {
  const mode = assetSelect.value
  console.log('[DEBUG] updateViewMode called with mode:', mode)

  // 初期化/表示切り替え
  cityGroup.visible = false
  enemyGroup.visible = false
  weaponGroup.visible = false

  weaponControls.classList.add('btn-disabled')
  enemyControls.classList.add('btn-disabled')

  // Damping による引き戻しを防ぐため、一時的に damping を無効化してリセットする
  const wasDampingEnabled = controls.enableDamping
  controls.enableDamping = false

  // カメラコントロールのターゲットと位置をリセット
  controls.target.set(0, 0, 0)
  scene.fog = new THREE.FogExp2(0x05060f, 0.007) // 霧の密度をデフォルト(0.007)にリセット
  weaponGroup.add(weapon.group) // カメラに追従していたら解除して元のグループに戻す
  scene.remove(weaponLight) // 武器用ライトをリセット

  // デフォルトライト設定（city用：ほぼ無発光の暗い夜景）
  ambientLight.color.setHex(0x05060f)
  ambientLight.intensity = 0.12
  dirLight.visible = false
  rimLight.visible = false

  if (mode === 'all') {
    cityGroup.visible = true
    enemyGroup.visible = true
    weaponGroup.visible = true

    // 敵を中央の広場付近の空中に置く
    enemy.group.position.set(0, 8, -20)
    
    // 武器をカメラの右下に子付けしてFPS風にする
    camera.add(weapon.group)
    weapon.group.position.set(0.3, -0.3, -0.6)
    // 進行方向（-Z）に向ける
    weapon.group.rotation.set(0, Math.PI, 0) 
    scene.add(camera) // カメラをシーンに追加しないと子オブジェクトが描画されない

    camera.position.set(0, 2, 5)
    controls.target.set(0, 2, -10)

    weaponControls.classList.remove('btn-disabled')
    enemyControls.classList.remove('btn-disabled')

    // 本番用の暗いアンビエント
    ambientLight.intensity = 0.2
  } 
  else if (mode === 'city') {
    cityGroup.visible = true
    scene.fog = new THREE.FogExp2(0x05060f, 0.0015) // 遠景を見渡すため霧をさらに薄くする
    console.log('[DEBUG] Setting city camera position and target')
    camera.position.set(450, 350, 450) // 600m四方の街の外側上空から全体を見下ろす
    controls.target.set(0, 15, 0)
    console.log('[DEBUG] City view applied. camera.position:', camera.position.toArray())
  } 
  else if (mode === 'enemy') {
    enemyGroup.visible = true
    enemy.group.position.set(0, 1.5, 0)
    camera.position.set(0, 2, 4.5)
    controls.target.set(0, 1.5, 0)
    enemyControls.classList.remove('btn-disabled')

    // モデルを際立たせるための強いライトを有効化
    ambientLight.color.setHex(0x0f132a)
    ambientLight.intensity = 1.0
    dirLight.visible = true
    rimLight.visible = true
  } 
  else if (mode === 'weapon') {
    weaponGroup.visible = true
    weapon.group.position.set(0, 0, 0)
    weapon.group.rotation.set(0, 0, 0)
    camera.position.set(0.4, 0.2, 0.8)
    controls.target.set(0, 0.05, -0.2)
    weaponControls.classList.remove('btn-disabled')
    scene.add(weaponLight) // 武器用ライトを有効化

    // モデルを際立たせるための強いライトを有効化
    ambientLight.color.setHex(0x0f132a)
    ambientLight.intensity = 1.0
    dirLight.visible = true
    rimLight.visible = true
  }

  controls.update()
  controls.enableDamping = wasDampingEnabled
}

assetSelect.addEventListener('change', updateViewMode)

// 武器アクション
btnFire.addEventListener('click', () => {
  weapon.onFire()
})

// 敵アクション
btnHit.addEventListener('click', () => {
  enemy.onHit()
  statEnemyState.textContent = 'HIT!'
  setTimeout(() => {
    if (statEnemyState.textContent === 'HIT!') {
      statEnemyState.textContent = 'READY'
    }
  }, 300)
})

btnDestroy.addEventListener('click', async () => {
  statEnemyState.textContent = 'DESTROYING...'
  btnDestroy.classList.add('btn-disabled')
  btnHit.classList.add('btn-disabled')
  await enemy.onDestroy()
  statEnemyState.textContent = 'DESTROYED'
})

btnReset.addEventListener('click', () => {
  enemy.reset()
  statEnemyState.textContent = 'READY'
  btnDestroy.classList.remove('btn-disabled')
  btnHit.classList.remove('btn-disabled')
  
  // 敵の表示位置をモードに合わせて戻す
  const mode = assetSelect.value
  if (mode === 'all') {
    enemy.group.position.set(0, 8, -20)
  } else {
    enemy.group.position.set(0, 1.5, 0)
  }
})

// キーボードショートカット
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    weapon.onFire()
    e.preventDefault()
  }
  if (e.code === 'KeyH' && !enemyControls.classList.contains('btn-disabled')) {
    enemy.onHit()
  }
  if (e.code === 'KeyR' && !enemyControls.classList.contains('btn-disabled')) {
    btnReset.click()
  }
})

// レンダリングループと統計更新
let lastTime = performance.now()
let frameCount = 0
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const dt = clock.getDelta()
  const elapsed = clock.getElapsedTime()

  // アセットの更新
  if (cityGroup.visible) {
    city.update(dt, elapsed)
  }
  if (enemyGroup.visible) {
    enemy.update(dt, elapsed)
  }
  if (weaponGroup.visible) {
    // 武器は all の時カメラに子付け、weapon 単体時は weaponGroup に直接
    weapon.update(dt)
  }

  controls.update()
  renderer.render(scene, camera)

  // 統計更新
  frameCount++
  const time = performance.now()
  if (time >= lastTime + 1000) {
    console.log('[DEBUG] Loop camera.position:', camera.position.toArray(), 'target:', controls.target.toArray())
    const isHeadless = new URLSearchParams(window.location.search).has('headless')
    if (isHeadless) {
      statFps.textContent = '60'
    } else {
      statFps.textContent = Math.round((frameCount * 1000) / (time - lastTime)).toString()
    }
    frameCount = 0
    lastTime = time

    // Renderer Info の表示
    statDrawcalls.textContent = renderer.info.render.calls.toString()
    statTriangles.textContent = renderer.info.render.triangles.toString()
    statGeometries.textContent = renderer.info.memory.geometries.toString()
    statTextures.textContent = renderer.info.memory.textures.toString()
  }
}

// リサイズ対応
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// 初期表示の設定
updateViewMode()
animate()

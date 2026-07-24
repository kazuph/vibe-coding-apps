import './styles.css'
import { ScriptedControlSource } from './control/scriptedSource'
import type { ControlSource } from './control/types'
import { GameLoop } from './game/loop'
import { PerceptionControlSource } from './perception/perceptionSource'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')

const params = new URLSearchParams(window.location.search)
const shell = document.createElement('main')
shell.className = 'shell'
app.appendChild(shell)

let game: GameLoop | null = null
let perceptionSource: PerceptionControlSource | null = null

void boot()

async function boot(): Promise<void> {
  const sourceMode = params.get('source')
  if (sourceMode === 'script') {
    const script = params.get('script') ?? '/fixtures/view-control.json'
    await startGame(new ScriptedControlSource(script))
    return
  }

  showBoot()
}

function showBoot(): void {
  const bootLayer = document.createElement('section')
  bootLayer.className = 'boot'
  bootLayer.innerHTML = `
    <div class="boot-panel">
      <h1>AERO HAND</h1>
      <p>Webカメラだけで動く VR 風 FPS。左手で移動とジェット、右手で視点回転と射撃を制御します。</p>
      <button class="start-button" type="button">START CAMERA</button>
    </div>
  `
  shell.appendChild(bootLayer)
  bootLayer.querySelector<HTMLButtonElement>('.start-button')?.addEventListener('click', async () => {
    bootLayer.remove()
    await startPerceptionGame()
  })
}

async function startPerceptionGame(): Promise<void> {
  let controlsShownForCalibration = false
  const calibrationLayer = document.createElement('section')
  calibrationLayer.className = 'calibration'
  calibrationLayer.innerHTML = `
    <div class="calibration-panel">
      <h1>CALIBRATION</h1>
      <p>左手を胸の前に、右手を画面中央に置いてください。両手を 2 秒間検出すると開始します。右手が画面中央なら視点は動かず、左右で yaw、上下で pitch を操作します。</p>
    </div>
  `
  shell.appendChild(calibrationLayer)

  perceptionSource = new PerceptionControlSource(shell, params.get('debug') === '1')
  await startGame(perceptionSource)

  window.setInterval(() => {
    if (perceptionSource?.calibrationReady()) {
      calibrationLayer.remove()
      if (!controlsShownForCalibration) {
        game?.showControlsBriefly()
        controlsShownForCalibration = true
      }
    }
  }, 120)

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR') {
      perceptionSource?.recalibrate()
      controlsShownForCalibration = false
      if (!calibrationLayer.isConnected) shell.appendChild(calibrationLayer)
    }
  })
}

async function startGame(source: ControlSource): Promise<void> {
  game?.dispose()
  game = new GameLoop(shell, source)
  try {
    await game.start()
  } catch (error) {
    showFatal(error)
  }
}

function showFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const fatal = document.createElement('section')
  fatal.className = 'boot'
  fatal.innerHTML = `
    <div class="boot-panel">
      <h1>STARTUP ERROR</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  `
  shell.appendChild(fatal)
}

function escapeHtml(value: string): string {
  const element = document.createElement('div')
  element.textContent = value
  return element.innerHTML
}

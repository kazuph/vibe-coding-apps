import type { ControlState } from '../control/types'
import type { DebugState } from './loop'

const CONTROLS_AUTO_COLLAPSE_MS = 8_000

export class Hud {
  readonly root: HTMLDivElement
  private readonly targetBar: HTMLSpanElement
  private readonly fuelBar: HTMLSpanElement
  private readonly targetText: HTMLSpanElement
  private readonly fuelText: HTMLSpanElement
  private readonly scoreText: HTMLSpanElement
  private readonly controlsPanel: HTMLElement
  private readonly controlsToggle: HTMLButtonElement
  private readonly warnings: HTMLDivElement
  private readonly gameOver: HTMLDivElement
  private readonly finalScore: HTMLParagraphElement
  private controlsAutoCollapseTimer = 0

  constructor(container: HTMLElement, restart: () => void) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="warning-stack"></div>
      <div class="damage-vignette"></div>
      <div class="radar"></div>
      <div class="crosshair" aria-hidden="true">AIM</div>
      <section class="hud-panel">
        <div class="hud-heading">
          <h2 class="hud-title">AERO HAND // WRIST HUD</h2>
          <button class="controls-toggle" type="button" aria-controls="controls-panel" aria-expanded="false" aria-label="操作ガイドを開く" title="操作ガイドを開く">?</button>
        </div>
        <div class="stat"><span>TARGETS</span><div class="bar danger"><span data-target-bar></span></div><span data-target-text>5</span></div>
        <div class="stat"><span>FUEL</span><div class="bar"><span data-fuel-bar></span></div><span data-fuel-text>100%</span></div>
        <div class="score-line"><span>SCORE</span><strong data-score>0</strong></div>
        <section class="controls-panel" id="controls-panel" aria-label="操作ガイド" hidden>
          <h3>CONTROLS</h3>
          <div class="control-groups">
            <section class="hand-control-group" aria-labelledby="left-controls-title">
              <img class="control-hand-image" src="/ui/controls-left-hand.png" alt="左手の前後、ストラフ、燃料制ジェットの操作方向">
              <div>
                <h4 id="left-controls-title">LEFT</h4>
                <ul class="control-description-list">
                  <li>上下: 前後 / 左右: ストラフ</li>
                  <li>OPEN PALM JET（燃料制）</li>
                </ul>
              </div>
            </section>
            <section class="hand-control-group" aria-labelledby="right-controls-title">
              <img class="control-hand-image" src="/ui/controls-right-hand.png" alt="右手の画面中央、yaw、pitch、射撃の操作方向">
              <div>
                <h4 id="right-controls-title">RIGHT</h4>
                <ul class="control-description-list">
                  <li>CENTER NEUTRAL</li>
                  <li>左右 YAW / 上下 PITCH</li>
                  <li>THUMB + INDEX FIRE</li>
                </ul>
              </div>
            </section>
          </div>
          <div class="recalibrate-control"><kbd class="recalibrate-key" aria-label="Rキー">R</kbd><span>両手の操作位置を再校正</span></div>
        </section>
      </section>
      <div class="game-over">
        <div class="game-over-panel">
          <h1>GAME OVER</h1>
          <p data-final-score>score 0</p>
          <button class="restart-button" type="button">RESTART</button>
        </div>
      </div>
    `
    container.appendChild(this.root)
    this.targetBar = this.root.querySelector('[data-target-bar]')!
    this.fuelBar = this.root.querySelector('[data-fuel-bar]')!
    this.targetText = this.root.querySelector('[data-target-text]')!
    this.fuelText = this.root.querySelector('[data-fuel-text]')!
    this.scoreText = this.root.querySelector('[data-score]')!
    this.controlsPanel = this.root.querySelector('.controls-panel')!
    this.controlsToggle = this.root.querySelector('.controls-toggle')!
    this.warnings = this.root.querySelector('.warning-stack')!
    this.gameOver = this.root.querySelector('.game-over')!
    this.finalScore = this.root.querySelector('[data-final-score]')!
    this.root.querySelector<HTMLButtonElement>('.restart-button')?.addEventListener('click', restart)
    this.controlsToggle.addEventListener('click', () => {
      window.clearTimeout(this.controlsAutoCollapseTimer)
      this.setControlsOpen(this.controlsPanel.hasAttribute('hidden'))
    })
  }

  showControlsBriefly(): void {
    window.clearTimeout(this.controlsAutoCollapseTimer)
    this.setControlsOpen(true)
    this.controlsAutoCollapseTimer = window.setTimeout(() => this.setControlsOpen(false), CONTROLS_AUTO_COLLAPSE_MS)
  }

  update(state: DebugState, control: ControlState): void {
    const targetPercent = Math.round((state.enemyCount / 5) * 100)
    this.targetBar.style.width = `${targetPercent}%`
    this.targetText.textContent = state.enemyCount.toString()
    this.root.classList.remove('is-damaged')
    this.root.style.setProperty('--damage-flash', '0')
    const fuelPercent = Math.round((state.player.fuel / 3.5) * 100)
    this.fuelBar.style.width = `${fuelPercent}%`
    this.fuelText.textContent = `${fuelPercent}%`
    this.scoreText.textContent = state.score.toString()
    const warnings: string[] = []
    if (!control.tracking.leftHand) warnings.push('LEFT HAND LOST')
    if (!control.tracking.rightHand) warnings.push('RIGHT HAND LOST')
    this.warnings.innerHTML = warnings.map((warning) => `<div>${warning}</div>`).join('')

    this.gameOver.classList.toggle('is-visible', state.gameOver)
    this.finalScore.textContent = `score ${state.score}`
  }

  dispose(): void {
    window.clearTimeout(this.controlsAutoCollapseTimer)
    this.root.remove()
  }

  private setControlsOpen(open: boolean): void {
    this.controlsPanel.hidden = !open
    this.controlsToggle.setAttribute('aria-expanded', String(open))
    const label = open ? '操作ガイドを閉じる' : '操作ガイドを開く'
    this.controlsToggle.setAttribute('aria-label', label)
    this.controlsToggle.title = label
  }
}

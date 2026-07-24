import * as THREE from 'three'
import { createCity, createWeapon } from '../assets'
import type { CityAsset, WeaponViewModel } from '../assets/contract'
import type { ControlState } from '../control/types'
import type { PlayerController } from './player'

export class GameWorld {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000)
  readonly renderer: THREE.WebGLRenderer
  readonly city: CityAsset
  readonly weapon: WeaponViewModel

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color('#05060f')
    this.scene.fog = new THREE.FogExp2(0x05060f, 0.006)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.domElement.className = 'game-canvas'
    container.appendChild(this.renderer.domElement)

    const ambient = new THREE.AmbientLight(0x10204a, 0.7)
    this.scene.add(ambient)
    const cyan = new THREE.DirectionalLight(0x00f0ff, 1.1)
    cyan.position.set(-60, 90, 40)
    this.scene.add(cyan)
    const magenta = new THREE.DirectionalLight(0xff2d95, 0.85)
    magenta.position.set(80, 80, -70)
    this.scene.add(magenta)

    this.city = createCity(46)
    this.scene.add(this.city.group)

    this.weapon = createWeapon()
    this.weapon.group.position.set(0.32, -0.28, -0.58)
    this.weapon.group.rotation.set(0, 0, 0)
    this.camera.add(this.weapon.group)
    this.scene.add(this.camera)

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  update(dt: number, elapsed: number, player: PlayerController, control: ControlState): void {
    this.city.update(dt, elapsed)
    this.weapon.update(dt)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.copy(player.position)
    this.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')

    const aimOffset = control.aim
    this.weapon.group.position.x = 0.32 + aimOffset.x * 0.04
    this.weapon.group.position.y = -0.28 + aimOffset.y * 0.03
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private resize = (): void => {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }
}

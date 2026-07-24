import type { DebugGameApi } from './game/loop'

declare global {
  interface Window {
    __game?: DebugGameApi
  }
}

export {}

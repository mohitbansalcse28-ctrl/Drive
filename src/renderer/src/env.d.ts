import type { LuminaApi } from '@shared/types'

declare global {
  interface Window {
    lumina: LuminaApi
  }
}

export {}

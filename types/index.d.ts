export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** Quanto questa sessione ha consumato. */
export type SessionSpend = {
  /** Token sommati dalle risposte di questa sessione (input + output + scrittura cache). */
  tokens: number
  /** Token letti dalla cache (contano poco sui limiti, tenuti a parte). */
  cacheRead: number
  /** Costo equivalente in dollari, come /cost. */
  usd: number
  /** Per finestra (five_hour, seven_day): punti percentuali saliti mentre questa sessione lavorava. */
  share: Record<string, number>
  /** Ultima percentuale vista per finestra, per calcolare i salti. */
  lastSeen: Record<string, number>
}

/** Primo campione di una finestra, per la previsione; ricomincia a ogni reset. */
export type Sample = { t: number; pct: number; resetsAt?: string }

export type BarStyle = 'block' | 'square' | 'dot'

/** Le preferenze, salvate in $.store e valide in tutte le chat. */
export type Settings = {
  /** 'auto' = semaforo secondo le soglie; altrimenti un colore fisso (hex). */
  color: string
  warn: number
  crit: number
  showFive: boolean
  showWeek: boolean
  showChat: boolean
  style: BarStyle
  width: number
  compact: boolean
  alerts: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bars': {
      limits: Limit[]
      spend: SessionSpend
      settings: Settings
      panelOpen: boolean
      samples: Record<string, Sample>
      alerted: Record<string, number>
    }
  }
}

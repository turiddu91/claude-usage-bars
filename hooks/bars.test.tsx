import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-bars',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false },
} as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 61, resetsAt: '2026-11-12T15:00:00Z' },
  { kind: 'seven_day', percentUsed: 8, resetsAt: '2026-11-17T06:00:00Z' },
]

test('le barre si disegnano e la rotellina apre il pannello', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: LIMITS, cost: { usd: 1.5 } },
  }))
  on('clock.now', () => ({ value: Date.parse('2026-11-12T14:30:00Z') }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const label = await ui.find({ type: 'Text', text: /Sessione/ })
    expect(label?.text).toBe('Sessione (5h)')
    await ui.press({ key: 'gear' })
    const fatto = await ui.find({ type: 'Button', key: 't-close' })
    expect(fatto).toBeTruthy()
    await ui.press({ key: 'gear' })
    await ui.unmount()
  }
})

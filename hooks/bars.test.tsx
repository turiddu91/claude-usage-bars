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

const CASES = [
  // Impostazioni salvate dalla versione solo italiana (senza lingua): restano in italiano.
  { name: 'italiano per chi aveva già la mod', saved: { color: 'auto' }, expected: 'Sessione (5h)' },
  { name: 'inglese scelto nelle impostazioni', saved: { lang: 'en' }, expected: 'Session (5h)' },
]

for (const c of CASES) {
  test(`barre e pannello: ${c.name}`, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({
      value: { startedAt: 0, context: { window: 200000 }, rateLimits: LIMITS, cost: { usd: 1.5 } },
    }))
    on('clock.now', () => ({ value: Date.parse('2026-11-12T14:30:00Z') }))
    on('ui.toast', () => ({ value: undefined }))
    on('store.get', () => ({ value: c.saved }))
    on('store.set', () => ({ value: undefined }))

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

    for (const surface of ['desktop', 'terminal'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const label = await ui.find({ type: 'Text', text: /\(5h\)/ })
      expect(label?.text).toBe(c.expected)
      await ui.press({ key: 'gear' })
      const done = await ui.find({ type: 'Button', key: 't-close' })
      expect(done).toBeTruthy()
      await ui.press({ key: 'gear' })
      await ui.unmount()
    }
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BarStyle, Limit, Sample, SessionSpend, Settings } from '../types'

const DEFAULTS: Settings = {
  color: 'auto',
  warn: 70,
  crit: 90,
  showFive: true,
  showWeek: true,
  showChat: true,
  style: 'block',
  width: 20,
  compact: false,
  alerts: true,
}

const limits = atom({ plugin: 'usage-bars', key: 'limits' } as const, [] as Limit[])
const spend = atom({ plugin: 'usage-bars', key: 'spend' } as const, {
  tokens: 0,
  cacheRead: 0,
  usd: 0,
  share: {},
  lastSeen: {},
} as SessionSpend)
const settings = atom({ plugin: 'usage-bars', key: 'settings' } as const, DEFAULTS)
const panelOpen = atom({ plugin: 'usage-bars', key: 'panelOpen' } as const, false)
const samples = atom({ plugin: 'usage-bars', key: 'samples' } as const, {} as Record<string, Sample>)
const alerted = atom({ plugin: 'usage-bars', key: 'alerted' } as const, {} as Record<string, number>)

const LABELS: Record<string, string> = {
  five_hour: 'Sessione (5h)',
  seven_day: 'Settimana',
  spend_limit: 'Spesa',
}
const SHORT: Record<string, string> = { five_hour: '5h', seven_day: 'Sett.', spend_limit: 'Spesa' }

const COLORS: { label: string; value: string }[] = [
  { label: 'Automatico (semaforo)', value: 'auto' },
  { label: 'Blu', value: '#4f8ff7' },
  { label: 'Viola', value: '#a779f2' },
  { label: 'Ciano', value: '#3cc4d6' },
  { label: 'Arancio', value: '#f2994a' },
  { label: 'Rosa', value: '#ec6fae' },
  { label: 'Grigio', value: '#9aa0a6' },
]

/** Il semaforo in esadecimale: serve all'SVG, che non conosce i colori del tema. */
const LIGHTS = { ok: '#3fb950', warn: '#d29922', crit: '#f85149' }

const GLYPHS: Record<BarStyle, [string, string]> = {
  block: ['█', '░'],
  square: ['■', '□'],
  dot: ['●', '○'],
}

/** Lunghezza della barra: celle nel terminale, pixel su desktop. */
const PIXELS: Record<number, number> = { 10: 110, 20: 180, 30: 260 }

const DAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

// ---------- formattazione ----------

function textBar(pct: number, s: Settings, width: number): string {
  const [on, off] = GLYPHS[s.style] ?? GLYPHS.block
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return on.repeat(filled) + off.repeat(width - filled)
}

function svgBar(pct: number, fill: string, width: number): string {
  const h = 10
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  const fg = filled > 0 ? `<rect x="0" y="0" width="${Math.max(filled, h)}" height="${h}" rx="5" fill="${fill}"/>` : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">` +
    `<rect x="0" y="0" width="${width}" height="${h}" rx="5" fill="#8b8b8b" fill-opacity="0.25"/>` +
    fg +
    `</svg>`
  )
}

function hex(pct: number, s: Settings): string {
  if (s.color !== 'auto') return s.color
  if (pct >= s.crit) return LIGHTS.crit
  if (pct >= s.warn) return LIGHTS.warn
  return LIGHTS.ok
}

function clock(ms: number, withDay: boolean): string {
  const d = new Date(ms)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return withDay ? `${DAYS[d.getDay()]} ${hm}` : hm
}

function duration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}g ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function resetText(l: Limit, now: number): string {
  if (!l.resetsAt) return ''
  const at = Date.parse(l.resetsAt)
  if (!Number.isFinite(at) || at <= now) return ''
  const longWindow = at - now > 20 * 3600 * 1000
  return `reset ${clock(at, longWindow)} (tra ${duration(at - now)})`
}

/** Al ritmo visto da questa chat, quando si arriva al 100%? Solo se prima del reset. */
function forecast(l: Limit, sample: Sample | undefined, now: number): string {
  if (!sample || !l.resetsAt || sample.resetsAt !== l.resetsAt) return ''
  const dt = now - sample.t
  const dp = l.percentUsed - sample.pct
  // La finestra settimanale va osservata più a lungo, o un'ora intensa sembra la norma.
  const minObserve = l.kind === 'seven_day' ? 3 * 3600 * 1000 : 10 * 60000
  if (dt < minObserve || dp <= 0) return ''
  const eta = now + ((100 - l.percentUsed) / dp) * dt
  const reset = Date.parse(l.resetsAt)
  if (!Number.isFinite(reset) || eta >= reset) return ''
  return `⚠ A questo ritmo arrivi al 100% ${dayDate(eta, now)}, prima del reset`
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** "oggi 18:30", oppure "sab 21 nov 04:30". */
function dayDate(ms: number, now: number): string {
  const d = new Date(ms)
  const hm = clock(ms, false)
  if (d.toDateString() === new Date(now).toDateString()) return `oggi alle ${hm}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} alle ${hm}`
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function pct(n: number): string {
  return n < 10 ? n.toFixed(1).replace('.', ',') : String(Math.round(n))
}

function visible(l: Limit, s: Settings): boolean {
  if (l.kind === 'five_hour') return s.showFive
  if (l.kind === 'seven_day') return s.showWeek
  return true
}

function details(parts: string[]): string {
  return parts.filter(Boolean).join(' · ')
}

// ---------- calcoli sui dati ----------

/** Somma i punti saliti in ogni finestra dall'ultima lettura; un calo è un reset e azzera la quota. */
function track(s: SessionSpend, rateLimits: readonly Limit[]): SessionSpend {
  const share = { ...s.share }
  const lastSeen = { ...s.lastSeen }
  for (const r of rateLimits) {
    const prev = lastSeen[r.kind]
    if (prev !== undefined) {
      if (r.percentUsed >= prev) share[r.kind] = (share[r.kind] ?? 0) + (r.percentUsed - prev)
      else share[r.kind] = 0
    }
    lastSeen[r.kind] = r.percentUsed
  }
  return { ...s, share, lastSeen }
}

function sampleAll(prev: Record<string, Sample>, rateLimits: readonly Limit[], now: number) {
  const next = { ...prev }
  for (const r of rateLimits) {
    const s = next[r.kind]
    if (!s || s.resetsAt !== r.resetsAt || r.percentUsed < s.pct) {
      next[r.kind] = { t: now, pct: r.percentUsed, resetsAt: r.resetsAt }
    }
  }
  return next
}

async function ingest($: EngineInterface, rl: readonly Limit[]) {
  const now = await $.clock.now()
  await update($, limits, () => rl.map(r => ({ ...r })))
  await update($, samples, prev => sampleAll(prev, rl, now))

  const s = await read($, settings)
  if (!s.alerts) return
  const done = await read($, alerted)
  const fresh: Record<string, number> = {}
  for (const r of rl) {
    const level = r.percentUsed >= s.crit ? 2 : r.percentUsed >= s.warn ? 1 : 0
    const key = `${r.kind}|${r.resetsAt ?? ''}`
    if (level > (done[key] ?? 0)) {
      fresh[key] = level
      $.ui.toast(
        `${level === 2 ? '🔴' : '🟡'} ${LABELS[r.kind] ?? r.kind}: ${Math.round(r.percentUsed)}% del limite usato · ${resetText(r, now)}`,
      )
    }
  }
  if (Object.keys(fresh).length > 0) await update($, alerted, a => ({ ...a, ...fresh }))
}

async function saveSettings($: EngineInterface, patch: Partial<Settings>) {
  const nextS = { ...(await read($, settings)), ...patch }
  await update($, settings, () => nextS)
  await $.store.set('settings', nextS)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') {
      await update($, settings, () => ({ ...DEFAULTS, ...(saved as Partial<Settings>) }))
    }
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) await ingest($, usage.rateLimits)
    await update($, spend, s => {
      const t = track(s, usage.rateLimits)
      return usage.cost ? { ...t, usd: usage.cost.usd } : t
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await ingest($, e.rateLimits)
    await update($, spend, s => {
      const t = e.changed.includes('rateLimits') ? track(s, e.rateLimits) : s
      return e.cost ? { ...t, usd: e.cost.usd } : t
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      await update($, spend, s => ({
        ...s,
        tokens: s.tokens + u.input_tokens + u.output_tokens + u.cache_creation_input_tokens,
        cacheRead: s.cacheRead + u.cache_read_input_tokens,
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, limits)
    const sp = await read($, spend)
    if (e.props.hasSurvey || (list.length === 0 && sp.tokens + sp.cacheRead === 0)) {
      return next(e)
    }

    const s = await read($, settings)
    const open = await read($, panelOpen)
    const smp = await read($, samples)
    const now = await $.clock.now()
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Select } = els
    const Svg = 'Svg' in els ? els.Svg : undefined

    const shown = list.filter(l => visible(l, s))
    const total = sp.tokens + sp.cacheRead

    const barOf = (l: Limit, small: boolean) =>
      Svg ? (
        <Svg
          key={`bar-${l.kind}`}
          source={svgBar(l.percentUsed, hex(l.percentUsed, s), small ? 70 : PIXELS[s.width] ?? 180)}
          alt={`${LABELS[l.kind] ?? l.kind}: ${Math.round(l.percentUsed)}%`}
        />
      ) : (
        <Text key={`bar-${l.kind}`} color={hex(l.percentUsed, s)}>
          {textBar(l.percentUsed, s, small ? 8 : s.width)}
        </Text>
      )

    // ----- righe dei dati -----
    const rows = s.compact ? (
      <Box key="compact" flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
        {shown.map(l => (
          <Box key={l.kind} flexDirection="row" columnGap={1} alignItems="center">
            <Text dimColor>{SHORT[l.kind] ?? l.kind}</Text>
            {barOf(l, true)}
            <Text bold>{Math.round(l.percentUsed)}%</Text>
            {s.showChat && sp.share[l.kind] !== undefined ? (
              <Text dimColor>chat ~{pct(sp.share[l.kind])}%</Text>
            ) : null}
          </Box>
        ))}
        {s.showChat ? <Text dimColor>chat {tokens(total)} token</Text> : null}
      </Box>
    ) : (
      <Box key="full" flexDirection="column" rowGap={0}>
        {shown.map(l => {
          const mine = s.showChat ? sp.share[l.kind] : undefined
          const warn = forecast(l, smp[l.kind], now)
          return (
            <Box key={l.kind} flexDirection="column">
              <Box key="row" flexDirection="row" columnGap={1} alignItems="center">
                <Box key="lbl" minWidth={14}>
                  <Text dimColor>{LABELS[l.kind] ?? l.kind}</Text>
                </Box>
                {barOf(l, false)}
                <Box key="pct" minWidth={5}>
                  <Text bold>{Math.round(l.percentUsed)}%</Text>
                </Box>
                <Box key="info" flexShrink={1}>
                  <Text dimColor wrap="truncate-end">
                    {details([mine !== undefined ? `chat ~${pct(mine)}%` : '', resetText(l, now)])}
                  </Text>
                </Box>
              </Box>
              {warn ? (
                <Box key="warn" flexDirection="row" columnGap={1}>
                  <Box key="lbl" minWidth={14}>
                    <Text> </Text>
                  </Box>
                  <Text color={LIGHTS.warn}>{warn}</Text>
                </Box>
              ) : null}
            </Box>
          )
        })}
        {s.showChat ? (
          <Box key="chat" flexDirection="row" columnGap={1}>
            <Box key="lbl" minWidth={14}>
              <Text dimColor>Questa chat</Text>
            </Box>
            <Text>{tokens(total)} token</Text>
            <Text dimColor>
              {details([
                sp.cacheRead > 0 ? `${tokens(sp.cacheRead)} da cache` : '',
                sp.usd > 0 ? `~$${sp.usd.toFixed(2).replace('.', ',')} se pagata a consumo` : '',
              ])}
            </Text>
          </Box>
        ) : null}
        {shown.length === 0 && !s.showChat ? <Text dimColor>Tutte le righe sono nascoste: apri ⚙</Text> : null}
      </Box>
    )

    // ----- pannello impostazioni -----
    const toggle = (key: string, label: string, isOn: boolean, patch: Partial<Settings>) => (
      <Button
        key={key}
        label={`${isOn ? '✓' : '○'} ${label}`}
        dimColor={!isOn}
        onPress={() => saveSettings($, patch)}
      />
    )

    const panel = open ? (
      <Box key="panel" flexDirection="column" rowGap={1} marginTop={1}>
        <Box key="selects" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
          <Select
            key="sel-color"
            label="Colore"
            value={s.color}
            options={COLORS}
            onSelect={v => void saveSettings($, { color: v })}
          />
          <Select
            key="sel-warn"
            label="Giallo da"
            value={String(s.warn)}
            options={[50, 60, 70, 80].map(v => ({ value: String(v), label: `${v}%` }))}
            onSelect={v => void saveSettings($, { warn: Number(v) })}
          />
          <Select
            key="sel-crit"
            label="Rosso da"
            value={String(s.crit)}
            options={[80, 85, 90, 95].map(v => ({ value: String(v), label: `${v}%` }))}
            onSelect={v => void saveSettings($, { crit: Number(v) })}
          />
          <Select
            key="sel-width"
            label="Lunghezza"
            value={String(s.width)}
            options={[
              { value: '10', label: 'Corta' },
              { value: '20', label: 'Media' },
              { value: '30', label: 'Lunga' },
            ]}
            onSelect={v => void saveSettings($, { width: Number(v) })}
          />
          {Svg ? null : (
            <Select
              key="sel-style"
              label="Stile"
              value={s.style}
              options={[
                { value: 'block', label: '█░ pieno' },
                { value: 'square', label: '■□ quadretti' },
                { value: 'dot', label: '●○ pallini' },
              ]}
              onSelect={v => void saveSettings($, { style: v as BarStyle })}
            />
          )}
        </Box>
        <Box key="toggles" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {toggle('t-5', '5 ore', s.showFive, { showFive: !s.showFive })}
          {toggle('t-w', 'Settimana', s.showWeek, { showWeek: !s.showWeek })}
          {toggle('t-c', 'Questa chat', s.showChat, { showChat: !s.showChat })}
          {toggle('t-a', 'Avvisi', s.alerts, { alerts: !s.alerts })}
          {toggle('t-k', 'Compatta', s.compact, { compact: !s.compact })}
          <Button key="t-reset" label="Ripristina" dimColor onPress={() => saveSettings($, { ...DEFAULTS })} />
          <Button key="t-close" label="Fatto" variant="primary" onPress={() => update($, panelOpen, () => false)} />
        </Box>
      </Box>
    ) : null

    return (
      <Box flexDirection="column">
        <Box key="top" flexDirection="row" alignItems="flex-start">
          <Box key="rows" flexGrow={1} flexDirection="column">
            {rows}
          </Box>
          <Button
            key="gear"
            label="⚙"
            plain
            dimColor={!open}
            onPress={() => update($, panelOpen, o => !o)}
          />
        </Box>
        {panel}
      </Box>
    )
  })
}

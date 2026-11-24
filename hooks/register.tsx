import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BarStyle, Lang, Limit, Sample, SessionSpend, Settings } from '../types'

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
  lang: 'auto',
  hidden: false,
}

const limits = atom({ plugin: 'usage-bars', key: 'limits' } as const, [] as Limit[])
const spend = atom({ plugin: 'usage-bars', key: 'spend' } as const, {
  tokens: 0,
  cacheRead: 0,
  usd: 0,
  share: {},
  lastSeen: {},
} as SessionSpend)
/** Le impostazioni di prima, uguali ovunque: valgono dove una superficie non ha le sue. */
const settings = atom({ plugin: 'usage-bars', key: 'settings' } as const, DEFAULTS)
/** Le impostazioni di ogni superficie: app desktop, VS Code, terminale, app mobile. */
const bySurface = atom({ plugin: 'usage-bars', key: 'bySurface' } as const, {} as Record<string, Settings>)
const panelOpen = atom({ plugin: 'usage-bars', key: 'panelOpen' } as const, false)
const samples = atom({ plugin: 'usage-bars', key: 'samples' } as const, {} as Record<string, Sample>)
const alerted = atom({ plugin: 'usage-bars', key: 'alerted' } as const, {} as Record<string, number>)

// ---------- testi ----------

type Dict = {
  labels: Record<string, string>
  short: Record<string, string>
  days: string[]
  months: string[]
  dayUnit: string
  decimal: string
  resets: (when: string, left: string) => string
  forecast: (when: string) => string
  today: (hm: string) => string
  date: (dow: string, day: number, month: string, hm: string) => string
  thisChat: string
  tokenWord: string
  fromCache: string
  payg: (usd: string) => string
  allHidden: string
  toast: (label: string, p: number, reset: string) => string
  colors: string[]
  color: string
  yellowFrom: string
  redFrom: string
  length: string
  lengths: [string, string, string]
  style: string
  styles: [string, string, string]
  language: string
  langAuto: string
  fiveHours: string
  week: string
  alerts: string
  compact: string
  reset: string
  done: string
  hideHere: string
  surfaces: Record<string, string>
  scope: (where: string) => string
  cmdHidden: (where: string) => string
  cmdShown: (where: string) => string
}

const TEXTS: Record<'en' | 'it', Dict> = {
  en: {
    labels: { five_hour: 'Session (5h)', seven_day: 'Week', spend_limit: 'Spend' },
    short: { five_hour: '5h', seven_day: 'Week', spend_limit: 'Spend' },
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    dayUnit: 'd',
    decimal: '.',
    resets: (when, left) => `resets ${when} (in ${left})`,
    forecast: when => `⚠ At this pace you'll hit 100% ${when}, before the reset`,
    today: hm => `today at ${hm}`,
    date: (dow, day, month, hm) => `${dow} ${month} ${day} at ${hm}`,
    thisChat: 'This chat',
    tokenWord: 'tokens',
    fromCache: 'from cache',
    payg: usd => `~$${usd} at API prices`,
    allHidden: 'All rows are hidden: open ⚙',
    toast: (label, p, reset) => `${label}: ${p}% of the limit used · ${reset}`,
    colors: ['Automatic (traffic light)', 'Blue', 'Purple', 'Cyan', 'Orange', 'Pink', 'Grey'],
    color: 'Colour',
    yellowFrom: 'Yellow from',
    redFrom: 'Red from',
    length: 'Length',
    lengths: ['Short', 'Medium', 'Long'],
    style: 'Style',
    styles: ['█░ solid', '■□ squares', '●○ dots'],
    language: 'Language',
    langAuto: 'Automatic',
    fiveHours: '5 hours',
    week: 'Week',
    alerts: 'Alerts',
    compact: 'Compact',
    reset: 'Reset',
    done: 'Done',
    hideHere: 'Hide here',
    surfaces: { desktop: 'the desktop app', vscode: 'VS Code', terminal: 'the terminal', mobile: 'the mobile app' },
    scope: where => `These settings apply only to ${where}. Hidden bars come back with /usage-bars.`,
    cmdHidden: where => `Usage bars hidden in ${where}. Run /usage-bars again to bring them back.`,
    cmdShown: where => `Usage bars shown again in ${where}.`,
  },
  it: {
    labels: { five_hour: 'Sessione (5h)', seven_day: 'Settimana', spend_limit: 'Spesa' },
    short: { five_hour: '5h', seven_day: 'Sett.', spend_limit: 'Spesa' },
    days: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
    months: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
    dayUnit: 'g',
    decimal: ',',
    resets: (when, left) => `reset ${when} (tra ${left})`,
    forecast: when => `⚠ A questo ritmo arrivi al 100% ${when}, prima del reset`,
    today: hm => `oggi alle ${hm}`,
    date: (dow, day, month, hm) => `${dow} ${day} ${month} alle ${hm}`,
    thisChat: 'Questa chat',
    tokenWord: 'token',
    fromCache: 'da cache',
    payg: usd => `~$${usd} se pagata a consumo`,
    allHidden: 'Tutte le righe sono nascoste: apri ⚙',
    toast: (label, p, reset) => `${label}: ${p}% del limite usato · ${reset}`,
    colors: ['Automatico (semaforo)', 'Blu', 'Viola', 'Ciano', 'Arancio', 'Rosa', 'Grigio'],
    color: 'Colore',
    yellowFrom: 'Giallo da',
    redFrom: 'Rosso da',
    length: 'Lunghezza',
    lengths: ['Corta', 'Media', 'Lunga'],
    style: 'Stile',
    styles: ['█░ pieno', '■□ quadretti', '●○ pallini'],
    language: 'Lingua',
    langAuto: 'Automatica',
    fiveHours: '5 ore',
    week: 'Settimana',
    alerts: 'Avvisi',
    compact: 'Compatta',
    reset: 'Ripristina',
    done: 'Fatto',
    hideHere: 'Nascondi qui',
    surfaces: { desktop: "nell'app desktop", vscode: 'in VS Code', terminal: 'nel terminale', mobile: "nell'app mobile" },
    scope: where => `Queste impostazioni valgono solo ${where}. Le barre nascoste si rimettono con /usage-bars.`,
    cmdHidden: where => `Barre nascoste ${where}. Scrivi di nuovo /usage-bars per rimetterle.`,
    cmdShown: where => `Barre di nuovo visibili ${where}.`,
  },
}

/** La lingua del sistema, se si riesce a leggerla. */
function systemLang(): 'en' | 'it' {
  try {
    const loc = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : ''
    return loc.toLowerCase().startsWith('it') ? 'it' : 'en'
  } catch {
    return 'en'
  }
}

/** Le impostazioni di una superficie; dove non ne ha di sue, quelle comuni. */
function settingsFor(base: Settings, map: Record<string, Settings>, surface: string | null | undefined): Settings {
  return (surface ? map[surface] : undefined) ?? base
}

function dict(lang: Lang): Dict {
  return TEXTS[lang === 'auto' ? systemLang() : lang] ?? TEXTS.en
}

const COLOR_VALUES = ['auto', '#4f8ff7', '#a779f2', '#3cc4d6', '#f2994a', '#ec6fae', '#9aa0a6']

/** Il semaforo in esadecimale: serve all'SVG, che non conosce i colori del tema. */
const LIGHTS = { ok: '#3fb950', warn: '#d29922', crit: '#f85149' }

const GLYPHS: Record<BarStyle, [string, string]> = {
  block: ['█', '░'],
  square: ['■', '□'],
  dot: ['●', '○'],
}

/** Lunghezza della barra: celle nel terminale, pixel su desktop. */
const PIXELS: Record<number, number> = { 10: 110, 20: 180, 30: 260 }

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

function hm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function clock(ms: number, withDay: boolean, t: Dict): string {
  return withDay ? `${t.days[new Date(ms).getDay()]} ${hm(ms)}` : hm(ms)
}

function duration(ms: number, t: Dict): string {
  const mins = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}${t.dayUnit} ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function resetText(l: Limit, now: number, t: Dict): string {
  if (!l.resetsAt) return ''
  const at = Date.parse(l.resetsAt)
  if (!Number.isFinite(at) || at <= now) return ''
  const longWindow = at - now > 20 * 3600 * 1000
  return t.resets(clock(at, longWindow, t), duration(at - now, t))
}

/** "oggi alle 18:30", oppure "sab 21 nov alle 04:30". */
function dayDate(ms: number, now: number, t: Dict): string {
  const d = new Date(ms)
  if (d.toDateString() === new Date(now).toDateString()) return t.today(hm(ms))
  return t.date(t.days[d.getDay()] ?? "", d.getDate(), t.months[d.getMonth()] ?? "", hm(ms))
}

/** Al ritmo visto da questa chat, quando si arriva al 100%? Solo se prima del reset. */
function forecast(l: Limit, sample: Sample | undefined, now: number, t: Dict): string {
  if (!sample || !l.resetsAt || sample.resetsAt !== l.resetsAt) return ''
  const dt = now - sample.t
  const dp = l.percentUsed - sample.pct
  // La finestra settimanale va osservata più a lungo, o un'ora intensa sembra la norma.
  const minObserve = l.kind === 'seven_day' ? 3 * 3600 * 1000 : 30 * 60000
  if (dt < minObserve || dp <= 0) return ''
  const eta = now + ((100 - l.percentUsed) / dp) * dt
  const reset = Date.parse(l.resetsAt)
  if (!Number.isFinite(reset) || eta >= reset) return ''
  return t.forecast(dayDate(eta, now, t))
}

function num(n: number, digits: number, t: Dict): string {
  return n.toFixed(digits).replace('.', t.decimal)
}

function tokens(n: number, t: Dict): string {
  if (n >= 1_000_000) return `${num(n / 1_000_000, 1, t)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function pct(n: number, t: Dict): string {
  return n < 10 ? num(n, 1, t) : String(Math.round(n))
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

  const surfs = await $.session.surfaces()
  const s = settingsFor(await read($, settings), await read($, bySurface), surfs[0])
  if (!s.alerts) return
  const t = dict(s.lang)
  const done = await read($, alerted)
  const fresh: Record<string, number> = {}
  for (const r of rl) {
    const level = r.percentUsed >= s.crit ? 2 : r.percentUsed >= s.warn ? 1 : 0
    const key = `${r.kind}|${r.resetsAt ?? ''}`
    if (level > (done[key] ?? 0)) {
      fresh[key] = level
      $.ui.toast(
        `${level === 2 ? '🔴' : '🟡'} ${t.toast(t.labels[r.kind] ?? r.kind, Math.round(r.percentUsed), resetText(r, now, t))}`,
      )
    }
  }
  if (Object.keys(fresh).length > 0) await update($, alerted, a => ({ ...a, ...fresh }))
}

/** Salva una modifica solo per la superficie indicata. */
async function saveSettings($: EngineInterface, surface: string, patch: Partial<Settings>) {
  const map = await read($, bySurface)
  const nextS = { ...settingsFor(await read($, settings), map, surface), ...patch }
  const nextMap = { ...map, [surface]: nextS }
  await update($, bySurface, () => nextMap)
  await $.store.set('surfaces', nextMap)
}

/** "Nascondi qui": nasconde le barre e dice subito come rimetterle. */
async function hideHere($: EngineInterface, surface: string, message: string) {
  await update($, panelOpen, () => false)
  await saveSettings($, surface, { hidden: true })
  $.ui.toast(message)
}

/** /usage-bars: nasconde o rimette le barre sulle superfici di questa sessione. */
async function toggleHidden($: EngineInterface) {
  const found = await $.session.surfaces()
  const targets: string[] = found.length > 0 ? [...found] : ['terminal']
  const first = settingsFor(await read($, settings), await read($, bySurface), targets[0])
  const hide = !first.hidden
  for (const surface of targets) await saveSettings($, surface, { hidden: hide })
  const t = dict(first.lang)
  const where = targets.map(x => t.surfaces[x] ?? x).join(', ')
  return { text: hide ? t.cmdHidden(where) : t.cmdShown(where), isTextDisplayOnly: true as const }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') {
      const prev = saved as Partial<Settings>
      // Chi aveva già la versione solo italiana la ritrova in italiano.
      const lang: Lang = prev.lang ?? 'it'
      await update($, settings, () => ({ ...DEFAULTS, ...prev, lang }))
    }
    const perSurface = await $.store.get('surfaces')
    if (perSurface && typeof perSurface === 'object') {
      const map: Record<string, Settings> = {}
      for (const [k, v] of Object.entries(perSurface as Record<string, Partial<Settings>>)) {
        map[k] = { ...DEFAULTS, ...v }
      }
      await update($, bySurface, () => map)
    }
    await $.command.register({ name: 'usage-bars', description: 'Show or hide the usage bars here' })
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

  on('command.run', { command: 'usage-bars' }, async $ => toggleHidden($))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, limits)
    const sp = await read($, spend)
    if (e.props.hasSurvey || (list.length === 0 && sp.tokens + sp.cacheRead === 0)) {
      return next(e)
    }

    const s = settingsFor(await read($, settings), await read($, bySurface), e.surface)
    if (s.hidden) return next(e)
    const t = dict(s.lang)
    const here = e.surface
    const open = await read($, panelOpen)
    const smp = await read($, samples)
    const now = await $.clock.now()
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Select } = els
    const Svg = 'Svg' in els ? els.Svg : undefined

    const shown = list.filter(l => visible(l, s))
    const total = sp.tokens + sp.cacheRead
    const label = (l: Limit) => t.labels[l.kind] ?? l.kind

    const barOf = (l: Limit, small: boolean) =>
      Svg ? (
        <Svg
          key={`bar-${l.kind}`}
          source={svgBar(l.percentUsed, hex(l.percentUsed, s), small ? 70 : PIXELS[s.width] ?? 180)}
          alt={`${label(l)}: ${Math.round(l.percentUsed)}%`}
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
            <Text dimColor>{t.short[l.kind] ?? l.kind}</Text>
            {barOf(l, true)}
            <Text bold>{Math.round(l.percentUsed)}%</Text>
            {s.showChat && sp.share[l.kind] !== undefined ? (
              <Text dimColor>chat ~{pct(sp.share[l.kind] ?? 0, t)}%</Text>
            ) : null}
          </Box>
        ))}
        {s.showChat ? <Text dimColor>chat {tokens(total, t)} {t.tokenWord}</Text> : null}
      </Box>
    ) : (
      <Box key="full" flexDirection="column" rowGap={0}>
        {shown.map(l => {
          const mine = s.showChat ? sp.share[l.kind] : undefined
          const warn = forecast(l, smp[l.kind], now, t)
          return (
            <Box key={l.kind} flexDirection="column">
              <Box key="row" flexDirection="row" columnGap={1} alignItems="center">
                <Box key="lbl" minWidth={14}>
                  <Text dimColor>{label(l)}</Text>
                </Box>
                {barOf(l, false)}
                <Box key="pct" minWidth={5}>
                  <Text bold>{Math.round(l.percentUsed)}%</Text>
                </Box>
                <Box key="info" flexShrink={1}>
                  <Text dimColor wrap="truncate-end">
                    {details([mine !== undefined ? `chat ~${pct(mine, t)}%` : '', resetText(l, now, t)])}
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
              <Text dimColor>{t.thisChat}</Text>
            </Box>
            <Text>
              {tokens(total, t)} {t.tokenWord}
            </Text>
            <Text dimColor>
              {details([
                sp.cacheRead > 0 ? `${tokens(sp.cacheRead, t)} ${t.fromCache}` : '',
                sp.usd > 0 ? t.payg(num(sp.usd, 2, t)) : '',
              ])}
            </Text>
          </Box>
        ) : null}
        {shown.length === 0 && !s.showChat ? <Text dimColor>{t.allHidden}</Text> : null}
      </Box>
    )

    // ----- pannello impostazioni -----
    const toggle = (key: string, text: string, isOn: boolean, patch: Partial<Settings>) => (
      <Button
        key={key}
        label={`${isOn ? '✓' : '○'} ${text}`}
        dimColor={!isOn}
        onPress={() => saveSettings($, here, patch)}
      />
    )

    const panel = open ? (
      <Box key="panel" flexDirection="column" rowGap={1} marginTop={1}>
        <Text key="scope" dimColor>
          {t.scope(t.surfaces[here] ?? here)}
        </Text>
        <Box key="selects" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
          <Select
            key="sel-color"
            label={t.color}
            value={s.color}
            options={COLOR_VALUES.map((value, i) => ({ value, label: t.colors[i] }))}
            onSelect={v => void saveSettings($, here, { color: v })}
          />
          <Select
            key="sel-warn"
            label={t.yellowFrom}
            value={String(s.warn)}
            options={[50, 60, 70, 80].map(v => ({ value: String(v), label: `${v}%` }))}
            onSelect={v => void saveSettings($, here, { warn: Number(v) })}
          />
          <Select
            key="sel-crit"
            label={t.redFrom}
            value={String(s.crit)}
            options={[80, 85, 90, 95].map(v => ({ value: String(v), label: `${v}%` }))}
            onSelect={v => void saveSettings($, here, { crit: Number(v) })}
          />
          <Select
            key="sel-width"
            label={t.length}
            value={String(s.width)}
            options={['10', '20', '30'].map((value, i) => ({ value, label: t.lengths[i] }))}
            onSelect={v => void saveSettings($, here, { width: Number(v) })}
          />
          {Svg ? null : (
            <Select
              key="sel-style"
              label={t.style}
              value={s.style}
              options={(['block', 'square', 'dot'] as const).map((value, i) => ({ value, label: t.styles[i] }))}
              onSelect={v => void saveSettings($, here, { style: v as BarStyle })}
            />
          )}
          <Select
            key="sel-lang"
            label={t.language}
            value={s.lang}
            options={[
              { value: 'auto', label: t.langAuto },
              { value: 'en', label: 'English' },
              { value: 'it', label: 'Italiano' },
            ]}
            onSelect={v => void saveSettings($, here, { lang: v as Lang })}
          />
        </Box>
        <Box key="toggles" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {toggle('t-5', t.fiveHours, s.showFive, { showFive: !s.showFive })}
          {toggle('t-w', t.week, s.showWeek, { showWeek: !s.showWeek })}
          {toggle('t-c', t.thisChat, s.showChat, { showChat: !s.showChat })}
          {toggle('t-a', t.alerts, s.alerts, { alerts: !s.alerts })}
          {toggle('t-k', t.compact, s.compact, { compact: !s.compact })}
          <Button key="t-reset" label={t.reset} dimColor onPress={() => saveSettings($, here, { ...DEFAULTS, lang: s.lang })} />
          <Button
            key="t-hide"
            label={t.hideHere}
            dimColor
            onPress={() => hideHere($, here, t.cmdHidden(t.surfaces[here] ?? here))}
          />
          <Button key="t-close" label={t.done} variant="primary" onPress={() => update($, panelOpen, () => false)} />
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

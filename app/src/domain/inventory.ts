/**
 * Medicine stock and refill estimates. Pure and transparent: every number can be recomputed from the saved ledger and the doses the
 * person actually CONFIRMED. A reminder that was sent, or is still unanswered, never reduces the count.
 *
 *   on hand now        = opening + refills + adjustments − (confirmed doses × units per dose)
 *   daily use          = units per dose × scheduled doses per day
 *   days of supply     = on hand ÷ daily use
 *   % remaining        = on hand ÷ size of the most recent supply (what was on hand right after the last opening/refill/count)
 *   uncertain          = some doses were due but neither confirmed nor explicitly skipped, so the true count may be lower
 */
import type { Medicine, Reminder, StockTxn } from './types'

export interface StockEstimate {
  tracked: boolean
  reason?: 'no_stock' | 'no_dose_size' | 'no_schedule'
  onHand: number
  unit: string
  dailyUse: number
  daysLeft: number | null
  pctLeft: number | null
  /** If every unconfirmed dose was in fact taken, this is the lower count. */
  onHandIfUnconfirmedTaken: number
  unconfirmedDoses: number
  uncertain: boolean
  runsOutOn: string | null   // ISO date (yyyy-mm-dd, UTC date of the estimate)
  reorderBy: string | null
  lastRefillAt: string | null
  level: 'ok' | 'low' | 'critical' | 'out' | 'unknown'
  message: string
}

export const DEFAULT_LOW_DAYS = 7
export const CRITICAL_DAYS = 3
export const DEFAULT_LEAD_DAYS = 3
const DAY = 86400000
const round1 = (n: number) => Math.round(n * 10) / 10
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Doses the person confirmed for this medicine since stock tracking began (explicitly reported, not merely delivered). */
export function confirmedDoses(m: Pick<Medicine, 'id'>, reminders: Reminder[], since: string): Reminder[] {
  return reminders.filter((r) => r.medicineId === m.id && r.kind === 'medicine' && r.status === 'completed' && r.completion?.basis === 'user-reported' && (r.completedAt ?? r.scheduledFor) >= since)
}
/** Doses that came due but have no confirmation and were not explicitly skipped: they make the estimate uncertain. */
export function unconfirmedDueDoses(m: Pick<Medicine, 'id'>, reminders: Reminder[], since: string, now: Date): Reminder[] {
  return reminders.filter((r) => r.medicineId === m.id && r.kind === 'medicine' && r.scheduledFor >= since && new Date(r.scheduledFor) <= now
    && (r.status === 'missed' || r.status === 'ringing' || r.status === 'scheduled' || r.status === 'snoozed'))
}

export function estimateStock(m: Medicine, reminders: Reminder[], now: Date): StockEstimate {
  const s = m.stock
  const base = { onHand: 0, unit: s?.unit ?? 'tablet', dailyUse: 0, daysLeft: null, pctLeft: null, onHandIfUnconfirmedTaken: 0, unconfirmedDoses: 0, uncertain: false, runsOutOn: null, reorderBy: null, lastRefillAt: null, level: 'unknown' as const }
  if (!s || s.ledger.length === 0) return { ...base, tracked: false, reason: 'no_stock', message: 'Stock is not tracked yet. Add how many tablets you have.' }
  const ledger = [...s.ledger].sort((a, b) => a.at.localeCompare(b.at))
  const since = ledger[0].at
  const perDose = s.perDose
  const done = perDose > 0 ? confirmedDoses(m, reminders, since) : []
  // replay in time order so "size of the latest supply" is exact
  type Ev = { at: string; delta: number; supply?: boolean }
  const evs: Ev[] = [
    ...ledger.map((t): Ev => ({ at: t.at, delta: t.type === 'consumed' ? -t.qty : t.qty, supply: t.type === 'opening' || t.type === 'refill' })),
    ...done.map((r): Ev => ({ at: r.completedAt ?? r.scheduledFor, delta: -perDose })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  let level = 0, supplySize = 0
  for (const e of evs) { level += e.delta; if (e.supply) supplySize = level }
  const onHand = Math.max(0, round1(level))
  const lastRefill = [...ledger].reverse().find((t) => t.type === 'refill')?.at ?? null
  const perDay = s.dosesPerDay > 0 ? s.dosesPerDay : m.times.length
  const dailyUse = perDose * perDay
  const unconf = perDose > 0 ? unconfirmedDueDoses(m, reminders, since, now) : []
  const lowerBound = Math.max(0, round1(onHand - unconf.length * perDose))
  const out: StockEstimate = {
    ...base, tracked: true, onHand, onHandIfUnconfirmedTaken: lowerBound, unconfirmedDoses: unconf.length, uncertain: unconf.length > 0, lastRefillAt: lastRefill,
    pctLeft: supplySize > 0 ? Math.round((onHand / supplySize) * 100) : null, dailyUse, level: 'unknown', message: '',
  }
  if (!(perDose > 0)) return { ...out, reason: 'no_dose_size', message: 'Add how many tablets are taken each time to estimate the supply.' }
  if (!(perDay > 0)) return { ...out, reason: 'no_schedule', message: 'Add the reminder times to estimate the supply.' }
  const daysLeft = round1(onHand / dailyUse)
  const end = now.getTime() + daysLeft * DAY
  const lead = s.leadDays ?? DEFAULT_LEAD_DAYS
  const lowDays = s.lowDays ?? DEFAULT_LOW_DAYS
  const lowPct = s.lowPct
  out.daysLeft = daysLeft; out.runsOutOn = dayKey(end); out.reorderBy = dayKey(end - lead * DAY)
  out.level = onHand <= 0 ? 'out' : daysLeft <= CRITICAL_DAYS ? 'critical' : daysLeft <= lowDays || (lowPct != null && out.pctLeft != null && out.pctLeft <= lowPct) ? 'low' : 'ok'
  out.message = out.level === 'out' ? 'No tablets left by our records. Please check the actual count.'
    : out.level === 'ok' ? `About ${Math.floor(daysLeft)} days of supply.`
      : `May need a refill soon. About ${Math.floor(daysLeft)} day${Math.floor(daysLeft) === 1 ? '' : 's'} of supply remain.`
  if (out.uncertain) out.message += ` ${unconf.length} dose${unconf.length === 1 ? ' was' : 's were'} not confirmed, so this is an estimate. Please check the actual count.`
  return out
}

let seq = 0
export const txn = (type: StockTxn['type'], qty: number, source: StockTxn['source'], at: Date, note?: string): StockTxn => ({ id: `stk_${at.getTime().toString(36)}_${++seq}`, at: at.toISOString(), type, qty, source, note })

export function validateStockInput(i: { qty: number; perDose?: number }): string | null {
  if (!Number.isFinite(i.qty) || i.qty < 0) return 'Enter a quantity of 0 or more.'
  if (i.qty > 10000) return 'That quantity looks too large. Please check it.'
  if (i.perDose != null && (!(i.perDose > 0) || i.perDose > 20)) return 'Enter how many tablets are taken each time (for example 1).'
  return null
}

export interface StockAlert { medicineId: string; medicine: string; level: 'low' | 'critical' | 'out'; daysLeft: number | null; uncertain: boolean; text: string }
const RANK = { out: 3, critical: 2, low: 1 } as const
/** Refill alerts for one person, worst first. The wording never tells anyone to stop, change or restart a treatment. */
export function stockAlerts(meds: Medicine[], reminders: Reminder[], now: Date, who: string): StockAlert[] {
  const out: StockAlert[] = []
  for (const m of meds) {
    if (m.status === 'removed' || m.status === 'completed' || m.status === 'draft') continue
    const e = estimateStock(m, reminders, now)
    if (!e.tracked || (e.level !== 'low' && e.level !== 'critical' && e.level !== 'out')) continue
    const name = m.name.trim() || 'medicine'
    const base = e.level === 'out' ? `${who}'s ${name} may have run out. Please check the actual tablets and arrange a refill if appropriate.`
      : `${who}'s ${name} may need a refill soon. Approximately ${Math.floor(e.daysLeft ?? 0)} day${Math.floor(e.daysLeft ?? 0) === 1 ? '' : 's'} of supply remain. Please check the remaining tablets and arrange a refill if appropriate.`
    out.push({ medicineId: m.id, medicine: name, level: e.level, daysLeft: e.daysLeft, uncertain: e.uncertain, text: e.uncertain ? `${base} This is an estimate: some doses were not confirmed.` : base })
  }
  return out.sort((a, b) => RANK[b.level] - RANK[a.level] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
}

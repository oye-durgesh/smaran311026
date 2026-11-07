import { Check, Clock, Plus } from 'lucide-react';
import type { Medicine } from '../types';
import { C, Chev, MedIcon } from './ui';
import { fmtTimeShort } from '../services/reminderService';
import { medicineLabel } from '../services/medicineService';

export const timesText = (m: Pick<Medicine, 'times'>) => m.times.map(fmtTimeShort).join(', ');
export const summaryLine = (m: Medicine) => `${m.dose} · ${m.frequency} · ${m.food === 'No instruction' ? m.timeOfDay : m.food}`;

export function StatusPill({ m }: { m: Medicine }) {
  const ok = m.status === 'ready';
  const paused = m.status === 'paused';
  return (
    <span style={{ padding: '2px 8px', background: ok ? '#E7EDE2' : paused ? C.card : 'rgba(192,133,96,.12)', borderRadius: 999, fontSize: 11, color: ok ? C.deep : paused ? C.muted : C.terra, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {ok ? '✓ Confirmed' : paused ? 'Ⅱ Paused' : '! Needs review'}
    </span>
  );
}

/** Review card used on the "Medicines found" screen; shows preserved original Rx text. */
export function ReviewCard({ m, onReview, onRemove }: { m: Medicine; onReview: () => void; onRemove?: () => void }) {
  const ok = m.status === 'ready';
  return (
    <div className="crd" style={{ borderLeft: `3px solid ${ok ? C.sage : C.terra}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{medicineLabel(m)}</div>
        <StatusPill m={m} />
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{m.dose} · {m.frequency} · {m.food === 'No instruction' && !ok ? 'Timing unclear' : m.food === 'No instruction' ? m.timeOfDay : m.food}</div>
      {m.originalRx && <div style={{ fontSize: 12, color: ok ? '#A89584' : C.terra, marginTop: 4, fontStyle: ok ? 'italic' : undefined }}>Rx: "{m.originalRx}"</div>}
      {!ok && m.reviewFlags && m.reviewFlags.length > 0 && (
        <div role="status" style={{ fontSize: 12, color: C.terra, marginTop: 6 }}>Needs check: {m.reviewFlags.filter((f) => f !== 'food_missing' && f !== 'duration_unclear').join(', ') || 'review details'}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button data-act="1" onClick={onReview} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, fontSize: 13, fontWeight: 500, font: 'inherit', cursor: 'pointer', minHeight: 36 }}>
          <Check size={13} /> {ok ? 'Edit' : 'Review'}
        </button>
        {onRemove && <button data-act="1" onClick={onRemove} style={{ padding: '6px 14px', background: 'none', border: 0, fontSize: 13, color: C.err, cursor: 'pointer', font: 'inherit' }}>Remove</button>}
      </div>
    </div>
  );
}

export function MedRow({ m, right, onClick, accent }: { m: Medicine; right?: React.ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <div className="crd" data-act={onClick ? '1' : undefined} role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, boxShadow: accent ? `inset 3px 0 0 ${accent}` : undefined, cursor: onClick ? 'pointer' : undefined }}>
      <MedIcon g={m.gradient} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{medicineLabel(m)}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{timesText(m)} · {m.food === 'No instruction' ? m.timeOfDay : m.food}</div>
      </div>
      {right ?? <Chev />}
    </div>
  );
}

export const TakenMark = ({ label = 'Taken' }: { label?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.sage, fontSize: 12 }}><Check size={14} strokeWidth={2.5} />{label}</div>
);
export const DuePill = ({ children, color = C.orange }: { children: React.ReactNode; color?: string }) => (
  <div style={{ padding: '4px 10px', border: `1px solid ${color}`, borderRadius: 999, fontSize: 11, color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{children}</div>
);
export const AddCircle = ({ onClick, label = 'Add medicine' }: { onClick: () => void; label?: string }) => (
  <button aria-label={label} data-act="1" onClick={onClick} style={{ width: 44, height: 44, borderRadius: '50%', background: '#E7EDE2', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={18} color={C.deep} strokeWidth={1.5} /></button>
);

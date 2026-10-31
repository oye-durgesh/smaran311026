import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Pill as PillIcon } from 'lucide-react';

export const C = {
  paper: '#F5EFE6', flow: '#F0EAE0', ink: '#2E241B', muted: '#7A6B5D', faint: '#8A7F6A', line: '#E8DFD1', card: '#F8F4EC',
  sage: '#7B8B5A', deep: '#526D51', plum: '#6F526C', lav: '#ECE4EE', peach: '#F3D6C6', orange: '#D98255', terra: '#C08560', err: '#B75B53',
};

export function DemoTag({ label = 'DEMO DATA' }: { label?: string }) {
  return <span className="demo-tag">{label}</span>;
}

export function ModeLine({ who }: { who?: string }) {
  const live = typeof document !== 'undefined' && document.documentElement.dataset.smaranMode === 'live';
  return (
    <div style={{ fontSize: 12, color: live ? C.deep : C.terra, marginTop: 6 }}>
      {live ? 'LIVE · saved to your Smaran account' : <><DemoTag /> sample data — not uploaded</>}
      {who ? ` · ${who}` : ''}
    </div>
  );
}

export function Back({ onClick }: { onClick?: () => void }) {
  const nav = useNavigate();
  return (
    <button aria-label="Go back" className="bk" data-act="1" onClick={onClick ?? (() => nav(-1))} style={{ cursor: 'pointer' }}>
      <ChevronLeft size={18} color={C.ink} strokeWidth={1.5} />
    </button>
  );
}

/** Scrolling screen body; mirrors the `.scr` > padded scroller used by the designs. */
export function Screen({ children, bg, pad = '20px 24px 80px', footer, dark, style }: { children: ReactNode; bg?: string; pad?: string; footer?: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <div className="scr" style={{ background: bg, ...style }}>
      <div style={{ position: 'absolute', inset: footer ? '0 0 96px' : 0, overflow: 'auto', padding: pad, boxSizing: 'border-box', color: dark ? C.paper : undefined }}>
        {children}
      </div>
      {footer && <div className="ft">{footer}</div>}
    </div>
  );
}

export function PillBtn({ children, onClick, tone = 'dark', disabled, style }: { children: ReactNode; onClick?: () => void; tone?: 'dark' | 'sage' | 'light' | 'danger'; disabled?: boolean; style?: CSSProperties }) {
  const tones: Record<string, CSSProperties> = {
    dark: {},
    sage: {},
    light: { background: C.card, color: C.ink, border: `1px solid ${C.line}` },
    danger: { background: '#fff', color: C.err, border: `1px solid ${C.err}` },
  };
  return (
    <button className={`bt ${tone === 'sage' ? 'bt-sg' : tone === 'dark' ? 'bt-d' : ''}`} data-act="1" disabled={disabled} onClick={onClick} style={{ border: 0, font: 'inherit', fontSize: 16, fontWeight: 500, cursor: 'pointer', ...tones[tone], ...style }}>
      {children}
    </button>
  );
}

export function TextLink({ children, onClick, color = C.sage }: { children: ReactNode; onClick?: () => void; color?: string }) {
  return (
    <button data-act="1" onClick={onClick} style={{ background: 'none', border: 0, font: 'inherit', fontSize: 15, color, cursor: 'pointer', padding: 8 }}>
      {children}
    </button>
  );
}

export function Label({ children, mt = 20 }: { children: ReactNode; mt?: number }) {
  return <div className="lbl" style={{ marginTop: mt }}>{children}</div>;
}

export function SectionLabel({ children, mt = 24 }: { children: ReactNode; mt?: number }) {
  return <div style={{ fontSize: 12, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: mt, fontWeight: 500 }}>{children}</div>;
}

export function MedIcon({ g, size = 40 }: { g: [string, string]; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <PillIcon size={size * 0.45} color="#fff" strokeWidth={1.5} />
    </div>
  );
}

export function Chev({ color = '#A89584' }: { color?: string }) {
  return <ChevronRight size={16} color={color} strokeWidth={1.5} />;
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button className={`ch ${on ? 'ch-on' : 'ch-off'}`} data-act="1" onClick={onClick} aria-pressed={!!on} style={{ font: 'inherit', fontSize: 14, cursor: 'pointer', border: on ? 0 : undefined }}>
      {children}
    </button>
  );
}

/** Option tiles used for text-size / frequency / food etc. */
export function Choice<T extends string>({ options, value, onChange, fs = 14 }: { options: readonly T[]; value: T; onChange: (v: T) => void; fs?: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} data-act="1" aria-pressed={on} onClick={() => onChange(o)} style={{ flex: '1 1 0', minWidth: 72, height: 48, background: C.card, border: on ? `1.5px solid ${C.sage}` : `1px solid ${C.line}`, borderRadius: 12, font: 'inherit', fontSize: fs, fontWeight: on ? 500 : 400, color: on ? C.ink : C.muted, cursor: 'pointer' }}>
            {on && <Check size={12} style={{ marginRight: 4 }} />}{o}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ value, onChange, placeholder, type = 'text', inputMode, focus, prefix, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text' | 'tel'; focus?: boolean; prefix?: ReactNode; autoFocus?: boolean }) {
  return (
    <label className={`inp ${focus ? 'inp-f' : ''}`} style={{ marginTop: 10 }}>
      {prefix}
      <input className="inp-t" type={type} inputMode={inputMode} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return { show: setMsg, node: msg ? <div className="toast" role="status">{msg}</div> : null };
}

export function Dialog({ title, body, confirm, cancel = 'Cancel', danger, onConfirm, onCancel }: { title: string; body?: ReactNode; confirm: string; cancel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.45)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.paper, borderRadius: 24, padding: 24, width: '100%', boxSizing: 'border-box' }}>
        <div className="sf" style={{ fontSize: 22 }}>{title}</div>
        {body && <div style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>{body}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <PillBtn tone="light" onClick={onCancel}>{cancel}</PillBtn>
          <PillBtn tone={danger ? 'danger' : 'dark'} onClick={onConfirm}>{confirm}</PillBtn>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { label: 'Home', to: '/home', match: ['/home', '/today'] },
  { label: 'Medicines', to: '/medicines', match: ['/medicines'] },
  { label: 'Health', to: '/health', match: ['/health'] },
  { label: 'More', to: '/settings', match: ['/settings', '/family', '/appointments', '/help', '/parent'] },
];
const tabIcon: Record<string, ReactNode> = {
  Home: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  Medicines: <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-30 12 12)" />,
  Health: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  More: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" strokeLinecap="round" />,
};

export function BottomNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="bn" aria-label="Main">
      {TABS.map((t) => {
        const on = t.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
        return (
          <button key={t.label} className={`bn-i ${on ? 'on' : ''}`} data-act="1" aria-current={on ? 'page' : undefined} onClick={() => nav(t.to)} style={{ background: 'none', border: 0, font: 'inherit', fontSize: 10, cursor: 'pointer', minWidth: 64, minHeight: 48 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{tabIcon[t.label]}</svg>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

export const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 12 }}>
    <span style={{ fontSize: 14, color: C.muted }}>{k}</span>
    <span style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{v}</span>
  </div>
);

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} data-act="1" onClick={() => onChange(!on)} style={{ width: 48, height: 28, borderRadius: 14, background: on ? C.deep : '#D9D0C2', border: 0, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export const Status = ({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'plain' | 'plum'; children: ReactNode }) => {
  const m = { ok: [C.deep, '#E7EDE2', '✓ '], warn: ['#9A5B2F', C.peach, '! '], bad: [C.err, '#F6E1DE', '× '], plain: [C.muted, C.card, ''], plum: [C.plum, C.lav, ''] }[kind];
  // Icon prefix so status never relies on colour alone.
  return <span style={{ fontSize: 11, fontWeight: 500, color: m[0], background: m[1], borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>{m[2]}{children}</span>;
};

import { useEffect, useRef, type ReactNode } from 'react';

export type Actions = Record<string, () => void>;

/**
 * Makes the faithfully-converted design markup interactive without touching its layout.
 * Keys: exact visible text ("Get Started"), "prefix*" for startsWith, or ".class" for a CSS class.
 * `replace` swaps exact text nodes (e.g. "Ramesh" -> current name) and is idempotent.
 */
export default function ActionLayer({ actions, replace, children }: { actions: Actions; replace?: Record<string, string>; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (replace) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode() as (Text & { __orig?: string }) | null; n; n = w.nextNode() as (Text & { __orig?: string }) | null) {
        const orig = n.__orig ?? n.data;
        for (const [from, to] of Object.entries(replace)) {
          const src = orig.trim()
          if (src === from || orig.includes(from)) {
            n.__orig = orig
            n.data = orig.includes(from) ? orig.replace(from, to) : to
          }
        }
      }
    }

    const keys = Object.keys(actions);
    const claimed = new Set<Element>();
    const all = Array.from(el.querySelectorAll<HTMLElement>('*'));
    for (const node of all) {
      if (node.dataset.actKey) delete node.dataset.actKey;
    }
    for (const node of all) {
      if ([...claimed].some((c) => c.contains(node))) continue;
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      const origText = text;
      const key = keys.find((k) => {
        if (k.startsWith('.')) return node.classList.contains(k.slice(1));
        if (k.endsWith('*')) return origText.startsWith(k.slice(0, -1));
        return origText === k;
      });
      if (key && node.tagName !== 'svg' && node.tagName !== 'path') {
        // For ".class" keys, require the element itself; for text keys avoid huge containers.
        if (!key.startsWith('.') && node.querySelectorAll('*').length > 40) continue;
        node.dataset.actKey = key;
        node.dataset.act = '1';
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        claimed.add(node);
      }
    }
  });

  const fire = (target: EventTarget | null) => {
    let n = target as HTMLElement | null;
    while (n && n !== root.current) {
      const k = n.dataset?.actKey;
      if (k && ref.current[k]) { ref.current[k](); return true; }
      n = n.parentElement;
    }
    return false;
  };

  return (
    <div
      ref={root}
      style={{ display: 'contents' }}
      onClick={(e) => { fire(e.target); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && fire(e.target)) e.preventDefault(); }}
    >
      {children}
    </div>
  );
}

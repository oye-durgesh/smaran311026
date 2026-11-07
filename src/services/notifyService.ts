const FIRED_KEY = 'smaran.firedReminders';

function loadFired(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(FIRED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  const keep = [...s].slice(-400);
  localStorage.setItem(FIRED_KEY, JSON.stringify(keep));
}

export function hasFired(id: string): boolean {
  return loadFired().has(id);
}

export function markFired(id: string): void {
  const s = loadFired();
  s.add(id);
  saveFired(s);
}

export function clearFired(id: string): void {
  const s = loadFired();
  s.delete(id);
  saveFired(s);
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

export function showDoseNotification(title: string, body: string, tag: string): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, { body, tag, silent: false });
    n.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent('smaran:due-call', { detail: { occurrenceId: tag } }));
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

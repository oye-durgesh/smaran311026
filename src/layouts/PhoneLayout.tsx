import { Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useStore } from '../data/store';
import { DARK_IDS } from '../screens/generated';

const DARK_STAGES = ['incoming', 'connecting', 'listening', 'speaking', 'active', 'reconnecting'];

/** Device frame (desktop) / full-bleed (phone) shell with status bar, home indicator, and offline banner. */
export default function PhoneLayout() {
  const { pathname } = useLocation();
  const { state } = useStore();
  const stage = pathname.startsWith('/call/') ? pathname.split('/')[2] : '';
  const dark = DARK_STAGES.includes(stage) && DARK_IDS.length > 0;
  return (
    <div className="shell">
      <div className="ph" data-ts={state.settings.textSize}>
        <div className={`sb ${dark ? 'lt' : ''}`}><span>9:41</span><span className="bat" aria-hidden /></div>
        {!state.settings.deviceOnline && (
          <div role="status" style={{ position: 'absolute', top: 47, left: 0, right: 0, zIndex: 6, background: '#2E241B', color: '#F5EFE6', fontSize: 12, padding: '6px 16px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <WifiOff size={13} /> Offline — changes are saved on this device only
          </div>
        )}
        <Outlet />
        <div className={`hi ${dark ? 'lt' : ''}`} />
      </div>
    </div>
  );
}

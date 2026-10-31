import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider } from './data/store';
import AppRoutes from './navigation/routes';
import { backendConfigured, onAuthEvent } from './services/backend';
import { startSync, stopSync } from './services/sync';

function AuthBridge() {
  useEffect(() => {
    if (!backendConfigured()) return;
    let off: (() => void) | undefined;
    let dead = false;
    void onAuthEvent((event) => {
      if (event === 'SIGNED_IN') void startSync();
      if (event === 'SIGNED_OUT') stopSync();
    }).then((u) => { if (dead) u(); else off = u; });
    return () => { dead = true; off?.(); };
  }, []);
  return null;
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AuthBridge />
        <AppRoutes />
      </BrowserRouter>
    </StoreProvider>
  );
}

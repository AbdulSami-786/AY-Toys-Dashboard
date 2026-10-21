import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './store/store';
import { DialogProvider } from './components/ui';
import { PrintProvider } from './components/print';
import { useTabLock } from './store/tabLock';
import { UsersProvider } from './store/users';
import UserGate from './windows/Login';
import './styles.css';

// Only one tab works on the books at a time (otherwise the tabs overwrite each other's changes)
function TabGuard({ children }) {
  const { state, epoch, takeOver } = useTabLock();
  if (state === 'checking') return null;
  if (state === 'other')
    return (
      <div className="welcome">
        <div className="welcome-card" style={{ maxWidth: 560 }}>
          <div className="welcome-head">
            <div className="brand-logo">AY</div>
            <div>
              <h1>AY Toys is open in another tab</h1>
              <p>Use one tab or window at a time, so neither overwrites the other's changes.</p>
            </div>
          </div>
          <div className="welcome-body">
            <p style={{ marginTop: 0 }}>
              Switch to the other tab — or continue here: the other tab then stops and shows this message instead. This tab continues by itself if the other one
              is closed.
            </p>
            <button className="btn primary" autoFocus onClick={takeOver}>
              Use this tab instead
            </button>
          </div>
        </div>
      </div>
    );
  // a fresh start every time this tab gets the lock, so it loads what the other tab saved
  return <TabEpoch key={epoch}>{children}</TabEpoch>;
}
const TabEpoch = ({ children }) => children;

createRoot(document.getElementById('root')).render(
  <TabGuard>
    <UsersProvider>
      <StoreProvider>
        <DialogProvider>
          <PrintProvider>
            <UserGate>
              <App />
            </UserGate>
          </PrintProvider>
        </DialogProvider>
      </StoreProvider>
    </UsersProvider>
  </TabGuard>,
);

// Offline: the built app keeps a copy of its own files (public/sw.js) so it opens without internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

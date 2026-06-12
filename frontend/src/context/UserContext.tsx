import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getMe, logoutBackend, setAuthErrorHandler, SOURCE_MODES, type MeData } from '@/lib/api';
import { OWNER } from '@/lib/data';
import { config } from '@/config/environment';
import { secureSessionStorage } from '@/utils/secureStorage';

const CACHE_KEY = 'madison_me';

// Module-level singleton: React StrictMode double-fires effects in dev.
// Sharing one promise means the second firing reuses the in-flight request.
let _mePromise: Promise<MeData | null> | null = null;
function fetchMeOnce(): Promise<MeData | null> {
  if (!_mePromise) _mePromise = getMe().catch(() => null);
  return _mePromise;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type UserCtx = {
  user: MeData | null;
  status: AuthStatus;
  logoutReason: string | null;
  login: () => void;
  logout: () => void;
};

const Ctx = createContext<UserCtx>({
  user: null,
  status: 'loading',
  logoutReason: null,
  login: () => {},
  logout: () => {},
});

// In mock mode there's no real auth — auto-authenticate as the sample user.
const isMockMode = !SOURCE_MODES.outlook || SOURCE_MODES.outlook === 'mock';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeData | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (isMockMode) {
      setUser({ displayName: OWNER, mail: '' });
      setStatus('authenticated');
      return () => { mounted.current = false; };
    }

    setAuthErrorHandler(() => {
      secureSessionStorage.removeItem(CACHE_KEY);
      _mePromise = null;
      setUser(null);
      setStatus('unauthenticated');
      setLogoutReason('session_expired');
    });

    // After OAuth redirect, clear stale cache. HashRouter: ?params are inside the hash.
    const hashSearch = window.location.hash.split('?')[1] || '';
    if (new URLSearchParams(hashSearch).get('auth') === 'success') {
      secureSessionStorage.removeItem(CACHE_KEY);
      _mePromise = null; // force a fresh fetch after new auth
    }

    // Seed the cached name optimistically (no name flash), but ALWAYS validate the
    // session with one /api/me call — the backend holds the token in memory, so a
    // restart/expiry invalidates a cached "authenticated" state and must drop us to login.
    const cached = secureSessionStorage.getItemObject<MeData>(CACHE_KEY);
    if (cached?.displayName) setUser(cached);

    // One network call regardless of StrictMode double-fire.
    // A 200 with an empty displayName still means authenticated — name is display-only.
    fetchMeOnce().then((me) => {
      if (!mounted.current) return;
      if (me !== null) {
        const resolved = { displayName: me.displayName || 'User', mail: me.mail || '' };
        secureSessionStorage.setItemObject(CACHE_KEY, resolved);
        setUser(resolved);
        setStatus('authenticated');
      } else {
        secureSessionStorage.removeItem(CACHE_KEY);
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => { mounted.current = false; };
  }, []);

  function login() {
    // Same-origin in the single-port deploy (config.apiUrl is ''); absolute only if
    // VITE_API_URL points elsewhere. Relative '/auth/microsoft' hits this server's BFF.
    window.location.href = `${config.apiUrl}/auth/microsoft`;
  }

  function logout() {
    // Drop the backend session first so a refresh can't silently re-authenticate.
    void logoutBackend();
    secureSessionStorage.removeItem(CACHE_KEY);
    _mePromise = null;
    setUser(null);
    setStatus('unauthenticated');
    setLogoutReason(null);
  }

  return <Ctx.Provider value={{ user, status, logoutReason, login, logout }}>{children}</Ctx.Provider>;
}

export function useUser() {
  return useContext(Ctx);
}

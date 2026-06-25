import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import madisonLogo from '@/assets/madison-logo.webp';
import { useUser } from '@/context/UserContext';

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function Login() {
  const { status, login, logoutReason } = useUser();
  const navigate = useNavigate();

  // Redirect if already authenticated (page refresh after OAuth).
  useEffect(() => {
    if (status === 'authenticated') navigate('/', { replace: true });
  }, [status, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-4">
        <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
          <img src={madisonLogo} alt="Madison Medical Sports & Wellness" className="h-7 w-auto" />
        </span>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Card */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
            {/* Logo + brand */}
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
                <img src={madisonLogo} alt="" className="h-10 w-auto" aria-hidden />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Command Center</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your practice, one view.
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-border" />

            {/* Session expired banner */}
            {logoutReason === 'session_expired' && (
              <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2.5 text-center text-xs font-medium text-yellow-800">
                Your session expired — please sign in again.
              </div>
            )}

            {/* Sign-in */}
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Sign in with your Microsoft 365 account to access your practice data.
              </p>
              <button
                onClick={login}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                <MicrosoftIcon />
                Continue with Microsoft 365
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                Read-only access · your data never leaves your tenant
              </p>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground">
            Prototyped for Madison Medical and Sports Rehabilitation Center
          </p>
        </div>
      </main>
    </div>
  );
}

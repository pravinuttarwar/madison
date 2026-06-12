import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MbSignature from '@/components/MbSignature';
import { ViewModeProvider } from '@/context/view-mode';
import { UserProvider, useUser } from '@/context/UserContext';
import AppShell from '@/components/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Financials from '@/pages/Financials';
import EmailQueue from '@/pages/EmailQueue';
import Calendar from '@/pages/Calendar';
import Tasks from '@/pages/Tasks';

// Code-split Reports — it pulls in the charting library (Recharts), so it loads only
// when the Reports tab is opened, keeping the initial bundle small.
const Reports = lazy(() => import('@/pages/Reports'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading" />
    </div>
  );
}

function AuthedApp() {
  const { status } = useUser();
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading" />
      </div>
    );
  }
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/financials" element={<Financials />} />
          <Route path="/email" element={<EmailQueue />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <ViewModeProvider>
      <HashRouter>
        <UserProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<AuthedApp />} />
          </Routes>
        </UserProvider>
      </HashRouter>
      <MbSignature />
    </ViewModeProvider>
  );
}

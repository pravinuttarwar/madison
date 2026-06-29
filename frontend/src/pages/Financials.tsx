import { Wallet, TrendingUp, Landmark, Receipt } from 'lucide-react';
import { useViewMode } from '@/context/view-mode';
import { Panel, Trend, KpiTile } from '@/components/primitives';
import { Loading } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getFinancials, sourceModeFor } from '@/lib/api';
import { config } from '@/config/environment';
const qboMode = sourceModeFor('quickbooks');
import { usd, pctChange } from '@/lib/format';

const CAT_COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)'];

// QuickBooks tokens live in memory only (like the Microsoft session), so after a
// backend restart or token expiry the owner reconnects with one click. This kicks
// off the read-only OAuth flow on the backend, which redirects back to /financials.
function qboConnectUrl() {
  // Same-origin in the single-port deploy (config.apiUrl is ''); relative '/auth/qbo'.
  return `${config.apiUrl}/auth/qbo`;
}

function ConnectQuickBooks() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Financial snapshot</h1>
        <p className="text-sm text-muted-foreground">
          Connect QuickBooks to see deposits, variable spend and net contribution here — read-only.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-16 text-center shadow-sm">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">QuickBooks isn't connected</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Reconnect to pull live deposits and spend. Access is read-only and the connection is held
            in memory only — never written to disk.
          </p>
        </div>
        <a
          href={qboConnectUrl()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Landmark className="h-4 w-4" aria-hidden />
          Connect QuickBooks
        </a>
      </div>
    </div>
  );
}

export default function Financials() {
  const { mode } = useViewMode();
  const isMonday = mode === 'monday';
  const { data, loading, error } = useApi(getFinancials, []);

  if (loading) return <Loading label="Loading financials…" />;
  // A financials error means QuickBooks needs (re)connecting → offer Connect.
  if (error || !data) return <ConnectQuickBooks />;

  const { weekly: WEEKLY_FINANCIAL, daily: DAILY_FINANCIAL, revenue: REVENUE } = data;
  const dep = WEEKLY_FINANCIAL.totalDeposits;
  const spend = WEEKLY_FINANCIAL.variableSpend;
  const net = WEEKLY_FINANCIAL.netContribution;
  const yday = DAILY_FINANCIAL.depositYesterday;
  const vspend = DAILY_FINANCIAL.variableSpend;
  const maxDep = Math.max(...WEEKLY_FINANCIAL.depositsByDay.map((d) => d.amount));
  const maxCat = Math.max(...vspend.topCategories.map((c) => c.amount));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Financial snapshot</h1>
        <p className="text-sm text-muted-foreground">
          The QuickBooks numbers that matter — deposits, variable spend and net contribution — without
          opening QuickBooks.
        </p>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {isMonday ? (
          <>
            <KpiTile
              label="Deposits (last week)"
              value={usd(dep.last)}
              sub="Week total"
              icon={Landmark}
              trend={<Trend delta={pctChange(dep.last, dep.prior)} unit="%" />}
            />
            <KpiTile
              label="Variable spend"
              value={usd(spend.last)}
              sub="Excludes fixed costs"
              icon={Wallet}
              trend={<Trend delta={pctChange(spend.last, spend.prior)} unit="%" goodWhenUp={false} />}
            />
            <KpiTile
              label="Net contribution"
              value={usd(net.last)}
              sub="Deposits − variable spend"
              icon={TrendingUp}
              trend={<Trend delta={pctChange(net.last, net.prior)} unit="%" />}
            />
            <KpiTile
              label="Revenue (last week)"
              value={usd(REVENUE.weekly.last)}
              sub="Accrual basis · differs from deposits"
              icon={Receipt}
              trend={<Trend delta={pctChange(REVENUE.weekly.last, REVENUE.weekly.prior)} unit="%" />}
            />
          </>
        ) : (
          <>
            <KpiTile
              label="Deposit (yesterday)"
              value={usd(yday.total)}
              sub={yday.account}
              icon={Landmark}
              trend={<Trend delta={pctChange(yday.total, yday.prior)} unit="%" />}
            />
            <KpiTile
              label="Variable spend (yesterday)"
              value={usd(vspend.yesterday.last)}
              sub="Excludes fixed costs"
              icon={Wallet}
              trend={<Trend delta={pctChange(vspend.yesterday.last, vspend.yesterday.prior)} unit="%" goodWhenUp={false} />}
            />
            <KpiTile label="Spend month-to-date" value={usd(vspend.mtd)} sub={`Week-to-date ${usd(vspend.wtd)}`} icon={TrendingUp} />
            <KpiTile
              label="Revenue (month-to-date)"
              value={usd(REVENUE.mtd)}
              sub="Accrual basis · differs from deposits"
              icon={Receipt}
            />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Deposits */}
        <Panel
          title={isMonday ? 'Deposits by day' : 'Yesterday deposit breakdown'}
          source="QuickBooks" sourceMode={qboMode}
        >
          {isMonday ? (
            <>
              <div className="space-y-2.5">
                {WEEKLY_FINANCIAL.depositsByDay.map((d) => (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="w-9 text-xs font-medium text-muted-foreground">{d.day}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.round((d.amount / maxDep) * 100)}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs font-semibold tabular-nums text-foreground">{usd(d.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Week total</span>
                <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                  {usd(dep.last)} <Trend delta={pctChange(dep.last, dep.prior)} unit="%" />
                </span>
              </div>
            </>
          ) : (
            <>
              <ul className="space-y-2.5">
                {yday.breakdown.map((b) => (
                  <li key={b.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">{usd(b.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Total deposit</div>
                  <div className="text-[11px] text-muted-foreground">
                    {yday.account} · {yday.posted}
                  </div>
                </div>
                <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                  {usd(yday.total)} <Trend delta={pctChange(yday.total, yday.prior)} unit="%" />
                </span>
              </div>
            </>
          )}
        </Panel>

        {/* Variable spend by category */}
        <Panel title="Variable spend by category" source="QuickBooks · ex. fixed">
          <ul className="space-y-3.5">
            {vspend.topCategories.map((c, i) => (
              <li key={c.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">{usd(c.amount)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((c.amount / maxCat) * 100)}%`, backgroundColor: CAT_COLORS[i] }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Yesterday</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{usd(vspend.yesterday.last)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Week-to-date</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{usd(vspend.wtd)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Month-to-date</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{usd(vspend.mtd)}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            "Fixed" accounts (rent, base utilities, contracted IT) are excluded so this reflects spend
            you actually steer. We'd confirm the exact fixed-cost list with you.
          </p>
        </Panel>
      </div>
    </div>
  );
}

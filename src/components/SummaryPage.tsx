import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '../types';
import { sportLabel } from '../core/i18n';
import { useLocale } from '../hooks/useLocale';
import { formatSpeed } from '../hooks/useActivities';
import {
  groupSummary,
  summaryKey,
  summarize,
  summaryChart,
  type SummaryPeriod,
} from '../utils/summary';
import { Select } from './Select';

const control =
  'rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]';
const panel =
  'rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6';
const number = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function SummaryCard({
  activities,
  period,
  label,
  t,
  onSelectActivity,
}: {
  activities: Activity[];
  period: SummaryPeriod;
  label: string;
  t: (key: string) => string;
  onSelectActivity: (a: Activity) => void;
}) {
  const stats = summarize(activities);
  const chart = summaryChart(activities, period, label);
  const metrics = [
    [t('activityCount'), String(stats.count)],
    [
      t('movingTime'),
      `${Math.floor(stats.seconds / 3600)}h ${Math.floor((stats.seconds % 3600) / 60)}m`,
    ],
    [
      t('averagePace'),
      stats.speed > 0 ? `${formatSpeed(stats.speed)} km/h` : '—',
    ],
    [
      t('averageHeartRate'),
      stats.heartRate ? `${Math.round(stats.heartRate)} bpm` : '—',
    ],
    [t('longestActivity'), `${number(stats.maxDistance / 1000)} km`],
    [
      t('fastestPace'),
      stats.maxSpeed > 0 ? `${formatSpeed(stats.maxSpeed)} km/h` : '—',
    ],
    [t('averageDistance'), `${number(stats.distance / stats.count / 1000)} km`],
    [t('elevationGain'), `${number(stats.elevation)} m`],
  ];
  const chartUnit =
    period === 'life'
      ? t('chartYear')
      : period === 'year'
        ? t('chartMonth')
        : period === 'week'
          ? t('chartWeek')
          : period === 'day'
            ? t('chartStartTime')
            : t('chartDay');
  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {label === 'Life' ? t('allTimeLife') : label}
        </h2>
        <p className="text-2xl font-semibold text-[var(--color-accent)] tabular-nums">
          {number(stats.distance / 1000)}{' '}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            km
          </span>
        </p>
      </div>
      <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {metrics.map(([name, value]) => (
          <div key={name}>
            <dt className="text-xs text-[var(--color-muted)]">{name}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div
        role="img"
        aria-label={`${label}: ${chart.map((d) => `${d.label}: ${d.km} km`).join(', ')}`}
      >
        <div className="h-40 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chart}
              margin={{ top: 8, right: 0, bottom: 0, left: -20 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={12}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-border)', opacity: 0.3 }}
                contentStyle={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text)',
                }}
              />
              <Bar
                dataKey="km"
                name="km"
                fill="var(--color-accent)"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--color-muted)]">
          {chartUnit} · km
        </p>
      </div>
      {period === 'day' && (
        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
          {activities.map((a) => (
            <button
              key={a.run_id}
              className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left text-sm hover:bg-[var(--color-bg)]"
              onClick={() => onSelectActivity(a)}
            >
              <span>
                {a.start_date_local.slice(11, 16)} · {a.name}
              </span>
              <span className="shrink-0 text-[var(--color-accent)]">
                {number(a.distance / 1000)} km ↗
              </span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function SummaryPage({
  activities,
  onSelectActivity,
}: {
  activities: Activity[];
  onSelectActivity: (a: Activity) => void;
}) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<SummaryPeriod>('month');
  const [sport, setSport] = useState('all');
  const [year, setYear] = useState('all');
  const [limit, setLimit] = useState(12);
  const sports = useMemo(
    () => [...new Set(activities.map((a) => a.type))].sort(),
    [activities]
  );
  const years = useMemo(
    () =>
      [...new Set(activities.map((a) => a.start_date_local.slice(0, 4)))]
        .sort()
        .reverse(),
    [activities]
  );
  const groups = useMemo(
    () =>
      groupSummary(
        activities.filter(
          (a) =>
            (sport === 'all' || a.type === sport) &&
            (year === 'all' || summaryKeyYear(a, period) === year)
        ),
        period
      ),
    [activities, sport, year, period]
  );
  const periods: [SummaryPeriod, string][] = [
    ['year', t('periodYear')],
    ['month', t('periodMonth')],
    ['week', t('periodWeek')],
    ['day', t('periodDay')],
    ['life', t('periodLife')],
  ];
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('summary')}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {t('summarySubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t('sport')}
            aria-label={t('sport')}
            value={sport}
            options={[
              { value: 'all', label: t('allSports') },
              ...sports.map((s) => ({ value: s, label: sportLabel(s, t) })),
            ]}
            onChange={(value) => {
              setSport(value);
              setLimit(12);
            }}
          />
          <Select
            label={t('year')}
            aria-label={t('summaryYear')}
            value={year}
            options={[
              { value: 'all', label: t('allYears') },
              ...years.map((y) => ({ value: y, label: y })),
            ]}
            onChange={(value) => {
              setYear(value);
              setLimit(12);
            }}
          />
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t('summaryPeriod')}
          className="bento-card !flex-row flex-wrap gap-1 !p-1"
        >
          {periods.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={period === value}
              onClick={() => {
                setPeriod(value);
                setLimit(12);
              }}
              className={`rounded-lg px-4 py-2 text-sm ${period === value ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-[var(--color-muted)]">
          {groups.length} {t('periodsCount')}
        </span>
      </div>
      {!groups.length ? (
        <p
          role="status"
          className={`${panel} py-16 text-center text-[var(--color-muted)]`}
        >
          {t('noMatchingActivities')}
        </p>
      ) : (
        <div
          className={`grid min-w-0 gap-5 ${period === 'life' ? '' : 'xl:grid-cols-2'}`}
        >
          {groups.slice(0, limit).map(([key, items]) => (
            <SummaryCard
              key={key}
              label={key}
              activities={items}
              period={period}
              t={t}
              onSelectActivity={onSelectActivity}
            />
          ))}
        </div>
      )}
      {groups.length > limit && (
        <div className="mt-6 text-center">
          <button className={control} onClick={() => setLimit((n) => n + 12)}>
            {t('loadMore')} ({limit}/{groups.length})
          </button>
        </div>
      )}
    </main>
  );
}

function summaryKeyYear(activity: Activity, period: SummaryPeriod) {
  // Weekly filters use the ISO week-year, including dates across New Year.
  return summaryKey(
    activity.start_date_local,
    period === 'week' ? 'week' : 'year'
  ).slice(0, 4);
}

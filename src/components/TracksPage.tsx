import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { exportCard } from '../utils/exportCard';
import { clusterTracks } from '../utils/clusterTracks';
import { RouteMap } from './RouteMap';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import {
  getAvailableYears,
  formatDistance,
  parseMovingTime,
  formatSpeed,
} from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';

type SportType = 'Run' | 'cycling' | 'Ride';
type Cluster = { representative: Activity; count: number; color: string };

interface TracksPageProps {
  activities: Activity[];
  filter: string;
  dark?: boolean;
  onBack: () => void;
  onSelectActivity?: (a: Activity | null) => void;
}

function renderTrackSVG(summaryPolyline: string, size = 80): string {
  try {
    const coords = polyline.decode(summaryPolyline);
    if (coords.length < 2) return '';
    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const minLat = Math.min(...lats),
      maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs),
      maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const scale = Math.min((size - 8) / lngRange, (size - 8) / latRange);
    const offsetX = (size - lngRange * scale) / 2;
    const offsetY = (size - latRange * scale) / 2;
    return coords
      .map(([lat, lng]) => {
        const x = (lng - minLng) * scale + offsetX;
        const y = size - ((lat - minLat) * scale + offsetY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  } catch {
    return '';
  }
}

const TrackThumb = memo(function TrackThumb({
  activity,
  color,
  selected,
  onClick,
}: {
  activity: Activity;
  color: string;
  selected: boolean;
  onClick: (activity: Activity) => void;
}) {
  const size = 80;
  const points = useMemo(
    () =>
      activity.summary_polyline
        ? renderTrackSVG(activity.summary_polyline, size)
        : '',
    [activity.summary_polyline]
  );
  if (!points) return null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${activity.start_date_local.slice(0, 16)} · ${activity.name} · ${(activity.distance / 1000).toFixed(1)} km`}
      className={`track-thumb group${selected ? 'is-selected' : ''}`}
      onClick={() => onClick(activity)}
      title={`${activity.name} — ${(activity.distance / 1000).toFixed(1)} km`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="track-thumb-svg"
        aria-hidden="true"
      >
        <polyline
          className="track-thumb-path"
          points={points}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
});

/** Theme-aware track stroke colors (aligned with dashboard accent tokens). */
function trackPalette(dark: boolean) {
  return dark
    ? {
        run: '#ff9f0a',
        runLong: '#ff453a',
        ride: '#e0ed5e',
        rideLong: '#f5f7c0',
        other: '#64d2ff',
      }
    : {
        run: '#f97316',
        runLong: '#ef4444',
        ride: '#3b82f6',
        rideLong: '#1d4ed8',
        other: '#0ea5e9',
      };
}

function getColor(a: Activity, dark = false): string {
  const palette = trackPalette(dark);
  if (a.type === 'Run') {
    return a.distance / 1000 >= 20 ? palette.runLong : palette.run;
  }
  if (a.type === 'Ride' || a.type === 'cycling') {
    return a.distance / 1000 >= 60 ? palette.rideLong : palette.ride;
  }
  return palette.other;
}

export function TracksPage({
  activities,
  onBack,
  dark,
  onSelectActivity,
}: TracksPageProps) {
  const { locale } = useLocale();
  const allYears = useMemo(() => getAvailableYears(activities), [activities]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sportFilter, setSportFilter] = useState<SportType | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  // Export
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Year pagination
  const MAX_YEARS = 10;
  const [yearPage, setYearPage] = useState(0);
  const totalYearPages = Math.ceil(allYears.length / MAX_YEARS);
  const visibleYears = allYears.slice(
    yearPage * MAX_YEARS,
    yearPage * MAX_YEARS + MAX_YEARS
  );

  // Determine which sport types exist
  const hasSport = (t: SportType) => activities.some((a) => a.type === t);

  // Filtered base (year + sport)
  const base = useMemo(
    () =>
      activities.filter((a) => {
        if (
          selectedYear !== null &&
          new Date(a.start_date_local).getFullYear() !== selectedYear
        )
          return false;
        if (sportFilter !== null && a.type !== sportFilter) return false;
        return true;
      }),
    [activities, selectedYear, sportFilter]
  );

  const withPolyline = useMemo(
    () =>
      base.filter((a) => a.summary_polyline && a.summary_polyline.length > 20),
    [base]
  );

  const { totalDist, totalTime, avgSpeed } = useMemo(() => {
    let totalDist = 0,
      totalTime = 0,
      speed = 0,
      rides = 0;
    for (const activity of base) {
      totalDist += activity.distance;
      totalTime += parseMovingTime(activity.moving_time);
      if (activity.average_speed > 0) {
        speed += activity.average_speed;
        rides++;
      }
    }
    return { totalDist, totalTime, avgSpeed: rides ? speed / rides : 0 };
  }, [base]);

  // Sync cluster on first paint — async worker caused a tall→short card jump
  // (provisional 1:1 thumbs, then merged clusters).
  const isDark = !!dark;
  const clusteredTracks = useMemo<Cluster[]>(() => {
    if (!withPolyline.length) return [];
    return clusterTracks(withPolyline).map(({ index, count }) => ({
      representative: withPolyline[index],
      count,
      color: getColor(withPolyline[index], isDark),
    }));
  }, [withPolyline, isDark]);

  const sortedTracks = useMemo(
    () =>
      [...clusteredTracks].sort((a, b) =>
        sortBy === 'distance'
          ? b.representative.distance - a.representative.distance
          : new Date(b.representative.start_date_local).getTime() -
            new Date(a.representative.start_date_local).getTime()
      ),
    [clusteredTracks, sortBy]
  );

  const handleSelectTrack = useCallback(
    (a: Activity) => {
      const next = selectedActivity?.run_id === a.run_id ? null : a;
      setSelectedActivity(next);
      onSelectActivity?.(next);
      if (next && window.matchMedia('(max-width: 1023px)').matches) {
        requestAnimationFrame(() =>
          previewRef.current?.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
              .matches
              ? 'instant'
              : 'smooth',
          })
        );
      }
    },
    [selectedActivity, onSelectActivity]
  );

  const selectedSeconds = selectedActivity
    ? parseMovingTime(selectedActivity.moving_time)
    : 0;
  const selectedDurationLabel = `${Math.floor(selectedSeconds / 3600) ? Math.floor(selectedSeconds / 3600) + 'h ' : ''}${Math.floor((selectedSeconds % 3600) / 60)}m`;

  const palette = trackPalette(isDark);
  const rideSport: SportType =
    hasSport('cycling') || !hasSport('Ride') ? 'cycling' : 'Ride';
  const allSportTabs: { label: string; value: SportType; color: string }[] = [
    {
      label: locale === 'zh' ? '骑行' : 'Ride',
      value: rideSport,
      color: palette.ride,
    },
  ];

  return (
    <div className="tracks-page mx-auto flex max-w-[1400px] flex-col px-4 py-5 sm:px-6 sm:py-6">
      {/* Top bar: back + title */}
      <div className="mb-5 flex shrink-0 items-center gap-4">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          {locale === 'zh' ? '返回' : 'Back'}
        </button>
        <h1 className="shrink-0 text-lg font-bold">
          {locale === 'zh' ? '轨迹' : 'Track Wall'}
        </h1>
      </div>

      <div className="tracks-layout grid min-h-0 flex-1 grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Left: stats + map — fixed in the viewport column */}
        <div
          ref={previewRef}
          className="tracks-preview flex h-full min-h-0 w-full min-w-0 flex-col gap-4"
        >
          {/* Stats card — 2×2 grid: 活动/时间/距离/均速 */}
          <div className="tracks-preview-stats bento-card p-4">
            <p className="mb-3 text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
              {selectedYear ?? (locale === 'zh' ? '全部' : 'Total')}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="min-w-0">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '活动' : 'Activities'}
                </p>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)] tabular-nums sm:text-2xl">
                  {base.length}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '时间' : 'Time'}
                </p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl">
                  {Math.floor(totalTime / 3600)}h{' '}
                  {Math.floor((totalTime % 3600) / 60)}m
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '距离' : 'Distance'}
                </p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl">
                  {formatDistance(totalDist)}{' '}
                  <span className="text-sm font-normal text-[var(--color-muted)]">
                    km
                  </span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '均速' : 'Avg Speed'}
                </p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl">
                  {avgSpeed > 0 ? (
                    <>
                      {formatSpeed(avgSpeed)}{' '}
                      <span className="text-sm font-normal text-[var(--color-muted)]">
                        km/h
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Activity detail — only when a single track is selected */}
          {selectedActivity && (
            <div className="tracks-preview-selected bento-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '已选记录' : 'Selected'}
                </p>
                <button
                  aria-label={
                    locale === 'zh' ? '清除选中轨迹' : 'Clear selected track'
                  }
                  onClick={() => {
                    setSelectedActivity(null);
                    onSelectActivity?.(null);
                  }}
                  className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <p className="mb-0.5 truncate text-xs font-semibold">
                {selectedActivity.name}
              </p>
              <p className="mb-3 text-[10px] text-[var(--color-muted)]">
                {new Date(selectedActivity.start_date_local).toLocaleDateString(
                  locale === 'zh' ? 'zh-CN' : 'en-US',
                  { year: 'numeric', month: 'short', day: 'numeric' }
                )}{' '}
                {new Date(selectedActivity.start_date_local).toLocaleTimeString(
                  locale === 'zh' ? 'zh-CN' : 'en-US',
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="min-w-0">
                  <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                    {locale === 'zh' ? '距离' : 'Distance'}
                  </p>
                  <p className="mt-0.5 font-mono text-base leading-tight font-bold tabular-nums">
                    {(selectedActivity.distance / 1000).toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-[var(--color-muted)]">
                      km
                    </span>
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                    {locale === 'zh' ? '时间' : 'Time'}
                  </p>
                  <p className="mt-0.5 font-mono text-base leading-tight font-bold tabular-nums">
                    {selectedDurationLabel}
                  </p>
                </div>
                {selectedActivity.average_speed > 0 && (
                  <div className="min-w-0">
                    <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                      {locale === 'zh' ? '速度' : 'Speed'}
                    </p>
                    <p className="mt-0.5 font-mono text-base leading-tight font-bold tabular-nums">
                      {formatSpeed(selectedActivity.average_speed)}{' '}
                      <span className="text-[10px] font-normal text-[var(--color-muted)]">
                        km/h
                      </span>
                    </p>
                  </div>
                )}
                {selectedActivity.elevation_gain != null &&
                  selectedActivity.elevation_gain > 0 && (
                    <div className="min-w-0">
                      <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                        {locale === 'zh' ? '爬升' : 'Elev'}
                      </p>
                      <p className="mt-0.5 font-mono text-base leading-tight font-bold tabular-nums">
                        {Math.round(selectedActivity.elevation_gain)}{' '}
                        <span className="text-[10px] font-normal text-[var(--color-muted)]">
                          m
                        </span>
                      </p>
                    </div>
                  )}
                {selectedActivity.average_heartrate != null &&
                  selectedActivity.average_heartrate > 0 && (
                    <div className="min-w-0">
                      <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                        {locale === 'zh' ? '心率' : 'HR'}
                      </p>
                      <p className="mt-0.5 font-mono text-base leading-tight font-bold tabular-nums">
                        {Math.round(selectedActivity.average_heartrate)}{' '}
                        <span className="text-[10px] font-normal text-[var(--color-muted)]">
                          bpm
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            </div>
          )}

          <div className="tracks-preview-map flex min-h-0 flex-1 flex-col">
            <RouteMap
              activities={withPolyline}
              selectedActivity={selectedActivity}
              dark={dark}
              onClearSelection={() => {
                setSelectedActivity(null);
                onSelectActivity?.(null);
              }}
            />
          </div>
        </div>

        {/* Right: filters + scrollable track grid + legend */}
        <div className="tracks-wall flex min-h-0 min-w-0 flex-col">
          <div
            ref={captureRef}
            className="bento-card flex h-full min-h-0 flex-col overflow-hidden p-4"
          >
            {/* Year pills + sport filter */}
            <div className="mb-4 flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] pb-3">
              {totalYearPages > 1 && (
                <button
                  aria-label={locale === 'zh' ? '较新的年份' : 'Newer years'}
                  onClick={() => setYearPage((p) => Math.max(0, p - 1))}
                  disabled={yearPage === 0}
                  className="px-1 text-base leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
                >
                  ‹
                </button>
              )}
              <button
                aria-pressed={selectedYear === null}
                onClick={() => {
                  setSelectedYear(null);
                  setSelectedActivity(null);
                  onSelectActivity?.(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${selectedYear === null ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
              >
                {locale === 'zh' ? '全部' : 'All'}
              </button>
              {visibleYears.map((yr) => (
                <button
                  key={yr}
                  aria-pressed={selectedYear === yr}
                  onClick={() => {
                    setSelectedYear(yr);
                    setSelectedActivity(null);
                    onSelectActivity?.(null);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${selectedYear === yr ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  {yr}
                </button>
              ))}
              {totalYearPages > 1 && (
                <button
                  onClick={() =>
                    setYearPage((p) => Math.min(totalYearPages - 1, p + 1))
                  }
                  aria-label={locale === 'zh' ? '较早的年份' : 'Older years'}
                  disabled={yearPage === totalYearPages - 1}
                  className="px-1 text-base leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
                >
                  ›
                </button>
              )}
              {/* Sport filter — right side */}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  aria-pressed={sportFilter === null}
                  onClick={() => {
                    setSportFilter(null);
                    setSelectedActivity(null);
                    onSelectActivity?.(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${sportFilter === null ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  {locale === 'zh' ? '全部' : 'All'}
                </button>
                {allSportTabs
                  .filter((t) => hasSport(t.value))
                  .map(({ label, value, color }) => (
                    <button
                      key={value}
                      aria-pressed={sportFilter === value}
                      onClick={() => {
                        setSportFilter(value);
                        setSelectedActivity(null);
                        onSelectActivity?.(null);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${sportFilter === value ? 'border-transparent text-white' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                      style={
                        sportFilter === value ? { backgroundColor: color } : {}
                      }
                    >
                      {label}
                    </button>
                  ))}
                <span className="mx-1 h-3 w-px bg-[var(--color-border)]" />
                <button
                  onClick={async () => {
                    if (!captureRef.current || exporting) return;
                    setExporting(true);
                    try {
                      await exportCard(
                        captureRef.current,
                        `tracks-${selectedYear ?? 'all'}.png`
                      );
                    } catch (err) {
                      console.error('Export failed:', err);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  data-export-hidden
                  disabled={exporting || !sortedTracks.length}
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-muted)] transition-all hover:text-[var(--color-text)] disabled:opacity-50"
                  title={locale === 'zh' ? '导出图片' : 'Export as image'}
                >
                  {exporting ? (
                    <svg
                      className="h-3.5 w-3.5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {sortedTracks.length === 0 ? (
              <p className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-sm text-[var(--color-muted)]">
                {locale === 'zh' ? '暂无轨迹数据' : 'No tracks found'}
              </p>
            ) : (
              <div className="tracks-grid flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto overscroll-contain p-0.5">
                {sortedTracks.map(({ representative: a, count, color }) => (
                  <div key={a.run_id} className="track-cell relative">
                    <TrackThumb
                      activity={a}
                      color={color}
                      selected={selectedActivity?.run_id === a.run_id}
                      onClick={handleSelectTrack}
                    />
                    {count > 1 && (
                      <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-[var(--color-bg)]/80 px-1 py-0.5 text-[9px] leading-none font-bold text-[var(--color-muted)]">
                        ×{count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Legend + route count + sort */}
            {sortedTracks.length > 0 && (
              <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
                {(sportFilter === null ||
                  sportFilter === 'cycling' ||
                  sportFilter === 'Ride') && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-0.5 w-3 rounded"
                        style={{ backgroundColor: palette.ride }}
                      />
                      {locale === 'zh' ? '骑行' : 'Ride'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-0.5 w-3 rounded"
                        style={{ backgroundColor: palette.rideLong }}
                      />
                      {locale === 'zh' ? '骑行 ≥60km' : 'Ride ≥60km'}
                    </span>
                  </>
                )}
                {(sportFilter === null || sportFilter === 'Run') &&
                  hasSport('Run') && (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-3 rounded"
                          style={{ backgroundColor: palette.run }}
                        />
                        {locale === 'zh' ? '跑步' : 'Run'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-3 rounded"
                          style={{ backgroundColor: palette.runLong }}
                        />
                        {locale === 'zh' ? '跑步 ≥20km' : 'Run ≥20km'}
                      </span>
                    </>
                  )}
                <div className="ml-auto flex items-center gap-1">
                  <span>
                    {sortedTracks.length}{' '}
                    {locale === 'zh' ? '条路线' : 'routes'}
                  </span>
                  <span className="mx-1.5 text-[var(--color-border)]">·</span>
                  <button
                    type="button"
                    aria-pressed={sortBy === 'date'}
                    onClick={() => setSortBy('date')}
                    className={`transition-colors ${sortBy === 'date' ? 'font-medium text-[var(--color-text)]' : 'hover:text-[var(--color-text)]'}`}
                  >
                    {locale === 'zh' ? '时间' : 'Date'}
                  </button>
                  <span className="text-[var(--color-border)]">/</span>
                  <button
                    type="button"
                    aria-pressed={sortBy === 'distance'}
                    onClick={() => setSortBy('distance')}
                    className={`transition-colors ${sortBy === 'distance' ? 'font-medium text-[var(--color-text)]' : 'hover:text-[var(--color-text)]'}`}
                  >
                    {locale === 'zh' ? '距离' : 'Dist'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* end track grid card */}
        </div>
        {/* end right column */}
      </div>
    </div>
  );
}

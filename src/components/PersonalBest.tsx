import { memo } from 'react';
import type { Activity } from '../types';
import { isRideType } from '../core/i18n';
import { useLocale } from '../hooks/useLocale';
import { parseMovingTime } from '../hooks/useActivities';

interface PersonalBestProps {
  activities: Activity[];
  onSelectActivity?: (a: Activity | null) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const DISTANCES = [
  { key: '40K', min: 38, max: 45 },
  { key: '60K', min: 55, max: 70 },
  { key: '80K', min: 75, max: 90 },
  { key: '100K', min: 95, max: 110 },
];

export const PersonalBest = memo(function PersonalBest({
  activities,
  onSelectActivity,
}: PersonalBestProps) {
  const { locale } = useLocale();

  // Outdoor rides with a usable GPS track
  const rides = activities.filter(
    (a) =>
      isRideType(a.type) && a.summary_polyline && a.summary_polyline.length > 20
  );

  const labels: Record<string, string> =
    locale === 'zh'
      ? {
          '40K': '40 公里',
          '60K': '60 公里',
          '80K': '80 公里',
          '100K': '100 公里',
        }
      : {
          '40K': '40 km',
          '60K': '60 km',
          '80K': '80 km',
          '100K': '100 km',
        };

  const bests = DISTANCES.map(({ key, min, max }) => {
    const matching = rides.filter((a) => {
      const km = a.distance / 1000;
      if (km < min || km > max) return false;
      // Reasonable cycling speed: about 12–45 km/h
      const time = parseMovingTime(a.moving_time);
      if (time <= 0) return false;
      const speedKmh = km / (time / 3600);
      return speedKmh >= 12 && speedKmh <= 45;
    });
    if (matching.length === 0) return { key, activity: null, time: 0 };
    const best = matching.reduce((b, a) => {
      return parseMovingTime(a.moving_time) < parseMovingTime(b.moving_time)
        ? a
        : b;
    });
    return { key, activity: best, time: parseMovingTime(best.moving_time) };
  });

  const hasBests = bests.some((b) => b.activity !== null);
  if (!hasBests) return null;

  return (
    <div className="bento-card !py-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <svg
          className="h-4 w-4 text-[var(--color-accent)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        {locale === 'zh' ? '个人最佳' : 'Personal Best'}
      </h3>

      <div>
        {bests.map(({ key, activity, time }) => (
          <button
            type="button"
            disabled={!activity || !onSelectActivity}
            key={key}
            className={`flex w-full items-center justify-between gap-3 py-1.5 text-left ${
              activity
                ? '-mx-2 cursor-pointer rounded-lg px-2 hover:bg-[var(--color-bg)]'
                : ''
            }`}
            onClick={() => activity && onSelectActivity?.(activity)}
          >
            <span className="text-xs text-[var(--color-text)]">
              {labels[key]}
            </span>
            <span
              className={`font-mono text-xs font-bold ${activity ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            >
              {activity ? formatTime(time) : '--'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});

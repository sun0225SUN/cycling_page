import { memo } from 'react';
import type { Activity, SportFilter } from '../types';
import { useLocale } from '../hooks/useLocale';
import {
  formatDistance,
  parseMovingTime,
  extractProvince,
} from '../hooks/useActivities';
import { AVATAR } from '../config';

interface ProfileCardProps {
  activities: Activity[];
  filter?: SportFilter;
}

export const ProfileCard = memo(function ProfileCard({
  activities,
  filter = 'all',
}: ProfileCardProps) {
  const { t, locale } = useLocale();

  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const totalDistance = filteredActivities.reduce((s, a) => s + a.distance, 0);
  const totalCount = filteredActivities.length;
  const totalSeconds = filteredActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );

  const allDates = activities.map((a) =>
    new Date(a.start_date_local).getFullYear()
  );
  const yearsActive =
    allDates.length > 0 ? Math.max(...allDates) - Math.min(...allDates) + 1 : 0;

  const countries = new Set<string>();
  const provinces = new Set<string>();
  for (const a of activities) {
    const loc = a.location_country;
    if (!loc || loc === 'None') continue;
    if (loc.startsWith('{')) {
      try {
        const d = JSON.parse(loc.replace(/'/g, '"').replace(/None/g, 'null'));
        if (d.country) countries.add(d.country);
      } catch {
        /* ignore */
      }
    } else if (loc.includes('泰国')) {
      countries.add('泰国');
    } else if (loc.includes('日本')) {
      countries.add('日本');
    } else {
      countries.add('中国');
    }
    const p = extractProvince(loc);
    if (p) provinces.add(p);
  }

  const formatHours = (secs: number) => `${(secs / 3600).toFixed(1)}h`;
  const distanceLabel = Number(formatDistance(totalDistance)).toLocaleString(
    locale === 'zh' ? 'zh-CN' : 'en-US'
  );

  return (
    <div className="bento-card bento-profile-card">
      <div className="bento-profile-hero">
        <div className="bento-profile-avatar">
          {AVATAR ? (
            <img src={AVATAR} alt="avatar" />
          ) : (
            <div className="bento-profile-avatar-fallback" aria-hidden="true">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
          )}
        </div>

        <p className="bento-num bento-profile-num text-[var(--color-accent)]">
          {distanceLabel}
          <span className="bento-profile-unit">km</span>
        </p>

        <p className="bento-profile-meta">
          {countries.size} {t('countries')}
          <span className="bento-profile-dot" aria-hidden="true">
            ·
          </span>
          {provinces.size} {t('provinces')}
        </p>
      </div>

      <div className="bento-profile-stats">
        <div>
          <p className="bento-profile-stat-value">
            {totalCount.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
          </p>
          <p className="bento-profile-stat-label">{t('activities')}</p>
        </div>
        <div>
          <p className="bento-profile-stat-value">{yearsActive}</p>
          <p className="bento-profile-stat-label">{t('years')}</p>
        </div>
        <div>
          <p className="bento-profile-stat-value">
            {formatHours(totalSeconds)}
          </p>
          <p className="bento-profile-stat-label">
            {locale === 'zh' ? '时间' : 'Time'}
          </p>
        </div>
      </div>
    </div>
  );
});

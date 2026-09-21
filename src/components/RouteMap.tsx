import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RouteMapProps } from './RouteMapCanvas';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

const MapCanvas = lazy(() =>
  import('./RouteMapCanvas').then((module) => ({
    default: module.RouteMapCanvas,
  }))
);

function MapLoadingShell({
  dark,
  label,
}: {
  dark?: boolean;
  label: string;
}) {
  return (
    <section
      className="route-map bento-card"
      aria-label={label}
      aria-busy="true"
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <div className="route-map-skel route-map-skel-title" />
          <div className="route-map-skel route-map-skel-subtitle" />
        </div>
        <div className="route-map-skel route-map-skel-action" />
      </div>
      <div
        className={`route-map-body${dark ? ' route-map-body-dark' : ''}`}
        role="status"
        aria-live="polite"
      >
        <div className="route-map-loading">
          <span className="route-map-spinner" aria-hidden="true" />
          <span className="route-map-loading-label">{label}</span>
        </div>
      </div>
      <div className="route-map-footer">
        <div className="route-map-skel route-map-skel-footer" />
      </div>
    </section>
  );
}

/** Load WebGL and decode routes only as the map approaches the viewport. */
export function RouteMap(props: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { locale } = useLocale();
  const label = locale === 'zh' ? '正在加载地图…' : 'Loading map…';
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const placeholder = <MapLoadingShell dark={props.dark} label={label} />;
  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={placeholder}>
        {visible || props.selectedActivity ? (
          <MapCanvas {...props} />
        ) : (
          placeholder
        )}
      </Suspense>
    </div>
  );
}

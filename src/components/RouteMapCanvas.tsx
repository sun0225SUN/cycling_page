import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { MAPBOX_TOKEN } from '../config';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

type BasemapProvider = 'mapbox' | 'openfreemap' | 'carto';

const routeCache = new WeakMap<
  Activity,
  {
    type: 'Feature';
    properties: { type: string };
    geometry: { type: 'LineString'; coordinates: number[][] };
  }[]
>();

function preferredProvider(): BasemapProvider {
  return MAPBOX_TOKEN ? 'mapbox' : 'openfreemap';
}

function nextFallback(provider: BasemapProvider): BasemapProvider | null {
  if (provider === 'mapbox') return 'openfreemap';
  if (provider === 'openfreemap') return 'carto';
  return null;
}

function styleForProvider(
  provider: BasemapProvider,
  dark: boolean | undefined
): string {
  const isLight = dark === false;
  if (provider === 'mapbox') {
    return `mapbox://styles/mapbox/${isLight ? 'light' : 'dark'}-v11`;
  }
  if (provider === 'openfreemap') {
    return isLight
      ? 'https://tiles.openfreemap.org/styles/bright'
      : 'https://tiles.openfreemap.org/styles/dark';
  }
  return `https://basemaps.cartocdn.com/gl/${isLight ? 'positron' : 'dark-matter'}-gl-style/style.json`;
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    status?: number;
    statusCode?: number;
    message?: string;
  };
  const status = err.status ?? err.statusCode;
  if (status === 401 || status === 403) return true;
  const message = String(err.message ?? error);
  return /401|403|unauthorized|not authorized|invalid.*token/i.test(message);
}

function isFatalStyleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; message?: string; error?: string };
  const message = String(err.message ?? err.error ?? error);
  // Ignore routine tile 404s; only treat style bootstrap failures as fatal.
  if (
    /Failed to fetch|AJAXError|Could not load style|Error loading style/i.test(
      message
    )
  ) {
    return true;
  }
  const status = err.status;
  return typeof status === 'number' && status >= 400 && status !== 404;
}

/** Classic MAIN_COLOR in dark; dashboard blue in light. Read from CSS so theme swaps stay in sync. */
function readRouteColor(dark?: boolean): string {
  if (typeof window !== 'undefined') {
    const fromCss = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-all')
      .trim();
    if (fromCss) return fromCss;
  }
  return dark === false ? '#0071e3' : 'rgb(224, 237, 94)';
}

const NO_TRANSITION = { duration: 0, delay: 0 } as const;

export function RouteMapCanvas({
  activities,
  selectedActivity,
  dark,
  onClearSelection,
}: RouteMapProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const cameraRef = useRef<mapboxgl.CameraOptions | null>(null);
  const fittedRef = useRef<unknown>(null);
  const appliedStyleKeyRef = useRef<string | null>(null);
  const hasBeenReadyRef = useRef(false);
  const [provider, setProvider] = useState<BasemapProvider>(() =>
    preferredProvider()
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [retry, setRetry] = useState(0);
  const style = styleForProvider(provider, dark);
  const bootstrapStyleRef = useRef(style);
  const bootstrapProviderRef = useRef(provider);

  const routes = useMemo(() => {
    const items = selectedActivity ? [selectedActivity] : activities;
    return items.flatMap((activity) => {
      const cached = routeCache.get(activity);
      if (cached) return cached;
      if (!activity.summary_polyline) return [];
      try {
        const coordinates = polyline
          .decode(activity.summary_polyline)
          .map(([lat, lng]) => [lng, lat])
          .filter(
            ([lng, lat]) =>
              Number.isFinite(lng) &&
              Number.isFinite(lat) &&
              Math.abs(lng) <= 180 &&
              Math.abs(lat) <= 90
          );
        if (coordinates.length < 2) return [];
        const features = [
          {
            type: 'Feature' as const,
            properties: { type: activity.type },
            geometry: { type: 'LineString' as const, coordinates },
          },
        ];
        routeCache.set(activity, features);
        return features;
      } catch {
        return [];
      }
    });
  }, [activities, selectedActivity]);

  const routeBounds = useMemo(() => {
    const bounds = new mapboxgl.LngLatBounds();
    for (const route of routes) {
      for (const coord of route.geometry.coordinates)
        bounds.extend(coord as [number, number]);
    }
    return bounds;
  }, [routes]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || routeBounds.isEmpty()) return;
    map.fitBounds(routeBounds, {
      padding: { top: 35, bottom: 35, left: 35, right: 65 },
      maxZoom: selectedActivity ? 16 : 13,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 500,
    });
  }, [routeBounds, selectedActivity]);

  const markReady = useCallback(() => {
    styleReadyRef.current = true;
    hasBeenReadyRef.current = true;
    setStatus('ready');
  }, []);

  const drawRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    // Color comes from CSS vars after the theme class flips; do not depend on
    // `dark` here or we repaint the old basemap and trigger Mapbox transitions.
    const routeColor = readRouteColor();
    const data = { type: 'FeatureCollection' as const, features: routes };
    const source = map.getSource('routes') as
      mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      // Re-add the layer so theme color swaps are instant (no paint transition).
      if (map.getLayer('routes')) map.removeLayer('routes');
    } else {
      map.addSource('routes', { type: 'geojson', data });
    }
    map.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeColor,
        'line-width': selectedActivity ? 3.5 : 2,
        'line-opacity': selectedActivity ? 1 : 0.7,
        'line-color-transition': NO_TRANSITION,
        'line-width-transition': NO_TRANSITION,
        'line-opacity-transition': NO_TRANSITION,
      },
    });
    if (fittedRef.current !== routes) {
      fittedRef.current = routes;
      fitRoutes();
    }
  }, [routes, selectedActivity, fitRoutes]);

  useEffect(() => {
    if (!containerRef.current || !panelRef.current) return;
    if (MAPBOX_TOKEN) {
      mapboxgl.accessToken = MAPBOX_TOKEN;
    }
    // Start with the real style — empty style + setStyle flashes a white GL clear.
    const bootstrapStyle = bootstrapStyleRef.current;
    const bootstrapProvider = bootstrapProviderRef.current;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: MAPBOX_TOKEN || 'not-needed-for-public-styles',
      language: zh ? 'zh-Hans' : 'en',
      style: bootstrapStyle,
      center: [121.4, 31.2],
      zoom: 10,
      fadeDuration: 0,
      ...cameraRef.current,
      locale: zh
        ? {
            'Map.Title': '骑行路线地图',
            'NavigationControl.ZoomIn': '放大',
            'NavigationControl.ZoomOut': '缩小',
            'NavigationControl.ResetBearing': '恢复朝北',
            'FullscreenControl.Enter': '全屏查看',
            'FullscreenControl.Exit': '退出全屏',
            'AttributionControl.ToggleAttribution': '地图来源',
          }
        : {},
    });
    mapRef.current = map;
    appliedStyleKeyRef.current = `${bootstrapProvider}::${bootstrapStyle}::0`;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.FullscreenControl({ container: panelRef.current }),
      'top-right'
    );
    map.addControl(
      new mapboxgl.ScaleControl({ unit: 'metric', maxWidth: 90 }),
      'bottom-left'
    );
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      cameraRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      appliedStyleKeyRef.current = null;
      styleReadyRef.current = false;
      hasBeenReadyRef.current = false;
    };
  }, [zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    let failed = false;
    const styleKey = `${provider}::${style}::${retry}`;

    const failOrFallback = () => {
      if (cancelled || failed) return;
      const fallback = nextFallback(provider);
      if (fallback) {
        setProvider(fallback);
        return;
      }
      failed = true;
      setStatus('error');
    };

    const onError = (event: mapboxgl.ErrorEvent) => {
      if (cancelled) return;
      if (provider === 'mapbox' && isAuthError(event.error)) {
        setProvider('openfreemap');
        return;
      }
      if (isFatalStyleError(event.error) && !map.isStyleLoaded()) {
        failOrFallback();
      }
    };
    const onIdle = () => {
      if (!cancelled && !failed && map.isStyleLoaded()) markReady();
    };

    map.on('error', onError);
    map.on('idle', onIdle);

    // Avoid re-setStyle on the bootstrap style — that white-flashes the GL canvas.
    if (appliedStyleKeyRef.current !== styleKey) {
      appliedStyleKeyRef.current = styleKey;
      styleReadyRef.current = false;
      // Keep the previous frame visible on theme swaps; only block UI on first load.
      if (!hasBeenReadyRef.current) setStatus('loading');
      map.setStyle(style, {
        diff: false,
        localFontFamily: undefined,
        localIdeographFontFamily: 'sans-serif',
      });
    } else if (map.isStyleLoaded()) {
      // Constructor style finished before this effect attached listeners.
      queueMicrotask(() => {
        if (!cancelled) markReady();
      });
    }

    const timer = window.setTimeout(() => {
      if (!cancelled && !map.isStyleLoaded()) failOrFallback();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      map.off('error', onError);
      map.off('idle', onIdle);
    };
  }, [style, provider, retry, zh, markReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const onStyleLoad = () => {
      if (cancelled) return;
      markReady();
      drawRoutes();
    };
    map.on('style.load', onStyleLoad);
    // Bootstrap / already-loaded style: style.load may have fired already.
    if (map.isStyleLoaded()) {
      queueMicrotask(() => {
        if (cancelled) return;
        markReady();
        drawRoutes();
      });
    }
    return () => {
      cancelled = true;
      map.off('style.load', onStyleLoad);
    };
  }, [drawRoutes, style, retry, zh, markReady]);

  useEffect(() => {
    let wasFullscreen = document.fullscreenElement === panelRef.current;
    let frame = 0;
    const onFullscreen = () => {
      const isFullscreen = document.fullscreenElement === panelRef.current;
      if (isFullscreen || wasFullscreen) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          mapRef.current?.resize();
          fitRoutes();
        });
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [fitRoutes]);

  const providerLabel =
    provider === 'mapbox'
      ? zh
        ? '底图 · Mapbox'
        : 'Basemap · Mapbox'
      : provider === 'openfreemap'
        ? zh
          ? '备用底图 · OpenFreeMap'
          : 'Alternative basemap · OpenFreeMap'
        : zh
          ? '备用底图 · CARTO'
          : 'Alternative basemap · CARTO';

  const statusText =
    status === 'error'
      ? zh
        ? MAPBOX_TOKEN
          ? '底图加载失败，请重试'
          : '底图加载失败。请在 Vercel 配置环境变量 VITE_MAPBOX_TOKEN'
        : MAPBOX_TOKEN
          ? 'Basemap failed to load'
          : 'Basemap failed. Set VITE_MAPBOX_TOKEN in Vercel env'
      : status === 'loading'
        ? zh
          ? '正在加载地图…'
          : 'Loading map…'
        : providerLabel;

  return (
    <section
      ref={panelRef}
      className="route-map bento-card"
      aria-label={zh ? '路线地图' : 'Route map'}
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {zh ? '路线地图' : 'Route map'}
          </h2>
          <p
            className="truncate text-xs text-[var(--color-muted)]"
            title={selectedActivity?.name}
          >
            {selectedActivity
              ? `${selectedActivity.name} · ${(selectedActivity.distance / 1000).toFixed(1)} km`
              : `${routes.length.toLocaleString()} ${zh ? '条轨迹' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {zh ? '返回总览' : 'Overview'}
            </button>
          )}
          <button
            className="route-map-action"
            disabled={!routes.length}
            onClick={fitRoutes}
            title={zh ? '将所有当前轨迹完整放入视野' : 'Fit all current routes'}
          >
            {zh ? '定位轨迹' : 'Fit routes'}
          </button>
        </div>
      </div>
      <div
        className={`route-map-body${dark ? ' route-map-body-dark' : ''}`}
      >
        <div ref={containerRef} className="h-full w-full" />
        {status === 'loading' && (
          <div className="route-map-loading" role="status" aria-live="polite">
            <span className="route-map-spinner" aria-hidden="true" />
            <span className="route-map-loading-label">
              {zh ? '正在加载地图…' : 'Loading map…'}
            </span>
          </div>
        )}
        {!routes.length && status !== 'loading' && (
          <div className="route-map-empty" role="status">
            {zh
              ? selectedActivity
                ? '这次活动没有 GPS 轨迹'
                : '当前筛选没有 GPS 轨迹'
              : 'No GPS route available'}
          </div>
        )}
        {status === 'error' && (
          <div className="route-map-empty" role="alert">
            <div className="max-w-sm px-4 text-center">
              <p className="font-medium text-[var(--color-text)]">
                {zh ? '加载失败' : 'Load failed'}
              </p>
              <p className="mt-2 text-[var(--color-muted)]">
                {MAPBOX_TOKEN
                  ? zh
                    ? 'Mapbox / 备用底图都未能加载，请点击重试。'
                    : 'Mapbox and fallback basemaps failed to load. Please retry.'
                  : zh
                    ? '未检测到 Mapbox token（请在 Vercel 设置 VITE_MAPBOX_TOKEN），备用底图也加载失败。'
                    : 'No Mapbox token detected (set VITE_MAPBOX_TOKEN in Vercel). Fallback basemap also failed.'}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="route-map-footer">
        <span role="status" aria-live="polite">
          {statusText}
        </span>
        {(status === 'error' || (provider !== 'mapbox' && !!MAPBOX_TOKEN)) && (
          <button
            className="route-map-action"
            onClick={() => {
              setProvider(preferredProvider());
              setRetry((value) => value + 1);
            }}
          >
            {provider !== 'mapbox' && MAPBOX_TOKEN
              ? zh
                ? '重试 Mapbox'
                : 'Retry Mapbox'
              : zh
                ? '重试'
                : 'Retry'}
          </button>
        )}
      </div>
    </section>
  );
}

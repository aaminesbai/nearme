import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { avatarUrls } from '@nearme/shared';
import type { MapProps } from './DiscoveryMap';
export default function DiscoveryMap({ point, users, radius, recenter, onSelect }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<LayerGroup | null>(null);
  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((L) => {
      if (disposed || !container.current) return;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      map.current = L.map(container.current, { zoomControl: false }).setView(
        [point.latitude, point.longitude],
        15,
      );
      const cartoKey = process.env.EXPO_PUBLIC_CARTO_API_KEY;
      const tileKey = cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : '';
      L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${tileKey}`, {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map.current);
      layers.current = L.layerGroup().addTo(map.current);
      map.current.invalidateSize();
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // Map lifetime is independent of incoming presence and slider changes.
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !layers.current) return;
      layers.current.clearLayers();
      L.circle([point.latitude, point.longitude], {
        radius,
        color: '#087F70',
        weight: 2,
        fillOpacity: 0.1,
      }).addTo(layers.current);
      L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          html: '<div style="width:22px;height:22px;border:4px solid white;border-radius:50%;background:#087F70;box-shadow:0 2px 8px #7898"> </div><b style="font:11px system-ui;color:#087F70">TOI</b>',
          className: '',
          iconSize: [30, 42],
          iconAnchor: [15, 15],
        }),
        zIndexOffset: 1000,
      }).addTo(layers.current);
      for (const user of users) {
        const icon = L.divIcon({
          html: `<img alt="" src="${avatarUrls[user.avatar]}" style="width:42px;height:42px;border-radius:50%;border:3px solid white;outline:2px solid #F18470;box-shadow:0 3px 12px #7896" />`,
          className: '',
          iconSize: [48, 48],
          iconAnchor: [24, 48],
        });
        L.marker([user.latitude, user.longitude], { icon, title: user.displayName })
          .on('click', () => onSelect(user))
          .addTo(layers.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [point, users, radius, onSelect]);
  useEffect(() => {
    map.current?.flyTo([point.latitude, point.longitude], 15, { duration: 0.5 });
  }, [point.latitude, point.longitude, recenter]);
  return (
    <div
      ref={container}
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      aria-label="Carte des personnes proches"
    />
  );
}

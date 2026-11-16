import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { SearchPharmacy } from '@/lib/useSearch';

function pinIcon(selected: boolean, lowStock: boolean) {
  const color = selected ? '#0A3832' : lowStock ? '#F59E0B' : '#1A5B53';
  const size = selected ? 40 : 32;
  const ring = selected ? 'box-shadow: 0 0 0 4px rgba(209, 241, 74, 0.5);' : '';
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="
        width: ${size}px; height: ${size}px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        ${ring}
        box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

export interface MapViewProps {
  center: { lat: number; lng: number };
  pharmacies: SearchPharmacy[];
  selectedId: string | null;
  onSelect: (pharmacyId: string) => void;
}

export function MapView({ center, pharmacies, selectedId, onSelect }: MapViewProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={center.lat} lng={center.lng} />
      {pharmacies.map((p) => (
        <Marker
          key={p.pharmacyId}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.pharmacyId === selectedId, p.stockLevel === 'low')}
          eventHandlers={{ click: () => onSelect(p.pharmacyId) }}
        />
      ))}
    </MapContainer>
  );
}
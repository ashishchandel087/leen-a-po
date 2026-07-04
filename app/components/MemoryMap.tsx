"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";


// Leaflet's default icon URLs assume a webpack public path that breaks under
// Next.js. Wire them up explicitly using vendored copies of the bundled
// assets (public/leaflet/, copied from node_modules/leaflet/dist/images/).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

// Custom rose-themed pin so it matches the cosmic palette
const memoryIcon = L.divIcon({
  className: "memory-pin",
  html: `<div style="
    width:28px;height:28px;border-radius:50% 50% 50% 0;
    background:linear-gradient(135deg,#f43f5e,#be123c);
    transform:rotate(-45deg);
    border:2px solid #fff;
    box-shadow:0 4px 10px rgba(244,63,94,.5);
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

interface MemoryPin {
  id: string;
  lat: number;
  lng: number;
  date: string;
  caption: string;
  location: string | null;
  thumbUrl: string | null;
}

interface Props {
  memories: MemoryPin[];
  onSelect?: (id: string) => void;
}

function FitBounds({ memories }: { memories: MemoryPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (memories.length === 0) return;
    if (memories.length === 1) {
      map.setView([memories[0].lat, memories[0].lng], 12);
      return;
    }
    const bounds = L.latLngBounds(memories.map((m) => [m.lat, m.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [memories, map]);
  return null;
}

export default function MemoryMap({ memories, onSelect }: Props) {
  // Default view if no pinned memories yet — center on India (rough)
  const initialCenter: [number, number] =
    memories.length > 0 ? [memories[0].lat, memories[0].lng] : [22.5, 78.9];

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={initialCenter}
        zoom={4}
        scrollWheelZoom
        className="h-full w-full bg-[#0a0305]"
        whenReady={() => {
          // Lower Leaflet's pane z-indices so they don't fight the lightbox.
          const root = document.querySelector(".leaflet-container") as HTMLElement | null;
          if (root) root.style.zIndex = "1";
        }}
      >
        <TileLayer
          // CartoDB dark-matter tiles match the cosmic theme
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains={["a", "b", "c", "d"]}
        />
        <FitBounds memories={memories} />
        {memories.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={memoryIcon}
            eventHandlers={
              onSelect
                ? {
                    // Tapping the pin itself opens the memory directly — most
                    // intuitive on touch. The popup is just a preview.
                    click: () => onSelect(m.id),
                  }
                : undefined
            }
          >
            <Popup pane="popupPane" autoPan>
              <div style={{ maxWidth: 220 }}>
                {m.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: onSelect ? "pointer" : "default",
                    }}
                    onClick={onSelect ? () => onSelect(m.id) : undefined}
                  />
                )}
                {m.caption && <p style={{ margin: 0, fontWeight: 600 }}>{m.caption}</p>}
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                  {m.date}
                  {m.location ? ` · ${m.location}` : ""}
                </p>
                {onSelect && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Stop Leaflet from swallowing the event before React
                      // sees the click; some browsers fire mousedown first.
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(m.id);
                    }}
                    style={{
                      marginTop: 8,
                      padding: "6px 14px",
                      background: "#f43f5e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Open
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

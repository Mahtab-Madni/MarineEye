import { Polygon, Tooltip } from "react-leaflet";

import { useState } from "react";

import { useMapStore } from "../../store/useMapStore";

const toLeafletPositions = (slick) => {
  const coordinates = slick?.polygon?.coordinates?.[0];

  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    )
    .map(([longitude, latitude]) => [Number(latitude), Number(longitude)]);
};

const getConfidenceOpacity = (slick) => {
  const raw = Number(slick?.detection_confidence ?? 0);

  if (!Number.isFinite(raw)) {
    return 0.55;
  }

  const confidence = raw > 1 ? raw / 100 : raw;

  return Math.min(0.82, Math.max(0.35, 0.35 + confidence * 0.45));
};

export function SlickLayer({ slicks = [] }) {
  const selectedSlickId = useMapStore((state) => state.selectedSlickId);

  const setSelectedSlickId = useMapStore((state) => state.setSelectedSlickId);

  const [hoveredSlickId, setHoveredSlickId] = useState(null);

  const handleSlickClick = (event, slick) => {
    /*
     * Stop this click from becoming a
     * generic Leaflet map click.
     */
    event?.originalEvent?.stopPropagation?.();
    event?.stopPropagation?.();

    /*
     * Always select the clicked slick.
     *
     * Do NOT toggle to null here.
     * The investigation panel owns the
     * close action.
     */
    setSelectedSlickId(slick.id);
  };

  if (!Array.isArray(slicks)) {
    return null;
  }

  return (
    <>
      {slicks.map((slick) => {
        const positions = toLeafletPositions(slick);

        if (positions.length < 3) {
          return null;
        }

        const id = String(slick?.id ?? "");

        const selected = String(selectedSlickId ?? "") === id;

        const hovered = String(hoveredSlickId ?? "") === id;

        return (
          <Polygon
            key={`slick-${id}`}
            positions={positions}
            pathOptions={{
              color: hovered ? "#ea580c" : "#f97316",

              weight: selected ? 3 : hovered ? 2.5 : 1.5,

              opacity: 1,

              fillColor: "#f97316",

              fillOpacity: selected ? 0.78 : getConfidenceOpacity(slick),
            }}
            eventHandlers={{
              click: (event) => handleSlickClick(event, slick),

              mouseover: () => setHoveredSlickId(slick.id),

              mouseout: () => setHoveredSlickId(null),
            }}
          >
            <Tooltip sticky direction="top" opacity={0.95}>
              <div className="text-[11px] font-semibold">
                {slick?.id ?? "Oil slick"}
              </div>

              <div className="text-[10px]">
                Detection:{" "}
                {(
                  Number(slick?.detection_confidence ?? 0) *
                  (Number(slick?.detection_confidence ?? 0) <= 1 ? 100 : 1)
                ).toFixed(0)}
                %
              </div>

              <div className="text-[10px]">
                Confidence:{" "}
                {(
                  Number(slick?.slick_confidence ?? 0) *
                  (Number(slick?.slick_confidence ?? 0) <= 1 ? 100 : 1)
                ).toFixed(0)}
                %
              </div>

              <div className="mt-1 text-[9px] text-slate-500">
                Click to investigate
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

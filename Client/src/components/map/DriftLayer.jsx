import { Circle, CircleMarker, Polyline, Tooltip } from "react-leaflet";

import { useMapStore } from "../../store/useMapStore";

const DEFAULT_RADIUS_KM = 5;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getOffset = (step) =>
  toNumber(
    step?.t_offset_hours ??
      step?.offset_hours ??
      step?.hours ??
      step?.time_offset_hours,
    0,
  );

const getRadiusKm = (step) =>
  Math.max(
    0,
    toNumber(
      step?.radius_km ?? step?.radius ?? step?.uncertainty_radius_km,
      DEFAULT_RADIUS_KM,
    ),
  );

/*
 * MarineEye keeps GeoJSON coordinates as:
 *
 * [longitude, latitude]
 *
 * Leaflet expects:
 *
 * [latitude, longitude]
 */
const getCenter = (step, fallback = null) => {
  if (!step) {
    return fallback;
  }

  if (Array.isArray(step.center) && step.center.length >= 2) {
    const longitude = Number(step.center[0]);

    const latitude = Number(step.center[1]);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return [latitude, longitude];
    }
  }

  if (Array.isArray(step.position) && step.position.length >= 2) {
    const longitude = Number(step.position[0]);

    const latitude = Number(step.position[1]);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return [latitude, longitude];
    }
  }

  const latitude = Number(
    step.latitude ?? step.lat ?? step.center_lat ?? step.lat_center,
  );

  const longitude = Number(
    step.longitude ??
      step.lon ??
      step.lng ??
      step.center_lon ??
      step.lon_center,
  );

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [latitude, longitude];
  }

  return fallback;
};

const getPhase = (step, offset) => {
  const explicitPhase = String(step?.phase ?? "").toLowerCase();

  if (explicitPhase.includes("forecast")) {
    return "Forecast";
  }

  if (explicitPhase.includes("hindcast")) {
    return "Hindcast";
  }

  if (
    explicitPhase.includes("observation") ||
    explicitPhase.includes("current")
  ) {
    return "Observation";
  }

  if (offset < 0) {
    return "Hindcast";
  }

  if (offset > 0) {
    return "Forecast";
  }

  return "Observation";
};

const getPolygonCenter = (slick) => {
  const coordinates = slick?.polygon?.coordinates?.[0];

  if (!Array.isArray(coordinates)) {
    return null;
  }

  const points = coordinates.filter(
    (point) =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1])),
  );

  if (!points.length) {
    return null;
  }

  return [
    points.reduce((sum, point) => sum + Number(point[0]), 0) / points.length,
    points.reduce((sum, point) => sum + Number(point[1]), 0) / points.length,
  ];
};

const normalizeSteps = (slick) => {
  const hindcast = Array.isArray(slick?.drift?.hindcast)
    ? slick.drift.hindcast
    : [];

  const forecast = Array.isArray(slick?.drift?.forecast)
    ? slick.drift.forecast
    : [];

  const observation =
    slick?.drift?.observation ?? slick?.drift?.current ?? null;

  const observationCenter = getPolygonCenter(slick);

  const observationStep = observation ?? {
    t_offset_hours: 0,
    phase: "Observation",
    ...(observationCenter ? { center: observationCenter } : {}),
  };

  const rawSteps = [
    ...hindcast,
    observationStep ? [observationStep] : [],
    ...forecast,
  ];

  const steps = rawSteps
    .map((step) => {
      const offset = getOffset(step);

      return {
        ...step,
        offset,
        phase: getPhase(step, offset),
      };
    })
    .sort((a, b) => a.offset - b.offset);

  const seenOffsets = new Set();

  return steps.filter((step) => {
    if (seenOffsets.has(step.offset)) {
      return false;
    }

    seenOffsets.add(step.offset);

    return true;
  });
};

const formatOffset = (offset) => {
  const value = toNumber(offset);

  if (value > 0) {
    return `+${value}H`;
  }

  if (value < 0) {
    return `${value}H`;
  }

  return "0H";
};

const getPhaseColor = (phase) => {
  if (phase === "Forecast") {
    return "#2fae9b";
  }

  if (phase === "Hindcast") {
    return "#6f9dad";
  }

  return "#e1a743";
};

export function DriftLayer() {
  const slicks = useMapStore((state) => state.slicks);

  const selectedSlickId = useMapStore((state) => state.selectedSlickId);

  const driftTimeOffset = useMapStore((state) => state.driftTimeOffset);

  const selectedSlick = slicks.find((slick) => slick.id === selectedSlickId);

  if (!selectedSlick) {
    return null;
  }

  const steps = normalizeSteps(selectedSlick);

  if (!steps.length) {
    return null;
  }

  const observationStep = steps.find((step) => step.offset === 0) ?? steps[0];

  const observationCenter = getCenter(observationStep);

  if (!observationCenter) {
    return null;
  }

  const requestedOffset = toNumber(driftTimeOffset);

  const activeStep =
    steps.find((step) => step.offset === requestedOffset) ??
    steps.reduce((closest, step) => {
      const currentDistance = Math.abs(step.offset - requestedOffset);

      const closestDistance = Math.abs(closest.offset - requestedOffset);

      return currentDistance < closestDistance ? step : closest;
    }, steps[0]);

  const activeCenter = getCenter(activeStep, observationCenter);

  const activeOffset = activeStep.offset;

  const activePhase = activeStep.phase;

  const activeRadiusKm = getRadiusKm(activeStep);

  /*
   * Build the complete movement
   * path.
   */
  const fullPath = steps
    .map((step) => getCenter(step, observationCenter))
    .filter(Boolean);

  /*
   * Historical path ends at the
   * currently selected time.
   */
  const selectedPath = steps
    .filter((step) => step.offset <= activeOffset)
    .map((step) => getCenter(step, observationCenter))
    .filter(Boolean);

  /*
   * Forecast path starts at the
   * observation and continues
   * forward.
   */
  const forecastPath = steps
    .filter((step) => step.offset >= 0)
    .map((step) => getCenter(step, observationCenter))
    .filter(Boolean);

  return (
    <>
      {/* -------------------------------------------------
          COMPLETE MOVEMENT ROUTE
          ------------------------------------------------- */}
      {fullPath.length >= 2 && (
        <Polyline
          positions={fullPath}
          pathOptions={{
            color: "#506c72",
            weight: 2,
            opacity: 0.22,
            dashArray: "4 8",
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* -------------------------------------------------
          HINDCAST / SELECTED TRAIL
          ------------------------------------------------- */}
      {selectedPath.length >= 2 && (
        <Polyline
          positions={selectedPath}
          pathOptions={{
            color: activeOffset < 0 ? "#6f9dad" : "#e1a743",
            weight: 4,
            opacity: 0.72,
            dashArray: activeOffset < 0 ? "7 7" : undefined,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* -------------------------------------------------
          FORECAST TRAIL
          ------------------------------------------------- */}
      {forecastPath.length >= 2 && (
        <Polyline
          positions={forecastPath}
          pathOptions={{
            color: "#2fae9b",
            weight: 3,
            opacity: 0.68,
            dashArray: "6 7",
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* -------------------------------------------------
          TIMELINE POINTS
          Small points replace the previous stack of
          overlapping uncertainty circles.
          ------------------------------------------------- */}
      {steps.map((step) => {
        const center = getCenter(step, observationCenter);

        if (!center) {
          return null;
        }

        const isActive = step.offset === activeOffset;

        const isObservation = step.offset === 0;

        if (isActive || isObservation) {
          return null;
        }

        return (
          <CircleMarker
            key={`drift-step-${selectedSlick.id}-${step.offset}`}
            center={center}
            radius={4}
            pathOptions={{
              color: getPhaseColor(step.phase),
              weight: 2,
              fillColor: getPhaseColor(step.phase),
              fillOpacity: 0.8,
              opacity: 0.75,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <div className="text-xs">
                <strong>{step.phase}</strong>
                <br />
                {formatOffset(step.offset)}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* -------------------------------------------------
          OBSERVATION POINT
          ------------------------------------------------- */}
      <CircleMarker
        center={observationCenter}
        radius={8}
        pathOptions={{
          color: "#ffffff",
          weight: 3,
          fillColor: "#e1a743",
          fillOpacity: 1,
        }}
      >
        <Tooltip direction="top" offset={[0, -9]}>
          <div className="text-xs">
            <strong>Observation</strong>
            <br />
            0H
            <br />
            Radius: {getRadiusKm(observationStep).toFixed(1)} km
          </div>
        </Tooltip>
      </CircleMarker>

      {/* -------------------------------------------------
          OBSERVATION → ACTIVE POSITION CONNECTOR
          ------------------------------------------------- */}
      {activeOffset !== 0 && activeCenter && (
        <Polyline
          positions={[observationCenter, activeCenter]}
          pathOptions={{
            color: getPhaseColor(activePhase),
            weight: 3,
            opacity: 0.55,
            dashArray: "3 7",
            lineCap: "round",
          }}
        />
      )}

      {/* -------------------------------------------------
          ONLY THE ACTIVE UNCERTAINTY ENVELOPE
          ------------------------------------------------- */}
      {activeCenter && (
        <Circle
          center={activeCenter}
          radius={activeRadiusKm * 1000}
          pathOptions={{
            color: getPhaseColor(activePhase),
            weight: 3,
            opacity: 0.9,
            fillColor: getPhaseColor(activePhase),
            fillOpacity: 0.13,
            dashArray: activePhase === "Hindcast" ? "8 7" : undefined,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <div className="text-xs">
              <strong>Selected drift position</strong>
              <br />
              {activePhase} · {formatOffset(activeOffset)}
              <br />
              Uncertainty radius: {activeRadiusKm.toFixed(1)} km
            </div>
          </Tooltip>
        </Circle>
      )}

      {/* -------------------------------------------------
          ACTIVE DRIFT POSITION
          ------------------------------------------------- */}
      {activeCenter && (
        <CircleMarker
          center={activeCenter}
          radius={11}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: getPhaseColor(activePhase),
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -12]} permanent opacity={0.95}>
            <div className="text-xs">
              <strong>{activePhase}</strong>
              <br />
              {formatOffset(activeOffset)}
            </div>
          </Tooltip>
        </CircleMarker>
      )}

      {/* -------------------------------------------------
          SELECTED POSITION → OBSERVATION LABEL
          ------------------------------------------------- */}
      {activeOffset !== 0 && activeCenter && (
        <CircleMarker
          center={activeCenter}
          radius={17}
          pathOptions={{
            color: getPhaseColor(activePhase),
            weight: 1.5,
            opacity: 0.45,
            fillOpacity: 0,
          }}
        />
      )}
    </>
  );
}

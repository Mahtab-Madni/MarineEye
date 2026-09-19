import {
  Circle,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useMapStore } from "../../store/useMapStore";

const DEFAULT_RADIUS_KM = 5;

const COLORS = {
  hindcast: "#6f9dad",
  observation: "#e1a743",

  forecastRed: "#ef4444",
  forecastGreen: "#22c55e",
  forecastBlue: "#2563eb",

  path: "#506c72",
};

const toNumber = (
  value,
  fallback = 0,
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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
      step?.radius_km ??
        step?.radius ??
        step?.uncertainty_radius_km,
      DEFAULT_RADIUS_KM,
    ),
  );

/*
 * Data:
 * [longitude, latitude]
 *
 * Leaflet:
 * [latitude, longitude]
 */
const getCenter = (
  step,
  fallback = null,
) => {
  if (!step) {
    return fallback;
  }

  if (
    Array.isArray(step.center) &&
    step.center.length >= 2
  ) {
    const longitude =
      Number(step.center[0]);

    const latitude =
      Number(step.center[1]);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      return [
        latitude,
        longitude,
      ];
    }
  }

  if (
    Array.isArray(step.position) &&
    step.position.length >= 2
  ) {
    const longitude =
      Number(step.position[0]);

    const latitude =
      Number(step.position[1]);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      return [
        latitude,
        longitude,
      ];
    }
  }

  const latitude = Number(
    step.latitude ??
      step.lat ??
      step.center_lat ??
      step.lat_center,
  );

  const longitude = Number(
    step.longitude ??
      step.lon ??
      step.lng ??
      step.center_lon ??
      step.lon_center,
  );

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return [
      latitude,
      longitude,
    ];
  }

  return fallback;
};

const getPolygonCenter = (
  slick,
) => {
  const coordinates =
    slick?.polygon?.coordinates?.[0];

  if (!Array.isArray(coordinates)) {
    return null;
  }

  const points =
    coordinates.filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(
          Number(point[0]),
        ) &&
        Number.isFinite(
          Number(point[1]),
        ),
    );

  if (!points.length) {
    return null;
  }

  const longitude =
    points.reduce(
      (sum, point) =>
        sum + Number(point[0]),
      0,
    ) / points.length;

  const latitude =
    points.reduce(
      (sum, point) =>
        sum + Number(point[1]),
      0,
    ) / points.length;

  return [
    latitude,
    longitude,
  ];
};

/*
 * IMPORTANT:
 *
 * The old code had:
 *
 * observationStep ? [observationStep] : []
 *
 * which creates:
 *
 * [..., [observationStep], ...]
 *
 * That is wrong.
 *
 * This implementation puts the observation
 * object directly into the timeline.
 */
const normalizeSteps = (
  slick,
) => {
  const hindcast =
    Array.isArray(
      slick?.drift?.hindcast,
    )
      ? slick.drift.hindcast
      : [];

  const forecast =
    Array.isArray(
      slick?.drift?.forecast,
    )
      ? slick.drift.forecast
      : [];

  const explicitObservation =
    slick?.drift?.observation ??
    slick?.drift?.current ??
    null;

  const polygonCenter =
    getPolygonCenter(slick);

  /*
   * The existing generator stores 0H
   * as the final hindcast record.
   *
   * Preserve it as observation.
   */
  const generatedZeroHour =
    hindcast.find(
      (step) =>
        getOffset(step) === 0,
    ) ?? null;

  const observationStep =
    explicitObservation ??
    generatedZeroHour ?? {
      t_offset_hours: 0,
      phase: "Observation",
      ...(polygonCenter
        ? {
            center: [
              polygonCenter[1],
              polygonCenter[0],
            ],
          }
        : {}),
    };

  const negativeHindcast =
    hindcast
      .filter(
        (step) =>
          getOffset(step) < 0,
      )
      .map((step) => ({
        ...step,
        offset: getOffset(step),
        phase: "Hindcast",
      }));

  const observation = {
    ...observationStep,
    offset: 0,
    phase: "Observation",
  };

  const positiveForecast =
    forecast
      .filter(
        (step) =>
          getOffset(step) > 0,
      )
      .map((step) => ({
        ...step,
        offset: getOffset(step),
        phase: "Forecast",
      }));

  const combined = [
    ...negativeHindcast,
    observation,
    ...positiveForecast,
  ].sort(
    (a, b) =>
      a.offset - b.offset,
  );

  const seen = new Set();

  return combined.filter(
    (step) => {
      if (
        seen.has(step.offset)
      ) {
        return false;
      }

      seen.add(step.offset);

      return true;
    },
  );
};

const formatOffset = (
  offset,
) => {
  const value =
    toNumber(offset);

  if (value > 0) {
    return `+${value}H`;
  }

  if (value < 0) {
    return `${value}H`;
  }

  return "0H";
};

const getForecastColor = (
  forecastSteps,
  step,
) => {
  const index =
    forecastSteps.findIndex(
      (item) =>
        item.offset ===
        step.offset,
    );

  if (index === 0) {
    return COLORS.forecastRed;
  }

  if (index === 1) {
    return COLORS.forecastGreen;
  }

  return COLORS.forecastBlue;
};

const getStepColor = (
  step,
  forecastSteps,
) => {
  if (
    step.phase ===
    "Forecast"
  ) {
    return getForecastColor(
      forecastSteps,
      step,
    );
  }

  if (
    step.phase ===
    "Observation"
  ) {
    return COLORS.observation;
  }

  return COLORS.hindcast;
};

function MapClickHandler({
  onMapClick,
}) {
  const map = useMap();

  useEffect(() => {
    const handleClick = () => {
      onMapClick();
    };

    map.on(
      "click",
      handleClick,
    );

    return () => {
      map.off(
        "click",
        handleClick,
      );
    };
  }, [
    map,
    onMapClick,
  ]);

  return null;
}

export function DriftLayer() {
  const slicks =
    useMapStore(
      (state) =>
        state.slicks,
    );

  const selectedSlickId =
    useMapStore(
      (state) =>
        state.selectedSlickId,
    );

  const driftTimeOffset =
    useMapStore(
      (state) =>
        state.driftTimeOffset,
    );

  const selectedSlick =
    slicks.find(
      (slick) =>
        String(slick.id) ===
        String(
          selectedSlickId,
        ),
    );

  const [
    circleVisible,
    setCircleVisible,
  ] = useState(false);

  const previousOffsetRef =
    useRef(0);

  /*
   * Selecting a different slick starts with
   * no uncertainty circle.
   */
  useEffect(() => {
    setCircleVisible(false);
    previousOffsetRef.current = 0;
  }, [selectedSlickId]);

  /*
   * A real timeline change automatically
   * shows the circle for that selected hour.
   *
   * The ref prevents the initial 0H render,
   * and the automatic 0H reset when selecting
   * a new slick, from opening the circle.
   */
  useEffect(() => {
    const nextOffset =
      Number(driftTimeOffset);

    if (
      previousOffsetRef.current !==
      nextOffset
    ) {
      setCircleVisible(true);
    }

    previousOffsetRef.current =
      nextOffset;
  }, [driftTimeOffset]);

  const hideCircle =
    useCallback(() => {
      setCircleVisible(false);
    }, []);

  if (!selectedSlick) {
    return null;
  }

  const steps =
    normalizeSteps(
      selectedSlick,
    );

  if (!steps.length) {
    return null;
  }

  const polygonCenter =
    getPolygonCenter(
      selectedSlick,
    );

  const observationStep =
    steps.find(
      (step) =>
        step.offset === 0,
    ) ?? steps[0];

  const fallbackCenter =
    getCenter(
      steps.find(
        (step) =>
          getCenter(step) !==
          null,
      ),
      polygonCenter,
    ) ?? polygonCenter;

  const observationCenter =
    getCenter(
      observationStep,
      polygonCenter,
    ) ?? fallbackCenter;

  if (!observationCenter) {
    return null;
  }

  const requestedOffset =
    toNumber(
      driftTimeOffset,
    );

  const activeStep =
    steps.find(
      (step) =>
        step.offset ===
        requestedOffset,
    ) ??
    steps.reduce(
      (closest, step) => {
        const currentDistance =
          Math.abs(
            step.offset -
              requestedOffset,
          );

        const closestDistance =
          Math.abs(
            closest.offset -
              requestedOffset,
          );

        return currentDistance <
          closestDistance
          ? step
          : closest;
      },
      steps[0],
    );

  const activeOffset =
    activeStep.offset;

  const forecastSteps =
    steps.filter(
      (step) =>
        step.phase ===
        "Forecast",
    );

  const fullPath =
    steps
      .map((step) =>
        getCenter(
          step,
          observationCenter,
        ),
      )
      .filter(Boolean);

  const selectedPath =
    steps
      .filter(
        (step) =>
          step.offset <=
          activeOffset,
      )
      .map((step) =>
        getCenter(
          step,
          observationCenter,
        ),
      )
      .filter(Boolean);

  const forecastPath =
    steps
      .filter(
        (step) =>
          step.offset >= 0,
      )
      .map((step) =>
        getCenter(
          step,
          observationCenter,
        ),
      )
      .filter(Boolean);

  const circleCenter =
    getCenter(
      activeStep,
      observationCenter,
    );

  const circleColor =
    getStepColor(
      activeStep,
      forecastSteps,
    );

  const circleRadius =
    getRadiusKm(activeStep);

  const handleDotClick = (
    event,
    offset,
  ) => {
    event?.originalEvent?.stopPropagation?.();
    event?.stopPropagation?.();

    useMapStore.setState({
      driftTimeOffset:
        Number(offset),
    });

    setCircleVisible(true);
  };

  return (
    <>
      <MapClickHandler
        onMapClick={
          hideCircle
        }
      />

      {/* Full movement path */}
      {fullPath.length >= 2 && (
        <Polyline
          positions={fullPath}
          pathOptions={{
            color:
              COLORS.path,
            weight: 2,
            opacity: 0.25,
            dashArray: "4 8",
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* Historical / selected path */}
      {selectedPath.length >= 2 && (
        <Polyline
          positions={
            selectedPath
          }
          pathOptions={{
            color:
              getStepColor(
                activeStep,
                forecastSteps,
              ),
            weight: 4,
            opacity: 0.72,
            dashArray:
              activeOffset < 0
                ? "7 7"
                : undefined,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* Forecast path */}
      {forecastPath.length >= 2 && (
        <Polyline
          positions={
            forecastPath
          }
          pathOptions={{
            color:
              COLORS.path,
            weight: 3,
            opacity: 0.42,
            dashArray: "5 7",
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}

      {/* Every timeline point */}
      {steps.map(
        (step) => {
          const center =
            getCenter(
              step,
              observationCenter,
            );

          if (!center) {
            return null;
          }

          const color =
            getStepColor(
              step,
              forecastSteps,
            );

          const active =
            step.offset ===
            activeOffset;

          return (
            <CircleMarker
              key={`drift-point-${selectedSlick.id}-${step.offset}`}
              center={center}
              radius={
                active ? 7 : 5
              }
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 1,
                weight:
                  active
                    ? 4
                    : 2,
              }}
              eventHandlers={{
                click: (
                  event,
                ) =>
                  handleDotClick(
                    event,
                    step.offset,
                  ),
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -6]}
                opacity={0.95}
              >
                <div className="text-[11px] font-semibold">
                  {formatOffset(
                    step.offset,
                  )}
                </div>

                <div className="text-[10px]">
                  {step.phase}
                </div>

                <div className="text-[10px]">
                  Uncertainty:{" "}
                  {circleRadiusForStep(
                    step,
                  ).toFixed(1)}{" "}
                  km
                </div>

                <div className="mt-1 text-[9px] text-slate-500">
                  Click to inspect
                </div>
              </Tooltip>
            </CircleMarker>
          );
        },
      )}

      {/* ONLY the selected hour's uncertainty circle */}
      {circleVisible &&
        circleCenter && (
          <Circle
            center={circleCenter}
            radius={
              circleRadius * 1000
            }
            pathOptions={{
              color:
                circleColor,
              weight: 2,
              opacity: 0.9,
              fillColor:
                circleColor,
              fillOpacity: 0.08,
              dashArray: "7 6",
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -8]}
            >
              <div className="text-[11px] font-semibold">
                {formatOffset(
                  activeOffset,
                )}
              </div>

              <div className="text-[10px]">
                {activeStep.phase}
              </div>

              <div className="text-[10px]">
                Uncertainty:{" "}
                {circleRadius.toFixed(
                  1,
                )}{" "}
                km
              </div>
            </Tooltip>
          </Circle>
        )}
    </>
  );
}

function circleRadiusForStep(
  step,
) {
  return getRadiusKm(step);
}
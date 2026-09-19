import { useEffect, useMemo } from "react";

import { useMapStore } from "../../store/useMapStore";

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

const getSteps = (slick) => {
  const hindcast = Array.isArray(slick?.drift?.hindcast)
    ? slick.drift.hindcast
    : [];

  const forecast = Array.isArray(slick?.drift?.forecast)
    ? slick.drift.forecast
    : [];

  const explicitObservation =
    slick?.drift?.observation ?? slick?.drift?.current ?? null;

  const zeroHour = hindcast.find((step) => getOffset(step) === 0) ?? null;

  const observation = explicitObservation ??
    zeroHour ?? {
      t_offset_hours: 0,
      phase: "Observation",
    };

  const steps = [
    ...hindcast
      .filter((step) => getOffset(step) < 0)
      .map((step) => ({
        ...step,
        offset: getOffset(step),
        phase: "Hindcast",
      })),

    {
      ...observation,
      offset: 0,
      phase: "Observation",
    },

    ...forecast
      .filter((step) => getOffset(step) > 0)
      .map((step) => ({
        ...step,
        offset: getOffset(step),
        phase: "Forecast",
      })),
  ].sort((a, b) => a.offset - b.offset);

  const seen = new Set();

  return steps.filter((step) => {
    if (seen.has(step.offset)) {
      return false;
    }

    seen.add(step.offset);

    return true;
  });
};

const getColor = (step, forecastSteps) => {
  if (step.phase === "Hindcast") {
    return "#6f9dad";
  }

  if (step.phase === "Observation") {
    return "#e1a743";
  }

  const index = forecastSteps.findIndex((item) => item.offset === step.offset);

  if (index === 0) {
    return "#ef4444";
  }

  if (index === 1) {
    return "#22c55e";
  }

  return "#2563eb";
};

export function DriftTimeSlider({ slick }) {
  const driftTimeOffset = useMapStore((state) => state.driftTimeOffset);

  const steps = useMemo(() => getSteps(slick), [slick]);

  useEffect(() => {
    if (!steps.length) {
      return;
    }

    const current = Number(driftTimeOffset);

    if (steps.some((step) => step.offset === current)) {
      return;
    }

    useMapStore.setState({
      driftTimeOffset: steps.some((step) => step.offset === 0)
        ? 0
        : steps[0].offset,
    });
  }, [slick?.id, steps, driftTimeOffset]);

  if (!steps.length) {
    return (
      <div className="rounded-xl border border-[#d5dcd7] bg-white p-4 text-[11px] text-[#819091]">
        No drift timeline available.
      </div>
    );
  }

  let currentIndex = steps.findIndex(
    (step) => step.offset === Number(driftTimeOffset),
  );

  if (currentIndex < 0) {
    currentIndex = steps.findIndex((step) => step.offset === 0);

    if (currentIndex < 0) {
      currentIndex = 0;
    }
  }

  const currentStep = steps[currentIndex];

  const forecastSteps = steps.filter((step) => step.phase === "Forecast");

  const setOffset = (offset) => {
    useMapStore.setState({
      driftTimeOffset: Number(offset),
    });
  };

  return (
    <div className="rounded-xl border border-[#d5dcd7] bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#879394]">
            Drift timeline
          </p>

          <p className="mt-1 text-[21px] font-semibold text-[#253642]">
            {formatOffset(currentStep.offset)}
          </p>

          <p className="text-[10px] text-[#819091]">{currentStep.phase}</p>
        </div>

        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#879394]">
            Uncertainty
          </p>

          <p className="mt-1 text-sm font-semibold text-[#344b4e]">
            {toNumber(
              currentStep.radius_km ??
                currentStep.radius ??
                currentStep.uncertainty_radius_km,
              5,
            ).toFixed(1)}{" "}
            km
          </p>
        </div>
      </div>

      <div className="relative mt-6">
        <div className="pointer-events-none absolute left-0 right-0 top-[7px] flex h-[3px] overflow-hidden rounded-full">
          {steps.slice(0, -1).map((step, index) => (
            <span
              key={`segment-${step.offset}`}
              className="min-w-0 flex-1"
              style={{
                backgroundColor: getColor(steps[index + 1], forecastSteps),
              }}
            />
          ))}
        </div>

        <input
          aria-label="Drift timeline"
          type="range"
          min="0"
          max={steps.length - 1}
          step="1"
          value={currentIndex}
          onChange={(event) => {
            const index = Number(event.target.value);

            const step = steps[index];

            if (step) {
              setOffset(step.offset);
            }
          }}
          className="marineeye-range relative z-10 w-full"
        />

        <div className="pointer-events-none absolute left-0 right-0 top-[3px] flex justify-between">
          {steps.map((step, index) => {
            const color = getColor(step, forecastSteps);

            const active = index === currentIndex;

            return (
              <span
                key={`dot-${step.offset}`}
                className="h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white"
                style={{
                  backgroundColor: color,
                  boxShadow: active ? `0 0 0 2px ${color}` : undefined,
                }}
              />
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-9">
          {steps.map((step) => (
            <button
              key={`label-${step.offset}`}
              type="button"
              onClick={() => setOffset(step.offset)}
              className={`text-center text-[8px] font-semibold ${
                step.offset === currentStep.offset
                  ? "text-[#246d68]"
                  : "text-[#879394]"
              }`}
            >
              {formatOffset(step.offset)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#edf0ed] pt-3 text-[9px] text-[#819091]">
        <span>
          {steps.filter((step) => step.phase === "Hindcast").length} hindcast
        </span>

        <span>1 observation</span>

        <span>
          {steps.filter((step) => step.phase === "Forecast").length} forecast
        </span>
      </div>

      <p className="mt-3 text-[9px] leading-4 text-[#819091]">
        Click a drift point to show its uncertainty circle. Click elsewhere on
        the map to hide it. Changing the timeline selects that hour.
      </p>
    </div>
  );
}

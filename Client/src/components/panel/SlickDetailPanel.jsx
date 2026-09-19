import { useMemo, useState } from "react";

import { DriftTimeSlider } from "./DriftTimeSlider";

import { SourceCard } from "./SourceCard";

import { useMapStore } from "../../store/useMapStore";

import {
  formatFactor,
  formatScore,
  getAttributionSignals,
  getSourceScore,
  rankSources,
} from "../../utils/attribution";

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatClass = (value) =>
  String(value ?? "ambiguous")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getSourceId = (source) =>
  String(
    source?.id ??
      source?.source_id ??
      source?.vessel_id ??
      source?.infra_id ??
      "",
  );

const getTrackSourceId = (track) =>
  String(
    track?.related_source_id ?? track?.source_id ?? track?.vessel_id ?? "",
  );

export function SlickDetailPanel({ slick }) {
  const setSelectedSlickId = useMapStore((state) => state.setSelectedSlickId);

  const selectedSourceId = useMapStore((state) => state.selectedSourceId);

  const aisTracks = useMapStore((state) => state.aisTracks);

  const setSelectedSourceId = useMapStore((state) => state.setSelectedSourceId);

  const sourceView = useMapStore((state) => state.sourceView);

  const setSourceView = useMapStore((state) => state.setSourceView);

  const [sortKey, setSortKey] = useState("score");

  const [sortDirection, setSortDirection] = useState("desc");

  const rankedSources = useMemo(
    () => rankSources(slick?.sources ?? [], 3),
    [slick],
  );

  const sources = useMemo(() => {
    return [...rankedSources].sort((a, b) => {
      if (sortKey === "name") {
        const left = String(
          a?.name ?? a?.id ?? a?.source_id ?? a?.vessel_id ?? "",
        ).toLowerCase();

        const right = String(
          b?.name ?? b?.id ?? b?.source_id ?? b?.vessel_id ?? "",
        ).toLowerCase();

        return sortDirection === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }

      if (sortKey === "factor") {
        const left = formatFactor(a?.dominant_factor).toLowerCase();

        const right = formatFactor(b?.dominant_factor).toLowerCase();

        return sortDirection === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }

      const left = getSourceScore(a) ?? -1;

      const right = getSourceScore(b) ?? -1;

      return sortDirection === "asc" ? left - right : right - left;
    });
  }, [rankedSources, sortDirection, sortKey]);

  if (!slick) {
    return (
      <div className="rounded-xl border border-[#c8d2cd] bg-[#f8f6ef] p-5 text-sm text-[#637477]">
        No slick selected.
      </div>
    );
  }

  const topCandidate = rankedSources[0] ?? null;

  const topCandidateId = getSourceId(topCandidate);

  const effectiveSelectedSourceId =
    selectedSourceId &&
    rankedSources.some(
      (source) => getSourceId(source) === String(selectedSourceId),
    )
      ? String(selectedSourceId)
      : topCandidateId;

  const selectedSource =
    rankedSources.find(
      (source) => getSourceId(source) === effectiveSelectedSourceId,
    ) ?? topCandidate;

  const selectedTrack =
    aisTracks.find(
      (track) => getTrackSourceId(track) === effectiveSelectedSourceId,
    ) ?? null;

  const hasDarkVessel = sources.some(
    (source) => source?.type === "dark_vessel",
  );

  const allSignals = sources.flatMap((source) => getAttributionSignals(source));

  const strongestSignal = allSignals.length
    ? [...allSignals].sort((a, b) => b.score - a.score)[0]
    : null;

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const handleSelectSource = (sourceId) => {
    setSelectedSourceId(sourceId);
  };

  const hindcast = Array.isArray(slick?.drift?.hindcast)
    ? slick.drift.hindcast
    : [];

  const forecast = Array.isArray(slick?.drift?.forecast)
    ? slick.drift.forecast
    : [];

  return (
    <div className="min-h-full bg-[#f8f6ef]">
      <div className="border-b border-[#d5dcd7] px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#ef7d2f]" />

              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#718083]">
                Slick investigation
              </p>
            </div>

            <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-[#253642]">
              {slick.id ?? "Unknown slick"}
            </h2>

            <p className="mt-1.5 text-[13px] font-medium text-[#64777a]">
              {formatClass(slick.class)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedSlickId(null)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border  bg-white text-xl leading-none text-[#718083] transition hover:border-[#b8cbc5] hover:text-[#246d68]"
            aria-label="Close slick investigation"
            title="Close slick investigation"
          >
            ×
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {hasDarkVessel && (
            <span className="rounded-full border border-[#d9c58f] bg-[#f7f0dc] px-2 py-1 text-[10px] font-bold text-[#866a2e]">
              Potential dark-vessel signal
            </span>
          )}

          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
              slick.hitl_reviewed === true
                ? "border-[#a8d2c6] bg-[#e8f4ef] text-[#267568]"
                : "border-[#d1d8d3] bg-[#edf0eb] text-[#687b7d]"
            }`}
          >
            {slick.hitl_reviewed === true ? "Verified" : "Unverified"}
          </span>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        <section>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Area", `${safeNumber(slick.area).toFixed(1)} km²`],

              [
                "Age estimate",
                `${safeNumber(slick.age_estimate).toFixed(1)} h`,
              ],

              ["Detection", formatScore(slick.detection_confidence)],

              ["Slick confidence", formatScore(slick.slick_confidence)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[#d5dcd7] bg-white p-3.5"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#879394]">
                  {label}
                </p>

                <p className="mt-1.5 text-[20px] font-semibold leading-tight text-[#253642]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#718083]">
              Observation
            </p>

            <p className="mt-1 text-[11px] text-[#91a0a1]">
              Core information for the selected detection.
            </p>
          </div>

          <div className="rounded-xl border border-[#d5dcd7] bg-white p-4 text-[12px] text-[#667779]">
            <div className="flex items-center justify-between gap-3">
              <span>Age estimate</span>

              <span className="font-semibold text-[#33474b]">
                {safeNumber(slick.age_estimate).toFixed(1)} hours
              </span>
            </div>

            <div className="mt-2 flex items-start justify-between gap-3">
              <span>Acquisition</span>

              <span className="text-right font-semibold text-[#33474b]">
                {formatDate(slick.timestamp)}
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#718083]">
              Drift analysis
            </p>

            <p className="mt-1 text-[11px] leading-4 text-[#819091]">
              Hindcast → observation → forecast movement envelope.
            </p>
          </div>

          <DriftTimeSlider slick={slick} />

          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[#819091]">
            <span>{hindcast.length} hindcast steps</span>

            <span>{forecast.length} forecast steps</span>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#718083]">
              Attribution evidence
            </p>

            <p className="mt-1 text-[11px] leading-4 text-[#819091]">
              Why the candidate sources are ranked this way.
            </p>
          </div>

          <div className="rounded-xl border border-[#d5dcd7] bg-[#eef4f1] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#819091]">
                  Strongest available signal
                </p>

                <p className="mt-1.5 text-[15px] font-semibold text-[#344b4e]">
                  {strongestSignal?.label ?? "No individual signal available"}
                </p>
              </div>

              {strongestSignal && (
                <span className="text-[18px] font-semibold text-[#246d68]">
                  {formatScore(strongestSignal.score)}
                </span>
              )}
            </div>

            <p className="mt-3 text-[10px] leading-4 text-[#718083]">
              The fused source score comes from the current dataset. Individual
              evidence values explain ranking strength; they are not
              probabilities.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                Candidate sources
              </p>

              <p className="mt-1 text-[11px] text-[#819091]">
                Ranked probable origins for this slick.
              </p>
            </div>

            <div className="flex rounded-lg border border-[#c8d2cd] bg-[#e7e8df] p-0.5">
              <button
                type="button"
                onClick={() => setSourceView("cards")}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${
                  sourceView === "cards"
                    ? "bg-[#f8f6ef] text-[#246d68] shadow-sm"
                    : "text-[#718083]"
                }`}
              >
                Cards
              </button>

              <button
                type="button"
                onClick={() => setSourceView("table")}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${
                  sourceView === "table"
                    ? "bg-[#f8f6ef] text-[#246d68] shadow-sm"
                    : "text-[#718083]"
                }`}
              >
                Table
              </button>
            </div>
          </div>

          {selectedSource && (
            <div className="mb-3 rounded-xl border border-[#9ed4c5] bg-[#e6f3ed] px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#5f7c7b]">
                    Selected candidate
                  </p>

                  <p className="mt-1 text-[13px] font-semibold text-[#246d68]">
                    {selectedSource?.name ??
                      selectedSource?.id ??
                      selectedSource?.source_id ??
                      selectedSource?.vessel_id ??
                      "Unknown source"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#718083]">
                    Rank
                  </p>

                  <p className="mt-1 text-sm font-bold text-[#344b4e]">
                    #
                    {rankedSources.findIndex(
                      (source) =>
                        getSourceId(source) === effectiveSelectedSourceId,
                    ) + 1}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-[9px] leading-4 text-[#718083]">
                AIS highlighting follows this selected candidate. If no
                candidate is clicked, the highest-ranked source is selected
                automatically.
              </p>
            </div>
          )}

          {selectedTrack && (
            <div className="mb-3 rounded-xl border border-[#c9d7e8] bg-[#f1f6fb] px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#61758b]">
                  AIS vessel telemetry
                </p>

                <span className="text-[9px] font-semibold text-[#61758b]">
                  {selectedTrack.positions?.length ?? 0} observations
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#61758b]">
                <div>
                  <span className="block text-[9px] uppercase tracking-[0.08em] text-[#8a9bab]">
                    Speed
                  </span>
                  <span className="font-semibold text-[#344b4e]">
                    {safeNumber(selectedTrack.speed).toFixed(1)} kn
                  </span>
                </div>

                <div>
                  <span className="block text-[9px] uppercase tracking-[0.08em] text-[#8a9bab]">
                    Heading
                  </span>
                  <span className="font-semibold text-[#344b4e]">
                    {safeNumber(selectedTrack.heading).toFixed(0)}°
                  </span>
                </div>

                <div className="col-span-2 flex items-center justify-between gap-3 border-t border-[#d8e2ec] pt-2">
                  <span>Last AIS observation</span>
                  <span className="text-right font-semibold text-[#344b4e]">
                    {formatDate(selectedTrack.timestamps?.at(-1))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sourceView === "cards" ? (
            <div className="space-y-3">
              {sources.length ? (
                sources.map((source, index) => (
                  <SourceCard
                    key={`${getSourceId(source)}-${index}`}
                    source={source}
                    rank={index + 1}
                    selected={getSourceId(source) === effectiveSelectedSourceId}
                    onSelect={handleSelectSource}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#cbd6d1] bg-white p-5 text-center text-[11px] leading-5 text-[#819091]">
                  No candidate source records are available for this slick.
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#c8d2cd] bg-white">
              <div className="grid grid-cols-[30px_1fr_60px_1fr] border-b border-[#d1d9d3] bg-[#e7e8df] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.09em] text-[#718083]">
                <span>#</span>

                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="text-left"
                >
                  Source{" "}
                  {sortKey === "name"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSort("score")}
                  className="text-left"
                >
                  Score{" "}
                  {sortKey === "score"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSort("factor")}
                  className="text-left"
                >
                  Evidence{" "}
                  {sortKey === "factor"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>
              </div>

              {sources.map((source, index) => {
                const sourceId = getSourceId(source);

                const selected = sourceId === effectiveSelectedSourceId;

                return (
                  <button
                    type="button"
                    key={`${sourceId}-${index}`}
                    onClick={() => handleSelectSource(sourceId)}
                    className={`grid w-full grid-cols-[30px_1fr_60px_1fr] items-center gap-1 border-b border-[#e4e6df] px-3 py-3 text-left last:border-0 ${
                      selected ? "bg-[#edf7f3]" : "hover:bg-[#f7f8f5]"
                    }`}
                    aria-pressed={selected}
                  >
                    <span
                      className={`font-bold ${
                        selected ? "text-[#246d68]" : "text-[#3d706b]"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-[#253642]">
                        {source?.name ??
                          source?.id ??
                          source?.source_id ??
                          source?.vessel_id ??
                          "Unknown source"}
                      </p>

                      <p className="mt-0.5 text-[9px] uppercase text-[#879394]">
                        {source?.type === "dark_vessel"
                          ? "Dark vessel"
                          : source?.type === "infrastructure"
                            ? "Infrastructure"
                            : "AIS vessel"}
                      </p>
                    </div>

                    <span className="font-bold text-[#246d68]">
                      {formatScore(getSourceScore(source))}
                    </span>

                    <span className="text-[10px] text-[#53696d]">
                      {selected
                        ? "Selected"
                        : formatFactor(source?.dominant_factor)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#d5dcd7] bg-[#eef4f1] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#718083]">
            Investigation status
          </p>

          <p className="mt-1.5 text-[13px] font-semibold text-[#344b4e]">
            {slick.hitl_reviewed === true
              ? "Human-reviewed observation"
              : "Awaiting review"}
          </p>

          <p className="mt-2 text-[11px] leading-5 text-[#718083]">
            Use AIS correlation, source attribution and drift analysis as
            investigation evidence, not as definitive proof of responsibility.
          </p>
        </section>
      </div>
    </div>
  );
}

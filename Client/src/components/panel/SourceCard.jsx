import {
  formatScore,
  getAttributionSignals,
  getSourceScore,
  getStrongestSignal,
} from "../../utils/attribution";

const getSourceName = (source) =>
  source?.name ??
  source?.id ??
  source?.source_id ??
  source?.vessel_id ??
  source?.infra_id ??
  "Unknown source";

const getSourceType = (source) => {
  if (source?.type === "dark_vessel") {
    return "Dark vessel";
  }

  if (source?.type === "infrastructure") {
    return "Infrastructure";
  }

  return "AIS vessel";
};

const getSourceIcon = (source) => {
  if (source?.type === "dark_vessel") {
    return "DV";
  }

  if (source?.type === "infrastructure") {
    return "INF";
  }

  return "AIS";
};

const getSourceId = (source) =>
  String(
    source?.id ??
      source?.source_id ??
      source?.vessel_id ??
      source?.infra_id ??
      "",
  );

export function SourceCard({ source, rank, selected = false, onSelect }) {
  const signals = getAttributionSignals(source);

  const score = getSourceScore(source);

  const sourceId = getSourceId(source);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(sourceId)}
      className={`block w-full rounded-xl border p-3.5 text-left shadow-[0_5px_15px_rgba(48,65,62,0.05)] transition ${
        selected
          ? "border-[#4bafa0] bg-[#edf7f3] shadow-[0_7px_20px_rgba(45,111,103,0.12)]"
          : "border-[#c8d2cd] bg-[#f8f6ef]/95 hover:border-[#a9c8bf] hover:bg-white"
      }`}
      aria-pressed={selected}
      aria-label={`Select source ${getSourceName(source)}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[9px] font-bold ${
              selected
                ? "bg-[#cfe9df] text-[#246d68]"
                : "bg-[#e3eee9] text-[#246d68]"
            }`}
          >
            {getSourceIcon(source)}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {rank && (
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[9px] font-bold ${
                    selected
                      ? "bg-[#246d68] text-white"
                      : "bg-[#e8efeb] text-[#3d706b]"
                  }`}
                >
                  {rank}
                </span>
              )}

              <p className="truncate text-sm font-semibold text-[#253642]">
                {getSourceName(source)}
              </p>
            </div>

            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a8788]">
              {getSourceType(source)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="rounded-full border border-[#9ed4c5] bg-[#e6f3ed] px-2 py-1 text-[10px] font-bold text-[#246d68]">
            {formatScore(score)}
          </div>

          {selected && (
            <span className="rounded-full bg-[#246d68] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-white">
              Selected
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-[#eef4f1] px-2.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#819091]">
              Strongest evidence
            </p>

            <p className="mt-1 text-[10px] font-semibold text-[#3d706b]">
              {getStrongestSignal(source)}
            </p>
          </div>

          <span className="text-[9px] font-semibold text-[#7b8b8c]">
            {source?.navic_state ??
              (source?.navic_tracked
                ? "NavIC available"
                : "Navigation status unavailable")}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#718083]">
            Attribution evidence
          </p>

          <span
            className="cursor-help text-[9px] text-[#879394]"
            title="The fused score ranks candidates. Evidence bars are signal strengths, not probabilities."
          >
            Dataset fused score
          </span>
        </div>

        <p className="mt-1 text-[9px] leading-4 text-[#879394]">
          Higher bars indicate stronger individual signals. They explain the
          ranking but are not probabilities.
        </p>
      </div>

      {signals.length ? (
        <div className="space-y-2.5">
          {signals.map((signal) => (
            <div key={signal.key}>
              <div className="mb-1 flex items-center justify-between text-[10px] text-[#53696d]">
                <span>{signal.label}</span>

                <span className="font-medium">{formatScore(signal.score)}</span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-[#dbe4df]">
                <div
                  className="h-full rounded-full bg-[#4bafa0]"
                  style={{
                    width: `${
                      Math.max(0, Math.min(1, Number(signal.score) || 0)) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-[#edf1ee] px-2.5 py-2 text-[10px] leading-4 text-[#718083]">
          No individual evidence signals are available for this candidate.
        </p>
      )}

      <p className="mt-3 text-[9px] font-medium text-[#819091]">
        {selected
          ? "Selected candidate — AIS map highlighting follows this source."
          : "Click to select this candidate and highlight its AIS track."}
      </p>
    </button>
  );
}

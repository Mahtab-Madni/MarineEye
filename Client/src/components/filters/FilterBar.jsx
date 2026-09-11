import { useMapStore } from "../../store/useMapStore";
import { DateRangeFilter } from "./DateRangeFilter";

const CLASS_OPTIONS = [
  {
    value: "recent_vessel",
    label: "Recent vessel",
    color: "rose",
  },
  {
    value: "coincident_vessel",
    label: "Coincident vessel",
    color: "amber",
  },
  {
    value: "old_vessel",
    label: "Old vessel",
    color: "orange",
  },
  {
    value: "natural_seep",
    label: "Natural seep",
    color: "sky",
  },
  {
    value: "infrastructure",
    label: "Infrastructure",
    color: "violet",
  },
  {
    value: "ambiguous",
    label: "Ambiguous",
    color: "slate",
  },
];

const SOURCE_OPTIONS = [
  {
    value: "vessel",
    label: "Vessels",
    icon: "AIS",
  },
  {
    value: "dark_vessel",
    label: "Dark vessels",
    icon: "DV",
  },
  {
    value: "infrastructure",
    label: "Infrastructure",
    icon: "INF",
  },
];

export function FilterBar() {
  const filters = useMapStore((state) => state.filters);
  const setFilters = useMapStore((state) => state.setFilters);

  const resetFilters = () => {
    setFilters({
      dateRange: ["2019-01-01", "2019-12-31"],
      minDetectionConfidence: 0.7,
      minSlickConfidence: 0.8,
      classes: CLASS_OPTIONS.map((item) => item.value),
      sourceTypes: SOURCE_OPTIONS.map((item) => item.value),
      reviewStatus: "all",
    });
  };

  const toggleClass = (value) => {
    const current = filters.classes;

    setFilters({
      classes: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };

  const toggleSource = (value) => {
    const current = filters.sourceTypes;

    setFilters({
      sourceTypes: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#f4f6f4] text-slate-700">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                Monitoring
              </span>
            </div>

            <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-slate-900">
              Investigation
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Configure observations and probable sources
            </p>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-2xl border border-slate-200  px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Time */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-label">Observation window</h3>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Time
            </span>
          </div>

          <DateRangeFilter
            value={filters.dateRange}
            onChange={(nextRange) =>
              setFilters({ dateRange: nextRange })
            }
          />
        </section>

        {/* Detection */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-label">Detection confidence</h3>

            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
              {Math.round(filters.minDetectionConfidence * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="50"
            max="100"
            step="1"
            value={Math.round(
              filters.minDetectionConfidence * 100,
            )}
            onChange={(event) =>
              setFilters({
                minDetectionConfidence:
                  Number(event.target.value) / 100,
              })
            }
            className="slider-track h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
          />

          <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400">
            <span>50</span>
            <span>60</span>
            <span>70</span>
            <span>80</span>
            <span>90</span>
            <span>100</span>
          </div>
        </section>

        {/* Slick confidence */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-label">Slick confidence</h3>

            <span className="rounded-full bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white">
              {Math.round(filters.minSlickConfidence * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="50"
            max="100"
            step="1"
            value={Math.round(
              filters.minSlickConfidence * 100,
            )}
            onChange={(event) =>
              setFilters({
                minSlickConfidence:
                  Number(event.target.value) / 100,
              })
            }
            className="slider-track slider-track-teal h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
          />

          <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400">
            <span>50</span>
            <span>60</span>
            <span>70</span>
            <span>80</span>
            <span>90</span>
            <span>100</span>
          </div>
        </section>

        {/* Source */}
        <section className="mb-6 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-label">Probable sources</h3>
            <span className="text-[10px] text-slate-400">
              {filters.sourceTypes.length} active
            </span>
          </div>

          <div className="space-y-2">
            {SOURCE_OPTIONS.map((source) => {
              const active = filters.sourceTypes.includes(
                source.value,
              );

              return (
                <button
                  key={source.value}
                  type="button"
                  onClick={() => toggleSource(source.value)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-slate-300 bg-white shadow-sm"
                      : "border-transparent bg-slate-100/70 opacity-55"
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg text-[9px] font-bold ${
                      active
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {source.icon}
                  </span>

                  <span className="flex-1 text-xs font-medium text-slate-700">
                    {source.label}
                  </span>

                  <span
                    className={`h-2 w-2 rounded-full ${
                      active
                        ? "bg-emerald-500"
                        : "bg-slate-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* Classes */}
        <section className="mb-6 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-label">Slick classification</h3>
            <span className="text-[10px] text-slate-400">
              {filters.classes.length}/6
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {CLASS_OPTIONS.map((option) => {
              const active = filters.classes.includes(
                option.value,
              );

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleClass(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
                    active
                      ? "border-slate-300 bg-white text-slate-700 shadow-sm"
                      : "border-transparent bg-slate-100 text-slate-400"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Review */}
        <section className="border-t border-slate-200 pt-5">
          <div className="mb-3">
            <h3 className="section-label">Review status</h3>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
            {[
              ["all", "All"],
              ["verified", "Verified"],
              ["unverified", "Unverified"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setFilters({ reviewStatus: value })
                }
                className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition ${
                  filters.reviewStatus === value
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Footer status */}
      <div className="border-t border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Filters applied to live map
        </div>
      </div>
    </div>
  );
}
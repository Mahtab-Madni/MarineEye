import { useEffect, useMemo, useState } from "react";

import { getMarineEyeData } from "./api/dataClient";

import { getMarineEyeData as getMockMarineEyeData } from "./api/mockClient";

import { FilterBar } from "./components/filters/FilterBar";

import { MapShell } from "./components/map/MapShell";

import { SlickDetailPanel } from "./components/panel/SlickDetailPanel";

import { StatsBar } from "./components/stats/StatsBar";

import { InvestigationReport } from "./components/report/InvestigationReport";

import { matchesFilters, useMapStore } from "./store/useMapStore";

function LoadingState() {
  return (
    <div className="absolute inset-0 z-[800] flex items-center justify-center bg-[#d7e0dc]/45 backdrop-blur-[2px]">
      <div className="rounded-2xl border border-[#c2d0ca] bg-[#f8f6ef]/95 px-6 py-5 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b9ccc5] border-t-[#3e8e84]" />

          <div>
            <p className="text-sm font-semibold text-[#253642]">
              Loading marine observations
            </p>

            <p className="mt-1 text-[11px] text-[#718083]">
              Connecting to MARIS-X data service…
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="absolute inset-0 z-[850] flex items-center justify-center bg-[#d7e0dc]/55 px-4 backdrop-blur-[2px]">
      <div className="max-w-sm rounded-2xl border border-[#d6b8ae] bg-[#fffaf5] px-6 py-5 text-center shadow-xl">
        <p className="text-sm font-semibold text-[#704b43]">
          Unable to load marine observations
        </p>

        <p className="mt-2 text-[11px] leading-5 text-[#8b6f69]">{message}</p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-[#c99e91] bg-white px-3 py-2 text-[11px] font-semibold text-[#704b43] transition hover:bg-[#fff1e9]"
        >
          Retry connection
        </button>
      </div>
    </div>
  );
}

function EmptyState({ hasData }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[650] flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm rounded-2xl border border-[#c8d2cd] bg-[#f8f6ef]/95 px-6 py-5 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#e2eee9] text-[#3d8d82]">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M4 17.5 9 12l3.5 3.5L20 8" />
            <path d="M4 20h16" />
          </svg>
        </div>

        <h2 className="mt-3 text-sm font-semibold text-[#253642]">
          {hasData
            ? "No detections match the current filters"
            : "No marine observations loaded"}
        </h2>

        <p className="mt-1 text-[11px] leading-5 text-[#718083]">
          {hasData
            ? "Try lowering the confidence thresholds, expanding the date range, or enabling additional filters."
            : "MARIS-X could not find any normalized slick records to display."}
        </p>
      </div>
    </div>
  );
}

function HeaderMenu({ title, open, onToggle, children }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition ${
          open
            ? "border-[#b8ccc6] bg-[#edf5f1] text-[#246d68]"
            : "border-transparent bg-white text-[#44575a] hover:border-[#d2dad5] hover:bg-[#f9faf7]"
        }`}
      >
        <span>{title}</span>

        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[2500] mt-2 w-[270px] overflow-hidden rounded-xl border border-[#d0d8d3] bg-[#f8f6ef] shadow-[0_14px_35px_rgba(37,54,66,0.16)]"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  const [dataSource, setDataSource] = useState("unknown");

  const [loadError, setLoadError] = useState("");

  const [dataUpdatedAt, setDataUpdatedAt] = useState(null);

  const [reloadToken, setReloadToken] = useState(0);

  const [isReportOpen, setIsReportOpen] = useState(false);

  const [openMenu, setOpenMenu] = useState(null);

  const slicks = useMapStore((state) => state.slicks);

  const filters = useMapStore((state) => state.filters);

  const selectedSlickId = useMapStore((state) => state.selectedSlickId);

  const cursorPosition = useMapStore((state) => state.cursorPosition);

  const mapZoom = useMapStore((state) => state.mapZoom);

  const setSlicks = useMapStore((state) => state.setSlicks);

  const setAISTracks = useMapStore((state) => state.setAISTracks);

  const resetFilters = useMapStore((state) => state.resetFilters);

  const visibleSlicks = useMemo(
    () => slicks.filter((slick) => matchesFilters(slick, filters)),
    [filters, slicks],
  );

  const selectedSlick = useMemo(
    () => slicks.find((slick) => slick.id === selectedSlickId) ?? null,
    [selectedSlickId, slicks],
  );

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await getMarineEyeData();

        if (cancelled) {
          return;
        }

        setSlicks(Array.isArray(response?.slicks) ? response.slicks : []);

        setAISTracks(
          Array.isArray(response?.aisTracks) ? response.aisTracks : [],
        );

        setDataSource("backend");
        setDataUpdatedAt(
          response?.meta?.generatedAt ?? new Date().toISOString(),
        );
      } catch (backendError) {
        console.warn(
          "MARIS-X API unavailable; falling back to local prototype data.",
          backendError,
        );

        try {
          const response = await getMockMarineEyeData();

          if (cancelled) {
            return;
          }

          setSlicks(Array.isArray(response?.slicks) ? response.slicks : []);

          setAISTracks(
            Array.isArray(response?.aisTracks) ? response.aisTracks : [],
          );

          setDataSource("mock");
          setDataUpdatedAt(new Date().toISOString());
        } catch (mockError) {
          if (cancelled) {
            return;
          }

          console.error("MarineEye data loading failed.", mockError);

          setSlicks([]);
          setAISTracks([]);
          setDataSource("none");
          setLoadError(
            "The FastAPI service and local prototype data are both unavailable.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, setAISTracks, setSlicks]);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[#e9e5dc] text-[#253642]"
      onClick={() => {
        if (openMenu) {
          setOpenMenu(null);
        }
      }}
    >
      <header
        data-marineeye-header="true"
        className="relative z-[2000] shrink-0 border-b border-[#cdd4ce] bg-[#f5f2e9]/98"
      >
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[1.3rem] font-semibold tracking-tight text-slate-900">
                MARIS-
                <span className="text-[#258f86]">X</span>
              </span>

              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.24em] text-[#7b8788]">
                Maritime intelligence
              </div>
            </div>

            <div className="hidden h-7 w-px bg-[#d1d7d2] sm:block" />

            <div className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-[#718083] md:block">
              Oil spill investigation console
            </div>
          </div>

          <div
            className="flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`hidden h-9 animate-pulse items-center gap-2 rounded-full border px-3 text-[10px] font-bold tracking-[0.1em] sm:flex ${
                dataSource === "backend"
                  ? " bg-transparent text-[#246d68]"
                  : dataSource === "mock"
                    ? " bg-transparent text-[#8a6b2e]"
                    : " bg-transparent text-[#718083]"
              }`}
            >
              <span
                className={`h-[6px] w-[6px] rounded-full ${
                  dataSource === "backend"
                    ? "bg-[#3e9c88]"
                    : dataSource === "mock"
                      ? "bg-[#c99c42]"
                      : "bg-[#899394]"
                }`}
              />

              {dataSource === "backend"
                ? "API connected"
                : dataSource === "mock"
                  ? "Prototype data"
                  : "No data"}
            </div>

            {dataUpdatedAt && (
              <span className="hidden text-[9px] text-[#879394] lg:inline">
                Updated{" "}
                {new Date(dataUpdatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}

            <HeaderMenu
              title="Help"
              open={openMenu === "help"}
              onToggle={() => setOpenMenu(openMenu === "help" ? null : "help")}
            >
              <div className="border-b border-[#dfe4df] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                  MARIS-X guide
                </p>

                <p className="mt-1 text-sm font-semibold text-[#344b4e]">
                  Investigation workflow
                </p>
              </div>

              <div className="space-y-3 p-4">
                {[
                  [
                    "01",
                    "Select a slick",
                    "Click an orange detection on the map.",
                  ],
                  [
                    "02",
                    "Review evidence",
                    "Inspect confidence, AIS correlation and candidate sources.",
                  ],
                  [
                    "03",
                    "Check drift",
                    "Use the timeline to inspect the modeled movement envelope.",
                  ],
                  [
                    "04",
                    "Generate report",
                    "Export the current investigation as a report or JSON evidence file.",
                  ],
                ].map(([number, title, description]) => (
                  <div key={number} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#e4eee9] text-[9px] font-bold text-[#3d706b]">
                      {number}
                    </span>

                    <div>
                      <p className="text-[11px] font-semibold text-[#344b4e]">
                        {title}
                      </p>

                      <p className="mt-0.5 text-[10px] leading-4 text-[#718083]">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#dfe4df] bg-[#eef4f1] px-4 py-3 text-[9px] leading-4 text-[#718083]">
                Prototype drift and attribution values are investigation aids,
                not scientific proof.
              </div>
            </HeaderMenu>

            {selectedSlick && (
              <button
                type="button"
                onClick={() => setIsReportOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#afd0c5] bg-[#eef7f3] px-3.5 text-sm font-semibold text-[#246d68] transition hover:bg-[#e2f0eb]"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 2.8h6l3 3v11.4H6z" />
                  <path d="M12 2.8v3h3" />
                  <path d="M8.5 10h4M8.5 13h4" />
                </svg>
                Report
              </button>
            )}

            <HeaderMenu
              title="Account"
              open={openMenu === "account"}
              onToggle={() =>
                setOpenMenu(openMenu === "account" ? null : "account")
              }
            >
              <div className="border-b border-[#dfe4df] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                  Analyst workspace
                </p>

                <p className="mt-1 text-sm font-semibold text-[#344b4e]">
                  Local prototype
                </p>
              </div>

              <div className="p-4">
                <div className="rounded-lg border border-[#d5dcd7] bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#879394]">
                    Data source
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#344b4e]">
                    {dataSource === "backend"
                      ? "FastAPI + SQLite"
                      : dataSource === "mock"
                        ? "Local CSV prototype"
                        : "Unavailable"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setOpenMenu(null);
                  }}
                  className="mt-3 w-full rounded-lg border border-[#cbd5d0] bg-white px-3 py-2.5 text-[11px] font-semibold text-[#3d5558] transition hover:bg-[#f2f4f1]"
                >
                  Reset investigation filters
                </button>

                <p className="mt-3 text-[9px] leading-4 text-[#879394]">
                  Authentication is not configured for this prototype.
                </p>
              </div>
            </HeaderMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full flex-1 max-w-[1800px] overflow-hidden border border-[#cdd4ce] border-t-0 bg-[#eeece5] shadow-[0_14px_40px_rgba(46,59,58,0.08)]">
        <aside className="relative z-[1000] h-full w-[360px] shrink-0 overflow-y-auto border-r border-[#cdd4ce] bg-[#e5e5dc] shadow-[4px_0_18px_rgba(46,59,58,0.05)]">
          {selectedSlick ? (
            <SlickDetailPanel slick={selectedSlick} />
          ) : (
            <div>
              <FilterBar />
            </div>
          )}
        </aside>

        <main className="relative min-w-0 flex-1 bg-[#d7e0dc]">
          <MapShell />

          <StatsBar />

          {isLoading && <LoadingState />}

          {!isLoading && loadError && (
            <ErrorState
              message={loadError}
              onRetry={() => setReloadToken((value) => value + 1)}
            />
          )}

          {!isLoading && !loadError && visibleSlicks.length === 0 && (
            <EmptyState hasData={slicks.length > 0} />
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[600] flex  justify-between border-t border-[#b8c8c3] bg-[#f5f2e9]/90 px-3 py-2 text-[11px] text-[#637477] backdrop-blur-sm">
            <span>
              {visibleSlicks.length}{" "}
              {visibleSlicks.length === 1 ? "slick" : "slicks"} in view
            </span>

            <span>
              {cursorPosition
                ? `Lat ${cursorPosition.latitude.toFixed(
                    5,
                  )}, Lon ${cursorPosition.longitude.toFixed(5)}`
                : "Move over map for coordinates"}
            </span>

            <span>
              Scale: ~
              {Math.round(40075 / 2 ** Math.max(0, Number(mapZoom) || 0))} km
            </span>
          </div>
        </main>
      </div>

      {isReportOpen && selectedSlick && (
        <InvestigationReport
          slick={selectedSlick}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
}

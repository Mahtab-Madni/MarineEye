import { create } from "zustand";

const REGION = {
  center: [33.2, 31.6],
  zoom: 7,
  bounds: [
    [29.3, 27.12],
    [36.37, 36.09],
  ],
};

const DEFAULT_FILTERS = {
  dateRange: [
    "2019-01-01",
    "2019-12-31",
  ],

  minDetectionConfidence: 0.7,

  minSlickConfidence: 0.8,

  classes: [
    "infrastructure",
    "natural_seep",
    "coincident_vessel",
    "recent_vessel",
    "old_vessel",
    "ambiguous",
  ],

  sourceTypes: [
    "vessel",
    "dark_vessel",
    "infrastructure",
  ],

  reviewStatus: "all",

  sourceSearch: "",
};

const toSafeNumber = (
  value,
  fallback = 0,
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const normalizeSource = (source) => ({
  ...source,

  id:
    source?.id ??
    source?.source_id ??
    source?.vessel_id ??
    source?.infra_id ??
    "unknown-source",

  type:
    source?.type ??
    "vessel",
});

export const matchesFilters = (
  slick,
  filters,
) => {
  const timestamp = String(
    slick?.timestamp ?? "",
  );

  const dateKey =
    timestamp.slice(0, 10);

  const sources = Array.isArray(
    slick?.sources,
  )
    ? slick.sources.map(
        normalizeSource,
      )
    : [];

  const dateMatches =
    !filters.dateRange?.[0] ||
    !filters.dateRange?.[1] ||
    (
      dateKey >=
        filters.dateRange[0] &&
      dateKey <=
        filters.dateRange[1]
    );

  const detectionMatches =
    toSafeNumber(
      slick?.detection_confidence,
    ) >=
    toSafeNumber(
      filters.minDetectionConfidence,
    );

  const slickConfidenceMatches =
    toSafeNumber(
      slick?.slick_confidence,
    ) >=
    toSafeNumber(
      filters.minSlickConfidence,
    );

  const classMatches =
    !filters.classes?.length ||
    filters.classes.includes(
      slick?.class,
    );

  const reviewMatches =
    filters.reviewStatus ===
      "all" ||
    (
      filters.reviewStatus ===
        "verified" &&
      slick?.hitl_reviewed === true
    ) ||
    (
      filters.reviewStatus ===
        "unverified" &&
      slick?.hitl_reviewed !== true
    );

  const sourceTypeMatches =
    !filters.sourceTypes?.length ||
    sources.length === 0 ||
    sources.some((source) =>
      filters.sourceTypes.includes(
        source.type,
      ),
    );

  const search = String(
    filters.sourceSearch ?? "",
  )
    .trim()
    .toLowerCase();

  const sourceSearchMatches =
    !search ||
    sources.some((source) =>
      [
        source.id,
        source.source_id,
        source.type,
        source.vessel_id,
        source.name,
        source.flag,
        source.tag,
        source.dominant_factor,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );

  return (
    dateMatches &&
    detectionMatches &&
    slickConfidenceMatches &&
    classMatches &&
    reviewMatches &&
    sourceTypeMatches &&
    sourceSearchMatches
  );
};

export const useMapStore = create(
  (set, get) => ({
    region: REGION,

    filters: DEFAULT_FILTERS,

    slicks: [],

    aisTracks: [],

    selectedSlickId: null,

    selectedSourceId: null,

    hoveredSlickId: null,

    cursorPosition: null,

    mapZoom: 9,

    sourceView: "cards",

    driftTimeOffset: 0,

    layerToggles: {
      slicks: true,
      ais: true,
      driftCone: true,
    },

    setSlicks: (slicks) =>
      set({
        slicks: Array.isArray(
          slicks,
        )
          ? slicks
          : [],
      }),

    setAISTracks: (aisTracks) =>
      set({
        aisTracks: Array.isArray(
          aisTracks,
        )
          ? aisTracks
          : [],
      }),

    setSelectedSlickId: (
      selectedSlickId,
    ) =>
      set({
        selectedSlickId,
        selectedSourceId: null,
        driftTimeOffset: 0,
      }),

    setSelectedSourceId: (
      selectedSourceId,
    ) =>
      set({
        selectedSourceId:
          selectedSourceId
            ? String(
                selectedSourceId,
              )
            : null,
      }),

    setHoveredSlickId: (
      hoveredSlickId,
    ) =>
      set({
        hoveredSlickId,
      }),

    setCursorPosition: (
      cursorPosition,
    ) =>
      set({
        cursorPosition,
      }),

    setMapZoom: (mapZoom) =>
      set({
        mapZoom,
      }),

    setFilters: (
      nextFilters,
    ) =>
      set((state) => ({
        filters: {
          ...state.filters,
          ...nextFilters,
        },
      })),

    resetFilters: () =>
      set({
        filters: {
          ...DEFAULT_FILTERS,

          classes: [
            ...DEFAULT_FILTERS.classes,
          ],

          sourceTypes: [
            ...DEFAULT_FILTERS.sourceTypes,
          ],
        },
      }),

    setSourceView: (
      sourceView,
    ) =>
      set({
        sourceView,
      }),

    setDriftTimeOffset: (
      driftTimeOffset,
    ) =>
      set({
        driftTimeOffset:
          toSafeNumber(
            driftTimeOffset,
          ),
      }),

    setLayerToggle: (
      key,
      value,
    ) =>
      set((state) => ({
        layerToggles: {
          ...state.layerToggles,
          [key]: value,
        },
      })),

    resetLayerToggles: () =>
      set({
        layerToggles: {
          slicks: true,
          ais: true,
          driftCone: true,
        },
      }),

    getFilteredSlicks: () => {
      const {
        slicks,
        filters,
      } = get();

      return slicks.filter(
        (slick) =>
          matchesFilters(
            slick,
            filters,
          ),
      );
    },
  }),
);
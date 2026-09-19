import { useEffect, useMemo, useState } from "react";

import {
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { divIcon } from "leaflet";

import { useShallow } from "zustand/react/shallow";

import { useMapStore } from "../../store/useMapStore";

import { AISLayer } from "./AISLayer";
import { DriftLayer } from "./DriftLayer";
import { SlickLayer } from "./SlickLayer";

/* =========================================================
   BASEMAPS
   ========================================================= */

const BASE_LAYERS = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },

  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

    attribution:
      "Tiles &copy; Esri, Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
};

/* =========================================================
   DEFAULT MAP REGION
   ========================================================= */

const DEMO_REGION_BOUNDS = [
  [29.3, 27.12],
  [36.37, 36.09],
];

const DEMO_CENTER = [33.2, 31.6];

const COUNTRY_BOUNDARIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const locationIcon = divIcon({
  className: "marineeye-location-icon",
  html: '<span class="marineeye-location-pin" aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

/* =========================================================
   DATASET BOUNDS
   ========================================================= */

function getDatasetBounds(slicks) {
  const points = [];

  const collectCoordinates = (coordinates) => {
    if (!Array.isArray(coordinates)) {
      return;
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      const [longitude, latitude] = coordinates;

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        points.push([latitude, longitude]);
      }

      return;
    }

    coordinates.forEach(collectCoordinates);
  };

  slicks.forEach((slick) => {
    collectCoordinates(slick?.polygon?.coordinates);
  });

  if (!points.length) {
    return null;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  points.forEach(([latitude, longitude]) => {
    minLat = Math.min(minLat, latitude);

    maxLat = Math.max(maxLat, latitude);

    minLon = Math.min(minLon, longitude);

    maxLon = Math.max(maxLon, longitude);
  });

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

/* =========================================================
   DATASET VIEWPORT
   ========================================================= */

function DatasetViewport({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) {
      return;
    }

    map.fitBounds(bounds, {
      padding: [55, 55],

      maxZoom: 11,

      animate: false,
    });
  }, [bounds, map]);

  return null;
}

/* =========================================================
   COUNTRY BOUNDARIES
   ========================================================= */

function CountryBoundaries() {
  const [countries, setCountries] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch(COUNTRY_BOUNDARIES_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load country boundaries.");
        }

        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setCountries(data);
        }
      })
      .catch((error) => {
        console.warn("Country boundary layer unavailable:", error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!countries) {
    return null;
  }

  return (
    <GeoJSON
      data={countries}
      style={{
        color: "#6d8f92",

        weight: 0.8,

        opacity: 0.48,

        fillOpacity: 0,
      }}
      onEachFeature={(feature, layer) => {
        const countryName =
          feature?.properties?.NAME ||
          feature?.properties?.ADMIN ||
          feature?.properties?.name;

        if (countryName) {
          layer.bindTooltip(countryName, {
            sticky: true,

            direction: "center",

            className: "country-tooltip",
          });
        }
      }}
    />
  );
}

/* =========================================================
   CURSOR POSITION TRACKER
   ========================================================= */

function CursorPositionTracker() {
  const map = useMap();

  const setCursorPosition = useMapStore((state) => state.setCursorPosition);

  const setMapZoom = useMapStore((state) => state.setMapZoom);

  useEffect(() => {
    const handleMouseMove = ({ latlng }) => {
      setCursorPosition({
        latitude: latlng.lat,

        longitude: latlng.lng,
      });
    };

    const handleMouseOut = () => {
      setCursorPosition(null);
    };

    const handleZoomEnd = () => {
      setMapZoom(map.getZoom());
    };

    map.on("mousemove", handleMouseMove);

    map.on("mouseout", handleMouseOut);

    map.on("zoomend", handleZoomEnd);

    handleZoomEnd();

    return () => {
      map.off("mousemove", handleMouseMove);

      map.off("mouseout", handleMouseOut);

      map.off("zoomend", handleZoomEnd);
    };
  }, [map, setCursorPosition, setMapZoom]);

  return null;
}

/* =========================================================
   GENERIC MAP TOOL BUTTON
   ========================================================= */

function ToolButton({ label, title, onClick, children, active = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={`group grid h-11 w-11 place-items-center rounded-xl border shadow-[0_5px_16px_rgba(15,23,42,0.24)] backdrop-blur-md transition ${
        active
          ? "border-[#246d68] bg-[#246d68] text-white"
          : "border-white/80 bg-white text-[#344b4e] hover:border-[#8eb6ae] hover:bg-[#f8fffc] hover:text-[#246d68]"
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================================
   LAYER TOGGLE
   ========================================================= */

function LayerToggle({ label, description, enabled, onChange, icon }) {
  const iconClass =
    icon === "slick"
      ? "bg-orange-50 text-orange-600"
      : icon === "ais"
        ? "bg-blue-50 text-blue-600"
        : "bg-teal-50 text-teal-600";

  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-slate-50"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        {icon === "slick" && (
          <span className="h-3 w-4 rounded-sm border-2 border-current" />
        )}

        {icon === "ais" && (
          <span className="h-0.5 w-4 rounded-full bg-current" />
        )}

        {icon === "drift" && (
          <span className="h-4 w-4 rounded-full border border-current border-dashed" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-700">
          {label}
        </span>

        <span className="block truncate text-[10px] text-slate-400">
          {description}
        </span>
      </span>

      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          enabled ? "bg-teal-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/* =========================================================
   MAP TOOLBAR
   ========================================================= */

function MapToolbar({ activeBase, setActiveBase, resetBounds }) {
  const map = useMap();

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [userLocation, setUserLocation] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [searchLocation, setSearchLocation] = useState(null);

  const [searchError, setSearchError] = useState("");

  const [layersOpen, setLayersOpen] = useState(false);

  const layerToggles = useMapStore((state) => state.layerToggles);

  const setLayerToggle = useMapStore((state) => state.setLayerToggle);

  /* -------------------------------------------------------
     FULLSCREEN STATE
     ------------------------------------------------------- */

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  /* -------------------------------------------------------
     FULLSCREEN
     ------------------------------------------------------- */

  const toggleFullscreen = async () => {
    const mapElement = map.getContainer();

    try {
      if (!document.fullscreenElement) {
        if (mapElement.requestFullscreen) {
          await mapElement.requestFullscreen();
        }

        return;
      }

      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error);
    }
  };

  /* -------------------------------------------------------
     FIND MY LOCATION
     ------------------------------------------------------- */

  const findMyLocation = () => {
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");

      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLocation = [coords.latitude, coords.longitude];

        setUserLocation(nextLocation);

        map.flyTo(nextLocation, 12, {
          duration: 1.5,
        });
      },

      (error) => {
        console.error("Geolocation failed:", error.message);
      },

      {
        enableHighAccuracy: true,

        timeout: 10000,
      },
    );
  };

  /* -------------------------------------------------------
     SEARCH
     ------------------------------------------------------- */

  const searchLocationOnMap = async (event) => {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    /*
     * First check whether the user entered:
     *
     * latitude, longitude
     */
    const coordinateParts = query.split(",").map((part) => Number(part.trim()));

    const isCoordinateSearch =
      coordinateParts.length === 2 && coordinateParts.every(Number.isFinite);

    if (isCoordinateSearch) {
      const [latitude, longitude] = coordinateParts;

      if (
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        setSearchError("Coordinates are outside the valid range.");

        return;
      }

      const nextLocation = [latitude, longitude];

      setSearchLocation(nextLocation);

      setSearchError("");

      map.flyTo(nextLocation, 11, {
        duration: 1.5,
      });

      return;
    }

    /*
     * Otherwise use Nominatim.
     */
    try {
      setSearchError("");

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
          query,
        )}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const results = await response.json();

      if (!results.length) {
        setSearchError("Location not found.");

        return;
      }

      const nextLocation = [Number(results[0].lat), Number(results[0].lon)];

      setSearchLocation(nextLocation);

      map.flyTo(nextLocation, 11, {
        duration: 1.5,
      });
    } catch (error) {
      console.error("Location search failed:", error);

      setSearchError("Search is unavailable right now.");
    }
  };

  /* -------------------------------------------------------
     RESET MAP
     ------------------------------------------------------- */

  const resetToDatasetRegion = () => {
    setUserLocation(null);

    setSearchLocation(null);

    setSearchQuery("");

    setSearchError("");

    map.fitBounds(resetBounds ?? DEMO_REGION_BOUNDS, {
      padding: [55, 55],

      maxZoom: 10,

      animate: true,
    });
  };

  return (
    <>
      {/* =====================================================
          SEARCH + CONTROLS
          ===================================================== */}

      <div className="pointer-events-none absolute right-4 top-4 z-[700]">
        {/* -------------------------------------------------
            SEARCH
            ------------------------------------------------- */}

        <div className="pointer-events-auto mr-[58px]">
          <form
            onSubmit={searchLocationOnMap}
            className="relative flex h-11 w-[280px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.32)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-slate-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="5.5" />

              <path d="M16 16L21 21" />
            </svg>

            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);

                setSearchError("");
              }}
              placeholder="Search location or lat, lon"
              className="w-full border-0 bg-transparent text-[13px] font-medium text-white outline-none placeholder:text-slate-400"
            />

            {searchError && (
              <span className="absolute right-0 top-12 whitespace-nowrap rounded-lg border border-red-400/30 bg-slate-950 px-3 py-2 text-[11px] text-red-300 shadow-lg">
                {searchError}
              </span>
            )}
          </form>
        </div>

        {/* =================================================
            RIGHT-SIDE MAP CONTROLS
            ================================================= */}

        <div className="pointer-events-auto absolute right-0 top-0 flex flex-col gap-2">
          {/* -------------------------------------------------
              LAYERS
              ------------------------------------------------- */}

          <div className="relative">
            <ToolButton
              label="Map layers"
              active={layersOpen}
              onClick={() => setLayersOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6.5 12 3l9 3.5-9 3.5L3 6.5Z" />

                <path d="M3 11.5 12 15l9-3.5" />

                <path d="M3 16.5 12 20l9-3.5" />
              </svg>
            </ToolButton>

            {layersOpen && (
              <div className="absolute right-12 top-0 z-[800] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                {/* -------------------------------------------------
                    LAYER PANEL HEADER
                    ------------------------------------------------- */}

                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Map Layers
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    Intelligence overlays
                  </div>
                </div>

                {/* -------------------------------------------------
                    INTELLIGENCE OVERLAYS
                    ------------------------------------------------- */}

                <div className="p-2">
                  <LayerToggle
                    label="Slick detections"
                    description="Detected surface anomalies"
                    enabled={layerToggles.slicks}
                    onChange={(value) => setLayerToggle("slicks", value)}
                    icon="slick"
                  />

                  <LayerToggle
                    label="AIS tracks"
                    description="Vessel movement history"
                    enabled={layerToggles.ais}
                    onChange={(value) => setLayerToggle("ais", value)}
                    icon="ais"
                  />

                  <LayerToggle
                    label="Drift analysis"
                    description="Hindcast and forecast"
                    enabled={layerToggles.driftCone}
                    onChange={(value) => setLayerToggle("driftCone", value)}
                    icon="drift"
                  />
                </div>

                {/* -------------------------------------------------
                    BASEMAP
                    ------------------------------------------------- */}
                <div className="border-t border-slate-100 px-4 py-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Basemap
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveBase("light")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        activeBase === "light"
                          ? "border-teal-500 bg-teal-50 text-teal-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Standard
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveBase("satellite")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        activeBase === "satellite"
                          ? "border-teal-500 bg-teal-50 text-teal-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Satellite
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* -------------------------------------------------
              FULLSCREEN
              ------------------------------------------------- */}

          <ToolButton
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleFullscreen}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {isFullscreen ? (
                <>
                  <path d="M9 4H4v5" />
                  <path d="M15 4h5v5" />
                  <path d="M4 15v5h5" />
                  <path d="M20 15v5h-5" />
                </>
              ) : (
                <>
                  <path d="M8 3H3v5" />
                  <path d="M16 3h5v5" />
                  <path d="M3 16v5h5" />
                  <path d="M21 16v5h-5" />
                </>
              )}
            </svg>
          </ToolButton>

          {/* -------------------------------------------------
              LOCATION
              ------------------------------------------------- */}

          <ToolButton label="Find my location" onClick={findMyLocation}>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3.5" />

              <path d="M12 2.5v3" />

              <path d="M12 18.5v3" />

              <path d="M2.5 12h3" />

              <path d="M18.5 12h3" />

              <circle cx="12" cy="12" r="8" />
            </svg>
          </ToolButton>

          {/* -------------------------------------------------
              RESET
              ------------------------------------------------- */}

          <ToolButton
            label="Reset to dataset region"
            onClick={resetToDatasetRegion}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h9.5a5 5 0 1 1-1 10H8" />

              <path d="M7 4 4 7l3 3" />
            </svg>
          </ToolButton>
        </div>
      </div>

      {/* =====================================================
          DATASET STATUS
          ===================================================== */}

      <div className="absolute bottom-[52px] left-4 z-[700]">
        <div className="rounded-xl border border-slate-600/80 bg-slate-950 px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.36)]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />

              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>

            <span className="text-[11px] font-semibold tracking-wide text-white">
              Monitoring region
            </span>
          </div>

          <div className="mt-1.5 pl-5 text-[10px] leading-4 text-slate-400">
            {resetBounds
              ? "Dataset-driven · detection coordinates"
              : "Waiting for detection coordinates"}
          </div>
        </div>
      </div>

      {/* =====================================================
          USER LOCATION MARKER
          ===================================================== */}

      {userLocation && (
        <Marker position={userLocation} icon={locationIcon}>
          <Popup>
            <div className="flex items-center gap-3">
              <span>Your current location</span>

              <button
                type="button"
                onClick={() => setUserLocation(null)}
                className="font-semibold text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
          </Popup>
        </Marker>
      )}

      {/* =====================================================
          SEARCH RESULT MARKER
          ===================================================== */}

      {searchLocation && (
        <Marker position={searchLocation} icon={locationIcon}>
          <Popup>
            <div className="flex items-center gap-3">
              <span>Search result: {searchQuery}</span>

              <button
                type="button"
                onClick={() => setSearchLocation(null)}
                className="font-semibold text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}

/* =========================================================
   MAP LEGEND
   ========================================================= */

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-[52px] right-4 z-[700] hidden rounded-xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:block">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Map legend
      </p>

      <div className="space-y-1.5">
        {/* Slick */}
        <div className="flex items-center gap-2 text-[10px] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
          Slick detection
        </div>

        {/* AIS */}
        <div className="flex items-center gap-2 text-[10px] font-medium text-slate-600">
          <span className="h-0.5 w-4 rounded-full bg-blue-500" />
          AIS track
        </div>

        {/* Drift */}
        <div className="mt-2 border-t border-slate-200 pt-2">
          <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Drift forecast
          </p>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              +12H
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              +24H
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              +36H / +48H
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-2 text-[9px] text-slate-400">
          Click a drift point to inspect its uncertainty.
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   MAIN MAP SHELL
   ========================================================= */

export function MapShell() {
  const allSlicks = useMapStore((state) => state.slicks);

  const filteredSlicks = useMapStore(
    useShallow((state) => state.getFilteredSlicks()),
  );

  const datasetBounds = useMemo(() => getDatasetBounds(allSlicks), [allSlicks]);

  const layerToggles = useMapStore((state) => state.layerToggles);

  const [activeBase, setActiveBase] = useState("light");

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <MapContainer
        center={DEMO_CENTER}
        zoom={9}
        maxZoom={15}
        minZoom={6}
        scrollWheelZoom
        zoomControl
        doubleClickZoom
        dragging
        touchZoom
        keyboard
        className="h-full w-full"
      >
        {/* =================================================
            DATASET VIEW
            ================================================= */}

        <DatasetViewport bounds={datasetBounds} />

        {/* =================================================
            CURSOR / ZOOM
            ================================================= */}

        <CursorPositionTracker />

        {/* =================================================
            BASEMAP
            ================================================= */}

        <TileLayer
          attribution={BASE_LAYERS[activeBase].attribution}
          url={BASE_LAYERS[activeBase].url}
          opacity={1}
          maxNativeZoom={19}
          maxZoom={19}
        />

        {/* =================================================
            COUNTRY BOUNDARIES
            ================================================= */}

        <CountryBoundaries />

        {/* =================================================
            SLICKS
            ================================================= */}

        {layerToggles.slicks && <SlickLayer slicks={filteredSlicks} />}

        {/* =================================================
            AIS
            ================================================= */}

        {layerToggles.ais && <AISLayer />}

        {/* =================================================
            DRIFT
            ================================================= */}

        {layerToggles.driftCone && <DriftLayer />}

        {/* =================================================
            TOOLBAR
            ================================================= */}

        <MapToolbar
          activeBase={activeBase}
          setActiveBase={setActiveBase}
          resetBounds={datasetBounds}
        />
      </MapContainer>

      {/* ===================================================
          LEGEND
          =================================================== */}

      <MapLegend />
    </div>
  );
}

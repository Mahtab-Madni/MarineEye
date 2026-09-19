const parseCsv = (text) => {
  const rows = [];

  let row = [];

  let value = "";

  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';

      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);

      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];

      value = "";
    } else {
      value += character;
    }
  }

  if (value.length || row.length) {
    row.push(value);

    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => String(header).trim());

  return rows
    .slice(1)
    .map((dataRow) =>
      Object.fromEntries(
        headers.map((header, index) => [header, dataRow[index]?.trim() ?? ""]),
      ),
    );
};

const asNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const asBoolean = (value) =>
  ["true", "1", "yes", "y", "on"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );

const polygonFromWkt = (value) => {
  const text = String(value ?? "").trim();

  if (!text) {
    return {
      type: "Polygon",
      coordinates: [[]],
    };
  }

  try {
    const body = text.replace(/^POLYGON\s*\(\(/i, "").replace(/\)\)\s*$/i, "");

    const ring = body
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).map(Number));

    const valid =
      ring.length >= 3 &&
      ring.every((pair) => pair.length >= 2 && pair.every(Number.isFinite));

    return valid
      ? {
          type: "Polygon",
          coordinates: [ring],
        }
      : {
          type: "Polygon",
          coordinates: [[]],
        };
  } catch {
    return {
      type: "Polygon",
      coordinates: [[]],
    };
  }
};

const buildDriftCone = (centerLat, centerLng) => ({
  observation: {
    t_offset_hours: 0,
    phase: "observation",
    center: [centerLng, centerLat],
    radius_km: 1.2,
  },

  hindcast: Array.from(
    {
      length: 5,
    },
    (_, index) => ({
      t_offset_hours: -48 + index * 12,

      center: [
        centerLng - 0.014 * (4 - index),

        centerLat - 0.006 * (4 - index),
      ],

      radius_km: Number((1.5 + index * 0.9).toFixed(2)),
    }),
  ),

  forecast: Array.from(
    {
      length: 4,
    },
    (_, index) => ({
      t_offset_hours: 12 + index * 12,

      center: [
        centerLng + 0.014 * (index + 1),

        centerLat + 0.006 * (index + 1),
      ],

      radius_km: Number((2 + index * 1.2).toFixed(2)),
    }),
  ),
});

const fetchText = async (path) => {
  const response = await fetch(path, {
    headers: {
      Accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(
      `MarineEye mock data returned ${response.status} for ${path}`,
    );
  }

  return response.text();
};

export const getMarineEyeData = async () => {
  const [slickText, sourceText, aisText] = await Promise.all([
    fetchText("/mock_slick_detections.csv"),

    fetchText("/mock_sources.csv"),

    fetchText("/mock_ais_tracks.csv"),
  ]);

  const slickRows = parseCsv(slickText);

  const sourceRows = parseCsv(sourceText);

  const aisRows = parseCsv(aisText);

  const sourcesBySlick = sourceRows.reduce((groups, row) => {
    const cpa = asNumber(row.cpa);

    const tcpa = asNumber(row.tcpa);

    const driftOverlap = asNumber(row.drift_overlap);

    const source = {
      id: row.source_id || row.vessel_id || row.infra_id || "unknown-source",

      type: row.type || "vessel",

      sub_scores: {
        proximity: row.proximity ? asNumber(row.proximity) : cpa,

        trajectory_match: row.trajectory_match
          ? asNumber(row.trajectory_match)
          : (tcpa + driftOverlap) / 2,

        cpa,

        tcpa,

        drift_overlap: driftOverlap,

        ais_gap_anomaly: asNumber(row.ais_gap_anomaly),

        behavioral_anomaly: asNumber(row.behavioral_anomaly),
      },

      fused_score: asNumber(row.fused_score),

      dominant_factor: row.dominant_factor || "",

      navic_tracked: asBoolean(row.navic_tracked),
    };

    (groups[row.slick_id] ??= []).push(source);

    return groups;
  }, {});

  const slicks = slickRows
    .map((row) => ({
      id: row.id,

      polygon: polygonFromWkt(row.polygon_wkt),

      class: row.class || "ambiguous",

      detection_confidence: asNumber(row.detection_confidence),

      slick_confidence: asNumber(row.slick_confidence),

      area: asNumber(row.area_km2),

      age_estimate: asNumber(row.age_estimate_hours),

      timestamp: row.timestamp || "",

      hitl_reviewed: asBoolean(row.hitl_reviewed),

      drift: buildDriftCone(
        asNumber(row.centroid_lat),

        asNumber(row.centroid_lon),
      ),

      sources: (sourcesBySlick[row.id] ?? []).slice(0, 3),
    }))
    .filter((slick) => slick.id);

  const tracksByVessel = aisRows.reduce((groups, row) => {
    const vesselId = row.vessel_id || row.source_id;

    if (!vesselId) {
      return groups;
    }

    const track = (groups[vesselId] ??= {
      vessel_id: vesselId,

      related_source_id: vesselId,

      positions: [],

      timestamps: [],

      speed: 0,

      heading: 0,

      linked_slick_ids: [],
    });

    const longitude = asNumber(row.lon, NaN);

    const latitude = asNumber(row.lat, NaN);

    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      track.positions.push([longitude, latitude]);

      track.timestamps.push(row.timestamp || "");
    }

    track.speed = asNumber(row.speed_knots, track.speed);

    track.heading = asNumber(row.heading_deg, track.heading);

    if (
      row.linked_slick_id &&
      !track.linked_slick_ids.includes(row.linked_slick_id)
    ) {
      track.linked_slick_ids.push(row.linked_slick_id);
    }

    return groups;
  }, {});

  return {
    slicks,
    aisTracks: Object.values(tracksByVessel),
  };
};

export default {
  getMarineEyeData,
};

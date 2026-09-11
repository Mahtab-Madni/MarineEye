from __future__ import annotations

import csv
import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# MarineEye Backend
# ============================================================
#
# Responsibilities:
#   1. Load the existing CSV fixtures.
#   2. Normalize them into the MarineEye data contract.
#   3. Store normalized records in SQLite.
#   4. Expose the data through FastAPI.
#
# The frontend can therefore use the API without changing
# the shape expected by the existing React components.
#
# NOTE:
# The current slick/drift data is still demo/mock data.
# Real ML inference, real AIS ingestion and real ocean
# modelling can be plugged into this API later.
# ============================================================


# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

SERVER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SERVER_DIR.parent

DATABASE_PATH = SERVER_DIR / "marineeye.db"

SLICK_CSV = PROJECT_DIR / "mock_slick_detections.csv"
SOURCE_CSV = PROJECT_DIR / "mock_sources.csv"
AIS_CSV = PROJECT_DIR / "mock_ais_tracks.csv"


# ------------------------------------------------------------
# FastAPI application
# ------------------------------------------------------------

app = FastAPI(
    title="MarineEye API",
    description=(
        "Backend API for MarineEye oil-slick detection, "
        "source attribution and AIS visualization."
    ),
    version="1.0.0",
)


# The frontend is served by Vite during development.
# Keeping CORS open here also makes direct API testing easier.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------
# Utility functions
# ------------------------------------------------------------


def clean_value(value: Any) -> Any:
    """Convert CSV values into clean Python values."""

    if value is None:
        return None

    if not isinstance(value, str):
        return value

    value = value.strip()

    if value == "":
        return None

    return value


def normalize_key(key: str) -> str:
    """Normalize a CSV column name for easier matching."""

    return (
        key.strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def normalized_row(row: dict[str, Any]) -> dict[str, Any]:
    """Create a normalized-key copy of a CSV row."""

    return {
        normalize_key(str(key)): clean_value(value)
        for key, value in row.items()
        if key is not None
    }


def first_value(
    row: dict[str, Any],
    *keys: str,
    default: Any = None,
) -> Any:
    """Return the first non-empty value matching the supplied keys."""

    normalized = {
        normalize_key(str(key)): value
        for key, value in row.items()
    }

    for key in keys:
        value = normalized.get(normalize_key(key))

        if value is not None and value != "":
            return value

    return default


def to_float(
    value: Any,
    default: float | None = None,
) -> float | None:
    """Safely convert a value to float."""

    if value is None or value == "":
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_bool(
    value: Any,
    default: bool = False,
) -> bool:
    """Safely convert common CSV boolean representations."""

    if isinstance(value, bool):
        return value

    if value is None:
        return default

    normalized = str(value).strip().lower()

    if normalized in {
        "true",
        "1",
        "yes",
        "y",
        "verified",
        "reviewed",
    }:
        return True

    if normalized in {
        "false",
        "0",
        "no",
        "n",
        "unverified",
        "pending",
    }:
        return False

    return default


def safe_json_loads(value: Any) -> Any:
    """Try to parse JSON without allowing malformed input to crash the API."""

    if value is None:
        return None

    if not isinstance(value, str):
        return value

    value = value.strip()

    if not value:
        return None

    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def read_csv(path: Path) -> list[dict[str, Any]]:
    """Read a CSV file into dictionaries."""

    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {path}")

    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        return [
            normalized_row(row)
            for row in csv.DictReader(file)
        ]


# ------------------------------------------------------------
# Geometry handling
# ------------------------------------------------------------


def parse_coordinate_pair(value: str) -> list[float] | None:
    """Parse a single x y coordinate pair."""

    if not value:
        return None

    parts = value.strip().split()

    if len(parts) < 2:
        return None

    longitude = to_float(parts[0])
    latitude = to_float(parts[1])

    if longitude is None or latitude is None:
        return None

    return [longitude, latitude]


def polygon_from_wkt(wkt: str) -> dict[str, Any] | None:
    """
    Convert simple WKT POLYGON geometry into GeoJSON.

    Example:

    POLYGON((75.1 9.2,75.2 9.2,75.2 9.3,75.1 9.3,75.1 9.2))
    """

    if not wkt:
        return None

    text = str(wkt).strip()

    if not text.upper().startswith("POLYGON"):
        return None

    try:
        start = text.index("((") + 2
        end = text.rindex("))")

        coordinate_text = text[start:end]

        coordinates = []

        for point in coordinate_text.split(","):
            parsed = parse_coordinate_pair(point)

            if parsed:
                coordinates.append(parsed)

        if len(coordinates) < 3:
            return None

        return {
            "type": "Polygon",
            "coordinates": [coordinates],
        }

    except (ValueError, IndexError):
        return None


def polygon_from_value(value: Any) -> dict[str, Any] | None:
    """Accept either GeoJSON JSON or WKT polygon text."""

    if value is None:
        return None

    if isinstance(value, dict):
        if value.get("type") and value.get("coordinates"):
            return value

    parsed_json = safe_json_loads(value)

    if isinstance(parsed_json, dict):
        if parsed_json.get("type") and parsed_json.get("coordinates"):
            return parsed_json

    return polygon_from_wkt(str(value))


def polygon_center(
    polygon: dict[str, Any],
) -> tuple[float, float]:
    """
    Calculate a simple polygon centroid.

    Returns:
        longitude, latitude
    """

    try:
        coordinates = polygon["coordinates"][0]

        points = [
            (float(point[0]), float(point[1]))
            for point in coordinates
            if len(point) >= 2
        ]

        if not points:
            return 0.0, 0.0

        longitude = sum(point[0] for point in points) / len(points)
        latitude = sum(point[1] for point in points) / len(points)

        return longitude, latitude

    except (KeyError, TypeError, ValueError, IndexError):
        return 0.0, 0.0


# ------------------------------------------------------------
# Demo drift generation
# ------------------------------------------------------------


def build_drift_cone(
    polygon: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """
    Generate deterministic demo hindcast/forecast positions.

    IMPORTANT:
    These values are visualization fixtures, NOT scientific
    ocean-current predictions.
    """

    longitude, latitude = polygon_center(polygon)

    hindcast = []

    for index in range(5):
        hours = -48 + index * 12

        drift_longitude = longitude - 0.012 * index
        drift_latitude = latitude + 0.004 * index

        radius_km = 1.5 + index * 0.9

        hindcast.append(
            {
                "t_offset_hours": hours,
                "radius_km": round(radius_km, 2),
                "center": [
                    round(drift_longitude, 6),
                    round(drift_latitude, 6),
                ],
            }
        )

    forecast = []

    for index in range(4):
        hours = (index + 1) * 12

        drift_longitude = longitude + 0.014 * index
        drift_latitude = latitude + 0.006 * index

        radius_km = 2.0 + index * 1.2

        forecast.append(
            {
                "t_offset_hours": hours,
                "radius_km": round(radius_km, 2),
                "center": [
                    round(drift_longitude, 6),
                    round(drift_latitude, 6),
                ],
            }
        )

    return {
        "hindcast": hindcast,
        "forecast": forecast,
    }


# ------------------------------------------------------------
# Source normalization
# ------------------------------------------------------------


def normalize_source(row: dict[str, Any]) -> dict[str, Any]:
    """Convert a source CSV row into the MarineEye source contract."""

    source_id = first_value(
        row,
        "id",
        "source_id",
        "vessel_id",
        "infra_id",
        "infrastructure_id",
        default="UNKNOWN",
    )

    source_type = first_value(
        row,
        "type",
        "source_type",
        "class",
        default="vessel",
    )

    source_type = str(source_type).strip().lower()

    if source_type in {
        "dark vessel",
        "dark-vessel",
        "darkvessel",
    }:
        source_type = "dark_vessel"

    if source_type not in {
        "vessel",
        "dark_vessel",
        "infrastructure",
    }:
        source_type = "vessel"

    source = {
        "id": str(source_id),
        "type": source_type,
        "score": to_float(
            first_value(
                row,
                "score",
                "fused_score",
                "attribution_score",
            ),
            0.0,
        ),
        "proximity": to_float(
            first_value(
                row,
                "proximity",
                "proximity_score",
            ),
            0.0,
        ),
        "trajectory_match": to_float(
            first_value(
                row,
                "trajectory_match",
                "trajectory_score",
                "trajectory_match_score",
            ),
            0.0,
        ),
        "cpa": to_float(
            first_value(
                row,
                "cpa",
                "cpa_score",
            ),
            0.0,
        ),
        "tcpa": to_float(
            first_value(
                row,
                "tcpa",
                "tcpa_score",
            ),
            0.0,
        ),
        "drift_overlap": to_float(
            first_value(
                row,
                "drift_overlap",
                "drift_overlap_score",
            ),
            0.0,
        ),
        "ais_gap": to_float(
            first_value(
                row,
                "ais_gap",
                "ais_gap_score",
            ),
            0.0,
        ),
        "behavior": to_float(
            first_value(
                row,
                "behavior",
                "behavior_score",
            ),
            0.0,
        ),
        "dominant_factor": first_value(
            row,
            "dominant_factor",
            "strongest_evidence",
            "factor",
            default="Proximity",
        ),
        "navic_state": first_value(
            row,
            "navic_state",
            "navic",
            "navigation_state",
            default="Available",
        ),
    }

    # Keep useful original values without breaking the normalized contract.
    source["raw"] = row

    return source


# ------------------------------------------------------------
# Slick normalization
# ------------------------------------------------------------


def normalize_slick(
    row: dict[str, Any],
    sources_by_slick: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Convert one slick CSV row into the MarineEye slick contract."""

    slick_id = first_value(
        row,
        "id",
        "slick_id",
        "detection_id",
        default="UNKNOWN",
    )

    polygon_value = first_value(
        row,
        "polygon",
        "polygon_wkt",
        "geometry",
        "wkt",
        "geom",
        "shape",
    )

    polygon = polygon_from_value(polygon_value)

    if polygon is None:
        # A malformed geometry should not crash the entire API.
        # The frontend simply receives an empty polygon.
        polygon = {
            "type": "Polygon",
            "coordinates": [[]],
        }

    slick_class = first_value(
        row,
        "class",
        "classification",
        "slick_class",
        default="ambiguous",
    )

    slick = {
        "id": str(slick_id),
        "polygon": polygon,
        "class": str(slick_class),
        "detection_confidence": to_float(
            first_value(
                row,
                "detection_confidence",
                "detection_score",
                "confidence",
            ),
            0.0,
        ),
        "slick_confidence": to_float(
            first_value(
                row,
                "slick_confidence",
                "slick_score",
                "shape_confidence",
            ),
            0.0,
        ),
        "area": to_float(
            first_value(
                row,
                "area",
                "area_km2",
                "area_km",
            ),
            0.0,
        ),
        "age_estimate": to_float(
    first_value(
        row,
        "age_estimate",
        "age_estimate_hours",
        "age_hours",
        "estimated_age",
    ),
    0.0,
),
        "timestamp": str(
            first_value(
                row,
                "timestamp",
                "detected_at",
                "acquisition_timestamp",
                "date",
                default="",
            )
        ),
        "hitl_reviewed": to_bool(
            first_value(
                row,
                "hitl_reviewed",
                "reviewed",
                "verified",
                "human_reviewed",
            ),
            False,
        ),
    }

    slick["sources"] = sorted(
        sources_by_slick.get(str(slick_id), []),
        key=lambda source: source.get("score") or 0.0,
        reverse=True,
    )[:3]

    slick["drift"] = build_drift_cone(polygon)

    return slick


# ------------------------------------------------------------
# AIS normalization
# ------------------------------------------------------------


def normalize_ais_tracks(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group raw AIS observations into vessel tracks."""

    grouped: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        vessel_id = first_value(
            row,
            "vessel_id",
            "mmsi",
            "id",
            "ship_id",
            default="UNKNOWN",
        )

        grouped.setdefault(str(vessel_id), []).append(row)

    tracks = []

    for vessel_id, vessel_rows in grouped.items():
        positions: list[list[float]] = []
        timestamps: list[str] = []

        speeds: list[float] = []
        headings: list[float] = []

        related_source_id = None

        for row in vessel_rows:
            longitude = to_float(
                first_value(
                    row,
                    "longitude",
                    "lon",
                    "lng",
                    "x",
                )
            )

            latitude = to_float(
                first_value(
                    row,
                    "latitude",
                    "lat",
                    "y",
                )
            )

            if longitude is not None and latitude is not None:
                positions.append(
                    [
                        longitude,
                        latitude,
                    ]
                )

            timestamp = first_value(
                row,
                "timestamp",
                "time",
                "datetime",
                "observed_at",
            )

            if timestamp is not None:
                timestamps.append(str(timestamp))

            speed = to_float(
                first_value(
                    row,
                    "speed",
                    "speed_kn",
                    "speed_knots",
                    "sog",
                )
            )

            if speed is not None:
                speeds.append(speed)

            heading = to_float(
                first_value(
                    row,
                    "heading",
                    "course",
                    "cog",
                    "direction",
                )
            )

            if heading is not None:
                headings.append(heading)

            source = first_value(
                row,
                "related_source_id",
                "source_id",
                "matched_source_id",
            )

            if source is not None:
                related_source_id = str(source)

        if not positions:
            continue

        tracks.append(
            {
                "vessel_id": vessel_id,
                "positions": positions,
                "timestamps": timestamps,
                "speed": round(
                    speeds[-1] if speeds else 0.0,
                    2,
                ),
                "heading": round(
                    headings[-1] if headings else 0.0,
                    2,
                ),
                "related_source_id": related_source_id,
            }
        )

    return tracks


# ------------------------------------------------------------
# SQLite setup
# ------------------------------------------------------------


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)

    connection.row_factory = sqlite3.Row

    return connection


def initialise_database() -> None:
    """
    Create the database and seed it from the project CSV fixtures.

    A schema version is stored so that future backend schema
    changes can safely recreate the demo database.
    """

    slick_rows = read_csv(SLICK_CSV)
    source_rows = read_csv(SOURCE_CSV)
    ais_rows = read_csv(AIS_CSV)

    sources_by_slick: dict[str, list[dict[str, Any]]] = {}

    for row in source_rows:
        slick_id = first_value(
            row,
            "slick_id",
            "detection_id",
            "slick",
        )

        if slick_id is None:
            continue

        source = normalize_source(row)

        sources_by_slick.setdefault(
            str(slick_id),
            [],
        ).append(source)

    slicks = [
        normalize_slick(
            row,
            sources_by_slick,
        )
        for row in slick_rows
    ]

    ais_tracks = normalize_ais_tracks(ais_rows)

    connection = get_connection()

    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        version_row = connection.execute(
            """
            SELECT value
            FROM app_meta
            WHERE key = 'schema_version'
            """
        ).fetchone()

        current_version = (
            version_row["value"]
            if version_row
            else None
        )

        # Re-seed databases created before WKT geometry normalization was fixed.
        database_version = "7"

        if current_version != database_version:
            connection.execute("DROP TABLE IF EXISTS slicks")
            connection.execute("DROP TABLE IF EXISTS sources")
            connection.execute("DROP TABLE IF EXISTS ais_tracks")

            connection.execute(
                """
                CREATE TABLE slicks (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                )
                """
            )

            connection.execute(
                """
                CREATE TABLE sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    slick_id TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    data TEXT NOT NULL
                )
                """
            )

            connection.execute(
                """
                CREATE TABLE ais_tracks (
                    vessel_id TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                )
                """
            )

            connection.execute(
                """
                INSERT OR REPLACE INTO app_meta
                (key, value)
                VALUES ('schema_version', ?)
                """,
                (database_version,),
            )

        # If the database is empty, seed it.
        slick_count = connection.execute(
            "SELECT COUNT(*) AS count FROM slicks"
        ).fetchone()["count"]

        if slick_count == 0:
            for slick in slicks:
                connection.execute(
                    """
                    INSERT INTO slicks (id, data)
                    VALUES (?, ?)
                    """,
                    (
                        slick["id"],
                        json.dumps(
                            slick,
                            ensure_ascii=False,
                        ),
                    ),
                )

                for source in slick["sources"]:
                    connection.execute(
                        """
                        INSERT INTO sources
                        (slick_id, source_id, data)
                        VALUES (?, ?, ?)
                        """,
                        (
                            slick["id"],
                            source["id"],
                            json.dumps(
                                source,
                                ensure_ascii=False,
                            ),
                        ),
                    )

        ais_count = connection.execute(
            "SELECT COUNT(*) AS count FROM ais_tracks"
        ).fetchone()["count"]

        if ais_count == 0:
            for track in ais_tracks:
                connection.execute(
                    """
                    INSERT INTO ais_tracks
                    (vessel_id, data)
                    VALUES (?, ?)
                    """,
                    (
                        track["vessel_id"],
                        json.dumps(
                            track,
                            ensure_ascii=False,
                        ),
                    ),
                )

        connection.commit()

    finally:
        connection.close()


# ------------------------------------------------------------
# Database reads
# ------------------------------------------------------------


def get_all_slicks() -> list[dict[str, Any]]:
    connection = get_connection()

    try:
        rows = connection.execute(
            """
            SELECT data
            FROM slicks
            ORDER BY id
            """
        ).fetchall()

        return [
            json.loads(row["data"])
            for row in rows
        ]

    finally:
        connection.close()


def get_all_ais_tracks() -> list[dict[str, Any]]:
    connection = get_connection()

    try:
        rows = connection.execute(
            """
            SELECT data
            FROM ais_tracks
            ORDER BY vessel_id
            """
        ).fetchall()

        return [
            json.loads(row["data"])
            for row in rows
        ]

    finally:
        connection.close()


def get_slick_by_id(
    slick_id: str,
) -> dict[str, Any] | None:
    connection = get_connection()

    try:
        row = connection.execute(
            """
            SELECT data
            FROM slicks
            WHERE id = ?
            """,
            (slick_id,),
        ).fetchone()

        if row is None:
            return None

        return json.loads(row["data"])

    finally:
        connection.close()


# ------------------------------------------------------------
# Startup
# ------------------------------------------------------------


@app.on_event("startup")
def startup_event() -> None:
    initialise_database()


# ------------------------------------------------------------
# API endpoints
# ------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Simple backend health check."""

    return {
        "status": "ok",
        "service": "MarineEye API",
        "database": str(DATABASE_PATH.name),
    }


@app.get("/api/data")
def get_data(
    slick_id: str | None = Query(
        default=None,
        description="Optional slick ID to inspect.",
    ),
) -> dict[str, Any]:
    """
    Return MarineEye data.

    Without slick_id:
        Returns all slicks and all AIS tracks.

    With slick_id:
        Returns the requested slick and related AIS tracks.
    """

    if slick_id:
        slick = get_slick_by_id(slick_id)

        if slick is None:
            raise HTTPException(
                status_code=404,
                detail=f"Slick '{slick_id}' was not found.",
            )

        related_source_ids = {
            str(source["id"])
            for source in slick.get("sources", [])
            if source.get("type") != "infrastructure"
        }

        ais_tracks = get_all_ais_tracks()

        related_tracks = [
            track
            for track in ais_tracks
            if (
                track.get("related_source_id") in related_source_ids
                or track.get("related_source_id") is None
            )
        ]

        return {
            "slicks": [slick],
            "aisTracks": related_tracks,
        }

    return {
        "slicks": get_all_slicks(),
        "aisTracks": get_all_ais_tracks(),
    }


@app.get("/api/slicks")
def get_slicks() -> dict[str, Any]:
    """Return all slick detections."""

    return {
        "slicks": get_all_slicks(),
    }


@app.get("/api/slicks/{slick_id}")
def get_slick(slick_id: str) -> dict[str, Any]:
    """Return a single slick."""

    slick = get_slick_by_id(slick_id)

    if slick is None:
        raise HTTPException(
            status_code=404,
            detail=f"Slick '{slick_id}' was not found.",
        )

    return slick


@app.get("/api/ais-tracks")
def get_ais_tracks() -> dict[str, Any]:
    """Return all grouped AIS tracks."""

    return {
        "aisTracks": get_all_ais_tracks(),
    }


@app.get("/api/stats")
def get_stats() -> dict[str, Any]:
    """Return dashboard-level statistics."""

    slicks = get_all_slicks()

    dark_vessel_count = 0

    for slick in slicks:
        for source in slick.get("sources", []):
            if source.get("type") == "dark_vessel":
                dark_vessel_count += 1
                break

    peak_confidence = 0.0

    if slicks:
        peak_confidence = max(
            float(
                slick.get(
                    "detection_confidence",
                    0.0,
                )
                or 0.0
            )
            for slick in slicks
        )

    return {
        "slick_count": len(slicks),
        "dark_vessel_cases": dark_vessel_count,
        "peak_detection_confidence": peak_confidence,
        "database": DATABASE_PATH.name,
    }


@app.get("/")
def root() -> dict[str, str]:
    """Root endpoint."""

    return {
        "service": "MarineEye API",
        "docs": "/docs",
        "health": "/api/health",
    }
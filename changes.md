# MARIS-X Website Updates

## Product Name

- Renamed the website from MarineEye to **MARIS-X**.

## Changes Made

- Corrected the backend mapping for AIS gap and behavioral anomaly values, so those evidence bars no longer incorrectly show zero.
- Added a map legend for slick detections, AIS tracks, and drift forecasts.
- Added loading feedback while marine data is being retrieved.
- Added an error message and retry option when the backend and local data are unavailable.
- Added selected-vessel details for speed, heading, observation count, and latest AIS observation time.
- Corrected AIS heading display so the vessel heading is read from the dataset instead of defaulting to 0 degrees.
- Added an explanation that attribution bars show evidence strength, not probability or proof of responsibility.
- Added a Reset button that clears the investigation filters and restores their default values.
- Added source search by vessel ID or evidence factor.
- Added the latest data update time to the application header.
- Added the real link between AIS tracks and slick detections, so an investigation shows the vessels associated with that slick.
- Corrected drift timeline geometry so hindcast positions move toward the 0H observation and forecast positions continue forward from it.
- Added an explicit observation center and corrected the stale SQLite seed data by bumping the database schema version.
- Added frontend fallback handling for older API responses that do not include an explicit observation point.
- Kept the drift movement clearly marked as deterministic demo data; it is not a scientific ocean-current prediction.


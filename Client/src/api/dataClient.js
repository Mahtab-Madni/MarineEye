const API_BASE_URL =
  "https://marineeye.onrender.com/api";
  // "http://localhost:8000/api";
  

const fetchJson = async (
  endpoint,
  options = {},
) => {
  const response =
    await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        ...options,

        headers: {
          Accept:
            "application/json",

          ...(options.headers ??
            {}),
        },
      },
    );

  if (!response.ok) {
    let detail = "";

    try {
      const body =
        await response.json();

      if (body?.detail) {
        detail = `: ${body.detail}`;
      }
    } catch {
      // Server did not return JSON.
    }

    throw new Error(
      `MarineEye API returned ${response.status}${detail}`,
    );
  }

  return response.json();
};

export const getMarineEyeData =
  () =>
    fetchJson("/data");

export const getSlick = (
  slickId,
) => {
  if (!slickId) {
    throw new Error(
      "A slick ID is required.",
    );
  }

  return fetchJson(
    `/data?slick_id=${encodeURIComponent(
      slickId,
    )}`,
  );
};

export const getHealth =
  () =>
    fetchJson("/health");

export const getStats =
  () =>
    fetchJson("/stats");

export const getSlicks =
  () =>
    fetchJson("/slicks");

export const getAISTracks =
  () =>
    fetchJson(
      "/ais-tracks",
    );
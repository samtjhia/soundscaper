const BASE = "https://freesound.org/apiv2";

type SearchResponse = unknown;

export async function searchOnce(query: string): Promise<SearchResponse> {
  const token = import.meta.env.VITE_FREESOUND_TOKEN;
  if (!token) {
    throw new Error("Missing VITE_FREESOUND_TOKEN in .env");
  }
  const filter =
    'tag:rain -tag:"rain stick" -tag:rainstick -tag:instrument -tag:music duration:[30 TO 240]';

  const params = new URLSearchParams({
    query,
    filter,
    sort: "rating_desc",
    page_size: "10",
    fields:
      "id,name,license,username,previews,tags,duration,avg_rating,num_ratings,download,analysis_stats",
  });

  const res = await fetch(`${BASE}/search/text/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Freesound HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

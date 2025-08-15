import {
  SEARCH_FIELDS,
  SEARCH_FILTER,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT,
  SEARCH_DEFAULT_QUERY,
  SEARCH_FIELDS_PARAM
} from "../config";

const BASE = "https://freesound.org/apiv2";

type SearchResponse = unknown;

export async function searchOnce(query: string = SEARCH_DEFAULT_QUERY): Promise<SearchResponse> {
  const token = import.meta.env.VITE_FREESOUND_TOKEN;
  if (!token) {
    throw new Error("Missing VITE_FREESOUND_TOKEN in .env");
  }
  
  const params = new URLSearchParams({
    query,
    filter: SEARCH_FILTER,
    sort: SEARCH_SORT,
    page_size: String(SEARCH_PAGE_SIZE),
    fields: SEARCH_FIELDS_PARAM,
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

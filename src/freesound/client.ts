import {
  SEARCH_FILTER,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT,
  SEARCH_DEFAULT_QUERY,
  SEARCH_FIELDS_PARAM
} from "../config";

import type { FSItem } from "../types";

const BASE = "https://freesound.org/apiv2";

export type SearchResponse = {
  count: number;
  results: FSItem[]; // reuse your shared item type
};

export async function searchOnce(query?: string): Promise<SearchResponse> {
  const q = query ?? SEARCH_DEFAULT_QUERY;

  const url = new URL(`${BASE}/search/text/`);
  url.searchParams.set("query", q);
  url.searchParams.set("filter", SEARCH_FILTER);
  url.searchParams.set("fields", SEARCH_FIELDS_PARAM);
  url.searchParams.set("page_size", String(SEARCH_PAGE_SIZE));
  url.searchParams.set("sort", SEARCH_SORT);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${import.meta.env.VITE_FREESOUND_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Freesound search failed: ${res.status}`);
  }
  const json = (await res.json()) as SearchResponse;
  return json;
}
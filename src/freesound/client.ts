import {
  SEARCH_PAGE_SIZE,
  SEARCH_SORT,
  SEARCH_FIELDS_PARAM,
  FILTER_DURATION,
  FILTER_LICENSE,
  FILTER_EXCLUDES,
  QUERY_PREFERENCE,
} from "../config";

import type { FSItem } from "../types";

const BASE = "https://freesound.org/apiv2";

export type SearchResponse = {
  count: number;
  results: FSItem[];
};

function escapeTag(t: string) {
  return /\s/.test(t) ? `"${t}"` : t;
}

export function buildFilterForTag(tag: string): string {
  return [
    `tag:${escapeTag(tag)}`,
    FILTER_DURATION,
    FILTER_LICENSE,
    FILTER_EXCLUDES,
  ].join(" ");
}

function tagToQueryHint(/* tag: string */): string {
  return QUERY_PREFERENCE;
}

export async function searchOnce(tag: string): Promise<SearchResponse> {
  const url = new URL(`${BASE}/search/text/`);
  url.searchParams.set("query", tagToQueryHint());
  url.searchParams.set("filter", buildFilterForTag(tag));
  url.searchParams.set("fields", SEARCH_FIELDS_PARAM);
  url.searchParams.set("page_size", String(SEARCH_PAGE_SIZE));
  url.searchParams.set("sort", SEARCH_SORT);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${import.meta.env.VITE_FREESOUND_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Freesound search failed: ${res.status}`);
  return (await res.json()) as SearchResponse;
}

export async function getById(id: number): Promise<FSItem> {
  const url = new URL(`${BASE}/sounds/${id}/`);
  url.searchParams.set("fields", SEARCH_FIELDS_PARAM);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${import.meta.env.VITE_FREESOUND_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Freesound getById(${id}) failed: ${res.status}`);
  }

  const json = await res.json();
  const item: FSItem = {
    id: json.id,
    name: json.name,
    duration: json.duration,
    license: json.license,
    username: json.username,
    tags: json.tags,
    previews: json.previews,
  };
  return item;
}




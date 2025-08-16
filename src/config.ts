export const SEARCH_DEFAULT_QUERY = "rural alley dusk light rain";

export const SEARCH_PAGE_SIZE = 10;
export const SEARCH_SORT = "rating_desc";
export const AUTO_RUN_ON_LOAD = false;

//used for every tag
export const FILTER_DURATION = 'duration:[30 TO 240]';
export const FILTER_LICENSE = 'license:"Creative Commons 0" OR license:"Attribution"';
export const FILTER_EXCLUDES = '-tag:music -tag:musical -tag:remix -tag:melody -tag:instrument';

export const QUERY_PREFERENCE = "loop";

export const SEARCH_FIELDS = [
  "id",
  "name",
  "tags",
  "license",
  "username",
  "duration",
  "rating",
  "num_downloads",
  "previews",
] as const;

export const SEARCH_FIELDS_PARAM = (SEARCH_FIELDS as readonly string[]).join(",");

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const FETCH_VERSION = "v4";
export const SEARCH_DEFAULT_QUERY = "rain";
export const SEARCH_PAGE_SIZE = 10;
export const SEARCH_SORT = "rating_desc"; // later imma make this "downloads_desc" | "score"? more accurate? idk
export const AUTO_RUN_ON_LOAD = false;

// filters
// prefer ambient rain, avoid instruments/music, prefer 30–240s loops
export const SEARCH_FILTER =
  'tag:rain -tag:"rain stick" -tag:rainstick -tag:instrument -tag:music duration:[30 TO 240]';

// fields we want back
export const SEARCH_FIELDS = [
  "id",
  "name",
  "tags",
  "license",
  "username",
  "duration",
  "rating",
  "num_downloads",
  "previews", // this for the lq/hq urls
] as const;

export const SEARCH_FIELDS_PARAM = (SEARCH_FIELDS as readonly string[]).join(",");

// cache TTL is 7 days
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;



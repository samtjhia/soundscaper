const tagGainPriors: Record<string, number> = {
  roomtone: 0.40,
  light_rain: 0.45,
  rain: 0.50,
  wind: 0.45,
  vinyl_crackle: 0.30,
  chatter: 0.35,
  footsteps: 0.35,
  motorcycle: 0.32,
  birds: 0.40,
  insects: 0.38,
  buzz: 0.28,
  waves: 0.42,
  seagulls: 0.38,
  subway: 0.36,
  bell: 0.30,
};

export function gainForTag(tag: string): number {
  return tagGainPriors[tag] ?? 0.40;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(s: string): string[] { return norm(s).split(" ").filter(Boolean); }
function hasAny(hay: string, needles: string[]) { return needles.some(n => hay.includes(n)); }
function tokensHasAny(tokens: string[], needles: string[]) {
  const set = new Set(tokens);
  return needles.some(n => set.has(n));
}

const RAIN_LIGHT = ["light rain", "drizzle", "drizzly", "mist", "sprinkle", "misting"];
const RAIN_HEAVY = ["heavy rain", "downpour", "storm", "rainstorm", "monsoon", "pouring", "thunderstorm", "rain"];
const WIND_WORDS = ["wind", "breeze", "breezy", "gust", "gusty", "blustery"];
const CITY_WORDS = ["city", "urban", "downtown", "street", "avenue", "alley", "plaza", "market", "cafe", "restaurant", "subway", "metro"];
const FOOTSTEP_WORDS = ["footsteps", "walking", "footstep", "steps", "alley", "cobble", "cobblestone", "stone", "pavement", "sidewalk", "street"];
const VEHICLE_2W = ["motorcycle", "scooter", "moped"];
const BIRD_WORDS = ["birds", "sparrow", "seagull", "gull", "songbird", "tweeting", "chirp", "chirping"];
const INSECT_WORDS = ["insects", "cricket", "crickets", "cicada", "cicadas", "katydid", "bugs"];
const NEON_WORDS = ["neon", "buzz", "hum", "humming", "electric", "fluorescent"];
const VINYL_WORDS = ["vinyl", "record", "turntable", "lofi", "lo-fi"];
const RURAL_WORDS = ["rural", "field", "farm", "forest", "woods", "park", "meadow", "countryside"];
const NIGHT_WORDS = ["night", "midnight", "evening", "dusk", "twilight"];

const SEA_WORDS = ["sea", "ocean", "beach", "shore", "coast", "seaside", "surf", "waves"];
const GULL_WORDS = ["seagull", "gull", "gulls"];
const SUBWAY_WORDS = ["subway", "metro", "underground", "tube", "u bahn", "u-bahn", "mrt", "station", "platform", "train"];
const TEMPLE_WORDS = ["temple", "shrine", "pagoda", "torii", "monastery", "shinto", "buddhist"];
const BELL_WORDS = ["bell", "bells", "chime", "chimes", "gong", "windchime", "wind chime", "wind-chime", "windchimes"];

const QUIET_WORDS = ["quiet", "calm", "soft", "gentle", "peaceful", "serene", "subtle", "low"];
const BUSY_WORDS = ["busy", "crowded", "bustling", "noisy", "loud", "hectic", "packed", "traffic", "market"];

export function mapPromptToTags(prompt: string): { tags: string[]; gainScale: number } {
  const p = norm(prompt);
  const tokens = tokenize(prompt);

  const chosen: string[] = ["roomtone"];

  // rain
  const mentionsLight = hasAny(p, RAIN_LIGHT);
  const mentionsHeavy = hasAny(p, RAIN_HEAVY);
  if (mentionsLight && !mentionsHeavy) chosen.push("light_rain");
  if (mentionsHeavy) chosen.push("rain");

  // wind
  if (tokensHasAny(tokens, WIND_WORDS)) chosen.push("wind");

  // seaside
  if (tokensHasAny(tokens, SEA_WORDS)) {
    chosen.push("waves");
    if (tokensHasAny(tokens, GULL_WORDS)) chosen.push("seagulls");
    else chosen.push("birds"); // fallback if they didn’t say gulls
    if (!mentionsHeavy) chosen.push("wind");
  }

  // subway / metro
  if (tokensHasAny(tokens, SUBWAY_WORDS)) {
    chosen.push("subway");
    chosen.push("chatter");
    chosen.push("footsteps");
    chosen.push("buzz");
  }

  // city textures
  if (tokensHasAny(tokens, CITY_WORDS)) {
    chosen.push("chatter");
    if (tokensHasAny(tokens, NEON_WORDS) || tokensHasAny(tokens, NIGHT_WORDS)) {
      chosen.push("buzz");
    }
    if (tokensHasAny(tokens, VEHICLE_2W)) {
      chosen.push("motorcycle");
    }
  }

  // footsteps
  if (tokensHasAny(tokens, FOOTSTEP_WORDS)) chosen.push("footsteps");

  // rural / natural
  const isRuralish = tokensHasAny(tokens, RURAL_WORDS);
  const isNightish = tokensHasAny(tokens, NIGHT_WORDS);
  if (isRuralish || tokensHasAny(tokens, BIRD_WORDS)) chosen.push("birds");
  if (isRuralish || isNightish || tokensHasAny(tokens, INSECT_WORDS)) chosen.push("insects");

  // temple / bells
  if (tokensHasAny(tokens, TEMPLE_WORDS) || tokensHasAny(tokens, BELL_WORDS)) {
    chosen.push("bell");
    if (tokensHasAny(tokens, WIND_WORDS)) chosen.push("wind");
    if (isNightish) chosen.push("insects"); else chosen.push("birds");
  }

  // vinyl
  if (tokensHasAny(tokens, VINYL_WORDS)) chosen.push("vinyl_crackle");

  // 2-wheelers explicitly
  if (tokensHasAny(tokens, VEHICLE_2W)) chosen.push("motorcycle");

  const order = [
    "roomtone",
    "rain",
    "light_rain",
    "wind",
    "waves",
    "seagulls",
    "subway",
    "chatter",
    "footsteps",
    "birds",
    "insects",
    "motorcycle",
    "buzz",
    "bell",
    "vinyl_crackle",
  ] as const;

  const seen = new Set<string>();
  const sorted = order.filter((t) => {
    if (!chosen.includes(t)) return false;
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  const tags = sorted.slice(0, 5);

  let gainScale = 1.0;
  if (tokensHasAny(tokens, QUIET_WORDS)) gainScale = 0.7;
  if (tokensHasAny(tokens, BUSY_WORDS)) gainScale = 1.2;

  return { tags, gainScale };
}
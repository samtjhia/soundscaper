export type Tag = string;
export type WhitelistMap = Record<Tag, number[]>;

export const WL_CACHE_PREFIX = "wl:";

const WHITELIST: WhitelistMap = {
  // core ambience
  roomtone: [
    750643, 495865
  ],
  light_rain: [
    200271, 96729
  ],
  rain: [
    478665, 535869
  ],
  wind: [
    654566, 786265
  ],
  vinyl_crackle: [
    648313
  ],

  // people / textures
  chatter: [
    326967, 537761
  ],
  footsteps: [
    194979, 777608
  ],

  // transport
  motorcycle: [
    632219
  ],
  subway: [
    745638, 726609
  ],

  // nature
  birds: [
    624126
  ],
  insects: [
    268959
  ],
  waves: [
    426075
  ],
  seagulls: [
    56532
  ],

  // urban texture / sfx
  buzz: [
    537769
  ],
  bell: [
    625059
  ],
};

const cursor = new Map<Tag, number>();

export function allWhitelist(): WhitelistMap {
  return JSON.parse(JSON.stringify(WHITELIST));
}

export function getWhitelist(tag: Tag): number[] {
  return [...(WHITELIST[tag] ?? [])];
}

export function setWhitelist(tag: Tag, ids: number[]): void {
  WHITELIST[tag] = [...ids];
  cursor.set(tag, 0);
}

export function hasWhitelist(tag: Tag): boolean {
  return (WHITELIST[tag]?.length ?? 0) > 0;
}

export function pickWhitelist(tag: Tag): number | null {
  const list = WHITELIST[tag] ?? [];
  if (list.length === 0) return null;

  const i = cursor.get(tag) ?? 0;
  const id = list[i % list.length];
  cursor.set(tag, (i + 1) % list.length);
  return id;
}

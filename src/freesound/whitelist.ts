export type Tag = string;
export type WhitelistMap = Record<Tag, number[]>;

export const WL_CACHE_PREFIX = "wl:";

const WHITELIST: WhitelistMap = {
  // core ambience
  roomtone: [
    // TODO:
  ],
  light_rain: [
    // TODO
  ],
  rain: [
    // TODO
  ],
  wind: [
    // TODO
  ],
  vinyl_crackle: [
    // TODO
  ],

  // people / textures
  distant_chatter: [
    // TODO
  ],
  footsteps_stone: [
    // TODO
  ],

  // transport
  motorcycle: [
    // TODO
  ],
  subway: [
    // TODO
  ],

  // nature
  birds: [
    // TODO
  ],
  insects: [
    // TODO
  ],
  waves: [
    // TODO
  ],
  seagulls: [
    // TODO
  ],

  // urban texture / sfx
  neon_buzz: [
    // TODO
  ],
  bell: [
    // TODO
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

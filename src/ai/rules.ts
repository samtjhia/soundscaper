export const tagGainPriors: Record<string, number> = {
  roomtone: 0.40,
  light_rain: 0.45,
  rain: 0.50,
  wind: 0.45,
  vinyl_crackle: 0.30,
  distant_chatter: 0.35,
  footsteps_stone: 0.35,
  motorcycle: 0.32,
  birds: 0.40,
  insects: 0.38,
  neon_buzz: 0.28,
};

// for now hardcoded tags
export function pickInitialTags(): string[] {
  return ["roomtone", "light_rain", "distant_chatter", "footsteps_stone"];
}

export function gainForTag(tag: string): number {
  return tagGainPriors[tag] ?? 0.4;
}

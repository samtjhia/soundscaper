export function hashTags(tags: string[]): string {
  const s = JSON.stringify([...tags].sort());
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }

  return "v1:" + (h >>> 0).toString(16);
}

export function hashPromptTags(prompt: string, tags: string[]): string {
  const s = JSON.stringify({ prompt, tags: [...tags].sort() });
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i); // djb2 xor
  }
  return "v2:" + (h >>> 0).toString(16);
}

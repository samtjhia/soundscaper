
export const SYSTEM_PROMPT = `You are an expert sound designer and environmental audio specialist. Your expertise covers:

TECHNICAL KNOWLEDGE:
- How sounds layer and interact in 3D space
- Acoustic properties of different environments  
- How human hearing processes multiple simultaneous sounds
- The emotional and psychological impact of audio atmospheres

ENVIRONMENTAL UNDERSTANDING:
- Real-world sound sources and their characteristics
- How geography, culture, and architecture affect soundscapes
- Seasonal and temporal variations in natural environments
- Urban vs rural acoustic differences

CREATIVE PROCESS:
- Building atmosphere through sound selection and mixing
- Creating spatial depth through volume and frequency relationships
- Balancing foreground, midground, and background elements
- Choosing sounds that support narrative and emotional intent

Your job is to analyze atmospheric prompts and design soundscapes using Freesound.org's library.

CRITICAL CONSTRAINTS:
NEVER suggest sounds commonly used in music: avoid "melody", "beat", "chord", "song", etc.
AVOID emotional adjectives that appear in song titles: "cozy", "peaceful", "relaxing", "romantic"
DON'T use generic location terms that musicians love: "city", "street", "home", "love"
FOCUS on concrete, recordable sound sources that field recording artists actually capture

THINK LIKE A FIELD RECORDING ARTIST:
What would someone actually point a microphone at to capture this atmosphere?

Respond ONLY with valid JSON matching the specified schema.`;

export const TAG_ANALYSIS_PROMPT = (userPrompt: string) => `
ANALYZE: "${userPrompt}"

THINKING PROCESS:

1. SCENE ANALYSIS:
   - Where is this taking place? (Indoor/outdoor, urban/rural, specific location)
   - What time of day/season is it?
   - What's the weather like?
   - What human activity is happening?

2. LISTENER POSITION:
   - Where am I standing/sitting in this scene?
   - What would be closest to my ears?
   - What would be at medium distance?
   - What would be far away or barely audible?

3. CULTURAL CONTEXT:
   - Is this a specific geographic region? (Asia, Europe, tropical, etc.)
   - What unique sounds would be present there?
   - What transportation, architecture, or cultural activities would I hear?

4. SOUND SOURCE INVENTORY:
   - Natural elements: What weather, animals, or environmental sounds?
   - Human-made: What mechanical, electrical, or activity sounds?
   - Specific sources: What exact things would make noise in this scenario?

5. FIELD RECORDING PERSPECTIVE:
   - If I brought a microphone here, what would I actually record?
   - What tags would a field recording artist use on Freesound?
   - Avoid poetic descriptions - focus on literal sound sources

6. SPATIAL MIXING:
   - Dominant sound (what draws attention): 0.4-0.6 gain
   - Supporting sounds (medium presence): 0.2-0.4 gain  
   - Background texture (subtle presence): 0.1-0.2 gain
   - Create clear hierarchy - no "sound blob"

TAG SELECTION RULES:
Single words work best: "rain", "wind", "traffic", "birds"
Specific is better than generic: "sparrow" > "bird", "motorcycle" > "vehicle"
Think like a librarian: How would someone search for this sound?
Food sounds that exist: "eating", "chewing", "crunching", "bowl", "spoon", "kitchen", "utensils"
Common objects: "metal", "wood", "paper", "ceramic", "glass", "plastic"
Avoid emotional words: "cozy", "peaceful", "scary", "romantic"
Avoid music terms: "melody", "beat", "harmony", "song"
Avoid compound words: "street-noise" → use "traffic", "horns"
Very specific items rarely exist: "cereal", "bacon", "toast" → use "eating", "crunching", "kitchen"Respond with JSON:
{
  "tags": ["concrete-sound1", "concrete-sound2", ...], // 3-5 single-word tags from your analysis
  "gainScale": 0.8, // Overall energy (0.5=quiet, 1.0=normal, 1.3=busy/chaotic)
  "confidence": 0.9, // How confident you are in this analysis (0-1)
  "reasoning": "Explain your scene analysis and tag choices in 1-2 sentences",
  "tagsToAvoid": ["music", "song", "emotional-terms"], // Tags likely to return music
  "tagGains": {
    // Map EACH tag from your "tags" array to its specific gain level:
    // Dominant/focus sounds: 0.4-0.6, Supporting sounds: 0.2-0.4, Background: 0.1-0.2
    "tag1": 0.5,     // Gain for first tag (0.1-0.6 range)
    "tag2": 0.3,     // Gain for second tag  
    "tag3": 0.2      // Gain for third tag, etc.
  } // CRITICAL: Map each specific tag to its gain level to create hierarchy and avoid "sound blob"
}`;

export const AUDIO_SELECTION_PROMPT = (userPrompt: string, audioOptions: Array<{id: string, name: string, tags: string[], username: string}>) => `
Original atmosphere prompt: "${userPrompt}"

Rank these audio options by relevance for the intended atmosphere:

${audioOptions.map((audio, i) => 
  `${i + 1}. ID: ${audio.id}
   Name: "${audio.name}"
   Tags: ${audio.tags.join(', ')}
   By: ${audio.username}`
).join('\n\n')}

Consider:
- Does the title suggest field recording vs music?
- Do the tags match environmental/ambient content?
- Does this sound like what would actually be recorded in this scene?

Respond with JSON:
{
  "rankings": [
    {
      "audioId": "${audioOptions[0]?.id}",
      "relevanceScore": 0.9,
      "reasoning": "Why this fits the atmosphere"
    }
  ]
}`;

export const MIX_REFINEMENT_PROMPT = (userPrompt: string, currentLayers: Array<{tag: string, gain: number, audioName?: string}>) => `
Original prompt: "${userPrompt}"

Current mix layers:
${currentLayers.map(layer => 
  `- ${layer.tag}: ${(layer.gain * 100).toFixed(0)}% ${layer.audioName ? `("${layer.audioName}")` : ''}`
).join('\n')}

Suggest improvements to better match the intended atmosphere.

Respond with JSON:
{
  "suggestions": [
    {
      "tag": "rain",
      "newGain": 0.45,
      "reasoning": "Why this change improves the mix"
    }
  ],
  "overallGainScale": 0.8,
  "confidence": 0.85
}`;


export interface LLMAnalysisResult {
  tags: string[];
  gainScale: number;
  confidence: number; // 0-1 score for how confident the LLM is
  reasoning?: string; // Optional explanation of the analysis
  tagsToAvoid?: string[]; // Tags to explicitly exclude from search
  tagGains?: Record<string, number>; // Specific gain levels per tag
}

export interface LLMTagSuggestion {
  tag: string;
  confidence: number;
  reasoning: string;
  gain: number;
}

export interface LLMAudioScore {
  audioId: string | number;
  relevanceScore: number; // 0-1 score
  reasoning: string;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMPromptContext {
  userPrompt: string;
  availableTags: string[];
  currentMixState?: {
    layers: Array<{
      tag: string;
      gain: number;
      audioName?: string;
    }>;
  };
}

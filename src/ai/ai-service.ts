import { LLMService } from './llm-service';
import { mapPromptToTags, gainForTag } from './rules';
import { LLM_CONFIG, LLM_ENABLED } from '../config';
import type { LLMAnalysisResult } from './llm-types';

export interface AIAnalysisResult {
  tags: string[];
  gainScale: number;
  baseGainsMap: Record<string, number>;
  confidence: number;
  source: 'llm' | 'rules' | 'fallback';
  reasoning?: string;
  llmSuggestions?: LLMAnalysisResult;
}

class AIService {
  private llmService: LLMService | null = null;
  private availableTags = [
    'roomtone', 'rain', 'light_rain', 'wind', 'waves', 'seagulls', 
    'birds', 'insects', 'chatter', 'footsteps', 'subway', 'motorcycle', 
    'buzz', 'bell', 'vinyl_crackle'
  ];

  constructor() {
    if (LLM_ENABLED) {
      try {
        this.llmService = new LLMService(LLM_CONFIG);
        console.log('[AI] LLM service initialized');
      } catch (error) {
        console.warn('[AI] Failed to initialize LLM service:', error);
        this.llmService = null;
      }
    } else {
      console.log('[AI] LLM disabled, using rules-based fallback only');
    }
  }

  async analyzePrompt(prompt: string): Promise<AIAnalysisResult> {
    // Try LLM first if available with timeout
    if (this.llmService) {
      try {
        console.log('[AI] Attempting LLM analysis with 15s timeout...');
        
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('LLM analysis timeout (15s)')), 15000);
        });
        
        // Race between LLM analysis and timeout
        const llmResult = await Promise.race([
          this.llmService.analyzePromptForTags(prompt),
          timeoutPromise
        ]);
        
        // No validation against hardcoded tags - LLM is free to suggest any tags
        const validTags = llmResult.tags.filter(tag => tag && typeof tag === 'string');
        if (validTags.length === 0) {
          throw new Error('No valid tags returned from LLM');
        }

        // Create baseGainsMap - use LLM gains if provided, otherwise default to 0.4
        console.log('[AI] LLM tagGains received:', llmResult.tagGains);
        const baseGainsMap = Object.fromEntries(
          validTags.map(tag => [
            tag, 
            llmResult.tagGains?.[tag] ?? 0.4 // Default gain if LLM doesn't specify
          ])
        );
        console.log('[AI] Final baseGainsMap:', baseGainsMap);

        console.log('[AI] LLM analysis successful:', { 
          tags: validTags, 
          gainScale: llmResult.gainScale,
          confidence: llmResult.confidence,
          tagsToAvoid: llmResult.tagsToAvoid 
        });

        return {
          tags: validTags,
          gainScale: llmResult.gainScale,
          baseGainsMap,
          confidence: llmResult.confidence,
          source: 'llm',
          reasoning: llmResult.reasoning,
          llmSuggestions: llmResult
        };

      } catch (error) {
        const isTimeout = error instanceof Error && error.message.includes('timeout');
        console.warn(`[AI] LLM analysis ${isTimeout ? 'timed out' : 'failed'}, falling back to rules:`, error);
      }
    }

    // Fallback to hardcoded rules
    console.log('[AI] Using rules-based analysis as fallback');
    const rulesResult = mapPromptToTags(prompt);
    const baseGainsMap = Object.fromEntries(
      rulesResult.tags.map(tag => [tag, gainForTag(tag)])
    );

    return {
      tags: rulesResult.tags,
      gainScale: rulesResult.gainScale,
      baseGainsMap,
      confidence: 0.8, // Rules are pretty reliable for known patterns
      source: this.llmService ? 'fallback' : 'rules',
      reasoning: this.llmService 
        ? 'LLM failed or timed out, using hardcoded pattern matching'
        : 'Using hardcoded pattern matching rules'
    };
  }

  async scoreAudioOptions(
    userPrompt: string,
    audioOptions: Array<{
      id: string | number;
      name: string;
      tags: string[];
      username: string;
    }>
  ) {
    if (!this.llmService || audioOptions.length === 0) {
      // Return neutral scores
      return audioOptions.map(audio => ({
        audioId: String(audio.id),
        relevanceScore: 0.5,
        reasoning: 'No LLM scoring available'
      }));
    }

    try {
      return await this.llmService.scoreAudioOptions(userPrompt, audioOptions);
    } catch (error) {
      console.warn('[AI] Audio scoring failed:', error);
      return audioOptions.map(audio => ({
        audioId: String(audio.id),
        relevanceScore: 0.5,
        reasoning: 'LLM scoring failed'
      }));
    }
  }

  async generateFallbackTags(prompt: string, count: number): Promise<string[]> {
    if (!this.llmService) {
      // Fallback to common ambient tags if LLM not available
      const commonTags = ['ambience', 'atmosphere', 'room', 'background', 'noise', 'sound', 'environment'];
      return commonTags.slice(0, count);
    }

    try {
      const response = await this.llmService.generateFallbackTags(prompt, count);
      return response.filter((tag: any) => tag && typeof tag === 'string').slice(0, count);
    } catch (error) {
      console.warn('[AI] Fallback tag generation failed:', error);
      // Return common ambient tags as last resort
      const commonTags = ['ambience', 'atmosphere', 'room', 'background', 'noise'];
      return commonTags.slice(0, count);
    }
  }

  isLLMEnabled(): boolean {
    return Boolean(this.llmService);
  }

  getAvailableTags(): string[] {
    return [...this.availableTags];
  }
}

// Export a singleton instance
export const aiService = new AIService();

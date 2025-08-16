import OpenAI from 'openai';
import type { LLMAnalysisResult, LLMConfig, LLMAudioScore } from './llm-types';
import { SYSTEM_PROMPT, TAG_ANALYSIS_PROMPT, AUDIO_SELECTION_PROMPT, MIX_REFINEMENT_PROMPT } from './prompt-templates';

export class LLMService {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    
    if (config.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true
      });
    } else {
      throw new Error(`Provider ${config.provider} not yet implemented`);
    }
  }

  async analyzePromptForTags(
    userPrompt: string
  ): Promise<LLMAnalysisResult> {
    try {
      const prompt = TAG_ANALYSIS_PROMPT(userPrompt);
      
      console.log('[LLM] Analyzing prompt:', userPrompt);
      
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens ?? 500,
        temperature: this.config.temperature ?? 0.3,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from LLM');
      }

      console.log('[LLM] Raw response:', responseText);

      const parsed = JSON.parse(responseText) as LLMAnalysisResult;
      
      if (!Array.isArray(parsed.tags) || parsed.tags.length === 0) {
        throw new Error('Invalid tags in LLM response');
      }


      parsed.gainScale = Math.max(0.3, Math.min(2.0, parsed.gainScale || 1.0));
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

      console.log('[LLM] Parsed result:', parsed);
      
      return parsed;
      
    } catch (error) {
      console.error('[LLM] Analysis failed:', error);
      throw new Error(`LLM analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async scoreAudioOptions(
    userPrompt: string,
    audioOptions: Array<{
      id: string | number;
      name: string;
      tags: string[];
      username: string;
    }>
  ): Promise<LLMAudioScore[]> {
    try {
      if (audioOptions.length === 0) return [];

      const prompt = AUDIO_SELECTION_PROMPT(
        userPrompt, 
        audioOptions.map(a => ({ ...a, id: String(a.id) }))
      );
      
      console.log('[LLM] Scoring audio options for:', userPrompt);
      
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens ?? 800,
        temperature: this.config.temperature ?? 0.3,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from LLM');
      }

      const parsed = JSON.parse(responseText);
      
      if (!Array.isArray(parsed.rankings)) {
        throw new Error('Invalid rankings in LLM response');
      }

      return parsed.rankings.map((ranking: any) => ({
        audioId: ranking.audioId,
        relevanceScore: Math.max(0, Math.min(1, ranking.relevanceScore || 0.5)),
        reasoning: ranking.reasoning || 'No reasoning provided'
      }));
      
    } catch (error) {
      console.error('[LLM] Audio scoring failed:', error);
      return audioOptions.map(audio => ({
        audioId: String(audio.id),
        relevanceScore: 0.5,
        reasoning: 'LLM scoring failed, using default'
      }));
    }
  }

  async suggestMixRefinements(
    userPrompt: string,
    currentLayers: Array<{
      tag: string;
      gain: number;
      audioName?: string;
    }>
  ): Promise<{
    suggestions: Array<{
      tag: string;
      newGain: number;
      reasoning: string;
    }>;
    overallGainScale: number;
    confidence: number;
  }> {
    try {
      const prompt = MIX_REFINEMENT_PROMPT(userPrompt, currentLayers);
      
      console.log('[LLM] Getting mix refinement suggestions');
      
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens ?? 600,
        temperature: this.config.temperature ?? 0.3,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from LLM');
      }

      const parsed = JSON.parse(responseText);
      
      return {
        suggestions: parsed.suggestions || [],
        overallGainScale: Math.max(0.3, Math.min(2.0, parsed.overallGainScale || 1.0)),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
      };
      
    } catch (error) {
      console.error('[LLM] Mix refinement failed:', error);
      return {
        suggestions: [],
        overallGainScale: 1.0,
        confidence: 0.0
      };
    }
  }

  async generateFallbackTags(prompt: string, count: number): Promise<string[]> {
    try {
      console.log('[LLM] Generating fallback tags for:', prompt);
      
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { 
            role: 'system', 
            content: `You are an expert at finding alternative audio tags that are likely to have samples available on Freesound. 

COMMON AVAILABLE SOUNDS:
- Food: eating, chewing, crunching, bowl, spoon, kitchen, utensils, ceramic, glass
- Weather: rain, wind, storm, thunder, drops, rustling
- Indoor: room, ambient, furniture, door, window, floor, footsteps
- Objects: metal, wood, paper, fabric, plastic, clicking

Return only a comma-separated list of single-word tags that field recording artists would actually have uploaded to Freesound.` 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from LLM');
      }

      const tags = responseText
        .split(',')
        .map(tag => tag.trim().toLowerCase().replace(/[^a-z]/g, ''))
        .filter(tag => tag.length > 2)
        .slice(0, count);

      console.log('[LLM] Generated fallback tags:', tags);
      return tags;
      
    } catch (error) {
      console.error('[LLM] Fallback tag generation failed:', error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<{ url: string; revisedPrompt?: string }> {
    try {
      console.log('[LLM] Generating image for prompt:', prompt);
      
      const response = await this.client.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        size: "1792x1024", // Landscape format
        quality: "standard", // Use standard quality (cheaper than "hd")
        n: 1,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned from DALL-E');
      }

      const imageUrl = response.data[0]?.url;
      const revisedPrompt = response.data[0]?.revised_prompt;

      if (!imageUrl) {
        throw new Error('No image URL returned from DALL-E');
      }

      console.log('[LLM] Image generated successfully');
      
      return {
        url: imageUrl,
        revisedPrompt: revisedPrompt
      };
      
    } catch (error) {
      console.error('[LLM] Image generation failed:', error);
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

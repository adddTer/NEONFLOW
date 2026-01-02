import { GoogleGenAI, Type } from "@google/genai";
import { SongStructure, AITheme, DEFAULT_THEME } from "../types";

const getEffectiveKey = (userKey?: string) => {
  if (userKey && userKey.trim().length > 0) {
    return userKey.trim();
  }
  return process.env.API_KEY || '';
};

interface AIAnalysisResult extends SongStructure {
    theme?: {
        primaryColor: string;
        secondaryColor: string;
        perfectColor: string;
        goodColor: string;
        mood: string;
    };
    metadata?: {
        identifiedTitle?: string;
        identifiedArtist?: string;
        identifiedAlbum?: string;
    }
}

/**
 * AI 决策层：分析歌曲结构 + 视觉主题 + 元数据识别
 */
export const analyzeStructureWithGemini = async (
  filename: string, 
  audioBase64: string, 
  mimeType: string,
  userApiKey?: string
): Promise<{ structure: SongStructure, theme: AITheme, metadata?: { title?: string, artist?: string, album?: string } }> => {
  const apiKey = getEffectiveKey(userApiKey);

  // 默认结构（保底）
  const defaultStructure: SongStructure = {
      bpm: 120,
      sections: [{ startTime: 0, endTime: 600, type: 'verse', intensity: 0.8, style: 'stream' }]
  };
  
  // 默认主题
  let finalTheme = { ...DEFAULT_THEME };

  if (!apiKey) {
    console.warn("No API Key provided, using DSP fallback.");
    return { structure: defaultStructure, theme: finalTheme };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          {
            text: `You are an expert Rhythm Game Chart Designer and Music Metadata Specialist.
            
            Task 1: Music Analysis for Gameplay
            - Analyze the provided audio.
            - Identify the EXACT BPM (Beats Per Minute).
            - Segment the song into gameplay sections (Intro, Verse, Build-up, Kiai/Drop).
            - Assign 'intensity' (0.0-1.0) and preferred 'style' (stream, jump, etc) for each section.

            Task 2: Visual & Thematic Design
            - Pick a "primaryColor" (High contrast neon).
            - Pick a "secondaryColor" (Darker atmosphere).
            - Pick "perfectColor" and "goodColor" for hit effects.
            - Describe the "mood" in one word.

            Task 3: Metadata Identification (CRITICAL: LANGUAGE INTEGRITY)
            - Filename hint: "${filename}"
            - **RULE 1**: If the song title contains multiple languages (e.g., "Original Title Translated Title"), **KEEP BOTH** in the output. Do not discard the original or the translation.
            - **RULE 2**: If the song is Chinese, Japanese, or Korean, prefer the original script unless a dual-language title is common.
            - **RULE 3**: If you cannot 100% identify the song from audio, USE THE FILENAME as the source of truth for the Title.
            - **RULE 4**: Do not halluncinate famous songs if this is a random audio file. Be conservative.

            Return strictly JSON complying with the schema.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bpm: { type: Type.NUMBER },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    type: { type: Type.STRING },
                    intensity: { type: Type.NUMBER },
                    style: { type: Type.STRING, enum: ['stream', 'jump', 'hold', 'simple'] }
                },
                required: ['startTime', 'endTime', 'type', 'intensity', 'style']
              }
            },
            theme: {
                type: Type.OBJECT,
                properties: {
                    primaryColor: { type: Type.STRING },
                    secondaryColor: { type: Type.STRING },
                    perfectColor: { type: Type.STRING },
                    goodColor: { type: Type.STRING },
                    mood: { type: Type.STRING }
                },
                required: ['primaryColor', 'secondaryColor', 'perfectColor', 'goodColor', 'mood']
            },
            metadata: {
                type: Type.OBJECT,
                properties: {
                    identifiedTitle: { type: Type.STRING },
                    identifiedArtist: { type: Type.STRING },
                    identifiedAlbum: { type: Type.STRING }
                }
            }
          },
          required: ["bpm", "sections", "theme"]
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as AIAnalysisResult;
      console.log("Gemini Analysis Complete:", data);
      
      const { theme, metadata, ...structureData } = data;
      
      if (theme) {
          finalTheme = {
              primaryColor: theme.primaryColor,
              secondaryColor: theme.secondaryColor,
              perfectColor: theme.perfectColor || theme.primaryColor,
              goodColor: theme.goodColor || '#ffffff',
              moodDescription: theme.mood
          };
      }

      const inferredMetadata = {
          title: metadata?.identifiedTitle,
          artist: metadata?.identifiedArtist,
          album: metadata?.identifiedAlbum
      };

      return { structure: structureData, theme: finalTheme, metadata: inferredMetadata };
    }
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
  }
  
  return { structure: defaultStructure, theme: finalTheme };
};
import { GoogleGenAI, Type } from "@google/genai";
import { SongStructure, AITheme, DEFAULT_THEME } from "../types";

const getEffectiveKey = (userKey?: string) => {
  if (userKey && userKey.trim().length > 0) {
    return userKey.trim();
  }
  return process.env.API_KEY || '';
};

interface AIAnalysisResult {
    bpm?: number;
    sections?: any[];
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

export interface GenerationOptions {
    structure: boolean;
    theme: boolean;
    metadata: boolean;
}

/**
 * AI 决策层：分析歌曲结构 + 视觉主题 + 元数据识别
 */
export const analyzeStructureWithGemini = async (
  filename: string, 
  audioBase64: string, 
  mimeType: string,
  userApiKey?: string,
  options: GenerationOptions = { structure: true, theme: true, metadata: true }
): Promise<{ structure: SongStructure, theme: AITheme, metadata?: { title?: string, artist?: string, album?: string } }> => {
  const apiKey = getEffectiveKey(userApiKey);

  // 默认结构（保底）
  const defaultStructure: SongStructure = {
      bpm: 120,
      sections: [{ startTime: 0, endTime: 600, type: 'verse', intensity: 0.8, style: 'stream' }]
  };
  
  // 默认主题
  let finalTheme = { ...DEFAULT_THEME };
  const finalMetadata = { title: undefined as string | undefined, artist: undefined as string | undefined, album: undefined as string | undefined };

  // If nothing is requested or no key, return defaults
  if ((!options.structure && !options.theme && !options.metadata) || !apiKey) {
    if (!apiKey) console.warn("No API Key provided, using DSP fallback.");
    return { structure: defaultStructure, theme: finalTheme, metadata: finalMetadata };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Dynamic Prompt Construction
    let systemInstruction = `You are an expert Rhythm Game Chart Designer and Music Metadata Specialist.`;
    let taskInstruction = "";
    
    if (options.structure) {
        taskInstruction += `
        Task 1: Music Analysis
        - Identify EXACT BPM.
        - Segment song into gameplay sections.
        - Assign intensity (0.0-1.0) and style.`;
    }
    
    if (options.theme) {
        taskInstruction += `
        Task 2: Visual Theme
        - Pick neon/cyberpunk colors based on audio vibe.`;
    }

    if (options.metadata) {
        taskInstruction += `
        Task 3: Metadata Identification (STRICT RULES)
        - Filename hint: "${filename}"
        - Use Google Search to verify the song title and artist if unsure.
        - **RULE 1 (NO BRACKETS):** Remove ALL brackets like (), [], {}, 【】. NO "feat.", "ft.", "Official", "MV".
        - **RULE 2 (FORMAT):** If song has titles in multiple languages, format as: "[Main Language Title] [Sub Language Title]". 
        - **RULE 3 (PRIORITY):** Main Language Priority: Chinese > English > Japanese/Korean/Others. 
        - **RULE 4:** Do NOT translate titles yourself. Only use official dual titles found online.
        - **RULE 5:** If you cannot identify the song, clean up the filename and use it.`;
    }

    taskInstruction += `\nReturn strictly JSON. Only include fields for requested tasks.`;

    // Dynamic Schema Construction
    const properties: any = {};
    const requiredProps: string[] = [];

    if (options.structure) {
        properties.bpm = { type: Type.NUMBER };
        properties.sections = {
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
        };
        requiredProps.push("bpm", "sections");
    }

    if (options.theme) {
        properties.theme = {
            type: Type.OBJECT,
            properties: {
                primaryColor: { type: Type.STRING },
                secondaryColor: { type: Type.STRING },
                perfectColor: { type: Type.STRING },
                goodColor: { type: Type.STRING },
                mood: { type: Type.STRING }
            },
            required: ['primaryColor', 'secondaryColor', 'perfectColor', 'goodColor', 'mood']
        };
        requiredProps.push("theme");
    }

    if (options.metadata) {
        properties.metadata = {
            type: Type.OBJECT,
            properties: {
                identifiedTitle: { type: Type.STRING },
                identifiedArtist: { type: Type.STRING },
                identifiedAlbum: { type: Type.STRING }
            }
        };
        // Metadata is often optional if not found, but we want the object structure
    }

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
            text: systemInstruction + taskInstruction
          }
        ]
      },
      config: {
        tools: options.metadata ? [{ googleSearch: {} }] : [], // Only enable search if metadata requested
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: properties,
          required: requiredProps.length > 0 ? requiredProps : undefined
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as AIAnalysisResult;
      console.log("Gemini Analysis Complete:", data);
      
      let structureResult = defaultStructure;
      if (options.structure && data.bpm && data.sections) {
          structureResult = { bpm: data.bpm, sections: data.sections };
      }
      
      if (options.theme && data.theme) {
          finalTheme = {
              primaryColor: data.theme.primaryColor,
              secondaryColor: data.theme.secondaryColor,
              perfectColor: data.theme.perfectColor || data.theme.primaryColor,
              goodColor: data.theme.goodColor || '#ffffff',
              moodDescription: data.theme.mood
          };
      }

      if (options.metadata && data.metadata) {
          finalMetadata.title = data.metadata.identifiedTitle;
          finalMetadata.artist = data.metadata.identifiedArtist;
          finalMetadata.album = data.metadata.identifiedAlbum;
      }

      return { structure: structureResult, theme: finalTheme, metadata: finalMetadata };
    }
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
  }
  
  return { structure: defaultStructure, theme: finalTheme, metadata: finalMetadata };
};
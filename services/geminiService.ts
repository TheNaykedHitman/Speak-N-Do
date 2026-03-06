import { GoogleGenAI, Modality } from "@google/genai";
import { base64ToUint8Array, decodeAudioData } from "../utils/audio";

// Robust Env Var Helper
const getEnvVar = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || process.env[`REACT_APP_${key}`] || process.env[`VITE_${key}`];
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || import.meta.env[`VITE_${key}`];
    }
  } catch (e) {}
  return undefined;
};

export const generateSpeech = async (text: string, apiKeyOverride?: string): Promise<AudioBuffer | null> => {
  const apiKey = apiKeyOverride || getEnvVar('API_KEY');

  if (!apiKey) {
    console.error("API Key missing");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBuffer = await decodeAudioData(
      base64ToUint8Array(base64Audio),
      audioCtx,
      24000,
      1
    );
    
    return audioBuffer;

  } catch (error) {
    console.error("Error generating speech:", error);
    return null;
  }
};

export const playAudioBuffer = (buffer: AudioBuffer, context: AudioContext) => {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
};
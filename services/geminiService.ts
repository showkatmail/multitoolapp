import { GoogleGenAI } from "@google/genai";
import { AIAssistAction } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. AI features will not work.");
}

const getAI = () => {
  if (!API_KEY) return null;
  return new GoogleGenAI({ apiKey: API_KEY });
};

const getPromptForAction = (action: AIAssistAction, text: string): string => {
  switch (action) {
    case AIAssistAction.GRAMMAR:
      return `Correct any grammar and spelling mistakes in the following text. Only return the corrected text, without any preamble or explanation.\n\nText: "${text}"`;
    case AIAssistAction.SUMMARIZE:
      return `Summarize the following text concisely. Only return the summary.\n\nText: "${text}"`;
    case AIAssistAction.KEYWORDS:
      return `Extract the main keywords from the following text. Return them as a comma-separated list. Only return the list.\n\nText: "${text}"`;
    case AIAssistAction.EXPAND:
      return `Expand on the following text, adding more detail and making it more descriptive. Only return the expanded text.\n\nText: "${text}"`;
    case AIAssistAction.SIMPLIFY:
      return `Simplify the following text to make it easier to read for a general audience. Only return the simplified text.\n\nText: "${text}"`;
    default:
      throw new Error("Unknown AI action");
  }
};

export const runAIAssist = async (action: AIAssistAction, text: string): Promise<string> => {
  const ai = getAI();
  if (!ai) {
    return "Error: Gemini API key is not configured. Please set the API_KEY environment variable.";
  }
  
  const prompt = getPromptForAction(action, text);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        return `Error interacting with AI: ${error.message}`;
    }
    return "An unknown error occurred while contacting the AI assistant.";
  }
};

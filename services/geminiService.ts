import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Lead } from "../types";

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Configuration for models
// Switched to Flash for both to ensure high quota availability and prevent 429 errors
const MODEL_WORKER = 'gemini-2.5-flash'; 
const MODEL_SUPPORT = 'gemini-2.5-flash';

const systemInstructionExtraction = `
Eres un Analista de Datos experto en cualificación de leads B2B (Headhunter digital).

OBJETIVO PRINCIPAL:
1. Descartar empresas con CHATBOTS o automatización avanzada.
2. Encontrar al TOMADOR DE DECISIONES (CEO, Marketing, Operaciones, Dueño).

REGLAS DE EXTRACCIÓN (STRICT):
1. Detección de Rol (CRÍTICO):
   - Busca nombres propios asociados a cargos: CEO, Fundador, Director, Gerente, Marketing, Operaciones.
   - Si encuentras un nombre, ponlo en "contactName" y su cargo en "role".
   - Si no hay nombre, intenta inferir el departamento del email (ej: marketing@ -> "Dpto. Marketing").

2. Email:
   - PRIORIDAD: Emails directos de personas (juan.perez@empresa.com).
   - SECUNDARIO: Emails departamentales específicos (marketing@, gerencia@, operaciones@).
   - EVITAR: Emails genéricos 'info@' SALVO que sea una empresa pequeña donde el dueño lo lee.
   - NUNCA: Emails 'no-reply' o personales (gmail/hotmail) a menos que sea un autónomo claro.

3. Redes Sociales: Busca enlaces a LinkedIn (prioridad para ver empleados), Instagram, etc.

4. Status Chatbot:
   - "TIENE_CHATBOT": Si ves burbujas de chat automáticas, Zendesk, Intercom, bots.
   - "OPORTUNIDAD": Si es formulario simple, mailto, o teléfono.

5. Need Score (1-5):
   - 5: Web antigua, solo teléfono/fax, sin LinkedIn corporativo.
   - 1: Empresa tech, con chatbot y procesos modernos.
`;

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      companyName: { type: Type.STRING },
      contactName: { type: Type.STRING },
      role: { type: Type.STRING },
      email: { type: Type.STRING },
      website: { type: Type.STRING },
      chatbotStatus: { type: Type.STRING, enum: ['OPORTUNIDAD', 'TIENE_CHATBOT'] },
      needScore: { type: Type.INTEGER },
      reason: { type: Type.STRING },
      socialLinks: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['companyName', 'email', 'website', 'chatbotStatus', 'needScore', 'reason', 'socialLinks'],
  },
};

export interface MarketStrategy {
  targetNiche: string;
  location: string;
  searchQuery: string;
  reasoning: string;
}

// --- RATE LIMIT HANDLING ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps generateContent with retry logic for 429/Resource Exhausted errors.
 * Reduced retries to 3 to fail fast and let the main loop handle the pause.
 */
async function safeGenerateContent(params: any, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      // Robust error detection for various SDK error formats
      const msg = error?.message || error?.toString() || '';
      const status = error?.status || error?.response?.status;
      const fullErrorString = JSON.stringify(error);

      const isRateLimit = status === 429 || 
                          msg.includes('429') || 
                          msg.includes('RESOURCE_EXHAUSTED') ||
                          msg.includes('quota') ||
                          fullErrorString.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit) {
        if (attempt < retries) {
          // Exponential backoff: 15s, 30s, 60s
          const delayTime = 15000 * Math.pow(2, attempt - 1);
          console.warn(`⚠️ Rate limit hit (Attempt ${attempt}/${retries}). Cooling down for ${delayTime/1000}s...`);
          await wait(delayTime);
          continue;
        } else {
            console.error("❌ Rate limit exceeded after all retries.");
        }
      }
      throw error;
    }
  }
}

/**
 * Standard analysis for raw text input (Manual Mode)
 */
export const analyzeLeads = async (text: string): Promise<Lead[]> => {
  if (!text.trim()) return [];

  try {
    const response = await safeGenerateContent({
      model: MODEL_SUPPORT, // Use Flash for text processing speed
      contents: text,
      config: {
        systemInstruction: systemInstructionExtraction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error analyzing leads:", error);
    throw error;
  }
};

/**
 * STRATEGIST AGENT (Gemini 2.5 Flash)
 */
export const planMarketStrategy = async (pastSearches: string[]): Promise<MarketStrategy> => {
  const historyContext = pastSearches.length > 0 
    ? `Historial de búsquedas recientes (EVITAR REPETIR): ${pastSearches.join(", ")}.`
    : "No hay historial previo.";

  const prompt = `
    Actúa como un Director de Estrategia Comercial B2B.
    
    TU MISIÓN:
    Identificar un nicho de mercado de servicios y una ubicación en España con alta probabilidad de NO estar digitalizado Y ser accesible para contactar al dueño/gerente.
    
    CONTEXTO:
    ${historyContext}
    
    INSTRUCCIONES:
    1. Elige sectores donde el contacto con el dueño es factible (ej: Clínicas, Despachos, Reformas, Agencias locales). Evita grandes corporaciones.
    2. Elige una ciudad o región específica de España diferente a las del historial.
    3. Genera una query diseñada para encontrar a las personas ("Dueño", "Gerente", "Equipo").
    
    FORMATO DE RESPUESTA JSON:
    {
      "targetNiche": "Nombre del nicho",
      "location": "Ciudad/Región",
      "searchQuery": "Query optimizada para Google (ej: 'Clínicas dentales Madrid equipo directivo' o 'Despacho abogados Valencia socios')",
      "reasoning": "Breve explicación estratégica."
    }
  `;

  const response = await safeGenerateContent({
    model: MODEL_SUPPORT, 
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          targetNiche: { type: Type.STRING },
          location: { type: Type.STRING },
          searchQuery: { type: Type.STRING },
          reasoning: { type: Type.STRING },
        },
        required: ["targetNiche", "location", "searchQuery", "reasoning"]
      }
    }
  });

  if (!response.text) throw new Error("Failed to generate strategy");
  return JSON.parse(response.text);
};

/**
 * WORKER AGENT
 * Executes the search and qualifies leads.
 */
export const runAgentSearch = async (
  query: string, 
  onLog: (msg: string) => void
): Promise<Lead[]> => {
  let searchResultText = "";
  
  // --- PHASE 1: SEARCH & GATHER (Worker) ---
  onLog(`🤖 [WORKER: ${MODEL_WORKER}] Iniciando búsqueda ejecutiva (Headhunting)...`);
  
  const searchPrompt = `
    Realiza una investigación profunda para la búsqueda: "${query}".
    Objetivo: Encontrar 5-8 empresas candidatas y sus TOMADORES DE DECISIONES.
    
    Para cada empresa:
    1. Extrae Nombre y Web.
    2. INVESTIGA PROFUNDAMENTE para encontrar nombres de personas clave:
       - CEO / Fundador / Dueño
       - Director de Marketing (CMO)
       - Director de Operaciones (COO)
    3. Busca emails directos de estas personas o de sus departamentos.
    4. Verifica sus redes sociales (especialmente LinkedIn).
    5. Revisa si tienen Chatbot automatizado (para descartarlas luego).
    
    Genera un informe detallado con estos datos.
  `;

  try {
    onLog(`🔍 Ejecutando Google Search buscando perfiles directivos...`);
    
    const response = await safeGenerateContent({
      model: MODEL_WORKER,
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }, 2); // Only 2 retries for search to avoid long hangs
    
    searchResultText = response.text || "";
    
    if (!searchResultText) throw new Error("Empty search result");
    
    onLog("✅ Búsqueda completada. Analizando perfiles...");
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks?.length) {
      onLog(`🌐 Fuentes consultadas: ${chunks.length} sitios web.`);
    }

  } catch (workerError) {
    onLog(`❌ Error en búsqueda con ${MODEL_WORKER}. Verificando cuota...`);
    throw workerError; // Let the main loop handle the backoff
  }

  // --- PHASE 2: STRUCTURE & QUALIFY (Support) ---
  onLog("🧠 [SOPORTE] Filtrando chatbots y validando cargos...");

  try {
    const rawLeads = await analyzeLeads(searchResultText);
    
    // STRICT FILTERING:
    // 1. Must have email
    // 2. Must NOT be 'TIENE_CHATBOT'
    const validLeads = rawLeads.filter(lead => {
      const hasEmail = lead.email && lead.email !== 'N/A' && lead.email.includes('@');
      const isOpportunity = lead.chatbotStatus === 'OPORTUNIDAD';
      return hasEmail && isOpportunity;
    });

    const discardedChatbots = rawLeads.filter(l => l.chatbotStatus === 'TIENE_CHATBOT').length;
    
    if (discardedChatbots > 0) {
      onLog(`🚫 Se descartaron ${discardedChatbots} empresas por tener Chatbot activo.`);
    }
    
    if (validLeads.length === 0) {
      onLog(`⚠️ Se encontraron ${rawLeads.length} candidatos, pero ninguno pasó los filtros de calidad.`);
    } else {
      onLog(`✨ Éxito: ${validLeads.length} leads cualificados.`);
    }
    
    return validLeads;
  } catch (error) {
    onLog("❌ Error durante la estructuración de datos.");
    throw error;
  }
};
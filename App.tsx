import React, { useState, useEffect, useRef } from 'react';
import { analyzeLeads, runAgentSearch, planMarketStrategy, MarketStrategy } from './services/geminiService';
import { Lead } from './types';
import { LeadTable } from './components/LeadTable';
import { Bot, FileDown, Loader2, Sparkles, Trash2, ClipboardPaste, Terminal, Zap, BrainCircuit, Database, Play, PauseCircle } from 'lucide-react';

const SAMPLE_TEXT = `Bienvenidos a Clinica Dental Sonrisas. Pide tu cita llamando al 912345678 o escribe a contacto@sonrisas.com. Horario de lunes a viernes...
---
Soluciones Logísticas Rápidas S.L. Rastrea tu pedido en nuestro portal de clientes o usa nuestro chat de soporte 24/7 con Zendesk. Para ventas corporativas contactar a ventas@logistica-rapida.es.
---
Asesoría Legal Pérez. Atención personalizada. Para consultas, por favor rellene el formulario de contacto o envíe un correo a info@asesoriaperez.com. Nuestros abogados le responderán en 48 horas.
`;

export default function App() {
  const [mode, setMode] = useState<'manual' | 'agent'>('agent');
  
  // Manual State
  const [inputText, setInputText] = useState<string>('');
  
  // Agent State
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [currentStrategy, setCurrentStrategy] = useState<MarketStrategy | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  // Shared State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- MEMORY SYSTEM (Persistence) ---
  useEffect(() => {
    try {
      const savedLeads = localStorage.getItem('b2b_leads_db');
      if (savedLeads) setLeads(JSON.parse(savedLeads));

      const savedHistory = localStorage.getItem('b2b_search_history');
      if (savedHistory) setSearchHistory(JSON.parse(savedHistory));
    } catch (e) {
      console.error("Failed to load memory", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('b2b_leads_db', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('b2b_search_history', JSON.stringify(searchHistory));
  }, [searchHistory]);
  // -----------------------------------

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

  // --- CONTINUOUS LOOP ENGINE ---
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (isLooping && !isLoading && cooldown === 0) {
        // Delay next cycle to avoid rate limits and allow UI updates
        // INCREASED SAFETY: 60 seconds (1 minute per cycle)
        timeoutId = setTimeout(() => {
            executeAgentCycle();
        }, 60000); 
    } else if (cooldown > 0) {
        timeoutId = setTimeout(() => {
            setCooldown(0);
            addLog("🟢 Enfriamiento completado. Reanudando operaciones...");
        }, cooldown);
    }

    return () => clearTimeout(timeoutId);
  }, [isLooping, isLoading, cooldown]);

  const addLog = (msg: string) => {
    setAgentLogs(prev => {
        const newLogs = [...prev, msg];
        if (newLogs.length > 100) return newLogs.slice(-100); // Keep last 100 logs
        return newLogs;
    });
  };

  const handleManualAnalyze = async () => {
    if (!inputText.trim()) {
      setError("Por favor, introduce texto para analizar.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeLeads(inputText);
      // Deduplicate manually added leads against existing ones
      const newLeads = result.filter(newLead => 
        !leads.some(existing => existing.email === newLead.email && existing.companyName === newLead.companyName)
      );
      setLeads(prev => [...prev, ...newLeads]);
    } catch (err) {
      setError("Ocurrió un error al procesar el texto.");
    } finally {
      setIsLoading(false);
    }
  };

  const executeAgentCycle = async () => {
    setIsLoading(true);
    setError(null);
    // Don't clear logs here to keep history during loop
    setCurrentStrategy(null);
    
    // Note: We are now using Flash for planning to save Pro quota
    addLog("🔵 [FASE 1] Iniciando Estudio de Mercado...");

    try {
      // 1. Plan Strategy
      const strategy = await planMarketStrategy(searchHistory);
      setCurrentStrategy(strategy);
      addLog(`💡 ESTRATEGIA DEFINIDA: ${strategy.targetNiche} en ${strategy.location}`);
      addLog(`⚖️ Razón: ${strategy.reasoning}`);
      
      // 2. Execute Search
      addLog("🔵 [FASE 2] Ejecutando Agente de Búsqueda...");
      const result = await runAgentSearch(strategy.searchQuery, addLog);
      
      // 3. Update Memory & State
      if (result.length > 0) {
        setSearchHistory(prev => [...prev, strategy.searchQuery]);
        
        // Deduplicate
        setLeads(prev => {
          const uniqueNewLeads = result.filter(newLead => 
            !prev.some(existing => existing.email === newLead.email || existing.companyName === newLead.companyName)
          );
          
          if (uniqueNewLeads.length < result.length) {
            addLog(`♻️ Se filtraron ${result.length - uniqueNewLeads.length} duplicados ya existentes en memoria.`);
          }
          return [...prev, ...uniqueNewLeads];
        });
      }

    } catch (err) {
      console.error(err);
      const errorMessage = (err as Error).message || JSON.stringify(err);
      
      // Check for rate limit specific errors
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        addLog("⏳ CUOTA DE API EXCEDIDA. Pausa de seguridad larga (5 min)...");
        setCooldown(300000); // 5 minutes pause (300s)
      } else {
        addLog(`❌ Error en el ciclo: ${errorMessage.substring(0, 100)}... Reintentando en breve.`);
      }
    } finally {
      setIsLoading(false);
      // The useEffect will trigger the next cycle if isLooping is still true
    }
  };

  const handleClearMemory = () => {
    if (confirm("¿Estás seguro de borrar toda la memoria y los leads extraídos?")) {
      setLeads([]);
      setSearchHistory([]);
      setCurrentStrategy(null);
      setAgentLogs([]);
      setIsLooping(false); // Safety stop
      localStorage.removeItem('b2b_leads_db');
      localStorage.removeItem('b2b_search_history');
    }
  };

  const handleDownloadCSV = () => {
    if (leads.length === 0) return;
    const headers = "Nombre Empresa;Nombre Contacto;Cargo;Email;Sitio Web;Nivel de Necesidad;Motivo;Redes Sociales";
    const rows = leads.map(lead => 
      `${lead.companyName};${lead.contactName || 'N/A'};${lead.role || 'N/A'};${lead.email};${lead.website};${lead.needScore};${lead.reason};${lead.socialLinks?.join(', ') || ''}`
    );
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'leads_qualificados_exec_db.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleLoop = () => {
      setIsLooping(!isLooping);
  };

  const stats = {
    total: leads.length,
    opportunities: leads.filter(l => l.chatbotStatus === 'OPORTUNIDAD').length,
    highPriority: leads.filter(l => l.needScore >= 4 && l.chatbotStatus === 'OPORTUNIDAD').length
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2 rounded-lg text-white shadow-md">
              <Bot size={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              LeadQualifier AI <span className="text-xs font-normal text-gray-400 ml-1">v3.4 Flash Optimized</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 hidden sm:flex">
             <span className="flex items-center gap-1"><Zap size={14} className="text-blue-500"/> Gemini 2.5 Flash</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Intro */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl tracking-tight">
            Agente de Prospección B2B
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Inteligencia Artificial autónoma que encuentra <b>Tomadores de Decisiones</b> y filtra chatbots.
          </p>
        </div>

        {/* Main Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Mode Switcher Tabs */}
            <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 flex">
              <button
                onClick={() => { setMode('manual'); setIsLooping(false); }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  mode === 'manual' 
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' 
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <ClipboardPaste size={16} />
                Modo Manual
              </button>
              <button
                onClick={() => setMode('agent')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  mode === 'agent' 
                    ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200' 
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <BrainCircuit size={16} />
                Agente Autónomo
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-[550px]">
              {mode === 'manual' ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Pegar Texto Crudo</h3>
                    <button 
                        onClick={() => setInputText(SAMPLE_TEXT)} 
                        className="text-xs text-blue-600 hover:underline"
                    >
                      Cargar Ejemplo
                    </button>
                  </div>
                  <textarea
                    className="flex-1 w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm font-mono bg-gray-50 mb-4"
                    placeholder="Pega aquí el contenido de los sitios web..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setInputText('')} className="btn-secondary flex justify-center items-center py-2 border rounded-lg hover:bg-gray-50">
                      <Trash2 size={16} className="mr-2"/> Limpiar
                    </button>
                    <button 
                      onClick={handleManualAnalyze} 
                      disabled={isLoading || !inputText}
                      className="btn-primary bg-blue-600 text-white flex justify-center items-center py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="animate-spin" /> : 'Analizar Texto'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Piloto Automático</h3>
                    {isLooping && !cooldown && (
                      <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100 animate-pulse">
                        <Sparkles size={12} />
                        <span>Bucle Activo</span>
                      </div>
                    )}
                    {cooldown > 0 && (
                      <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-100 animate-pulse">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Enfriando ({Math.ceil(cooldown/1000)}s)</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Strategy Display */}
                  <div className={`mb-4 p-4 rounded-lg border transition-all duration-300 ${currentStrategy ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200 border-dashed'}`}>
                     {currentStrategy ? (
                         <div className="space-y-2">
                             <div className="flex items-start gap-2">
                                <span className="bg-purple-200 text-purple-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5">Objetivo</span>
                                <span className="text-sm font-bold text-gray-800">{currentStrategy.targetNiche}</span>
                             </div>
                             <div className="flex items-start gap-2">
                                <span className="bg-blue-200 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5">Zona</span>
                                <span className="text-sm text-gray-700">{currentStrategy.location}</span>
                             </div>
                             <p className="text-xs text-gray-600 italic mt-2 border-t border-purple-100 pt-2">
                                "{currentStrategy.reasoning}"
                             </p>
                         </div>
                     ) : (
                         <div className="text-center text-gray-400 py-4 text-sm flex flex-col items-center">
                             <BrainCircuit size={24} className="mb-2 opacity-20"/>
                             <p>Esperando iniciar estudio de mercado...</p>
                         </div>
                     )}
                  </div>

                  {/* Agent Console */}
                  <div className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-y-auto mb-4 border border-gray-800 shadow-inner">
                    <div className="flex items-center gap-2 text-gray-500 border-b border-gray-800 pb-2 mb-2">
                      <Terminal size={14} />
                      <span>AGENT_CORE_LOGS {isLooping ? '(LIVE)' : '(IDLE)'}</span>
                    </div>
                    {agentLogs.length === 0 && !isLoading && (
                      <div className="text-gray-600 italic">Sistema en espera. Pulse START.</div>
                    )}
                    {agentLogs.map((log, i) => (
                      <div key={i} className="mb-1.5 break-words">
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                        {log}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="animate-pulse">_</div>
                    )}
                    <div ref={logsEndRef} />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={toggleLoop} 
                      className={`btn-primary flex justify-center items-center py-3 rounded-lg shadow-lg transition-all transform active:scale-95 ${
                          isLooping 
                          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
                          : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-purple-200'
                      }`}
                    >
                      {isLooping ? (
                        <>
                          <PauseCircle size={20} className="mr-2" /> 
                          DETENER BUCLE
                        </>
                      ) : (
                        <>
                          <Play size={20} className="mr-2" /> 
                          INICIAR AUTO-DESCUBRIMIENTO
                        </>
                      )}
                    </button>
                    {isLooping && isLoading && (
                        <p className="text-[10px] text-center text-gray-400 animate-pulse">
                            Ciclo en progreso...
                        </p>
                    )}
                  </div>
                </>
              )}
              
              {error && !isLooping && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100 flex items-start gap-2">
                   <div className="mt-0.5">⚠️</div>
                   <div>{error}</div>
                </div>
              )}
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="text-gray-500 text-xs font-medium uppercase tracking-wider">Base de Datos (Memoria)</div>
                <div className="mt-1 text-2xl font-bold text-gray-900 flex items-center gap-2">
                    {stats.total}
                    <Database size={16} className="text-gray-300"/>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="text-green-600 text-xs font-medium uppercase tracking-wider">Oportunidades</div>
                <div className="mt-1 text-2xl font-bold text-green-700">{stats.opportunities}</div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="text-orange-600 text-xs font-medium uppercase tracking-wider">Alta Prioridad</div>
                <div className="mt-1 text-2xl font-bold text-orange-700">{stats.highPriority}</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[550px] max-h-[600px] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  Resultados Globales
                  {leads.length > 0 && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{leads.length}</span>}
                </h3>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleClearMemory}
                        disabled={leads.length === 0}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Borrar Memoria"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button
                    onClick={handleDownloadCSV}
                    disabled={leads.length === 0}
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                    <FileDown size={18} />
                    Exportar DB
                    </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {leads.length > 0 ? (
                  <LeadTable leads={leads} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                    {isLoading ? (
                       <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                         <div className="relative">
                            <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-75"></div>
                            <div className="relative bg-white p-3 rounded-full shadow-sm">
                                <Loader2 size={32} className="animate-spin text-purple-600" />
                            </div>
                         </div>
                         <div>
                            <p className="text-sm font-semibold text-gray-800 mb-1">
                                {currentStrategy ? 'Investigando Mercado...' : 'Analizando...'}
                            </p>
                            <p className="text-xs text-gray-500">
                                {currentStrategy ? `Buscando ${currentStrategy.targetNiche} en ${currentStrategy.location}` : 'El agente está pensando.'}
                            </p>
                         </div>
                       </div>
                    ) : (
                      <>
                        <div className="bg-gray-100 p-4 rounded-full mb-4">
                            <BrainCircuit size={32} className="text-gray-400" />
                        </div>
                        <p className="font-medium text-gray-600">Memoria Vacía</p>
                        <p className="text-sm text-gray-400 mt-1 max-w-xs text-center">
                            Activa el modo "Agente Autónomo" para que la IA encuentre clientes por ti automáticamente.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
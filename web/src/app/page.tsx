"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  LayoutDashboard, 
  Layers, 
  Database, 
  Clock, 
  BarChart3, 
  Calendar,
  Users,
  Zap,
  Network,
  Settings,
  Bell,
  Sun,
  Menu,
  ChevronDown,
  RotateCcw,
  Maximize2,
  Send,
  Paperclip,
  Mic,
  MicOff,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Brain,
  Cloud,
  CheckCircle2,
  Cpu,
  Save,
  Globe,
  Box,
  Server,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Square
} from 'lucide-react';


const API_BASE = "http://localhost:8000";

export default function OpenClawDashboard() {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [aiMode, setAiMode] = useState<'local' | 'cloud'>('cloud');
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Configuración Local
  const [localProvider, setLocalProvider] = useState("Ollama");
  const [localUrl, setLocalUrl] = useState("http://localhost:11434");
  const [localModel, setLocalModel] = useState("llama3.2:latest");
  const [isLocalConnected, setIsLocalConnected] = useState(false);
  
  // Configuración Nube
  const [cloudProvider, setCloudProvider] = useState("Groq");
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recognition, setRecognition] = useState<any>(null);
  
  // Referencias para que el reconocimiento de voz siempre tenga los valores actualizados
  const aiModeRef = useRef(aiMode);
  const localProviderRef = useRef(localProvider);
  const localUrlRef = useRef(localUrl);
  const localModelRef = useRef(localModel);
  const cloudApiKeyRef = useRef(cloudApiKey);

  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  useEffect(() => { localProviderRef.current = localProvider; }, [localProvider]);
  useEffect(() => { localUrlRef.current = localUrl; }, [localUrl]);
  useEffect(() => { localModelRef.current = localModel; }, [localModel]);
  useEffect(() => { cloudApiKeyRef.current = cloudApiKey; }, [cloudApiKey]);

  const [audioOutputs, setAudioOutputs] = useState<any[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string | number>("");
  const [audioInputs, setAudioInputs] = useState<any[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | number>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      setRecordingTime(0);
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDevices = async () => {
    try {
      const res = await fetch(`${API_BASE}/audio/devices`);
      const data = await res.json();
      
      if (data.outputs) {
        setAudioOutputs(data.outputs);
        // Si no hay selección, o la selección actual no está en la lista (comparación flexible), elegir el default
        if (!selectedOutput || !data.outputs.find((d: any) => d.id == selectedOutput)) {
          setSelectedOutput(data.default_output);
        }
      }
      
      if (data.inputs) {
        setAudioInputs(data.inputs);
        if (!selectedInput || !data.inputs.find((d: any) => d.id == selectedInput)) {
          setSelectedInput(data.default_input);
        }
      }
    } catch (err) {
      console.error("Error al obtener dispositivos del servidor:", err);
      // Fallback a navegador si falla el servidor (opcional)
    }
  };

  useEffect(() => {
    getDevices();
    if (navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = getDevices;
    }
  }, []);

  const speak = (text: string) => {
    if (!isVoiceEnabled) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    setIsCloudConnected(cloudApiKey.trim().length > 0);
  }, [cloudApiKey]);

  useEffect(() => {
    const checkLocal = async () => {
      if (aiMode === 'local') {
        try {
          const res = await fetch('http://localhost:11434/api/tags');
          setIsLocalConnected(res.ok);
        } catch {
          setIsLocalConnected(false);
        }
      }
    };
    checkLocal();
    const interval = setInterval(checkLocal, 5000);
    return () => clearInterval(interval);
  }, [aiMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'es-ES';
        
        rec.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript && transcript.trim().length > 0) {
            handleSend(transcript.trim());
          }
        };
        
        rec.onend = () => {
          setIsRecording(false);
        };

        rec.onerror = (event: any) => {
          console.error("Error en reconocimiento:", event.error);
          setIsRecording(false);
        };

        setRecognition(rec);
      }
    }
  }, []);

  // Cargar configuraciones al iniciar
  useEffect(() => {
    const savedAiMode = localStorage.getItem('openbot_aiMode');
    const savedVoiceEnabled = localStorage.getItem('openbot_isVoiceEnabled');
    const savedCloudApiKey = localStorage.getItem('openbot_cloudApiKey');
    const savedLocalModel = localStorage.getItem('openbot_localModel');
    const savedLocalUrl = localStorage.getItem('openbot_localUrl');
    const savedSelectedOutput = localStorage.getItem('openbot_selectedOutput');

    if (savedAiMode) setAiMode(savedAiMode as 'local' | 'cloud');
    if (savedVoiceEnabled) setIsVoiceEnabled(savedVoiceEnabled === 'true');
    if (savedCloudApiKey) setCloudApiKey(savedCloudApiKey);
    if (savedLocalModel) setLocalModel(savedLocalModel);
    if (savedLocalUrl) setLocalUrl(savedLocalUrl);
    if (savedSelectedOutput) setSelectedOutput(Number(savedSelectedOutput));
  }, []);

  // Guardar configuraciones automáticamente
  useEffect(() => { localStorage.setItem('openbot_aiMode', aiMode); }, [aiMode]);
  useEffect(() => { localStorage.setItem('openbot_isVoiceEnabled', String(isVoiceEnabled)); }, [isVoiceEnabled]);
  useEffect(() => { localStorage.setItem('openbot_cloudApiKey', cloudApiKey); }, [cloudApiKey]);
  useEffect(() => { localStorage.setItem('openbot_localModel', localModel); }, [localModel]);
  useEffect(() => { localStorage.setItem('openbot_localUrl', localUrl); }, [localUrl]);
  useEffect(() => { localStorage.setItem('openbot_selectedOutput', String(selectedOutput)); }, [selectedOutput]);

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleSaveConfig = async (type: 'local' | 'cloud') => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      if (type === 'local') {
        setIsLocalConnected(localUrl.length > 10);
      } else {
        setIsCloudConnected(cloudApiKey.length > 20);
      }
    }, 1200);
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || inputText;
    if (!text.trim() || isSending) return;
    const userMsg = { role: 'user', content: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          mode: aiModeRef.current,
          provider: localProviderRef.current,
          url: localUrlRef.current,
          model: localModelRef.current,
          cloud_key: cloudApiKeyRef.current
        })
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'ai', content: data.response, time: data.time }]);
        speak(data.response);
      }
    } catch (error) { console.error("Error al enviar mensaje:", error); }
    finally { setIsSending(false); }
  };

  const toggleMic = () => {
    if (!isRecording) {
      if (recognition) {
        try {
          recognition.start();
          setIsRecording(true);
        } catch (err) {
          console.error("Error al iniciar reconocimiento:", err);
        }
      } else {
        alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.");
      }
    } else {
      if (recognition) {
        recognition.stop();
        setIsRecording(false);
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-[#e0e0e0] font-sans selection:bg-red-500/30">
      <input type="file" ref={fileInputRef} className="hidden" />
      
      {/* Barra Lateral */}
      <aside className="w-64 bg-[#0a0a0a] border-r border-white/5 flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
            <Cpu size={20} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm tracking-widest text-white">OPENBOT</span>
            <span className="text-[9px] text-red-500 font-bold uppercase tracking-tighter">Sistemas Autónomos</span>
          </div>
        </div>

        <div className="flex-1 px-3 space-y-6 overflow-y-auto custom-scrollbar">
          <SidebarSection title="Principal">
            <SidebarItem icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setActiveTab('chat')} />
            <SidebarItem icon={<MessageSquare size={18} />} label="Chat de IA" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
            <SidebarItem icon={<Clock size={18} />} label="Historial" />
          </SidebarSection>
          
          <SidebarSection title="IA & Modelos">
            <SidebarItem icon={<Brain size={18} />} label="Modelos Locales" />
            <SidebarItem icon={<Cloud size={18} />} label="Servicios Cloud" />
            <SidebarItem icon={<Database size={18} />} label="Base de Conocimiento" />
          </SidebarSection>

          <SidebarSection title="Sistema">
            <SidebarItem icon={<Settings size={18} />} label="Configuración" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
            <SidebarItem icon={<Bell size={18} />} label="Notificaciones" />
            <SidebarItem icon={<ShieldCheck size={18} />} label="Seguridad" />
          </SidebarSection>
        </div>

        <div className="p-4 border-t border-white/5">
          <div className="bg-[#151515] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center text-[10px] font-bold">C</div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white truncate">Usuario Admin</span>
              <span className="text-[10px] text-gray-500 truncate">Pro Plan</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0d0d0d]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-400 capitalize">{activeTab}</h2>
            <span className="text-gray-700">/</span>
            <span className="text-sm font-bold text-white">Sesión Actual</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Status & Mode Switcher - Quick Toggle */}
            <div className="flex items-center gap-2 bg-[#1a1a1a] p-1.5 rounded-full border border-white/5 shadow-inner">
              <div className="flex items-center gap-1 bg-black/20 p-1 rounded-full border border-white/5">
                <button 
                  onClick={() => setAiMode('local')}
                  className={`p-1.5 rounded-full transition-all duration-300 ${aiMode === 'local' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'text-gray-600 hover:text-gray-400'}`}
                  title="Modo Local"
                >
                  <Brain size={16} />
                </button>
                <button 
                  onClick={() => setAiMode('cloud')}
                  className={`p-1.5 rounded-full transition-all duration-300 ${aiMode === 'cloud' ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'text-gray-600 hover:text-gray-400'}`}
                  title="Modo Cloud"
                >
                  <Cloud size={16} />
                </button>
              </div>

              {/* Status Indicator */}
              <div className={`w-2 h-2 rounded-full transition-all duration-500 ${aiMode === 'local' ? (isLocalConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-red-500') : (isCloudConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-red-500')}`} />

              <div className="w-[1px] h-4 bg-white/10 mx-1" />

              {/* Speaker Toggle */}
              <button 
                onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} 
                className={`p-2 rounded-full transition-all duration-300 ${isVoiceEnabled ? 'text-blue-400 hover:bg-blue-400/10' : 'text-gray-600 hover:bg-white/5'}`}
                title="Voz del Asistente"
              >
                {isSpeaking ? <Zap size={16} className="animate-pulse text-yellow-400" /> : (isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />)}
              </button>

              {isSpeaking && (
                <button 
                  onClick={stopSpeaking}
                  className="p-2 rounded-full text-red-500 hover:bg-red-500/10 transition-all animate-in fade-in zoom-in"
                  title="Detener voz"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              )}
              
              <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest px-2 hidden lg:block">
                {aiMode === 'local' ? localProvider : cloudProvider}
              </span>
            </div>
            
            <button className="p-2 rounded-xl transition-all duration-300 border-2 border-transparent text-gray-400 hover:text-white hover:bg-black/40 hover:border-white">
              <Sun size={18} />
            </button>
          </div>
        </header>

        {activeTab === 'chat' ? (
          <div className="flex-1 flex flex-col p-8 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-8 pr-4 mb-6 custom-scrollbar scroll-smooth">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-20 select-none">
                  <div className="relative mb-6">
                    <div className="absolute -inset-4 bg-red-600/20 blur-3xl rounded-full"></div>
                    <Cpu size={80} className="relative text-red-600" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-white mb-2">OpenBot Core</h2>
                  <p className="text-sm font-bold text-gray-500 tracking-widest uppercase">
                    {aiMode === 'local' ? 'Red Neuronal Local Activa' : 'Sistemas en la Nube Sincronizados'}
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border shadow-lg ${
                      msg.role === 'user' ? 'bg-red-600/20 border-red-500/20 text-red-500' : 'bg-[#1a1a1a] border-white/5 text-gray-500'
                    }`}>
                      {msg.role === 'user' ? 'U' : 'A'}
                    </div>
                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-5 text-sm leading-relaxed whitespace-pre-wrap shadow-xl ${
                        msg.role === 'user' 
                          ? 'bg-[#1a1111] text-white rounded-2xl rounded-tr-none border border-red-500/10' 
                          : 'bg-[#151515] text-gray-300 rounded-2xl rounded-tl-none border border-white/5'
                      }`}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 mt-2 px-1 uppercase tracking-tighter">{msg.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative group bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-red-500/50 transition-all">
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Pregunta lo que sea en modo ${aiMode === 'local' ? 'Local' : 'Nube'}...`}
                className="w-full bg-transparent p-5 pb-16 min-h-[120px] text-sm outline-none transition-all resize-none placeholder:text-gray-600"
              />
              
              <div className="absolute bottom-4 left-5 flex items-center gap-1">
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-500 hover:text-white hover:bg-black/40 rounded-xl transition-all duration-300 border-2 border-transparent hover:border-white" title="Adjuntar Documento">
                  <Paperclip size={18} />
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-500 hover:text-white hover:bg-black/40 rounded-xl transition-all duration-300 border-2 border-transparent hover:border-white" title="Subir Imagen">
                  <ImageIcon size={18} />
                </button>
              </div>

              <div className="absolute bottom-4 right-5 flex items-center gap-4">
                <div className="relative flex flex-col items-center">
                  {isRecording && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full animate-in fade-in slide-in-from-bottom-2 duration-300 z-20 whitespace-nowrap">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-red-500 tabular-nums">{formatTime(recordingTime)}</span>
                    </div>
                  )}
                  <button 
                    onClick={toggleMic} 
                    className={`p-2.5 rounded-xl transition-all duration-300 border-2 ${isRecording ? 'text-red-500 bg-red-500/10 border-red-500/50 animate-pulse' : 'text-gray-500 border-transparent hover:text-white hover:bg-black/40 hover:border-white'}`}
                    title={isRecording ? "Detener Grabación" : "Grabar Audio"}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </div>
                
                <button 
                  onClick={() => handleSend()} 
                  disabled={isSending || !inputText.trim()} 
                  className="pl-6 pr-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-[0_4px_15px_rgba(220,38,38,0.3)] transition-all duration-300 border-2 border-red-600 hover:border-white flex items-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isSending ? 'Enviando' : 'Enviar'} <Send size={14} className={isSending ? 'animate-ping' : ''} />
                </button>
              </div>
            </div>
            
            <div className="flex justify-center mt-4 gap-6 opacity-30 select-none">
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-2"><Network size={10} /> Latencia: 42ms</span>
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-2"><Cpu size={10} /> Load: 12%</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Configuración Central</h1>
            <p className="text-sm text-gray-500 mb-12 font-bold tracking-wide">Gestión de proveedores de inteligencia y conectividad.</p>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className={`p-8 rounded-3xl border transition-all duration-500 ${aiMode === 'local' ? 'bg-purple-600/5 border-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.1)]' : 'bg-[#121212] border-white/5 hover:border-white/10'}`}>
                <div className="flex justify-between items-start mb-8">
                  <div className="p-4 bg-purple-600/20 rounded-2xl text-purple-400 shadow-inner"><Brain size={28} /></div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold ${isLocalConnected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isLocalConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      {isLocalConnected ? 'Conectado' : 'Sin Conexión'}
                    </div>
                    <button onClick={() => setAiMode('local')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aiMode === 'local' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                      {aiMode === 'local' ? 'Activo' : 'Activar'}
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-black text-white mb-2">Cerebro Local</h3>
                <p className="text-xs text-gray-500 mb-8 font-bold leading-relaxed">Ejecución segura y privada en tu propio hardware (Ollama, LM Studio).</p>
                <div className="space-y-4 mb-8">
                  <ConfigInput label="Proveedor" icon={<Server size={14} />} value={localProvider} onChange={setLocalProvider} placeholder="Ollama" />
                  <ConfigInput label="URL Servidor" icon={<Globe size={14} />} value={localUrl} onChange={setLocalUrl} placeholder="http://localhost:11434" />
                  <ConfigInput label="Modelo" icon={<Box size={14} />} value={localModel} onChange={setLocalModel} placeholder="llama3.1:8b" />
                </div>
                <button onClick={() => handleSaveConfig('local')} className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-purple-600/20">
                  <Save size={18} /> {isSaving ? 'Sincronizando...' : 'Guardar y Probar'}
                </button>
              </div>

              <div className={`p-8 rounded-3xl border transition-all duration-500 ${aiMode === 'cloud' ? 'bg-cyan-600/5 border-cyan-500/30 shadow-[0_0_40px_rgba(6,182,212,0.1)]' : 'bg-[#121212] border-white/5 hover:border-white/10'}`}>
                <div className="flex justify-between items-start mb-8">
                  <div className="p-4 bg-cyan-600/20 rounded-2xl text-cyan-400 shadow-inner"><Cloud size={28} /></div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold ${isCloudConnected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      {isCloudConnected ? 'Conectado' : 'Sin Conexión'}
                    </div>
                    <button onClick={() => setAiMode('cloud')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aiMode === 'cloud' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                      {aiMode === 'cloud' ? 'Activo' : 'Activar'}
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-black text-white mb-2">IA en la Nube</h3>
                <p className="text-xs text-gray-500 mb-8 font-bold leading-relaxed">Potencia ilimitada procesada en servidores de alto rendimiento (Groq, OpenAI).</p>
                <div className="space-y-4 mb-8">
                  <ConfigInput label="Proveedor" icon={<Globe size={14} />} value={cloudProvider} onChange={setCloudProvider} placeholder="Groq" />
                  <div className="space-y-3 relative">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 px-1"><Key size={14} /> API Access Key</label>
                    <div className="relative">
                      <input type={showApiKey ? "text" : "password"} value={cloudApiKey} onChange={(e) => setCloudApiKey(e.target.value)} placeholder="sk-..." className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 pr-14 text-sm focus:border-cyan-500/50 outline-none transition-all placeholder:text-gray-700" />
                      <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-all">{showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    </div>
                  </div>
                </div>
                <button onClick={() => handleSaveConfig('cloud')} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-cyan-600/20">
                  <Save size={18} /> {isSaving ? 'Sincronizando...' : 'Guardar y Probar'}
                </button>
              </div>

              {/* Paneles de Audio (Voz y Micro) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:col-span-2">
                {/* Card Parlante (Voz) */}
                <div className="p-8 bg-gradient-to-br from-[#151515] to-[#0d0d0d] border border-white/5 rounded-3xl flex items-center justify-between shadow-2xl transition-all hover:border-blue-500/20">
                  <div className="flex items-center gap-6">
                    <div className={`p-5 rounded-2xl transition-all duration-500 ${isVoiceEnabled ? 'bg-blue-500/10 text-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.15)]' : 'bg-black/40 text-gray-700'}`}>
                      {isVoiceEnabled ? <Volume2 size={28} /> : <VolumeX size={28} />}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight">Salida de Voz</h3>
                        <p className="text-[10px] text-gray-500 font-bold tracking-wide uppercase mb-2">Respuesta del asistente</p>
                        
                        {/* Selector de Dispositivo */}
                        <div className="flex items-center gap-2">
                          <div className="relative group/select w-full max-w-[240px]">
                            <select 
                              value={selectedOutput} 
                              onChange={(e) => setSelectedOutput(Number(e.target.value))}
                              className="appearance-none bg-black/60 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-[10px] text-gray-300 font-bold outline-none focus:border-blue-500/50 transition-all cursor-pointer hover:bg-black/80 w-full truncate"
                              title={audioOutputs.find((d: any) => d.id == selectedOutput)?.name || "Seleccionar dispositivo"}
                            >
                              {audioOutputs.length > 0 ? (
                                audioOutputs.map((device: any) => (
                                  <option key={device.id} value={device.id} className="bg-[#1a1a1a]">
                                    {device.name} {device.is_default ? '(Predeterminado)' : ''}
                                  </option>
                                ))
                              ) : (
                                <option value="">No se detectan salidas</option>
                              )}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none group-hover/select:text-blue-400 transition-colors" />
                          </div>
                          <button 
                            onClick={getDevices}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all shadow-inner border border-white/5"
                            title="Refrescar lista de dispositivos"
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`w-14 h-7 rounded-full transition-all relative border ${isVoiceEnabled ? 'bg-blue-600 border-blue-400' : 'bg-gray-800 border-white/5'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${isVoiceEnabled ? 'left-8 shadow-blue-400/50' : 'left-1'}`} />
                  </button>
                </div>

                {/* Card Micrófono */}
                <div className="p-8 bg-gradient-to-br from-[#151515] to-[#0d0d0d] border border-white/5 rounded-3xl flex items-center justify-between shadow-2xl transition-all hover:border-red-500/20">
                  <div className="flex items-center gap-6">
                    <div className={`p-5 rounded-2xl transition-all duration-500 ${isRecording ? 'bg-red-500/10 text-red-500 shadow-[0_0_25px_rgba(239,68,68,0.15)] animate-pulse' : 'bg-black/40 text-gray-700'}`}>
                      {isRecording ? <Mic size={28} /> : <MicOff size={28} />}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight">Entrada de Micro</h3>
                        <p className="text-[10px] text-gray-500 font-bold tracking-wide uppercase mb-2">Escucha activa / Wake-word</p>
                        
                        {/* Selector de Micro */}
                        <div className="flex items-center gap-2">
                          <div className="relative group/select w-full max-w-[240px]">
                            <select 
                              value={selectedInput} 
                              onChange={(e) => setSelectedInput(Number(e.target.value))}
                              className="appearance-none bg-black/60 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-[10px] text-gray-300 font-bold outline-none focus:border-red-500/50 transition-all cursor-pointer hover:bg-black/80 w-full truncate"
                              title={audioInputs.find((d: any) => d.id == selectedInput)?.name || "Seleccionar micro"}
                            >
                              {audioInputs.length > 0 ? (
                                audioInputs.map((device: any) => (
                                  <option key={device.id} value={device.id} className="bg-[#1a1a1a]">
                                    {device.name} {device.is_default ? '(Predeterminado)' : ''}
                                  </option>
                                ))
                              ) : (
                                <option value="">No se detectan micros</option>
                              )}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none group-hover/select:text-red-400 transition-colors" />
                          </div>
                          <button 
                            onClick={getDevices}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all shadow-inner border border-white/5"
                            title="Refrescar micros"
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setIsRecording(!isRecording)} className={`w-14 h-7 rounded-full transition-all relative border ${isRecording ? 'bg-red-600 border-red-400' : 'bg-gray-800 border-white/5'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${isRecording ? 'left-8 shadow-red-400/50' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="space-y-1 mb-8">
      {title && <h3 className="px-4 text-[10px] font-black text-gray-600 uppercase tracking-[3px] mb-4">{title}</h3>}
      {children}
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all duration-300 mx-1 border border-transparent ${active ? 'bg-red-600/10 text-white border-red-600/20 shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
      <span className={`${active ? 'text-red-500' : 'group-hover:text-gray-300'}`}>{icon}</span>
      <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" />}
    </div>
  );
}

function ConfigInput({ label, icon, value, onChange, placeholder, type = "text" }: { label: string, icon: React.ReactNode, value: string, onChange: (v: string) => void, placeholder: string, type?: string }) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 px-1">{icon} {label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm focus:border-cyan-500/50 outline-none transition-all placeholder:text-gray-700 font-medium" />
    </div>
  );
}

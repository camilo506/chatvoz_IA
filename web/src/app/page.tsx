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

function looksLikeImageRequest(text: string): boolean {
  const t = text.toLowerCase();
  const hints = [
    'dibuja',
    'genera una imagen',
    'genera imagen',
    'pinta',
    'crea una imagen',
    'crea una image',
    'crea imagen',
    'ilustra',
    'ilustración',
    'ilustracion',
  ];
  return hints.some((h) => t.includes(h));
}

/** Frases cortas para la voz al terminar una imagen (una al azar, suena menos robótico). */
const IMAGE_READY_VOICE_PHRASES = [
  "Listo, ya tienes la imagen.",
  "Hecho. Ahí la tienes en pantalla.",
  "Ya está, échale un vistazo cuando quieras.",
  "Aquí tienes el resultado.",
  "Terminé. Mira la imagen arriba.",
  "Generación lista.",
  "Va, ya puedes verla.",
  "Ya está renderizada, fíjate.",
  "Listo. Espero que te guste el resultado.",
  "Toma, ya la tienes ahí.",
  "Ya puedes ver la imagen en el chat.",
  "Listo el encargo; revisa la imagen.",
  "Salió bien. Aquí la dejo.",
  "Ya está. Si quieres, la editas después.",
  "Listo, versión nueva ahí.",
  "Así ha quedado el cambio.",
  "Ya está la imagen, cuéntame qué tal.",
] as const;

function pickImageReadyVoicePhrase(): string {
  const list = IMAGE_READY_VOICE_PHRASES;
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Cuadro de escritura del chat: el “rectángulo” grande. El borde pasa a rojo al enfocar (`focus-within`).
 *  Menos rojo: `focus-within:border-red-500/25` · Sin rojo al foco: quita todo `focus-within:border-*` */
const CHAT_COMPOSER_CLASS =
  'relative group bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-red-500/40 transition-all p-2';

/** Botón rojo “Enviar” (dentro del cuadro de chat). Tamaño: edita esta cadena.
 *  Más fino: `pl-3 pr-2.5 py-1 text-[9px] ... gap-1 rounded-md` · Más grande: `pl-6 pr-5 py-2.5 text-xs ... gap-2 rounded-xl` */
const CHAT_ENVIAR_BUTTON_CLASS =
  'pl-4 pr-3.5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-[11px] font-black uppercase tracking-widest text-white shadow-sm shadow-red-900/30 transition-all duration-300 border border-red-500/80 hover:border-white/80 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed leading-none';

/** Tamaño del icono avión (lucide Send), en px — suele ir un poco menor que el texto */
const CHAT_ENVIAR_ICON_SIZE = 14;

/** Fila avatar+burbuja cuando hay imagen: misma anchura en nube y local (coincide con Pollinations 1024² en servidor). */
const CHAT_ASSISTANT_IMAGE_ROW_CLASS =
  'flex gap-4 min-w-0 w-full max-w-[min(92vw,28rem)]';

/** Marco alrededor de la imagen generada en el chat. */
const CHAT_ASSISTANT_IMAGE_FRAME_CLASS =
  'mx-auto w-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/30';

/** <img> generada: alto máx. de visualización (único criterio nube/local). */
const CHAT_ASSISTANT_IMAGE_IMG_CLASS =
  'mx-auto block h-auto w-full max-h-[min(48vh,420px)] object-contain sm:max-h-[min(52vh,480px)]';

export default function OpenBotDashboard() {
  const [activeTab, setActiveTab] = useState<'chat' | 'agents' | 'settings'>('chat');
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [aiMode, setAiMode] = useState<'local' | 'cloud'>('cloud');
  const [messages, setMessages] = useState<any[]>([]);
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
  const fullTranscriptRef = useRef("");
  
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
  const [agents, setAgents] = useState<any>({});
  const [activeAgent, setActiveAgent] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [newAgentInstructions, setNewAgentInstructions] = useState("");
  const [selectedOutput, setSelectedOutput] = useState<string | number>("");
  const [audioInputs, setAudioInputs] = useState<any[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | number>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab, isSending]);

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
      
      // Limpiar markdown para que la voz no pronuncie "asterisco", etc.
      const cleanText = text
        .replace(/\*\*/g, "") // Negritas
        .replace(/\*/g, "")   // Cursivas
        .replace(/#/g, "")    // Títulos
        .replace(/`/g, "")    // Código
        .replace(/\[|\]/g, "") // Corchetes
        .replace(/\(|\)/g, "") // Paréntesis (opcional, pero ayuda a la fluidez)
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
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
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'es-ES';
        
        rec.onresult = (event: any) => {
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript + " ";
            }
          }
          fullTranscriptRef.current += final;
        };
        
        rec.onend = () => {
          // No hacemos nada aquí para que no se detenga solo, 
          // solo se detendrá cuando el usuario llame a recognition.stop()
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

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_BASE}/agents`);
      const data = await res.json();
      setAgents(data.agents);
      setActiveAgent(data.active);
    } catch (err) {
      console.error("Error cargando agentes:", err);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentInstructions) return;
    try {
      const res = await fetch(`${API_BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName,
          role: newAgentRole,
          instructions: newAgentInstructions
        })
      });
      if (res.ok) {
        setNewAgentName("");
        setNewAgentRole("");
        setNewAgentInstructions("");
        fetchAgents();
      }
    } catch (err) {
      console.error("Error creando agente:", err);
    }
  };

  const handleActivateAgent = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/agents/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchAgents();
        // Clear messages locally when switching agents
        setMessages([]);
        fetch(`${API_BASE}/new-session`, { method: 'POST' });
      }
    } catch (err) {
      console.error("Error activando agente:", err);
    }
  };

  const handleDeleteAgent = async (name: string) => {
    try {
      await fetch(`${API_BASE}/agents/${name}`, { method: 'DELETE' });
      fetchAgents();
    } catch (err) {
      console.error("Error eliminando agente:", err);
    }
  };

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

  const addMessage = (role: 'user' | 'assistant', content: string, opts?: { image?: string }) => {
    const newMessage: {
      role: 'user' | 'assistant';
      content: string;
      time: string;
      image?: string;
    } = {
      role,
      content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    if (opts?.image) newMessage.image = opts.image;
    setMessages((prev) => [...prev, newMessage]);
  };

  const processCommands = (text: string): boolean => {
    const lowerText = text.toLowerCase().trim();
    
    // Comandos de Voz
    if (lowerText.includes("activa la voz") || lowerText.includes("activar voz") || lowerText.includes("pon la voz")) {
      setIsVoiceEnabled(true);
      addMessage('assistant', "¡Entendido! He activado mi sistema de voz.");
      speak("¡Entendido! He activado mi sistema de voz.");
      return true;
    }
    if (lowerText.includes("desactiva la voz") || lowerText.includes("desactivar voz") || lowerText.includes("quitar la voz") || lowerText.includes("cállate")) {
      setIsVoiceEnabled(false);
      stopSpeaking();
      addMessage('assistant', "Voz desactivada. Seguiré respondiendo solo por texto.");
      return true;
    }

    // Comandos de Modo IA
    if (lowerText.includes("modo local") || lowerText.includes("usa ollama") || lowerText.includes("pon ia local")) {
      setAiMode('local');
      addMessage('assistant', "Cambiando a Inteligencia Local (Ollama).");
      speak("Cambiando a Inteligencia Local.");
      return true;
    }
    if (lowerText.includes("modo nube") || lowerText.includes("usa groq") || lowerText.includes("pon ia nube")) {
      setAiMode('cloud');
      addMessage('assistant', "Cambiando a Inteligencia en la Nube (Groq).");
      speak("Cambiando a Inteligencia en la Nube.");
      return true;
    }

    // Comandos de Agentes
    if (lowerText.includes("cambia al agente") || lowerText.includes("usa el agente") || lowerText.includes("activa al agente")) {
      // Intentar extraer el nombre del agente
      const parts = lowerText.split("agente");
      if (parts.length > 1) {
        const targetName = parts[1].trim();
        // Buscar coincidencia en la lista de agentes (ignorando mayúsculas/minúsculas)
        const foundName = Object.keys(agents).find(name => name.toLowerCase() === targetName);
        if (foundName) {
          handleActivateAgent(foundName);
          addMessage('assistant', `Cambiando identidad al agente: ${foundName}`);
          speak(`Cambiando identidad al agente ${foundName}`);
          return true;
        }
      }
    }

    // Comando de Hardware / Componentes
    if (lowerText.includes("componentes") || lowerText.includes("hardware") || lowerText.includes("dime mi pc")) {
      const fetchSystemInfo = async () => {
        try {
          const res = await fetch(`${API_BASE}/system-info`);
          const data = await res.json();
          if (data.info) {
            addMessage('assistant', data.info);
            speak(data.info);
          }
        } catch (err) {
          addMessage('assistant', "Lo siento, no pude acceder a la información de tu sistema.");
        }
      };
      fetchSystemInfo();
      return true;
    }

    // Comando Universal de Creación de Carpetas
    if (lowerText.includes("crea una carpeta") || lowerText.includes("crear carpeta")) {
      const createFolder = async () => {
        let name = "Nueva Carpeta";
        let path = "escritorio";
        let content = "";

        // Intento de extracción por lenguaje natural (Súper Robusto)
        if (lowerText.includes(" en ")) {
          const parts = lowerText.split(" en ");
          // "crea una carpeta [Nombre] en [Ruta]"
          name = parts[0].split("carpeta")[1]?.replace(/llamada|con nombre/g, "").trim() || "Nueva Carpeta";
          path = parts[1].split(" y pon")[0].trim();
        } else {
          // "crea una carpeta [Nombre]" -> Por defecto en Escritorio
          name = lowerText.split("carpeta")[1]?.replace(/llamada|con nombre/g, "").trim() || "Nueva Carpeta";
          path = "escritorio";
        }
        
        // Limpiar el nombre de puntos finales o espacios extra
        name = name.replace(/\.$/, "").trim();
        if (!name) name = "Nueva Carpeta";

        if (lowerText.includes("y pon") || lowerText.includes("con la info")) {
          content = "info_del_pc";
        }

        try {
          const res = await fetch(`${API_BASE}/create-folder-anywhere`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path, content })
          });
          const data = await res.json();
          if (data.status === "success") {
            addMessage('assistant', data.message);
            speak(data.message);
          } else {
            addMessage('assistant', data.error);
            speak(data.error);
          }
        } catch (err) {
          addMessage('assistant', "Error de conexión al crear la carpeta.");
        }
      };
      createFolder();
      return true;
    }

    return false; // No es un comando, continuar con el chat normal
  };

  const handleSend = async (textOverride?: string) => {
    const message = textOverride || inputText;
    if (!message.trim() || isSending) return;

    setInputText("");
    addMessage('user', message);

    // Revisar si es un comando antes de enviar a la IA
    if (processCommands(message)) return;

    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: message,
          mode: aiModeRef.current,
          provider: localProviderRef.current,
          url: localUrlRef.current,
          model: localModelRef.current,
          cloud_key: cloudApiKeyRef.current,
          image_base64: attachedImage
        })
      });
      const data = await res.json();
      if (data.error) {
        addMessage('assistant', `⚠️ ${data.error}`);
        console.error("Error del servidor:", data.error);
      } else {
        const hasImage = Boolean(data.image);
        const text = typeof data.response === "string" ? data.response : "";
        if (text || hasImage) {
          addMessage("assistant", text, hasImage ? { image: data.image } : undefined);
          if (hasImage) {
            speak(pickImageReadyVoicePhrase());
          } else if (text) {
            speak(text);
          }
          setAttachedImage(null);
        }
      }
    } catch (error) { console.error("Error al enviar mensaje:", error); }
    finally { setIsSending(false); }
  };

  const toggleMic = () => {
    if (!isRecording) {
      if (recognition) {
        try {
          fullTranscriptRef.current = ""; // Limpiar antes de empezar
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
        // Esperar un momento a que terminen de llegar los últimos resultados
        setTimeout(() => {
          if (fullTranscriptRef.current.trim().length > 0) {
            handleSend(fullTranscriptRef.current.trim());
            fullTranscriptRef.current = "";
          }
        }, 300);
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-[#e0e0e0] font-sans selection:bg-red-500/30">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*" />
      
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
            <SidebarItem icon={<Layers size={18} />} label="Gestión de Agentes" active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
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
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black">
              <img
                src="/recursos/LogoIA.png"
                alt="Monkey Studio"
                className="h-full w-full origin-center scale-[1.55] object-contain"
              />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white truncate">Monkey Studio</span>
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
                  className={`p-1.5 rounded-full transition-all duration-300 ${aiMode === 'local' ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'text-gray-600 hover:text-gray-400'}`}
                  title="Modo Local"
                >
                  <Server size={16} />
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

              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">ACTIVO</span>
                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{activeAgent}</span>
              </div>

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
              
              <span
                className="hidden lg:inline-block w-[5.75rem] shrink-0 truncate text-center text-[9px] font-black uppercase tracking-widest text-gray-600 px-2"
                title={aiMode === 'local' ? localProvider : cloudProvider}
              >
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
              {messages.map((msg, i) => {
                const assistantWithImage = msg.role === 'assistant' && Boolean(msg.image);
                return (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div
                    className={`${assistantWithImage ? CHAT_ASSISTANT_IMAGE_ROW_CLASS : 'flex gap-4 max-w-[85%]'} ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border shadow-lg ${
                      msg.role === 'user' ? 'bg-red-600/20 border-red-500/20 text-red-500' : 'bg-[#1a1a1a] border-white/5 text-gray-500'
                    }`}>
                      {msg.role === 'user' ? 'U' : 'A'}
                    </div>
                    <div className={`flex flex-col min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'} ${assistantWithImage ? 'w-full' : ''}`}>
                      <div className={`shadow-xl overflow-hidden ${assistantWithImage ? 'w-full' : ''} ${
                        msg.role === 'user' 
                          ? 'bg-[#1a1111] text-white rounded-2xl rounded-tr-none border border-red-500/10' 
                          : assistantWithImage
                            ? 'bg-[#151515] text-gray-300 rounded-2xl border border-white/5'
                            : 'bg-[#151515] text-gray-300 rounded-2xl rounded-tl-none border border-white/5'
                      }`}>
                        {msg.content && !msg.image ? (
                          <div className="p-5 text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                        ) : null}
                        {msg.image ? (
                          <div className="p-3 w-full min-w-0">
                            <div className={CHAT_ASSISTANT_IMAGE_FRAME_CLASS}>
                              <img
                                src={msg.image}
                                alt="Imagen generada"
                                className={CHAT_ASSISTANT_IMAGE_IMG_CLASS}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-3 gap-3">
                              <button
                                type="button"
                                onClick={() => setAttachedImage(msg.image!)}
                                className="text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-gray-200 transition-colors"
                              >
                                Editar
                              </button>
                              <a
                                href={msg.image}
                                download={`openbot-${msg.time?.replace(/:/g, '-') || 'imagen'}.png`}
                                className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-gray-500 hover:text-white border border-transparent hover:border-white/10 transition-colors"
                              >
                                Descargar
                              </a>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 mt-2 px-1 uppercase tracking-tighter">{msg.time}</span>
                    </div>
                  </div>
                </div>
                );
              })}
              {isSending &&
                messages.length > 0 &&
                messages[messages.length - 1].role === 'user' &&
                looksLikeImageRequest(messages[messages.length - 1].content) && (
                  <div className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className={CHAT_ASSISTANT_IMAGE_ROW_CLASS}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border shadow-lg bg-[#1a1a1a] border-white/5 text-gray-500">
                        A
                      </div>
                      <div className="flex flex-col items-start min-w-0 w-full">
                        <div className="rounded-2xl border border-white/5 bg-[#151515] p-6 w-full max-w-[min(92vw,28rem)] min-h-[180px] shadow-xl">
                          <p className="text-sm font-medium text-white mb-5 tracking-tight">Creando imagen</p>
                          <div className="grid grid-cols-10 gap-2 opacity-35">
                            {Array.from({ length: 50 }).map((_, j) => (
                              <div key={j} className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            <div className={CHAT_COMPOSER_CLASS}>
              {/* Preview de Imagen Adjunta */}
              {attachedImage && (
                <div className="mb-2 p-3 flex items-center gap-3 bg-black/40 rounded-xl border border-white/5 animate-in slide-in-from-top-2 duration-300">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-red-500/30 shrink-0">
                    <img src={attachedImage} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setAttachedImage(null)}
                      className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white hover:bg-red-500 transition-all shadow-lg"
                    >
                      <RotateCcw size={10} className="rotate-45" />
                    </button>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Imagen Adjunta</span>
                    <span className="text-[9px] text-gray-500 font-bold">Lista para editar o procesar</span>
                  </div>
                </div>
              )}

              <div className="relative flex min-h-[52px] items-center gap-2 px-2 py-2">
                <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Pregunta lo que sea en modo ${aiMode === 'local' ? 'Local' : 'Nube'}...`}
                  rows={1}
                  className={`relative z-0 min-h-[44px] max-h-[min(30vh,200px)] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 text-sm leading-normal outline-none transition-all ${
                    isRecording
                      ? 'text-gray-200 placeholder:text-gray-600'
                      : 'text-transparent caret-white placeholder:text-transparent'
                  }`}
                />
                {!isRecording && (
                  <div className="pointer-events-none absolute inset-y-2 left-2 right-[calc(7.5rem+0.5rem)] flex items-center overflow-hidden text-sm leading-normal text-gray-600">
                    {inputText.length === 0 ? (
                      <span className="truncate">{`Pregunta lo que sea en modo ${aiMode === 'local' ? 'Local' : 'Nube'}...`}</span>
                    ) : (
                      <span className="whitespace-pre-wrap break-words text-gray-200">{inputText}</span>
                    )}
                  </div>
                )}
                {isRecording && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    aria-live="polite"
                    aria-label={`Grabando, duración ${formatTime(recordingTime)}`}
                  >
                    <span className="text-3xl font-black leading-none tracking-tight text-red-400 tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-4xl">
                      {formatTime(recordingTime)}
                    </span>
                  </div>
                )}
                <div className="relative z-20 flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-500 hover:text-white hover:bg-black/40 rounded-lg transition-all duration-300 border-2 border-transparent hover:border-white"
                    title="Adjuntar imagen"
                  >
                    <Paperclip size={17} />
                  </button>
                  <button 
                    onClick={toggleMic} 
                    className={`p-2 rounded-lg transition-all duration-300 border-2 ${isRecording ? 'text-red-500 bg-red-500/10 border-red-500/50 animate-pulse' : 'text-gray-500 border-transparent hover:text-white hover:bg-black/40 hover:border-white'}`}
                    title={isRecording ? "Detener Grabación" : "Grabar Audio"}
                  >
                    {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <button 
                    onClick={() => handleSend()} 
                    disabled={isSending || !inputText.trim()} 
                    className={CHAT_ENVIAR_BUTTON_CLASS}
                  >
                    {isSending ? 'Enviando' : 'Enviar'} <Send size={CHAT_ENVIAR_ICON_SIZE} className={isSending ? 'animate-ping' : ''} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center mt-2 gap-6 opacity-30 select-none">
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-2"><Network size={10} /> Latencia: 42ms</span>
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-2"><Cpu size={10} /> Load: 12%</span>
            </div>
          </div>
        ) : activeTab === 'agents' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <div className="max-w-5xl mx-auto space-y-12">
              <header className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-600/20 rounded-2xl text-red-500 border border-red-500/20 shadow-inner">
                    <Layers size={24} />
                  </div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Gestión de Agentes</h2>
                </div>
                <p className="text-sm font-bold text-gray-500 tracking-[0.2em] uppercase ml-1">Diseña y despliega personalidades de IA a medida</p>
              </header>

              {/* Formulario Crear Agente */}
              <div className="bg-[#111] border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all duration-700">
                  <Cpu size={180} />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1 flex items-center gap-2">
                      <Brain size={14} /> Nombre del Agente
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: Programador Python"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white outline-none focus:border-red-500/50 transition-all placeholder:text-gray-700 font-bold"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1 flex items-center gap-2">
                      <Zap size={14} /> Rol / Especialidad
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: Senior Developer"
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white outline-none focus:border-red-500/50 transition-all placeholder:text-gray-700 font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1 flex items-center gap-2">
                    <Settings size={14} /> Instrucciones de Sistema (System Prompt)
                  </label>
                  <textarea 
                    placeholder="Describe detalladamente cómo debe comportarse, qué tono usar y cuáles son sus objetivos principales..."
                    value={newAgentInstructions}
                    onChange={(e) => setNewAgentInstructions(e.target.value)}
                    className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:border-red-500/50 transition-all placeholder:text-gray-700 font-bold min-h-[160px] resize-none leading-relaxed"
                  />
                </div>

                <button 
                  onClick={handleCreateAgent}
                  className="w-full py-5 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 rounded-2xl text-xs font-black uppercase tracking-[0.4em] text-white transition-all border border-white/10 hover:border-white shadow-2xl active:scale-[0.98] flex items-center justify-center gap-4"
                >
                  <Cpu size={18} /> Construir Agente Maestro
                </button>
              </div>

              {/* Lista de Agentes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {Object.entries(agents).map(([name, data]: [string, any]) => (
                  <div key={name} className={`bg-gradient-to-br from-[#121212] to-[#0a0a0a] border rounded-[2rem] p-8 transition-all duration-500 group relative ${activeAgent === name ? 'border-red-500/50 shadow-[0_0_40px_rgba(220,38,38,0.1)]' : 'border-white/5 hover:border-white/10'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 ${activeAgent === name ? 'bg-red-600/20 border-red-500/20 text-red-500 shadow-inner' : 'bg-black border-white/10 text-gray-700 group-hover:text-gray-400'}`}>
                          <Brain size={24} />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-white uppercase tracking-wider">{name}</h3>
                          <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{data.role}</span>
                        </div>
                      </div>
                      {activeAgent === name && (
                        <div className="px-3 py-1 bg-red-600/10 border border-red-600/20 rounded-full">
                          <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter">EN EJECUCIÓN</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="relative mb-8 h-24">
                      <p className="text-xs text-gray-500 font-bold leading-relaxed line-clamp-4 italic">"{data.instructions}"</p>
                      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                    </div>
                    
                    <div className="flex gap-3 relative z-10">
                      <button 
                        onClick={() => handleActivateAgent(name)}
                        className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeAgent === name ? 'bg-red-600 text-white cursor-default shadow-lg shadow-red-900/40' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white border border-white/5'}`}
                      >
                        {activeAgent === name ? 'Identidad Cargada' : 'Activar Agente'}
                      </button>
                      {name !== "OpenBot Original" && (
                        <button 
                          onClick={() => handleDeleteAgent(name)}
                          className="p-3.5 bg-white/5 hover:bg-red-600/20 text-gray-700 hover:text-red-500 rounded-xl transition-all border border-white/5 hover:border-red-500/20"
                          title="Eliminar Agente"
                        >
                          <RotateCcw size={16} className="rotate-45" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

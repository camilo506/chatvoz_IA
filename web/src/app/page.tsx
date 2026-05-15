"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Plus,
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
  Square,
  X,
  FileText,
} from 'lucide-react';


const API_BASE = "http://localhost:8000";

/** Id estable para `<label htmlFor>` — evita fallos con `input{display:none}` en algunos navegadores. */
const OPENBOT_CHAT_FILE_INPUT_ID = "openbot-chat-file-input";

const LS_KB_SNIPPETS = "openbot_knowledge_snippets";
const LS_KB_USE = "openbot_knowledge_use_in_chat";
const LS_KB_INJECT = "openbot_knowledge_inject";

type MainTab =
  | "dashboard"
  | "chat"
  | "agents"
  | "settings"
  | "localModels"
  | "cloudServices"
  | "knowledge";

type KbSnippet = { id: string; title: string; body: string; created: string };

type ChatBubbleAttachment = { dataUrl: string; name: string; isImage: boolean };
type ChatComposerAttachment = ChatBubbleAttachment & { id: string };

const ATTACH_MAX_FILES = 12;
const ATTACH_MAX_BYTES_PER_FILE = 8 * 1024 * 1024;

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fileExtensionBadge(filename: string): string {
  const m = /\.([^.]+)$/i.exec(filename);
  const raw = (m?.[1] ?? "").toUpperCase();
  return raw.slice(0, 14) || "ARCHIVO";
}

/** MIME vacío es habitual en algunos SO/navegadores; HEIC/HEIF suele no pintarse en Chrome. */
function guessIsImageFile(file: File): boolean {
  const t = (file.type ?? "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "heif", "tif", "tiff"].includes(ext);
}

function DataUrlImagePreview({
  src,
  className,
  fallbackClassName,
  label,
}: {
  src: string;
  className?: string;
  fallbackClassName?: string;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/60 px-1 text-center text-[9px] font-semibold leading-tight text-gray-400 ${fallbackClassName ?? ""}`}
      >
        Vista previa no disponible ({label})
      </div>
    );
  }
  return (
    <img src={src} alt="" className={className} onError={() => setFailed(true)} decoding="async" />
  );
}

function looksLikeImageRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  const hints = [
    'generame una imagen',
    'genera una imagen',
    'muéstrame una imagen',
    'muestrame una imagen',
    'necesito una imagen',
    'quiero una imagen',
    'hazme una imagen',
    'haz una imagen',
    'dame una imagen',
    'creo una imagen',
    'crea una imagen',
    'creo imagen',
    'crea imagen',
    'crea una image',
    'generame imagen',
    'genera imagen',
    'haz un dibujo',
    'hazme un dibujo',
    'dibujame',
    'dibújame',
    'dibuja',
    'pintame',
    'pinta',
    'ilustra',
    'ilustración',
    'ilustracion',
    'diseña una imagen',
    'diseña imagen',
  ];
  if (hints.some((h) => t.includes(h))) return true;

  const pad = ` ${t.replace(/\s+/g, ' ')} `;
  const hasSubject =
    pad.includes(' una imagen ') ||
    pad.includes(' imagen de ') ||
    pad.includes(' imagen del ') ||
    pad.includes(' un dibujo ') ||
    pad.includes(' una ilustración ') ||
    pad.includes(' una ilustracion ') ||
    pad.includes(' ilustración de ') ||
    pad.includes(' ilustracion de ');
  if (!hasSubject) return false;
  const markers = [
    ' dibuja',
    ' dibujame',
    ' genera',
    ' generame',
    ' crea ',
    ' creo ',
    ' crees',
    ' creas',
    ' haz ',
    ' hazme',
    ' haz una',
    ' pinta',
    ' ilustra',
    ' diseña',
    ' disena',
    ' muestrame',
    ' muéstrame',
    ' dame ',
    ' quiero ',
    ' necesito ',
  ];
  return markers.some((m) => pad.includes(m));
}

/** Pedidos de edición típicos cuando hay foto adjunta (alinea con el servidor img2img). */
function looksLikeAttachedImageEdit(text: string): boolean {
  const t = text.toLowerCase().trim();
  const markers = [
    "cambia",
    "cambiar",
    "cambiale",
    "modifica",
    "modificá",
    "editar",
    "edita",
    "ajusta",
    "reemplaza",
    "transforma",
    "convierte",
    "pon la",
    "pon el",
    "ponle",
    "color ",
    "camisa",
    "camiseta",
    "pantal",
    "pelo",
    "ojos",
    "fondo",
    " a azul",
    " a rojo",
    " a verde",
    "de azul",
    "de rojo",
    "igual pero",
    "esta imagen",
    "esta foto",
    "haz que",
    "que sea",
    "teñ",
    "tiñ",
    "pinte",
  ];
  return markers.some((m) => t.includes(m));
}

function showsPendingImageJob(content: string, hasImageAttachment: boolean): boolean {
  return looksLikeImageRequest(content) || (hasImageAttachment && looksLikeAttachedImageEdit(content));
}

/** Coincide el texto reconocido por voz con una clave de agente en `agents.json`. */
function resolveAgentNameFromVoiceFragment(fragment: string, agentKeys: string[]): string | null {
  let f = fragment
    .toLowerCase()
    .trim()
    .replace(/^[¿¡]+/, '')
    .replace(/[.!?¿¡,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(por favor|ahora|gracias|vale|venga)\s*$/i, '')
    .trim();
  if (!f) return null;
  const nospace = f.replace(/\s+/g, '');
  for (const orig of agentKeys) {
    const low = orig.toLowerCase();
    if (low === f) return orig;
    if (low.replace(/\s+/g, '') === nospace) return orig;
  }
  const token0 = f.split(/\s+/)[0]?.replace(/[.!?]+$/g, '') ?? '';
  if (token0) {
    for (const orig of agentKeys) {
      if (orig.toLowerCase() === token0) return orig;
    }
  }
  for (const orig of agentKeys) {
    const low = orig.toLowerCase();
    if (f.includes(low)) return orig;
  }
  if (f.length >= 3) {
    for (const orig of agentKeys) {
      const low = orig.toLowerCase();
      if (low.includes(f)) return orig;
    }
  }
  return null;
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
 *  Menos rojo: `focus-within:border-red-500/25` · Sin rojo al foco: quita todo `focus-within:border-*`
 *  Sin `overflow-hidden` vertical para no recortar miniaturas cuando el flex comprime el panel. */
const CHAT_COMPOSER_CLASS =
  'relative group bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-x-auto overflow-y-visible focus-within:border-red-500/40 transition-all p-2';

/** Botón rojo “Enviar” (dentro del cuadro de chat). Tamaño: edita esta cadena.
 *  Más fino: `pl-3 pr-2.5 py-1 text-[9px] ... gap-1 rounded-md` · Más grande: `pl-6 pr-5 py-2.5 text-xs ... gap-2 rounded-xl` */
const CHAT_ENVIAR_BUTTON_CLASS =
  'pl-4 pr-3.5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-[11px] font-black uppercase tracking-widest text-white shadow-sm shadow-red-900/30 transition-all duration-300 border border-red-500/80 hover:border-white/80 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed leading-none';

/** Tamaño del icono avión (lucide Send), en px — suele ir un poco menor que el texto */
const CHAT_ENVIAR_ICON_SIZE = 14;

/** Fila avatar+burbuja cuando hay imagen: misma anchura en nube y local (coincide con Pollinations 1024² en servidor). */
const CHAT_ASSISTANT_IMAGE_ROW_CLASS =
  'flex flex-col gap-2 min-w-0 w-full max-w-[min(92vw,28rem)] items-start';

/** Marco alrededor de la imagen generada en el chat. */
const CHAT_ASSISTANT_IMAGE_FRAME_CLASS =
  'mx-auto w-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/30';

/** <img> generada: alto máx. de visualización (único criterio nube/local). */
const CHAT_ASSISTANT_IMAGE_IMG_CLASS =
  'mx-auto block h-auto w-full max-h-[min(48vh,420px)] object-contain sm:max-h-[min(52vh,480px)]';

/** Marca de agua del logo OpenBot (ícono Cpu), mismo detalle que en Gestión de Agentes */
function OpenBotWatermark({
  size = 180,
  className = "p-8 opacity-5 group-hover:opacity-10",
}: {
  size?: number;
  /** p.ej. `p-4 opacity-[0.04] group-hover:opacity-[0.09]` en tarjetas pequeñas */
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute right-0 top-0 z-0 transition-opacity duration-700 ${className}`}
      aria-hidden
    >
      <Cpu size={size} className="text-red-600" />
    </div>
  );
}

export default function OpenBotDashboard() {
  const [activeTab, setActiveTab] = useState<MainTab>("chat");
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
  const [composerAttachments, setComposerAttachments] = useState<ChatComposerAttachment[]>([]);
  const composerAttachmentsRef = useRef<ChatComposerAttachment[]>([]);
  /** Encadena lecturas para que varias selecciones seguidas no pisen el estado (React tras await). */
  const ingestChainRef = useRef(Promise.resolve());

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  const patchComposerAttachments = useCallback(
    (updater: (prev: ChatComposerAttachment[]) => ChatComposerAttachment[]) => {
      setComposerAttachments((prev) => {
        const next = updater(prev);
        composerAttachmentsRef.current = next;
        return next;
      });
    },
    [],
  );

  const [dashboardApi, setDashboardApi] = useState<{ ok: boolean; name: string } | null>(null);
  const [dashboardApiAt, setDashboardApiAt] = useState('');
  const [dashboardSystem, setDashboardSystem] = useState('');

  const [ollamaModels, setOllamaModels] = useState<{ name: string; size?: number; modified_at?: string }[]>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState("");
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);

  const [kbSnippets, setKbSnippets] = useState<KbSnippet[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KB_SNIPPETS) : null;
      if (raw) return JSON.parse(raw) as KbSnippet[];
    } catch {
      /* ignore */
    }
    return [];
  });
  const [kbUseInChat, setKbUseInChat] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(LS_KB_USE) === "1" : false
  );
  const [kbInjectMap, setKbInjectMap] = useState<Record<string, boolean>>(() => {
    try {
      const inj = typeof window !== "undefined" ? localStorage.getItem(LS_KB_INJECT) : null;
      if (inj) return JSON.parse(inj) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    return {};
  });
  const [kbDraftTitle, setKbDraftTitle] = useState("");
  const [kbDraftBody, setKbDraftBody] = useState("");

  const loadDashboardData = async () => {
    setDashboardApiAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        setDashboardApi({ ok: true, name: typeof data.name === 'string' ? data.name : 'OpenBot' });
      } else {
        setDashboardApi({ ok: false, name: '' });
      }
    } catch {
      setDashboardApi({ ok: false, name: '' });
    }
    try {
      const res = await fetch(`${API_BASE}/system-info`);
      const data = await res.json();
      setDashboardSystem(typeof data.info === 'string' ? data.info.replace(/\*\*/g, '') : '');
    } catch {
      setDashboardSystem('No se pudo cargar la información del sistema.');
    }
    fetchAgents();
  };

  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    loadDashboardData();
    const id = setInterval(loadDashboardData, 12000);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KB_SNIPPETS, JSON.stringify(kbSnippets));
    } catch {
      /* ignore */
    }
  }, [kbSnippets]);

  useEffect(() => {
    localStorage.setItem(LS_KB_USE, kbUseInChat ? "1" : "0");
  }, [kbUseInChat]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KB_INJECT, JSON.stringify(kbInjectMap));
    } catch {
      /* ignore */
    }
  }, [kbInjectMap]);

  const fetchOllamaModels = async () => {
    setOllamaModelsLoading(true);
    setOllamaModelsError("");
    try {
      const base = localUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOllamaModels(Array.isArray(data.models) ? data.models : []);
    } catch (e: unknown) {
      setOllamaModels([]);
      setOllamaModelsError(e instanceof Error ? e.message : "Sin conexión");
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "localModels") return;
    fetchOllamaModels();
  }, [activeTab, localUrl]);

  const appendComposerFiles = useCallback((picked: File[]) => {
    if (!picked.length) return ingestChainRef.current;

    const run = async () => {
      const room = ATTACH_MAX_FILES - composerAttachmentsRef.current.length;
      if (room <= 0) {
        window.alert(`Máximo ${ATTACH_MAX_FILES} archivos en borrador.`);
        return;
      }

      let files = picked.slice(0, room);
      const tooBig = files.filter((f) => f.size > ATTACH_MAX_BYTES_PER_FILE);
      files = files.filter((f) => f.size <= ATTACH_MAX_BYTES_PER_FILE);
      if (tooBig.length) {
        window.alert(
          `Se omitieron ${tooBig.length} archivo(s) mayores de ${ATTACH_MAX_BYTES_PER_FILE / (1024 * 1024)} MB.`,
        );
      }
      if (!files.length) return;

      const readOne = (file: File) =>
        new Promise<ChatComposerAttachment>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => {
            if (r.error) {
              reject(r.error);
              return;
            }
            const dataUrl = r.result as string | null;
            if (!dataUrl || !dataUrl.startsWith("data:")) {
              reject(new Error("lectura vacía o incompleta"));
              return;
            }
            resolve({
              id: newAttachmentId(),
              dataUrl,
              name: file.name || "archivo",
              isImage: guessIsImageFile(file),
            });
          };
          r.onerror = () => reject(r.error ?? new Error("FileReader"));
          try {
            r.readAsDataURL(file);
          } catch (err) {
            reject(err);
          }
        });

      const settled = await Promise.allSettled(files.map(readOne));
      const newOnes = settled
        .filter((s): s is PromiseFulfilledResult<ChatComposerAttachment> => s.status === "fulfilled")
        .map((s) => s.value);

      const failed = settled.length - newOnes.length;
      if (failed > 0) {
        console.warn("[adjuntos] Archivos omitidos por error de lectura:", failed);
      }
      if (!newOnes.length) {
        window.alert(
          "No se pudieron leer los archivos (permiso denegado o formato no soportado). Prueba otras imágenes o otra carpeta.",
        );
        return;
      }

      patchComposerAttachments((prev) =>
        [...prev, ...newOnes].slice(0, ATTACH_MAX_FILES),
      );
    };

    ingestChainRef.current = ingestChainRef.current.then(run).catch((err) => {
      console.error("[adjuntos] Error en cola de archivos:", err);
    });
    return ingestChainRef.current;
  }, [patchComposerAttachments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    const batch = list?.length ? Array.from(list) : [];
    e.target.value = "";
    if (!batch.length) return;
    void appendComposerFiles(batch);
  };

  const handleComposerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleComposerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer.files;
    if (!dt?.length) return;
    void appendComposerFiles(Array.from(dt));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab, isSending, composerAttachments]);

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
          const base = localUrl.replace(/\/$/, '');
          const res = await fetch(`${base}/api/tags`);
          setIsLocalConnected(res.ok);
        } catch {
          setIsLocalConnected(false);
        }
      }
    };
    checkLocal();
    const interval = setInterval(checkLocal, 5000);
    return () => clearInterval(interval);
  }, [aiMode, localUrl]);

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

  const addMessage = (
    role: 'user' | 'assistant',
    content: string,
    opts?: { image?: string; agentName?: string; attachments?: ChatBubbleAttachment[] },
  ) => {
    const newMessage: {
      role: 'user' | 'assistant';
      content: string;
      time: string;
      image?: string;
      agentName?: string;
      attachments?: ChatBubbleAttachment[];
    } = {
      role,
      content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    if (opts?.attachments?.length) newMessage.attachments = opts.attachments;
    if (opts?.image) newMessage.image = opts.image;
    if (role === 'assistant') {
      newMessage.agentName = (opts?.agentName ?? activeAgent).trim() || 'Asistente';
    }
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

    // Comandos de Agentes (voz y texto): cambiar de agente por frase natural
    const agentKeys = Object.keys(agents);
    const trySwitchAgent = (fragment: string, notFoundMessage: boolean): boolean => {
      const foundName = resolveAgentNameFromVoiceFragment(fragment, agentKeys);
      if (foundName) {
        void handleActivateAgent(foundName);
        addMessage('assistant', `Cambiando identidad al agente: ${foundName}`);
        speak(`Cambiando identidad al agente ${foundName}`);
        return true;
      }
      if (notFoundMessage) {
        addMessage(
          'assistant',
          `No encontré un agente con ese nombre. Disponibles: ${agentKeys.length ? agentKeys.join(', ') : '(ninguno)'}.`
        );
        speak('No encontré ese agente en la lista.');
        return true;
      }
      return false;
    };

    const highConfidenceAgentPatterns: RegExp[] = [
      /(?:cambia|usa|activa|activar|cambiar|pasar)\s+al\s+agente\s+(.+)$/i,
      /(?:cambia|usa|activa|activar)\s+(?:a|el)\s+agente\s+(.+)$/i,
      /hablar\s+con\s+el\s+agente\s+(.+)$/i,
      /hablar\s+con\s+agente\s+(.+)$/i,
      /quiero\s+hablar\s+con\s+el\s+agente\s+(.+)$/i,
      /quiero\s+hablar\s+con\s+agente\s+(.+)$/i,
      /(?:pon|ponme|dame)\s+(?:el\s+)?agente\s+(.+)$/i,
    ];
    for (const re of highConfidenceAgentPatterns) {
      const m = lowerText.match(re);
      if (m?.[1]?.trim()) {
        return trySwitchAgent(m[1].trim(), true);
      }
    }

    // Sin la palabra "agente": solo cambia si el nombre coincide con un agente real (evita falsos positivos)
    const looseAgentPatterns: RegExp[] = [
      /quiero\s+hablar\s+con\s+(.+)$/i,
      /(?:me\s+gustaría|me\s+gustaria)\s+hablar\s+con\s+(.+)$/i,
    ];
    for (const re of looseAgentPatterns) {
      const m = lowerText.match(re);
      if (m?.[1]?.trim()) {
        if (trySwitchAgent(m[1].trim(), false)) return true;
        break;
      }
    }

    if (
      lowerText.includes('cambia al agente') ||
      lowerText.includes('usa el agente') ||
      lowerText.includes('activa al agente')
    ) {
      const parts = lowerText.split('agente');
      if (parts.length > 1) {
        const tail = parts[parts.length - 1].trim();
        if (tail) return trySwitchAgent(tail, true);
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

  const buildKnowledgeAugmentedMessage = (userText: string) => {
    if (!kbUseInChat || !kbSnippets.length) return userText;
    const selected = kbSnippets.filter((s) => kbInjectMap[s.id]);
    if (!selected.length) return userText;
    let block = selected.map((s) => `### ${s.title}\n${s.body}`).join("\n\n");
    const max = 6000;
    if (block.length > max) block = `${block.slice(0, max)}\n[…truncado]`;
    return `${userText}\n\n---\nContexto interno (base de conocimiento; úsalo solo si es relevante):\n${block}`;
  };

  const handleSend = async (textOverride?: string) => {
    const message = textOverride || inputText;
    const trimmed = message.trim();
    const attachSnap = [...composerAttachments];
    if ((!trimmed && attachSnap.length === 0) || isSending) return;

    const bubbleParts: ChatBubbleAttachment[] = attachSnap.map(({ dataUrl, name, isImage }) => ({
      dataUrl,
      name,
      isImage,
    }));

    setInputText("");
    patchComposerAttachments(() => []);
    addMessage(
      "user",
      trimmed,
      bubbleParts.length ? { attachments: bubbleParts } : undefined,
    );

    // Revisar si es un comando antes de enviar a la IA
    if (processCommands(trimmed)) return;

    setIsSending(true);
    try {
      const imageDataUrls = attachSnap.filter((a) => a.isImage).map((a) => a.dataUrl);
      const docNames = attachSnap.filter((a) => !a.isImage).map((a) => a.name);

      let textForApi =
        trimmed ||
        (imageDataUrls.length
          ? "El usuario ha adjuntado una o más imágenes; responde según el contexto del agente si aplica."
          : "El usuario ha adjuntado archivo(s); responde según el contexto del agente si aplica.");

      if (docNames.length) {
        textForApi += `\n\n[Adjuntos (${docNames.length} archivo(s); el servidor solo recibe nombre y tamaño desde el navegador, no el contenido): ${docNames.join(", ")}]`;
      }

      const outboundMessage = buildKnowledgeAugmentedMessage(textForApi);

      const body: Record<string, unknown> = {
        message: outboundMessage,
        mode: aiModeRef.current,
        provider: localProviderRef.current,
        url: localUrlRef.current,
        model: localModelRef.current,
        cloud_key: cloudApiKeyRef.current,
        image_base64: imageDataUrls[0] ?? null,
      };
      if (imageDataUrls.length > 1) {
        body.image_base64_list = imageDataUrls;
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(240_000),
        body: JSON.stringify(body),
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
        }
      }
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      const isTimeout =
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (isTimeout) {
        addMessage(
          "assistant",
          "⚠️ La petición tardó demasiado (p. ej. generando una imagen a 1024px). Reintenta o revisa Forge/Pollinations y el servidor Python."
        );
      }
    }
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
            <SidebarItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <SidebarItem icon={<MessageSquare size={18} />} label="Chat de IA" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
            <SidebarItem icon={<Layers size={18} />} label="Gestión de Agentes" active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
            <SidebarItem icon={<Clock size={18} />} label="Historial" />
          </SidebarSection>
          
          <SidebarSection title="IA & Modelos">
            <SidebarItem icon={<Brain size={18} />} label="Modelos Locales" active={activeTab === 'localModels'} onClick={() => setActiveTab('localModels')} />
            <SidebarItem icon={<Cloud size={18} />} label="Servicios Cloud" active={activeTab === 'cloudServices'} onClick={() => setActiveTab('cloudServices')} />
            <SidebarItem icon={<Database size={18} />} label="Base de Conocimiento" active={activeTab === 'knowledge'} onClick={() => setActiveTab('knowledge')} />
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
            <h2 className="text-sm font-bold text-gray-400">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'chat' && 'Chat de IA'}
              {activeTab === 'agents' && 'Gestión de Agentes'}
              {activeTab === 'settings' && 'Configuración'}
              {activeTab === 'localModels' && 'Modelos locales'}
              {activeTab === 'cloudServices' && 'Servicios cloud'}
              {activeTab === 'knowledge' && 'Base de conocimiento'}
            </h2>
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

        {activeTab === 'dashboard' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative group min-h-0">
            <OpenBotWatermark size={188} className="p-6 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div className="max-w-6xl mx-auto space-y-8 relative z-[1]">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight">Panel general</h1>
                  <p className="text-sm text-gray-500 mt-2 font-bold tracking-wide">
                    Estado del núcleo OpenBot, conexiones y atajos a la sesión actual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDashboardData()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                >
                  <RotateCcw size={14} /> Actualizar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">API Python</span>
                    {dashboardApi?.ok ? (
                      <CheckCircle2 className="text-green-500" size={20} />
                    ) : (
                      <AlertCircle className="text-red-500" size={20} />
                    )}
                  </div>
                  <p className="text-lg font-black text-white">{dashboardApi?.ok ? (dashboardApi.name || 'En línea') : 'Sin conexión'}</p>
                  <p className="text-[11px] text-gray-500 mt-2 font-mono">{API_BASE}</p>
                  <p className="text-[10px] text-gray-600 mt-3 uppercase tracking-tighter">Comprobado: {dashboardApiAt || '—'}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Modo IA</span>
                    {aiMode === 'local' ? <Server size={20} className="text-cyan-400" /> : <Cloud size={20} className="text-cyan-400" />}
                  </div>
                  <p className="text-lg font-black text-white">{aiMode === 'local' ? 'Local' : 'Nube'}</p>
                  <p className="text-[11px] text-gray-500 mt-2 font-bold">{aiMode === 'local' ? localProvider : cloudProvider}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${aiMode === 'local' ? (isLocalConnected ? 'bg-green-500' : 'bg-red-500') : isCloudConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {aiMode === 'local' ? (isLocalConnected ? 'Motor local OK' : 'Motor local no responde') : isCloudConnected ? 'Clave Groq lista' : 'Falta clave Groq'}
                    </span>
                  </div>
                  {aiMode === 'local' && (
                    <p className="text-[10px] text-gray-600 mt-2 font-mono truncate" title={localUrl}>
                      {localUrl} · {localModel}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Agente</span>
                    <Users size={20} className="text-gray-500" />
                  </div>
                  <p className="text-lg font-black text-white truncate" title={activeAgent}>
                    {activeAgent || '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2">{Object.keys(agents).length} agente(s) en el sistema</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('agents')}
                    className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Gestionar agentes
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl md:col-span-2 xl:col-span-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Sesión de chat</span>
                    <MessageSquare size={20} className="text-gray-500" />
                  </div>
                  <p className="text-lg font-black text-white">{messages.length} mensaje(s)</p>
                  <p className="text-[11px] text-gray-500 mt-2">Incluye la conversación visible en la pestaña Chat.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className="mt-4 w-full rounded-xl bg-red-600/90 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-500 transition-colors border border-red-500/50"
                  >
                    Ir al chat
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={18} className="text-gray-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Imágenes generadas</span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4">
                    Para generar una imagen real (no solo texto), escribe en el chat frases como{' '}
                    <span className="text-white font-bold">«dibuja …»</span>, <span className="text-white font-bold">«crea una imagen de …»</span> o{' '}
                    <span className="text-white font-bold">«creo una imagen de …»</span>. Imágenes en nube usan Pollinations (clave aparte en el servidor); en local hace falta Forge en el puerto 7860.
                  </p>
                  {(() => {
                    const lastImg = [...messages].reverse().find((m) => m.role === 'assistant' && m.image);
                    if (!lastImg?.image) {
                      return <p className="text-[11px] text-gray-600 italic">Aún no hay imagen en esta sesión.</p>;
                    }
                    return (
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <img src={lastImg.image} alt="Última generada" className="h-28 w-auto max-w-[200px] rounded-lg border border-white/10 object-contain bg-black/40" />
                        <button
                          type="button"
                          onClick={() => setActiveTab('chat')}
                          className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300"
                        >
                          Ver en el chat →
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl xl:col-span-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu size={18} className="text-gray-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Equipo (servidor Python)</span>
                  </div>
                  <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-medium">{dashboardSystem || 'Cargando…'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="rounded-xl border border-white/10 bg-[#151515] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:border-white/20 hover:text-white transition-colors"
                >
                  Configuración
                </button>
                <button
                  type="button"
                  onClick={() => void fetch(`${API_BASE}/new-session`, { method: 'POST' }).then(() => setMessages([]))}
                  className="rounded-xl border border-white/10 bg-[#151515] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:border-white/20 hover:text-white transition-colors"
                >
                  Nueva sesión (limpiar chat)
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'chat' ? (
          <div className="flex-1 flex flex-col p-8 overflow-hidden relative group min-h-0">
            <OpenBotWatermark size={176} className="p-5 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div ref={scrollRef} className="relative z-[1] flex-1 overflow-y-auto space-y-8 pr-4 mb-6 custom-scrollbar scroll-smooth">
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
                    className={`${assistantWithImage ? CHAT_ASSISTANT_IMAGE_ROW_CLASS : 'flex flex-col gap-2 max-w-[85%]'} ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`rounded-xl flex items-center justify-center shrink-0 border shadow-lg ${
                      msg.role === 'user'
                        ? 'w-10 h-10 overflow-hidden px-0.5 bg-red-600/20 border-red-500/20 text-red-500'
                        : 'min-h-10 w-fit max-w-full px-3 py-1.5 bg-[#1a1a1a] border-white/5 text-gray-400'
                    }`}>
                      {msg.role === 'user' ? (
                        <span className="text-[11px] font-black leading-none">Tú</span>
                      ) : (
                        <span
                          className="block max-w-[min(92vw,18rem)] truncate text-center text-[10px] font-black leading-tight"
                          title={msg.agentName || activeAgent}
                        >
                          {msg.agentName || activeAgent || 'Asistente'}
                        </span>
                      )}
                    </div>
                    <div className={`flex flex-col min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'} ${assistantWithImage ? 'w-full' : ''}`}>
                      <div className={`shadow-xl overflow-hidden ${assistantWithImage ? 'w-full' : ''} ${
                        msg.role === 'user' 
                          ? 'bg-[#1a1111] text-white rounded-2xl border border-red-500/10' 
                          : assistantWithImage
                            ? 'bg-[#151515] text-gray-300 rounded-2xl border border-white/5'
                            : 'bg-[#151515] text-gray-300 rounded-2xl border border-white/5'
                      }`}>
                        {msg.role === 'user' ? (
                          <>
                            {msg.attachments && msg.attachments.length > 0 ? (
                              <div
                                className={`max-w-full overflow-x-auto px-3 pt-3 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 ${
                                  msg.content?.trim() ? "pb-2" : "pb-3"
                                }`}
                              >
                                <div className="ml-auto flex w-max max-w-none flex-nowrap justify-end gap-2.5">
                                  {msg.attachments.map((a: ChatBubbleAttachment, ix: number) =>
                                    a.isImage ? (
                                      <div
                                        key={`${a.name}-${ix}`}
                                        className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black/50 shadow-md ring-1 ring-black/30"
                                      >
                                        <DataUrlImagePreview
                                          src={a.dataUrl}
                                          label={a.name}
                                          className="block h-full w-full object-cover"
                                          fallbackClassName="flex min-h-[4.5rem] w-full items-center justify-center px-1 py-2 text-[9px] leading-tight"
                                        />
                                      </div>
                                    ) : (
                                    <a
                                      key={`${a.name}-${ix}`}
                                      href={a.dataUrl}
                                      download={a.name}
                                      className="relative flex h-[72px] min-w-[180px] max-w-[260px] shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-gradient-to-br from-red-950/40 to-black/60 px-3 py-2 shadow-md ring-1 ring-black/25 transition hover:border-white/25"
                                    >
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-inner">
                                        <FileText size={18} strokeWidth={2} />
                                      </span>
                                      <span className="min-w-0 flex-1 text-left">
                                        <span className="block truncate text-[11px] font-bold leading-tight text-white">
                                          {a.name}
                                        </span>
                                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                                          {fileExtensionBadge(a.name)}
                                        </span>
                                      </span>
                                    </a>
                                  ),
                                )}
                                </div>
                              </div>
                            ) : msg.image ? (
                              <div className={`p-3 ${msg.content?.trim() ? 'pb-0' : ''}`}>
                                <div className="ml-auto max-w-[min(280px,82vw)] overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                  <DataUrlImagePreview
                                    src={msg.image}
                                    label="imagen"
                                    className="block max-h-[min(40vh,360px)] w-full object-contain"
                                    fallbackClassName="min-h-[100px] w-full py-8"
                                  />
                                </div>
                              </div>
                            ) : null}
                            {msg.content?.trim() ? (
                              <div
                                className={`p-5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                  msg.attachments?.length || msg.image ? 'pt-3' : ''
                                }`}
                              >
                                {msg.content}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
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
                                onClick={() =>
                                  msg.image &&
                                  patchComposerAttachments(() => [
                                    {
                                      id: newAttachmentId(),
                                      dataUrl: msg.image,
                                      name: "imagen-openbot.png",
                                      isImage: true,
                                    },
                                  ])
                                }
                                className="text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-gray-200 transition-colors"
                              >
                                Editar
                              </button>
                              <a
                                href={msg.image}
                                download={`openbot-${msg.time?.replace(/:/g, '-') || 'imagen'}.png`}
                                title="Descarga la imagen a tu equipo cuando quieras (no se guarda sola)"
                                className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-gray-500 hover:text-white border border-transparent hover:border-white/10 transition-colors"
                              >
                                Descargar
                              </a>
                            </div>
                          </div>
                            ) : null}
                          </>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 mt-2 px-1 uppercase tracking-tighter">{msg.time}</span>
                    </div>
                  </div>
                </div>
                );
              })}
              {isSending &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "user" &&
                showsPendingImageJob(
                  messages[messages.length - 1].content,
                  Boolean(messages[messages.length - 1].attachments?.some((x: ChatBubbleAttachment) => x.isImage)),
                ) && (
                  <div className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className={CHAT_ASSISTANT_IMAGE_ROW_CLASS}>
                      <div className="min-h-10 w-fit max-w-full px-3 py-1.5 rounded-xl flex items-center justify-center shrink-0 border shadow-lg bg-[#1a1a1a] border-white/5 text-gray-400">
                        <span
                          className="block max-w-[min(92vw,18rem)] truncate text-center text-[10px] font-black leading-tight"
                          title={activeAgent}
                        >
                          {activeAgent || '…'}
                        </span>
                      </div>
                      <div className="flex flex-col items-start min-w-0 w-full">
                        <div className="rounded-2xl border border-white/5 bg-[#151515] p-6 w-full max-w-[min(92vw,28rem)] min-h-[180px] shadow-xl">
                          <p className="text-sm font-medium text-white mb-5 tracking-tight">
                            Generando o editando imagen…
                          </p>
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

            <div
              className={`relative z-[1] shrink-0 min-h-0 ${CHAT_COMPOSER_CLASS}`}
              onDragEnter={handleComposerDragOver}
              onDragOver={handleComposerDragOver}
              onDrop={handleComposerDrop}
            >
              <input
                id={OPENBOT_CHAT_FILE_INPUT_ID}
                ref={fileInputRef}
                type="file"
                multiple
                tabIndex={-1}
                className="openbot-sr-file-input"
                onChange={handleFileChange}
              />

              {composerAttachments.length > 0 ? (
                <div className="mb-2 flex gap-2.5 overflow-x-auto overflow-y-visible px-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
                  {composerAttachments.map((att) =>
                    att.isImage ? (
                      <div
                        key={att.id}
                        className="relative h-[72px] w-[72px] shrink-0 overflow-visible rounded-xl border border-white/15 bg-zinc-950 shadow-lg ring-1 ring-black/40"
                      >
                        <div className="relative h-full w-full overflow-hidden rounded-xl">
                          <DataUrlImagePreview
                            src={att.dataUrl}
                            label={att.name}
                            className="h-full w-full object-cover"
                            fallbackClassName="h-full min-h-[4.5rem] w-full"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            patchComposerAttachments((prev) =>
                              prev.filter((p) => p.id !== att.id),
                            )
                          }
                          className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-md ring-2 ring-[#111] transition hover:bg-gray-100"
                          title="Quitar adjunto"
                          aria-label={`Quitar ${att.name}`}
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={att.id}
                        className="relative flex h-[72px] min-w-[180px] max-w-[260px] shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-gradient-to-br from-red-950/60 to-black/70 px-3 py-2 pr-8 shadow-lg ring-1 ring-black/30"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-inner">
                          <FileText size={18} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 flex flex-col gap-0.5 text-left leading-tight">
                          <span className="truncate text-[11px] font-bold text-gray-100">
                            {att.name}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                            {fileExtensionBadge(att.name)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            patchComposerAttachments((prev) =>
                              prev.filter((p) => p.id !== att.id),
                            )
                          }
                          className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-md ring-2 ring-[#111] transition hover:bg-gray-100"
                          title="Quitar archivo"
                          aria-label={`Quitar ${att.name}`}
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              ) : null}

              <div className="relative flex min-h-[52px] items-start gap-2 px-1 py-2 sm:items-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition hover:bg-white/10 hover:text-white sm:mt-0"
                  title="Añadir imágenes u otros archivos"
                  aria-label="Añadir archivos"
                >
                  <Plus size={22} strokeWidth={2} aria-hidden />
                </button>
                <div className="relative min-h-[44px] min-w-0 flex-1">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Pregunta lo que quieras"
                    rows={1}
                    className={`relative z-0 min-h-[44px] w-full max-h-[min(30vh,200px)] resize-none overflow-y-auto bg-transparent py-2 pr-1 text-sm leading-normal outline-none transition-all ${
                      isRecording
                        ? "text-gray-200 placeholder:text-gray-600"
                        : "text-transparent caret-white placeholder:text-transparent"
                    }`}
                  />
                  {!isRecording && (
                    <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden py-2 text-sm leading-normal text-gray-500">
                      {inputText.length === 0 ? (
                        <span className="truncate">Pregunta lo que quieras</span>
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
                      <span className="text-2xl font-black leading-none tracking-tight text-red-400 tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-3xl">
                        {formatTime(recordingTime)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="relative z-20 mt-1 flex shrink-0 items-center gap-1 sm:mt-0">
                  <button
                    onClick={toggleMic}
                    className={`p-2 rounded-lg transition-all duration-300 border-2 ${isRecording ? "text-red-500 bg-red-500/10 border-red-500/50 animate-pulse" : "text-gray-500 border-transparent hover:text-white hover:bg-black/40 hover:border-white"}`}
                    title={isRecording ? "Detener Grabación" : "Grabar Audio"}
                  >
                    {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={
                      isSending || (!inputText.trim() && composerAttachments.length === 0)
                    }
                    className={CHAT_ENVIAR_BUTTON_CLASS}
                  >
                    {isSending ? "Enviando" : "Enviar"}{" "}
                    <Send size={CHAT_ENVIAR_ICON_SIZE} className={isSending ? "animate-ping" : ""} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="relative z-[1] flex justify-center mt-2 gap-6 opacity-30 select-none">
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
                <OpenBotWatermark />
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
                  <div key={name} className={`group relative overflow-hidden bg-gradient-to-br from-[#121212] to-[#0a0a0a] border rounded-[2rem] p-8 transition-all duration-500 ${activeAgent === name ? 'border-red-500/50 shadow-[0_0_40px_rgba(220,38,38,0.1)]' : 'border-white/5 hover:border-white/10'}`}>
                    <OpenBotWatermark size={120} className="p-4 opacity-[0.04] group-hover:opacity-[0.09]" />
                    <div className="relative z-[1] flex justify-between items-start mb-6">
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
                    
                    <div className="relative z-[1] mb-8 h-24">
                      <p className="text-xs text-gray-500 font-bold leading-relaxed line-clamp-4 italic">"{data.instructions}"</p>
                      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                    </div>
                    
                    <div className="relative z-[1] flex gap-3">
                      <button 
                        onClick={() => handleActivateAgent(name)}
                        className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeAgent === name ? 'bg-red-600 text-white cursor-default shadow-lg shadow-red-900/40' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white border border-white/5'}`}
                      >
                        {activeAgent === name ? 'Identidad Cargada' : 'Activar Agente'}
                      </button>
                      {name !== "OpenBot" && (
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
        ) : activeTab === 'settings' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-12 relative group min-h-0">
            <OpenBotWatermark size={184} className="p-6 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div className="relative z-[1]">
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
          </div>
        ) : activeTab === 'localModels' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative group min-h-0">
            <OpenBotWatermark size={176} className="p-6 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div className="max-w-4xl mx-auto space-y-8 relative z-[1]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight">Modelos locales</h1>
                  <p className="text-sm text-gray-500 mt-2 font-mono truncate" title={localUrl}>{localUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchOllamaModels()}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:bg-white/10 shrink-0"
                >
                  <RotateCcw size={14} /> Refrescar
                </button>
              </div>
              <p className="text-xs text-gray-500 font-bold">
                Lista desde la API compatible con Ollama. El modelo activo del chat se elige aquí o en Configuración.
              </p>
              {ollamaModelsLoading && <p className="text-sm text-gray-400">Cargando modelos…</p>}
              {ollamaModelsError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{ollamaModelsError}</div>
              )}
              {!ollamaModelsLoading && !ollamaModelsError && ollamaModels.length === 0 && (
                <p className="text-sm text-gray-600">No se encontraron modelos en este endpoint.</p>
              )}
              <div className="space-y-2">
                {ollamaModels.map((m) => (
                  <div key={m.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{m.name}</p>
                      <p className="text-[10px] text-gray-600 font-mono">
                        {m.size != null && Number.isFinite(m.size) ? `${(m.size / 1024 ** 3).toFixed(1)} GB` : '—'}
                        {m.modified_at ? ` · ${new Date(m.modified_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLocalModel(m.name);
                        setAiMode('local');
                      }}
                      className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-200 hover:bg-purple-600/30"
                    >
                      Usar modelo
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="text-[11px] font-bold text-red-400 hover:text-red-300 uppercase tracking-wider"
              >
                Editar URL y proveedor →
              </button>
            </div>
          </div>
        ) : activeTab === 'cloudServices' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative group min-h-0">
            <OpenBotWatermark size={176} className="p-6 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div className="max-w-4xl mx-auto space-y-8 relative z-[1]">
              <h1 className="text-3xl font-black text-white uppercase tracking-tight">Servicios cloud</h1>
              <p className="text-sm text-gray-500 font-bold">Qué servicios externos usa OpenBot en modo nube.</p>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-cyan-500/25 bg-[#111] p-6">
                  <Cloud className="text-cyan-400 mb-3" size={28} />
                  <h3 className="text-lg font-black text-white">Groq</h3>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Chat de texto (p. ej. Llama 3.3) vía el backend en <span className="font-mono text-gray-400">/chat</span>. La clave se guarda en Configuración.
                  </p>
                  <p className={`mt-4 text-[11px] font-black uppercase tracking-wider ${isCloudConnected ? 'text-green-500' : 'text-red-500'}`}>
                    {isCloudConnected ? 'Clave API configurada' : 'Falta la clave API'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="mt-4 w-full rounded-xl bg-cyan-600/90 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-cyan-500"
                  >
                    Abrir configuración
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#111] p-6">
                  <Network className="text-gray-500 mb-3" size={28} />
                  <h3 className="text-lg font-black text-white">Pollinations</h3>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Imágenes en nube: variable <span className="font-mono text-gray-400">POLLINATIONS_API_KEY</span> en el servidor Python. No es la misma clave que Groq.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'knowledge' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative group min-h-0">
            <OpenBotWatermark size={176} className="p-6 opacity-[0.06] group-hover:opacity-[0.11]" />
            <div className="max-w-3xl mx-auto space-y-8 relative z-[1]">
              <div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tight">Base de conocimiento</h1>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  Fragmentos guardados en este navegador. Si activas la opción, los marcados se añaden al cuerpo del mensaje enviado al chat (el historial visible sigue mostrando solo lo que escribes).
                </p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={kbUseInChat}
                  onChange={(e) => setKbUseInChat(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black accent-red-600"
                />
                <span className="text-sm font-bold text-gray-300">Incluir fragmentos marcados al enviar al chat</span>
              </label>
              <div className="rounded-2xl border border-white/10 bg-[#111] p-6 space-y-4">
                <ConfigInput
                  label="Título"
                  icon={<Database size={14} />}
                  value={kbDraftTitle}
                  onChange={setKbDraftTitle}
                  placeholder="Ej: Reglas del proyecto"
                />
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Contenido</label>
                  <textarea
                    value={kbDraftBody}
                    onChange={(e) => setKbDraftBody(e.target.value)}
                    placeholder="Procedimientos, glosario, contexto de producto…"
                    className="w-full min-h-[120px] rounded-2xl border border-white/5 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-red-500/40 placeholder:text-gray-700"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const t = kbDraftTitle.trim() || 'Sin título';
                    const b = kbDraftBody.trim();
                    if (!b) return;
                    const id =
                      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
                    setKbSnippets((prev) => [...prev, { id, title: t, body: b, created: new Date().toISOString() }]);
                    setKbInjectMap((m) => ({ ...m, [id]: true }));
                    setKbDraftTitle('');
                    setKbDraftBody('');
                  }}
                  className="w-full rounded-xl bg-red-600 py-3 text-[11px] font-black uppercase tracking-widest text-white hover:bg-red-500"
                >
                  Añadir fragmento
                </button>
              </div>
              <div className="space-y-3">
                {kbSnippets.map((s) => (
                  <div key={s.id} className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white">{s.title}</p>
                        <p className="text-[10px] text-gray-600 mt-1">{new Date(s.created).toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-2 line-clamp-4 whitespace-pre-wrap">{s.body}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-gray-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(kbInjectMap[s.id])}
                            onChange={(e) => setKbInjectMap((m) => ({ ...m, [s.id]: e.target.checked }))}
                            className="accent-red-600"
                          />
                          En chat
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setKbSnippets((p) => p.filter((x) => x.id !== s.id));
                            setKbInjectMap((m) => {
                              const n = { ...m };
                              delete n[s.id];
                              return n;
                            });
                          }}
                          className="text-left text-[10px] font-black uppercase text-red-500 hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {kbSnippets.length === 0 && (
                  <p className="text-sm text-gray-600 italic">Aún no hay fragmentos.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
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

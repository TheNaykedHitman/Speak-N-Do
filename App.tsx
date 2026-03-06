import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GoogleGenAI, 
  Modality, 
  Type,
  FunctionDeclaration 
} from '@google/genai';
import { 
  Mic, 
  MicOff, 
  Loader2, 
  Settings,
  X,
  Copy,
  Activity,
  Zap,
  Cpu,
  Terminal,
  ChevronRight,
  Layers,
  Key
} from 'lucide-react';

import TaskList from './components/TaskList';
import Visualizer from './components/Visualizer';
import { Task, ConnectionState, SavedLocations, Coordinates } from './types';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from './utils/audio';
import { generateSpeech, playAudioBuffer } from './services/geminiService';
import { fetchGoogleTasks, createGoogleTask, updateGoogleTask, deleteGoogleTask } from './services/googleTasksService';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Robust Env Var Helper supporting Vite and standard process.env
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

const addTaskTool: FunctionDeclaration = {
  name: 'addTask',
  description: 'Add a new task with optional metadata.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      dueDateTime: { type: Type.STRING },
      alarmTime: { type: Type.STRING },
      locationTrigger: { type: Type.STRING },
      recurrence: { 
        type: Type.STRING, 
        enum: ['daily', 'weekly', 'weekdays', 'monthly']
      }
    },
    required: ['description']
  }
};

const removeTaskTool: FunctionDeclaration = {
  name: 'removeTask',
  description: 'Remove tasks by keyword.',
  parameters: {
    type: Type.OBJECT,
    properties: { keyword: { type: Type.STRING } },
    required: ['keyword']
  }
};

const App: React.FC = () => {
  // Application State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0); 
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocations>({});
  const [logs, setLogs] = useState<string[]>(["SYSTEM: Projection standby..."]);
  
  // HUD/Auth State
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [manualApiKey, setManualApiKey] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [origin] = useState(window.location.origin);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const tokenClientRef = useRef<any>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[ANTIGRAVITY] ${msg}`);
  };

  // Initialization
  useEffect(() => {
    // Load config from local storage for persistence
    const envId = getEnvVar('GOOGLE_CLIENT_ID');
    const storedId = localStorage.getItem('gemini_google_client_id');
    if (envId) setGoogleClientId(envId);
    else if (storedId) setGoogleClientId(storedId);

    const storedKey = localStorage.getItem('gemini_api_key_manual');
    if (storedKey) setManualApiKey(storedKey);
    
    const savedLocs = localStorage.getItem('gemini-locations');
    if (savedLocs) setSavedLocations(JSON.parse(savedLocs));

    const savedTasks = localStorage.getItem('gemini-tasks');
    if (savedTasks && !accessToken) setTasks(JSON.parse(savedTasks));
    
    addLog(`Matrix initialized. Secure: ${window.isSecureContext}`);
  }, []);

  useEffect(() => localStorage.setItem('gemini-locations', JSON.stringify(savedLocations)), [savedLocations]);
  useEffect(() => localStorage.setItem('gemini-tasks', JSON.stringify(tasks)), [tasks]);

  useEffect(() => {
    if ((window as any).google && googleClientId && googleClientId !== 'YOUR_CLIENT_ID_HERE') {
      try {
        tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'https://www.googleapis.com/auth/tasks',
          callback: async (res: any) => {
            if (res.error) {
              addLog(`Auth Error: ${res.error}`);
              setErrorMessage(`Google Auth Error: ${res.error}`);
              return;
            }
            if (res.access_token) {
              setAccessToken(res.access_token);
              setIsSyncing(true);
              addLog("Cloud link established.");
              try {
                const gTasks = await fetchGoogleTasks(res.access_token);
                setTasks(gTasks);
              } catch (e) {
                addLog("Sync failed.");
              } finally {
                setIsSyncing(false);
              }
            }
          },
        });
      } catch (e) { addLog("Identity init failed."); }
    }
  }, [googleClientId]);

  const handleGoogleLogin = () => {
    if (tokenClientRef.current) {
      addLog("Requesting Auth Token...");
      tokenClientRef.current.requestAccessToken();
    } else {
      if (!googleClientId || googleClientId === 'YOUR_CLIENT_ID_HERE') {
        addLog("ERROR: Google Client ID not configured.");
        setErrorMessage("Google Client ID Required for Sync.");
      } else {
        addLog("ERROR: Google Identity Services not initialized.");
        setErrorMessage("Identity Service Error. Check Console.");
      }
      setShowSettings(true);
    }
  };

  const refreshTasks = async () => {
    if (!accessToken) return;
    setIsSyncing(true);
    addLog("Refreshing cloud tasks...");
    try {
      const gTasks = await fetchGoogleTasks(accessToken);
      setTasks(gTasks);
      addLog("Sync complete.");
    } catch (e) {
      addLog("Refresh failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => setCurrentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => addLog("GPS data obscured."), { enableHighAccuracy: true }
    );
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyFeedback("Copied!");
        setTimeout(() => setCopyFeedback(null), 2000);
        addLog("Address copied to neural cache.");
      } else {
        // Fallback for non-secure or projected contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopyFeedback("Copied!");
        setTimeout(() => setCopyFeedback(null), 2000);
        addLog("Address copied via legacy fallback.");
      }
    } catch (err) {
      addLog("Copy operation failed.");
      setCopyFeedback("Failed");
    }
  };

  const handleToolCall = useCallback(async (toolCall: any) => {
    const responses: any[] = [];
    for (const fc of toolCall.functionCalls) {
      addLog(`Tool trigger: ${fc.name}`);
      if (fc.name === 'addTask') {
        const newTask: Task = {
          id: crypto.randomUUID(),
          description: fc.args.description,
          dueDateTime: fc.args.dueDateTime || null,
          alarmTime: fc.args.alarmTime || null,
          locationTrigger: fc.args.locationTrigger || null,
          recurrence: fc.args.recurrence || null,
          completed: false,
          createdAt: new Date().toISOString()
        };
        if (accessToken) {
          const gId = await createGoogleTask(accessToken, newTask);
          if (gId) newTask.id = gId;
        }
        setTasks(prev => [...prev, newTask]);
        
        // Confirm with voice
        generateSpeech(`Added task: ${newTask.description}`, manualApiKey).then(buf => {
            if (buf && audioContextRef.current) playAudioBuffer(buf, audioContextRef.current);
        });

      } else if (fc.name === 'removeTask') {
        const keyword = fc.args.keyword.toLowerCase();
        const toRemove = tasks.filter(t => t.description.toLowerCase().includes(keyword));
        setTasks(prev => prev.filter(t => !t.description.toLowerCase().includes(keyword)));
        if (accessToken) toRemove.forEach(t => deleteGoogleTask(accessToken, t.id));
      }
      responses.push({ id: fc.id, name: fc.name, response: { status: 'synced' } });
    }
    return responses;
  }, [tasks, accessToken, manualApiKey]);

  const connect = async () => {
    // Prioritize manual key if set, otherwise fallback to env
    const apiKey = manualApiKey || getEnvVar('API_KEY');
    
    if (!apiKey) {
      addLog("CRITICAL: API_KEY missing.");
      setErrorMessage("API Key Required.");
      setShowSettings(true);
      return;
    }

    addLog("Opening Neural Link...");
    setConnectionState(ConnectionState.CONNECTING);
    setErrorMessage(null);
    
    // Explicitly handle AudioContext on user gesture
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      if (!inputContextRef.current) inputContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      // Ensure context is running (vital for Cloud Run/Chrome policies)
      await Promise.all([audioContextRef.current.resume(), inputContextRef.current.resume()]);
      
      addLog("Requesting Mic permissions...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            addLog("Link active. Audio uplink engaged.");
            setConnectionState(ConnectionState.CONNECTED);
            const source = inputContextRef.current!.createMediaStreamSource(stream);
            const processor = inputContextRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0; for(let i=0; i<inputData.length; i++) sum += inputData[i]**2;
              setVolume(Math.sqrt(sum/inputData.length));
              sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createPcmBlob(inputData) }));
            };
            source.connect(processor);
            processor.connect(inputContextRef.current!.destination);
          },
          onmessage: async (msg) => {
            if (msg.toolCall) {
              const res = await handleToolCall(msg.toolCall);
              sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: res }));
            }
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
              const source = ctx.createBufferSource();
              source.buffer = buffer; source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onclose: () => {
            addLog("Link severed.");
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            addLog("Uplink error occurred.");
            setConnectionState(ConnectionState.ERROR);
            setErrorMessage("Connection Error.");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are the Antigravity HUD Assistant. Be concise, technical, and helpful. Current Time: " + new Date().toLocaleTimeString(),
          tools: [{ functionDeclarations: [addTaskTool, removeTaskTool] }]
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (e: any) {
      addLog(`Init failed: ${e.message}`);
      setConnectionState(ConnectionState.ERROR);
      setErrorMessage(e.message || "Microphone access denied.");
    }
  };

  const disconnect = () => {
    addLog("Force reset requested.");
    window.location.reload(); 
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTasks(updated);
    if (accessToken) {
      const task = updated.find(t => t.id === id);
      if (task) updateGoogleTask(accessToken, task);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center">
      
      {/* HUD: Corner Readouts */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-40">
        <div className="glass-hud px-4 py-2 rounded-lg flex items-center gap-3 border-l-4 border-l-blue-500">
          <Activity size={16} className="text-blue-400" />
          <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">State: {connectionState}</span>
        </div>
        <div className="glass-hud px-4 py-2 rounded-lg flex items-center gap-3 border-l-4 border-l-emerald-500">
          <Zap size={16} className="text-emerald-400" />
          <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">Sync: {isSyncing ? 'ACTIVE' : 'READY'}</span>
        </div>
      </div>

      <div className="absolute top-6 right-6 flex flex-col items-end gap-2 z-40">
        <button onClick={() => setShowSettings(true)} className="glass-hud p-3 rounded-full text-slate-400 hover:text-white transition-all hover:scale-110">
          <Settings size={20} />
        </button>
      </div>

      {/* CENTER: The Core Controller */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-30">
        <div className="relative group">
          <div className={`absolute -inset-10 rounded-full blur-[80px] transition-all duration-1000 ${connectionState === ConnectionState.CONNECTED ? 'bg-blue-500/40 scale-150 animate-pulse' : 'bg-blue-500/10'}`} />
          
          <button
            onClick={connectionState === ConnectionState.CONNECTED ? disconnect : connect}
            disabled={connectionState === ConnectionState.CONNECTING}
            className={`relative w-40 h-40 rounded-full glass-hud flex items-center justify-center border-2 transition-all duration-500 ${
              connectionState === ConnectionState.CONNECTED ? 'border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.3)]' : 'border-blue-500 shadow-[0_0_50px_rgba(37,99,235,0.3)] hover:scale-105'
            }`}
          >
            {connectionState === ConnectionState.CONNECTING ? (
              <Loader2 className="animate-spin text-blue-400" size={48} />
            ) : connectionState === ConnectionState.CONNECTED ? (
              <MicOff size={48} className="text-red-400" />
            ) : (
              <Mic size={48} className="text-blue-400" />
            )}
            <div className={`absolute inset-2 border border-dashed rounded-full border-blue-500/20 ${connectionState === ConnectionState.CONNECTED ? 'animate-[spin_10s_linear_infinite]' : ''}`} />
          </button>
        </div>
        
        <div className="mt-8 w-64 h-12 flex items-center justify-center gap-4">
          <Visualizer isActive={volume > 0.05} />
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          {!accessToken ? (
            <div className="flex flex-col items-center gap-2">
              <button 
                onClick={handleGoogleLogin}
                className="glass-hud px-6 py-3 rounded-full text-[11px] font-black tracking-widest text-white uppercase hover:bg-blue-500/20 transition-all flex items-center gap-3 border border-blue-500/30 group"
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4 group-hover:scale-110 transition-transform" alt="Google" />
                Establish Cloud Link
              </button>
              {(!googleClientId || googleClientId === 'YOUR_CLIENT_ID_HERE') && (
                <span className="text-[9px] text-amber-400/60 uppercase tracking-tighter animate-pulse">Configuration Required in Settings</span>
              )}
            </div>
          ) : (
            <button 
              onClick={refreshTasks}
              disabled={isSyncing}
              className="glass-hud px-6 py-3 rounded-full text-[11px] font-black tracking-widest text-slate-300 uppercase hover:bg-white/10 transition-all flex items-center gap-3 border border-white/10"
            >
              {isSyncing ? <Loader2 size={14} className="animate-spin text-blue-400" /> : <Layers size={14} className="text-blue-400" />}
              Synchronize Matrix
            </button>
          )}
        </div>
        
        {errorMessage && (
            <div className="mt-4 px-6 py-2 glass-hud rounded-full border border-red-500/30 text-[10px] font-bold text-red-400 animate-bounce uppercase tracking-widest cursor-pointer hover:bg-red-500/10" onClick={() => setShowSettings(true)}>
                {errorMessage}
            </div>
        )}
      </div>

      {/* PERIPHERY: Task Ring */}
      <div className="absolute inset-0 z-20 overflow-y-auto px-4 py-24 md:px-24 flex flex-col items-center">
         <div className="w-full max-w-2xl mt-96 md:mt-[450px]">
            <div className="flex justify-between items-end mb-8 px-2">
              <div className="flex flex-col">
                <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none">Task Matrix</h2>
                <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <Activity size={10} className="text-blue-500" /> 
                  {tasks.filter(t => !t.completed).length} Active Nodes
                </div>
              </div>
              {accessToken && (
                <button 
                  onClick={refreshTasks}
                  disabled={isSyncing}
                  className="glass-hud p-3 rounded-xl text-slate-400 hover:text-blue-400 transition-all hover:scale-110 disabled:opacity-50"
                  title="Refresh Sync"
                >
                  <Layers size={20} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
            <TaskList 
              tasks={tasks} 
              onDelete={(id) => setTasks(t => t.filter(x => x.id !== id))} 
              onToggle={toggleTask} 
              onUpdate={(ut) => setTasks(t => t.map(x => x.id === ut.id ? ut : x))} 
            />
         </div>
      </div>

      {/* FOOTER: Log & Geo */}
      <div className="absolute bottom-6 w-full px-6 flex justify-between items-end z-40 pointer-events-none">
        <div className="glass-hud p-4 rounded-xl pointer-events-auto border-b-2 border-b-blue-500/50 w-64">
           <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-blue-400 tracking-widest uppercase">
              <Terminal size={12}/> System Console
           </div>
           <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-1 text-[9px] font-mono text-slate-500 truncate">
                  <ChevronRight size={10} className="mt-0.5 text-blue-500/30" /> {log}
                </div>
              ))}
           </div>
        </div>

        {currentCoords && (
          <div className="glass-hud px-4 py-2 rounded-lg text-[9px] font-mono text-slate-500 flex items-center gap-2">
            <Cpu size={12} />
            POS: {currentCoords.latitude.toFixed(4)}N / {currentCoords.longitude.toFixed(4)}W
          </div>
        )}
      </div>

      {/* SETTINGS OVERLAY */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-6">
          <div className="glass-hud w-full max-w-md p-8 rounded-3xl border-2 border-blue-500/30 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold flex items-center gap-2"><Layers className="text-blue-400"/> HUD CONFIG</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white"><X size={24}/></button>
            </div>
            
            <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Projection Origin</label>
                 <div className="bg-black/40 p-2 rounded-xl border border-white/5 flex items-center gap-2">
                    <input 
                        readOnly 
                        value={origin} 
                        className="bg-transparent flex-1 text-[11px] font-mono text-blue-300 outline-none px-2"
                        onClick={(e) => (e.target as HTMLInputElement).select()} 
                    />
                    <button 
                        onClick={() => copyToClipboard(origin)} 
                        className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex-shrink-0 relative"
                    >
                        <Copy size={16}/>
                        {copyFeedback && <span className="absolute -top-8 right-0 bg-blue-600 text-white text-[9px] px-2 py-1 rounded">{copyFeedback}</span>}
                    </button>
                 </div>
                 <p className="text-[9px] text-slate-500 px-1 italic">Add this to "Authorized JavaScript origins" in Google Cloud Console.</p>
               </div>
               
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Google Client ID</label>
                 <input 
                   type="text" 
                   className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-sm text-white focus:border-blue-500 outline-none"
                   placeholder="e.g. 12345-abcde.apps.googleusercontent.com"
                   value={googleClientId}
                   onChange={e => setGoogleClientId(e.target.value)}
                 />
               </div>

               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    Gemini API Key 
                    {getEnvVar('API_KEY') && <span className="text-green-500 text-[9px]">(Detected in Env)</span>}
                 </label>
                 <div className="relative">
                    <Key size={14} className="absolute left-3 top-3.5 text-slate-500"/>
                    <input 
                        type="password" 
                        className="w-full bg-black/40 border border-white/10 p-3 pl-9 rounded-xl text-sm text-white focus:border-blue-500 outline-none placeholder:text-slate-600"
                        placeholder="Manual override key (sk-...) "
                        value={manualApiKey}
                        onChange={e => setManualApiKey(e.target.value)}
                    />
                 </div>
               </div>

               <button 
                 onClick={() => { 
                    localStorage.setItem('gemini_google_client_id', googleClientId); 
                    if (manualApiKey) localStorage.setItem('gemini_api_key_manual', manualApiKey);
                    else localStorage.removeItem('gemini_api_key_manual');
                    setShowSettings(false); 
                    addLog("Parameters committed."); 
                 }}
                 className="w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold text-white transition-all shadow-lg shadow-blue-600/20 uppercase tracking-widest text-xs"
               >
                 COMMIT PARAMETERS
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
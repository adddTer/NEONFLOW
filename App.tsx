import React, { useState, useEffect, useRef } from 'react';
import { Music, Loader2, Settings, X, Key, ExternalLink, ArrowLeft, Play, Zap, BarChart, Hand, Keyboard, AlertTriangle, CheckCircle, Check, ChevronLeft } from 'lucide-react';
import { analyzeAudioDSP } from './utils/audioAnalyzer';
import { analyzeStructureWithGemini } from './services/geminiService';
import { generateBeatmap, calculateDifficultyRating } from './utils/beatmapGenerator';
import { saveSong, getAllSongs, parseSongImport, updateSongMetadata } from './services/storageService';
import { calculateGrade } from './utils/scoring';
import GameCanvas from './components/GameCanvas';
import { LibraryScreen } from './components/screens/LibraryScreen';
import { ResultScreen } from './components/screens/ResultScreen';
import { Note, GameStatus, ScoreState, AITheme, DEFAULT_THEME, SavedSong, BeatmapDifficulty, LaneCount, PlayStyle, GameResult } from './types';

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

function App() {
  const [status, setStatus] = useState<GameStatus>(GameStatus.Library);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [theme, setTheme] = useState<AITheme>(DEFAULT_THEME); 
  const [score, setScore] = useState<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
  const [songName, setSongName] = useState<string>("");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null); // Track ID for saving scores
  const [loadingStage, setLoadingStage] = useState<string>(""); 
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  
  // Library State
  const [librarySongs, setLibrarySongs] = useState<SavedSong[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isSongLoading, setIsSongLoading] = useState(false); 

  // Creation State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isConfiguringSong, setIsConfiguringSong] = useState(false);

  const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
  const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
  const [selectedDifficulty, setSelectedDifficulty] = useState<BeatmapDifficulty | null>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<'valid' | 'missing'>('missing');

  const hasEnvKey = !!process.env.API_KEY;

  useEffect(() => {
     if (hasEnvKey || customApiKey.trim().length > 0) {
         setApiKeyStatus('valid');
     } else {
         setApiKeyStatus('missing');
     }
  }, [customApiKey, hasEnvKey]);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    setIsLibraryLoading(true);
    try {
        const songs = await getAllSongs();
        setLibrarySongs(songs);
    } catch (e) {
        console.error("Failed to load library", e);
    } finally {
        setIsLibraryLoading(false);
    }
  };

  // --- Handlers ---

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setPendingFile(file);
    setSelectedDifficulty(null); 
    setIsConfiguringSong(true); 
    event.target.value = '';
  };

  const confirmGeneration = async () => {
      if (!pendingFile || !selectedDifficulty) return;
      handleCreateBeatmap(selectedDifficulty);
  };

  const cancelConfiguration = () => {
      setPendingFile(null);
      setIsConfiguringSong(false);
  };

  const handleCreateBeatmap = async (difficulty: BeatmapDifficulty) => {
    if (!pendingFile) return;
    
    const file = pendingFile;
    const laneCount = selectedLaneCount;
    const playStyle = selectedPlayStyle;

    setIsConfiguringSong(false);
    setPendingFile(null); 

    setStatus(GameStatus.Analyzing);
    setSongName(file.name.replace(/\.[^/.]+$/, ""));
    setErrorMessage(null);
    
    try {
      // 1. DSP Analysis
      setLoadingStage("正在聆听音乐节奏...");
      const arrayBuffer = await file.arrayBuffer();
      const audioCtxBuffer = arrayBuffer.slice(0); // Clone for audio context
      const saveBuffer = arrayBuffer.slice(0); // Clone for storage
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const { buffer, onsets } = await analyzeAudioDSP(audioCtxBuffer, audioContext);

      // 2. AI Analysis
      setLoadingStage("正在识别元数据与构思谱面...");
      let structure;
      let aiTheme = DEFAULT_THEME;
      let aiMetadata: { title?: string, artist?: string, album?: string } | undefined;

      if (apiKeyStatus === 'valid') {
          const base64String = await fileToBase64(file);
          const base64Data = base64String.split(',')[1];
          const aiResult = await analyzeStructureWithGemini(file.name, base64Data, file.type, customApiKey);
          structure = aiResult.structure;
          aiTheme = aiResult.theme;
          aiMetadata = aiResult.metadata;
      } else {
          throw new Error("API Key Missing");
      }

      // 3. Fusion
      setLoadingStage(`正在生成谱面 (${laneCount}K)...`);
      const finalNotes = generateBeatmap(onsets, structure as any, difficulty, laneCount, playStyle);
      
      if (finalNotes.length === 0) throw new Error("GenerativeFailure");

      const rating = calculateDifficultyRating(finalNotes, buffer.duration);

      // 4. Save to Library
      setLoadingStage("正在保存到曲库...");
      const newSong: SavedSong = {
          id: crypto.randomUUID(),
          title: aiMetadata?.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: aiMetadata?.artist || "未知艺术家",
          album: aiMetadata?.album,
          createdAt: Date.now(),
          duration: buffer.duration,
          audioData: saveBuffer,
          notes: finalNotes,
          structure: structure as any,
          theme: aiTheme,
          difficultyRating: rating,
          laneCount: laneCount
      };

      await saveSong(newSong);
      await loadLibrary();
      
      setStatus(GameStatus.Library);
      setLoadingStage("");

    } catch (error: any) {
      console.error("Error importing song:", error);
      setStatus(GameStatus.Library); 
      
      if (error.message && error.message.includes("GenerativeFailure")) {
          setErrorMessage("生成失败：无法提取有效节奏。");
      } else if (error.message === "API Key Missing") {
          setErrorMessage("生成失败：缺少 API Key。");
          setShowSettings(true);
      } else {
          setErrorMessage("导入出错，请检查文件格式。");
      }
    }
  };

  const handleImportMap = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = '';

      setLoadingStage("正在解析谱面包 (.nfz)...");
      setStatus(GameStatus.Analyzing);
      setErrorMessage(null);
      
      try {
          const song = await parseSongImport(file);
          setLoadingStage("正在保存...");
          await saveSong(song);
          await loadLibrary();
          setStatus(GameStatus.Library);
      } catch (e: any) {
          console.error("Import failed", e);
          setStatus(GameStatus.Library);
          alert(`导入失败: ${e.message || "未知错误"}`);
      }
  };

  const handleSelectSong = async (song: SavedSong) => {
      setIsSongLoading(true);
      setCurrentSongId(song.id);
      try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const decodedBuffer = await audioContext.decodeAudioData(song.audioData.slice(0));
          
          setAudioBuffer(decodedBuffer);
          setNotes(song.notes);
          setTheme(song.theme);
          setSongName(song.title);
          setStatus(GameStatus.Ready);
      } catch (e) {
          console.error("Failed to load song audio", e);
          setErrorMessage("加载歌曲音频失败");
      } finally {
          setIsSongLoading(false);
      }
  };

  const startCountdown = () => {
    setStatus(GameStatus.Countdown);
    setCountdown(3);
  };

  useEffect(() => {
    if (status === GameStatus.Countdown) {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setStatus(GameStatus.Playing);
        }
    }
  }, [status, countdown]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' && status === GameStatus.Ready && !showSettings && !isConfiguringSong) {
            e.preventDefault();
            startCountdown();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, showSettings, isConfiguringSong]);

  const handleGameEnd = async (finalScore?: ScoreState) => {
    setStatus(GameStatus.Finished);
    
    // Use passed score (from GameCanvas callback) or fallback to state
    const resultScore = finalScore || score;

    // Save high score if better
    if (currentSongId) {
        const song = librarySongs.find(s => s.id === currentSongId);
        if (song) {
            const total = notes.length;
            const { rank } = calculateGrade(resultScore.perfect, resultScore.good, resultScore.miss, total);
            
            // Check if this score is better
            const newResult: GameResult = {
                score: Math.floor(resultScore.score),
                maxCombo: resultScore.maxCombo,
                perfect: resultScore.perfect,
                good: resultScore.good,
                miss: resultScore.miss,
                rank: rank,
                timestamp: Date.now()
            };

            if (!song.bestResult || newResult.score > song.bestResult.score) {
                const updatedSong = { ...song, bestResult: newResult };
                await saveSong(updatedSong);
                await loadLibrary(); 
            }
        }
    }
  };

  const backToLibrary = () => {
    setStatus(GameStatus.Library);
    setScore({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
    setNotes([]);
    setAudioBuffer(null);
    setCurrentSongId(null);
    setLoadingStage("");
    setErrorMessage(null);
  };

  const replay = () => {
    startCountdown();
  };

  return (
    <div 
      className="min-h-screen w-full flex flex-col transition-colors duration-700 font-sans text-white select-none relative overflow-hidden"
      style={{ 
        background: status === GameStatus.Library 
            ? '#050505' 
            : `radial-gradient(circle at center, ${theme.secondaryColor}11 0%, #050505 100%)` 
      }}
    >
      {/* --- MODALS SECTION --- */}

      {/* 1. Song Configuration Modal */}
      {isConfiguringSong && pendingFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
                 <button onClick={cancelConfiguration} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                     <X className="w-6 h-6" />
                 </button>

                 <h1 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-3">
                     <Music className="w-6 h-6 text-neon-blue" />
                     配置新乐谱
                 </h1>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Options Column */}
                     <div className="space-y-6">
                         <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                             <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">SELECTED FILE</div>
                             <div className="text-lg font-bold text-white break-all line-clamp-2">{pendingFile.name}</div>
                         </div>

                         <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">按键模式</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSelectedLaneCount(4)} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedLaneCount === 4 ? 'bg-neon-blue border-neon-blue text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        4 Keys
                                    </button>
                                    <button onClick={() => setSelectedLaneCount(6)} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedLaneCount === 6 ? 'bg-neon-blue border-neon-blue text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        6 Keys
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">游玩风格</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSelectedPlayStyle('THUMB')} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedPlayStyle === 'THUMB' ? 'bg-white border-white text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        双指/拇指
                                    </button>
                                    <button onClick={() => setSelectedPlayStyle('MULTI')} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedPlayStyle === 'MULTI' ? 'bg-white border-white text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        多指/键盘
                                    </button>
                                </div>
                            </div>
                         </div>
                     </div>

                     {/* Difficulty Column */}
                     <div className="flex flex-col gap-3">
                         <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">选择难度</h3>
                         {[
                            { id: BeatmapDifficulty.Easy, label: 'Easy', desc: 'Relaxed', color: 'bg-green-500' },
                            { id: BeatmapDifficulty.Normal, label: 'Normal', desc: 'Standard', color: 'bg-blue-500' },
                            { id: BeatmapDifficulty.Hard, label: 'Hard', desc: 'Intense', color: 'bg-orange-500' },
                            { id: BeatmapDifficulty.Expert, label: 'Expert', desc: 'Extreme', color: 'bg-red-600' },
                         ].map((mode) => (
                             <button
                                key={mode.id}
                                onClick={() => setSelectedDifficulty(mode.id as BeatmapDifficulty)}
                                className={`relative overflow-hidden rounded-xl p-4 text-left transition-all border group ${selectedDifficulty === mode.id ? 'bg-white/10 border-neon-blue' : 'border-white/10 hover:bg-white/5 hover:border-white/20'}`}
                             >
                                 <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${mode.color}`}></div>
                                 <div className="flex justify-between items-center pl-4">
                                     <div>
                                         <div className={`font-black italic text-lg ${selectedDifficulty === mode.id ? 'text-white' : 'text-gray-300'}`}>{mode.label}</div>
                                         <div className="text-xs text-gray-500">{mode.desc}</div>
                                     </div>
                                     {selectedDifficulty === mode.id && <CheckCircle className="w-5 h-5 text-neon-blue" />}
                                 </div>
                             </button>
                         ))}

                         <button 
                            onClick={confirmGeneration}
                            disabled={!selectedDifficulty}
                            className="mt-4 py-4 rounded-xl bg-neon-blue text-black font-black text-lg uppercase tracking-widest hover:bg-white hover:scale-[1.02] transition-all shadow-lg disabled:opacity-30 disabled:scale-100 disabled:shadow-none"
                         >
                             开始生成
                         </button>
                     </div>
                 </div>
             </div>
        </div>
      )}

      {/* 2. Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                 <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                     <X className="w-6 h-6" />
                 </button>

                 <h2 className="text-2xl font-black flex items-center gap-3 mb-8">
                     <Settings className="w-6 h-6 text-neon-blue" />
                     设置
                 </h2>

                 <div className="space-y-6">
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${apiKeyStatus === 'valid' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                         <span className="font-bold text-sm text-gray-200">API 状态</span>
                         {apiKeyStatus === 'valid' ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-bold text-xs uppercase">
                                <Check className="w-3.5 h-3.5"/> Connected
                            </span>
                         ) : (
                            <span className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase">
                                <AlertTriangle className="w-3.5 h-3.5"/> Disconnected
                            </span>
                         )}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Gemini API Key</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                value={customApiKey}
                                onChange={(e) => setCustomApiKey(e.target.value)}
                                placeholder={hasEnvKey ? "已配置环境变量" : "在此粘贴 API Key"}
                                className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all outline-none"
                            />
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        </div>
                        <p className="text-[10px] text-gray-600 leading-relaxed">
                            NeonFlow 需要 API Key 来进行 AI 音乐分析。您的 Key 仅存储在本地浏览器中。
                        </p>
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors shadow-lg"
                        >
                            保存
                        </button>
                    </div>
                 </div>
             </div>
        </div>
      )}

      {/* Song Loading Overlay */}
      {isSongLoading && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
           <Loader2 className="w-12 h-12 text-neon-blue animate-spin mb-6" />
           <p className="text-white font-bold tracking-widest animate-pulse text-lg">LOADING CHART...</p>
        </div>
      )}

      {/* Header */}
      <header className="p-6 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md flex justify-between items-center z-40 sticky top-0">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={backToLibrary}>
          <div className="relative">
              <div className="absolute inset-0 bg-neon-blue blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <Music className="w-8 h-8 relative z-10 transition-colors" style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }} />
          </div>
          <h1 className="text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:to-white transition-all">
            NEON<span style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }}>FLOW</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          {status === GameStatus.Playing || status === GameStatus.Countdown ? (
            <div className="flex gap-8 font-mono font-bold text-xl select-none">
              <div className="flex flex-col items-end leading-none gap-1">
                 <span className="text-[10px] text-gray-500 tracking-widest">SCORE</span>
                 <span>{Math.floor(score.score)}</span>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="flex flex-col items-start leading-none gap-1">
                 <span className="text-[10px] text-gray-500 tracking-widest">COMBO</span>
                 <span className="text-neon-yellow">{score.combo}</span>
              </div>
            </div>
          ) : (
             <button 
               onClick={() => setShowSettings(true)}
               className={`p-3 rounded-xl transition-all flex items-center gap-2 border ${apiKeyStatus === 'missing' ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : 'text-gray-400 border-white/5 hover:text-white hover:bg-white/5'}`}
               title="Settings"
             >
               {apiKeyStatus === 'missing' && <span className="text-xs font-bold hidden md:inline">SETUP API</span>}
               <Settings className="w-5 h-5" />
             </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden w-full">
        
        {/* Background Decorative Elements */}
        {status !== GameStatus.Library && (
            <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] opacity-10 rounded-full blur-[150px]" style={{ backgroundColor: theme.primaryColor }} />
                <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] opacity-10 rounded-full blur-[150px]" style={{ backgroundColor: theme.secondaryColor }} />
            </div>
        )}

        {status === GameStatus.Library && (
            <LibraryScreen 
                songs={librarySongs}
                isLoading={isLibraryLoading}
                onImportAudioClick={onFileSelect}
                onImportMapClick={handleImportMap}
                onSelectSong={handleSelectSong}
                onRefreshLibrary={loadLibrary}
                hasApiKey={apiKeyStatus === 'valid'}
                onOpenSettings={() => setShowSettings(true)}
            />
        )}

        {status === GameStatus.Analyzing && (
          <div className="z-10 flex flex-col items-center gap-8 animate-fade-in max-w-md text-center px-4">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-white/5 border-t-neon-blue rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <Zap className="w-8 h-8 text-neon-blue animate-pulse" />
              </div>
            </div>
            <div>
                <h2 className="text-2xl font-black text-white mb-2">{loadingStage}</h2>
                <p className="text-sm text-gray-500">AI is analyzing rhythm and structure...</p>
            </div>
            {errorMessage && (
                <div className="mt-4 text-red-400 text-sm bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                    {errorMessage}
                </div>
            )}
          </div>
        )}

        {status === GameStatus.Ready && (
          <div className="z-10 text-center space-y-8 animate-fade-in p-12 bg-[#0a0a0a]/80 rounded-[3rem] border border-white/10 backdrop-blur-3xl shadow-2xl max-w-xl w-full relative group">
             {/* Glow effect behind card */}
             <div className="absolute inset-0 bg-neon-blue/5 rounded-[3rem] blur-xl -z-10 group-hover:bg-neon-blue/10 transition-colors duration-500"></div>

             <button onClick={backToLibrary} className="absolute top-6 left-6 p-3 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                 <ArrowLeft className="w-6 h-6" />
             </button>

             <div className="space-y-4 pt-8">
                <span className="inline-block px-3 py-1 rounded-full bg-neon-blue/10 text-neon-blue text-xs font-bold uppercase tracking-widest border border-neon-blue/20">
                    Ready to Start
                </span>
                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight" style={{ textShadow: `0 0 40px ${theme.primaryColor}44` }}>
                    {songName}
                </h2>
             </div>

             <div className="grid grid-cols-2 gap-4 py-8">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-3xl font-black text-white">{notes.length}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Objects</div>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-3xl font-black text-white">{(notes.length / (audioBuffer?.duration || 60)).toFixed(1)}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">NPS</div>
                </div>
             </div>
             
             <div className="space-y-6">
                <button 
                    onClick={startCountdown}
                    className="w-full py-6 rounded-2xl font-black text-xl uppercase tracking-widest transition-all bg-white text-black hover:bg-neon-blue hover:scale-[1.02] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3"
                >
                    <Play className="fill-current w-6 h-6" />
                    Start Game
                </button>
                <div className="text-xs text-gray-600 font-mono">PRESS SPACE TO START</div>
             </div>
          </div>
        )}

        {status === GameStatus.Countdown && (
            <div className="z-50 absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="text-[15rem] font-black italic text-white animate-pulse-fast tracking-tighter" style={{ textShadow: `0 0 80px ${theme.primaryColor}`}}>
                    {countdown > 0 ? countdown : 'GO!'}
                </div>
            </div>
        )}

        {status === GameStatus.Playing && (
            <div className="absolute inset-0 z-0">
                 <GameCanvas 
                    status={status}
                    audioBuffer={audioBuffer}
                    notes={notes}
                    theme={theme}
                    onScoreUpdate={setScore}
                    onGameEnd={handleGameEnd}
                 />
            </div>
        )}

        <ResultScreen 
          status={status}
          score={score}
          notesCount={notes.length}
          songName={songName}
          onReset={backToLibrary}
          onReplay={replay}
        />
        
      </main>
      
      {/* Footer Instructions */}
      {status !== GameStatus.Playing && status !== GameStatus.Countdown && (
          <footer className="p-6 text-center text-[10px] text-gray-700 uppercase tracking-[0.2em] bg-[#050505]">
             <p>NeonFlow v1.0 • AI Rhythm Engine</p>
          </footer>
      )}
    </div>
  );
}

export default App;
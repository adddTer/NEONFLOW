import React, { useState, useEffect, useRef } from 'react';
import { Music, Loader2, Settings, X, Key, ExternalLink, ArrowLeft, Play, Zap, BarChart, Hand, Keyboard, AlertTriangle, CheckCircle, Check } from 'lucide-react';
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
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
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
    setShowDifficultyModal(true);
    event.target.value = '';
  };

  const confirmGeneration = async () => {
      if (!pendingFile || !selectedDifficulty) return;
      handleCreateBeatmap(selectedDifficulty);
  };

  const handleCreateBeatmap = async (difficulty: BeatmapDifficulty) => {
    if (!pendingFile) return;
    
    const file = pendingFile;
    const laneCount = selectedLaneCount;
    const playStyle = selectedPlayStyle;

    setShowDifficultyModal(false);
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
        if (e.code === 'Space' && status === GameStatus.Ready && !showSettings && !showDifficultyModal) {
            e.preventDefault();
            startCountdown();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, showSettings, showDifficultyModal]);

  const handleGameEnd = async (finalScore?: ScoreState) => {
    setStatus(GameStatus.Finished);
    
    // Use passed score (from GameCanvas callback) or fallback to state (which might be stale if not passed)
    const resultScore = finalScore || score;

    // Save high score if better
    if (currentSongId) {
        const song = librarySongs.find(s => s.id === currentSongId);
        if (song) {
            const total = notes.length;
            const { rank } = calculateGrade(resultScore.perfect, resultScore.good, resultScore.miss, total);
            
            // Check if this score is better (simple check: higher score)
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
                await loadLibrary(); // Refresh UI
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
      className="min-h-screen w-full flex flex-col transition-colors duration-700 font-sans text-white select-none"
      style={{ 
        background: status === GameStatus.Library 
            ? '#050505' 
            : `radial-gradient(circle at center, ${theme.secondaryColor}11 0%, #050505 100%)` 
      }}
    >
      {/* Song Loading Overlay */}
      {isSongLoading && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
           <Loader2 className="w-10 h-10 text-neon-blue animate-spin mb-4" />
           <p className="text-white font-bold tracking-widest animate-pulse">正在载入曲谱...</p>
        </div>
      )}

      {/* Difficulty Selection Modal */}
      {showDifficultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-2xl p-8 w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
                <button 
                  onClick={() => { setShowDifficultyModal(false); setPendingFile(null); }}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
                
                <h2 className="text-2xl font-black text-white mb-2">生成新谱面</h2>
                <p className="text-gray-400 text-sm mb-6">自定义您的游戏体验</p>

                {/* Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Lane Count */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">按键数量</h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setSelectedLaneCount(4)}
                                className={`flex-1 py-3 rounded-lg border font-bold transition-all ${selectedLaneCount === 4 ? 'bg-neon-blue text-black border-neon-blue' : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10'}`}
                            >
                                4 Keys
                            </button>
                            <button 
                                onClick={() => setSelectedLaneCount(6)}
                                className={`flex-1 py-3 rounded-lg border font-bold transition-all ${selectedLaneCount === 6 ? 'bg-neon-blue text-black border-neon-blue' : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10'}`}
                            >
                                6 Keys
                            </button>
                        </div>
                    </div>

                    {/* Play Style */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">游玩风格</h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setSelectedPlayStyle('THUMB')}
                                className={`flex-1 py-3 px-2 rounded-lg border font-bold text-xs transition-all flex flex-col items-center gap-1 ${selectedPlayStyle === 'THUMB' ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                title="最大同时按键限制为2个"
                            >
                                <Hand className="w-4 h-4" />
                                双指 / 拇指
                            </button>
                            <button 
                                onClick={() => setSelectedPlayStyle('MULTI')}
                                className={`flex-1 py-3 px-2 rounded-lg border font-bold text-xs transition-all flex flex-col items-center gap-1 ${selectedPlayStyle === 'MULTI' ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                title="允许3-4个同时按键"
                            >
                                <Keyboard className="w-4 h-4" />
                                多指 / 键盘
                            </button>
                        </div>
                    </div>
                </div>
                
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">选择难度</h3>
                <div className="grid grid-cols-1 gap-3 mb-8">
                    {[
                        { id: BeatmapDifficulty.Easy, label: '简单 / Easy', desc: '轻松休闲，适合新手', color: 'bg-green-500', hover: 'hover:bg-green-400' },
                        { id: BeatmapDifficulty.Normal, label: '普通 / Normal', desc: '张弛有度，标准体验', color: 'bg-blue-500', hover: 'hover:bg-blue-400' },
                        { id: BeatmapDifficulty.Hard, label: '困难 / Hard', desc: '具有挑战，考验耐力', color: 'bg-orange-500', hover: 'hover:bg-orange-400' },
                        { id: BeatmapDifficulty.Expert, label: '专家 / Expert', desc: '极速反应，指尖狂舞', color: 'bg-red-600', hover: 'hover:bg-red-500' },
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setSelectedDifficulty(mode.id as BeatmapDifficulty)}
                            className={`group relative overflow-hidden rounded-xl p-4 text-left transition-all border 
                                ${selectedDifficulty === mode.id 
                                    ? 'border-neon-blue bg-white/10 scale-[1.02] shadow-[0_0_15px_rgba(0,243,255,0.2)]' 
                                    : 'border-white/5 hover:border-white/20 hover:scale-[1.01]'
                                }`}
                        >
                            <div className={`absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity ${mode.color}`}></div>
                            <div className="relative flex items-center justify-between">
                                <div>
                                    <h3 className={`text-lg font-bold transition-colors ${selectedDifficulty === mode.id ? 'text-neon-blue' : 'text-white'}`}>{mode.label}</h3>
                                    <p className="text-xs text-gray-400">{mode.desc}</p>
                                </div>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedDifficulty === mode.id ? 'bg-neon-blue text-black' : 'bg-white/10 text-white'}`}>
                                    {selectedDifficulty === mode.id ? <Check className="w-5 h-5" /> : <Zap className="w-4 h-4" />}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <button 
                    onClick={confirmGeneration}
                    disabled={!selectedDifficulty}
                    className="w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all bg-white text-black hover:bg-neon-blue disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                >
                    确认生成
                </button>
             </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#0f172a] border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-neon-blue" />
              设置
            </h2>

            <div className="space-y-4">
              <div className="bg-black/30 p-4 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-300">API 状态</span>
                      {apiKeyStatus === 'valid' ? (
                          <span className="text-green-400 text-xs flex items-center gap-1 font-bold"><CheckCircle className="w-3 h-3"/> 已就绪</span>
                      ) : (
                          <span className="text-red-400 text-xs flex items-center gap-1 font-bold"><AlertTriangle className="w-3 h-3"/> 未配置</span>
                      )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                      本游戏依赖 Gemini API 进行音乐分析。如果没有 API Key，<span className="text-red-400 font-bold">将无法生成新谱面</span>。
                  </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Gemini API Key</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Key className="w-4 h-4 text-gray-500" />
                  </div>
                  <input 
                    type="password" 
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder={hasEnvKey ? "已检测到环境变量 API Key" : "输入您的 API Key 以启用创作"}
                    className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-gray-200 transition-colors"
              >
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b border-white/10 bg-black/50 backdrop-blur-md flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={backToLibrary}>
          <Music className="w-6 h-6 animate-pulse" style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }} />
          <h1 className="text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            NEON<span style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }}>FLOW</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          {status === GameStatus.Playing || status === GameStatus.Countdown ? (
            <div className="flex gap-6 font-mono font-bold text-lg select-none">
              <div className="flex flex-col items-center leading-none">
                 <span className="text-[10px] text-gray-500">SCORE</span>
                 <span>{Math.floor(score.score)}</span>
              </div>
              <div className="flex flex-col items-center leading-none">
                 <span className="text-[10px] text-gray-500">COMBO</span>
                 <span className="text-neon-yellow">{score.combo}</span>
              </div>
            </div>
          ) : (
             <button 
               onClick={() => setShowSettings(true)}
               className={`p-2 rounded-full transition-colors flex items-center gap-2 ${apiKeyStatus === 'missing' ? 'text-red-400 bg-red-500/10 animate-pulse' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
               title="设置"
             >
               {apiKeyStatus === 'missing' && <span className="text-xs font-bold hidden md:inline">配置 API</span>}
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
                <div className="absolute top-1/4 left-1/4 w-64 h-64 opacity-20 rounded-full blur-[120px]" style={{ backgroundColor: theme.primaryColor }} />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 opacity-20 rounded-full blur-[120px]" style={{ backgroundColor: theme.secondaryColor }} />
            </div>
        )}

        {/* --- Screen Components --- */}

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
          <div className="z-10 flex flex-col items-center gap-6 animate-fade-in">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-white/10 border-t-neon-blue rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <Loader2 className="w-6 h-6 text-neon-blue animate-spin" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-lg font-bold text-neon-blue tracking-widest animate-pulse">
                    {loadingStage}
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wider mt-2">
                   Powered by Google Gemini
                </p>
            </div>
            {errorMessage && (
                <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded">
                    {errorMessage}
                </div>
            )}
          </div>
        )}

        {status === GameStatus.Ready && (
          <div className="z-10 text-center space-y-8 animate-fade-in p-10 bg-[#0a0a0a]/90 rounded-3xl border border-white/10 backdrop-blur-2xl shadow-2xl max-w-md w-full relative">
             <button onClick={backToLibrary} className="absolute top-4 left-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
                 <ArrowLeft className="w-5 h-5" />
             </button>

             <div className="space-y-2 pt-4">
                <p className="text-neon-blue text-xs font-bold uppercase tracking-[0.2em]">Ready to Play</p>
                <h2 className="text-3xl font-black text-white line-clamp-2" style={{ textShadow: `0 0 30px ${theme.primaryColor}66` }}>
                    {songName}
                </h2>
             </div>

             <div className="grid grid-cols-2 divide-x divide-white/10 py-4 border-y border-white/10">
                <div className="text-center px-4">
                    <div className="text-2xl font-bold font-mono">{notes.length}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Total Notes</div>
                </div>
                <div className="text-center px-4">
                    <div className="text-2xl font-bold font-mono">{(notes.length / (audioBuffer?.duration || 60)).toFixed(1)}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Avg NPS</div>
                </div>
             </div>
             
             <div className="space-y-6">
                <button 
                    onClick={startCountdown}
                    className={`group relative w-full py-4 px-8 font-bold text-xl rounded-xl overflow-hidden transition-all active:scale-95 bg-white text-black`}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="flex items-center justify-center gap-2 relative z-10">
                       <Play className="fill-current w-5 h-5" />
                       开始游戏 (SPACE)
                    </span>
                </button>
             </div>
          </div>
        )}

        {status === GameStatus.Countdown && (
            <div className="z-50 absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="text-[15rem] font-black italic text-white animate-pulse-fast" style={{ textShadow: `0 0 50px ${theme.primaryColor}`}}>
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
          <footer className="p-4 text-center text-[10px] text-gray-600 uppercase tracking-widest bg-black">
             <p>NeonFlow - AI Rhythm Engine</p>
          </footer>
      )}
    </div>
  );
}

export default App;
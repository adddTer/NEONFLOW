import React, { useState, useEffect, useRef } from 'react';
import { Music, Loader2, Settings, X, Key, ExternalLink, ArrowLeft, Play, Zap, BarChart, Hand, Keyboard, AlertTriangle, CheckCircle, Check, ChevronLeft, ShieldAlert, Smartphone, Volume2, AudioWaveform, Clock, Pause, LogOut, RotateCcw, Bug } from 'lucide-react';
import { analyzeAudioDSP } from './utils/audioAnalyzer';
import { analyzeStructureWithGemini, GenerationOptions } from './services/geminiService';
import { generateBeatmap, calculateDifficultyRating } from './utils/beatmapGenerator';
import { saveSong, getAllSongs, parseSongImport, updateSongMetadata, getSongById } from './services/storageService';
import { extractCoverArt } from './utils/audioMetadata';
import { calculateGrade } from './utils/scoring';
import { GoogleGenAI } from "@google/genai"; 
import GameCanvas from './components/GameCanvas';
import { LibraryScreen } from './components/screens/LibraryScreen';
import { ResultScreen } from './components/screens/ResultScreen';
import { AudioCalibration } from './components/screens/AudioCalibration';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { MetadataDebugger } from './components/debug/MetadataDebugger';
import { Note, GameStatus, ScoreState, AITheme, DEFAULT_THEME, SavedSong, BeatmapDifficulty, LaneCount, PlayStyle, GameResult } from './types';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const LS_KEY_API = 'neonflow_api_key';
const LS_KEY_DEBUG = 'neonflow_debug_mode';

function App() {
  const [status, setStatus] = useState<GameStatus>(GameStatus.Library);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [theme, setTheme] = useState<AITheme>(DEFAULT_THEME); 
  const [score, setScore] = useState<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
  const [songName, setSongName] = useState<string>("");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null); 
  const [loadingStage, setLoadingStage] = useState<string>(""); 
  const [loadingSubText, setLoadingSubText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  
  const [audioOffset, setAudioOffset] = useState<number>(0); 
  const [showCalibration, setShowCalibration] = useState(false);
  const [showMetadataDebug, setShowMetadataDebug] = useState(false);

  // Debug State
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [titleClickCount, setTitleClickCount] = useState(0);

  // Pause Menu State
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const [librarySongs, setLibrarySongs] = useState<SavedSong[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isSongLoading, setIsSongLoading] = useState(false); 

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isConfiguringSong, setIsConfiguringSong] = useState(false);

  const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
  const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
  const [selectedDifficulty, setSelectedDifficulty] = useState<BeatmapDifficulty | null>(null);
  
  // Generation Options (AI Tasks)
  const [aiOptions, setAiOptions] = useState<GenerationOptions>({
      structure: true,
      theme: true,
      metadata: true
  });
  // Beatmap Elements (Note Types) - Available to ALL
  const [beatmapFeatures, setBeatmapFeatures] = useState({
      jumps: true,
      holds: true,
      catch: true
  });
  // Dev Option
  const [skipAI, setSkipAI] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  
  const [apiKeyStatus, setApiKeyStatus] = useState<'valid' | 'missing' | 'checking' | 'invalid'>('missing');
  const [validationError, setValidationError] = useState<string | null>(null);

  const hasEnvKey = !!process.env.API_KEY;

  useEffect(() => {
     const savedOffset = localStorage.getItem('neonflow_audio_offset');
     if (savedOffset) {
         setAudioOffset(Number(savedOffset));
     }

     const storedKey = localStorage.getItem(LS_KEY_API);
     if (storedKey) {
         setCustomApiKey(storedKey);
         validateKey(storedKey);
     } else {
         const keyToUse = process.env.API_KEY;
         if (keyToUse) {
             validateKey(keyToUse);
         }
     }

     const debug = localStorage.getItem(LS_KEY_DEBUG);
     if (debug === 'true') setIsDebugMode(true);
  }, []);

  // Visibility Check (Removed Orientation Check)
  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.hidden && status === GameStatus.Playing) {
            setStatus(GameStatus.Paused);
        }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status]);

  const toggleDebugMode = () => {
      const newState = !isDebugMode;
      setIsDebugMode(newState);
      localStorage.setItem(LS_KEY_DEBUG, String(newState));
      if (newState) {
          alert("调试模式已开启");
      } else {
          setSkipAI(false); // Reset skipAI if dev mode off
          alert("调试模式已关闭");
      }
  };

  const handleTitleClick = () => {
      setTitleClickCount(prev => prev + 1);
  };

  const handleVersionClick = () => {
      if (titleClickCount === 7) {
          toggleDebugMode();
      }
      // Always reset logic count after footer click to avoid accumulation
      setTitleClickCount(0);
  };

  const validateKey = async (key: string) => {
      if (!key.trim()) return false;
      
      setApiKeyStatus('checking');
      setValidationError(null);
      try {
          const ai = new GoogleGenAI({ apiKey: key });
          await ai.models.countTokens({
             model: 'gemini-3-flash-preview',
             contents: { parts: [{ text: 'ping' }] }
          });
          setApiKeyStatus('valid');
          return true;
      } catch (e: any) {
          console.error("API Validation Failed", e);
          setApiKeyStatus('invalid');
          setValidationError(e.message || "连接 Gemini API 失败");
          return false;
      }
  };

  const handleSaveSettings = async () => {
      const trimmedKey = customApiKey.trim();
      
      if (!trimmedKey && !hasEnvKey) {
          localStorage.removeItem(LS_KEY_API);
          setApiKeyStatus('missing');
          return;
      }
      
      const keyToValidate = trimmedKey || process.env.API_KEY || "";
      const isValid = await validateKey(keyToValidate);
      
      if (isValid) {
          if (trimmedKey) {
              localStorage.setItem(LS_KEY_API, trimmedKey);
          }
          setShowSettings(false);
      }
  };

  const openCalibration = () => {
      setShowSettings(false); 
      setShowCalibration(true);
  };

  const closeCalibration = (newOffset: number) => {
      setAudioOffset(newOffset);
      localStorage.setItem('neonflow_audio_offset', String(newOffset));
      setShowCalibration(false);
      setShowSettings(true); 
  };

  const openMetadataDebugger = () => {
      setShowSettings(false);
      setShowMetadataDebug(true);
  }

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

  const handleDifficultySelect = (diff: BeatmapDifficulty) => {
      setSelectedDifficulty(diff);
      if (diff === BeatmapDifficulty.Titan) {
          setSelectedLaneCount(6);
          setSelectedPlayStyle('MULTI');
      }
  };

  const handleCreateBeatmap = async (difficulty: BeatmapDifficulty) => {
    if (!pendingFile) return;
    
    const file = pendingFile;
    const laneCount = selectedLaneCount;
    const playStyle = selectedPlayStyle;
    const currentAiOptions = { ...aiOptions };
    const currentFeatures = { ...beatmapFeatures };

    setIsConfiguringSong(false);
    setPendingFile(null); 

    setStatus(GameStatus.Analyzing);
    setSongName(file.name.replace(/\.[^/.]+$/, ""));
    setErrorMessage(null);
    
    try {
      setLoadingStage("正在解析音频");
      setLoadingSubText("分析频率与节奏特征...");
      
      const arrayBuffer = await file.arrayBuffer();
      const audioCtxBuffer = arrayBuffer.slice(0); 
      const saveBuffer = arrayBuffer.slice(0); 
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
      
      const { buffer, onsets } = await analyzeAudioDSP(audioCtxBuffer, audioContext);

      const coverArt = await extractCoverArt(file);

      let structure;
      let aiTheme = DEFAULT_THEME;
      let aiMetadata: { title?: string, artist?: string, album?: string } | undefined;

      const shouldSkipAI = isDebugMode && skipAI;

      if (shouldSkipAI) {
          setLoadingStage("调试模式：跳过 AI");
          setLoadingSubText("使用默认结构生成...");
          // Wait a bit to simulate processing
          await new Promise(resolve => setTimeout(resolve, 500));
          
          structure = {
              bpm: 120, // Default fallback
              sections: [{ startTime: 0, endTime: buffer.duration, type: 'verse', intensity: 0.8, style: 'stream' }]
          };
          
          aiMetadata = {
              title: file.name.replace(/\.[^/.]+$/, "") + " [DEV]",
              artist: "Debug Mode"
          };
      } else {
          setLoadingStage("Gemini AI 构思中");
          setLoadingSubText("识别风格、结构与视觉主题...");
          
          if (apiKeyStatus === 'valid') {
              const base64String = await fileToBase64(file);
              const base64Data = base64String.split(',')[1];
              // Pass options to service
              const aiResult = await analyzeStructureWithGemini(file.name, base64Data, file.type, customApiKey, currentAiOptions);
              structure = aiResult.structure;
              aiTheme = aiResult.theme;
              aiMetadata = aiResult.metadata;
          } else {
              throw new Error("API Key Missing");
          }
      }

      setLoadingStage("谱面生成中");
      setLoadingSubText(`正在构建 ${laneCount}K 模式键位...`);
      
      const finalNotes = generateBeatmap(
          onsets, 
          structure as any, 
          difficulty, 
          laneCount, 
          playStyle,
          currentFeatures // Pass user selections for note types
      );
      
      if (finalNotes.length === 0) throw new Error("GenerativeFailure");

      const rating = calculateDifficultyRating(finalNotes, buffer.duration);

      setLoadingStage("保存数据");
      setLoadingSubText("写入本地数据库...");
      
      const newSong: SavedSong = {
          id: crypto.randomUUID(),
          title: aiMetadata?.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: aiMetadata?.artist || "未知艺术家",
          album: aiMetadata?.album,
          coverArt: coverArt,
          createdAt: Date.now(),
          duration: buffer.duration,
          audioData: saveBuffer,
          notes: finalNotes,
          structure: structure as any,
          theme: aiTheme,
          difficultyRating: rating,
          laneCount: difficulty === BeatmapDifficulty.Titan ? 6 : laneCount
      };

      await saveSong(newSong);
      await loadLibrary();
      
      setStatus(GameStatus.Library);
      setLoadingStage("");
      setLoadingSubText("");

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
      const files = event.target.files;
      if (!files || files.length === 0) return;
      
      const fileList: File[] = Array.from(files);
      event.target.value = '';

      setStatus(GameStatus.Analyzing);
      setErrorMessage(null);
      
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          setLoadingStage("导入谱面");
          setLoadingSubText(`正在解析 (${i + 1}/${fileList.length}): ${file.name}...`);
          
          try {
              const song = await parseSongImport(file);
              await saveSong(song);
              successCount++;
          } catch (e: any) {
              console.error(`Import failed for ${file.name}`, e);
              failCount++;
          }
      }

      await loadLibrary();
      setStatus(GameStatus.Library);
      setLoadingStage("");
      setLoadingSubText("");

      if (failCount > 0) {
          console.warn(`Batch import complete. Success: ${successCount}, Failed: ${failCount}`);
      }
  };

  const handleSelectSong = async (song: SavedSong) => {
      setIsSongLoading(true);
      setCurrentSongId(song.id);
      try {
          let fullSong = song;
          if (song.audioData.byteLength === 0) {
              const fetched = await getSongById(song.id);
              if (!fetched) throw new Error("Song not found in DB");
              fullSong = fetched;
          }

          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
          const decodedBuffer = await audioContext.decodeAudioData(fullSong.audioData.slice(0));
          
          setAudioBuffer(decodedBuffer);
          setNotes(fullSong.notes);
          setTheme(fullSong.theme);
          setSongName(fullSong.title);
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

  const pauseGame = () => {
    if (status === GameStatus.Playing) {
        setStatus(GameStatus.Paused);
    }
  };

  const resumeGame = () => {
      if (status === GameStatus.Paused) {
          // Go to countdown first to give user time to prepare
          setStatus(GameStatus.Countdown);
          setCountdown(3);
      }
  };

  const quitGame = () => {
      setShowQuitConfirm(true);
  };

  const confirmQuit = () => {
      setShowQuitConfirm(false);
      setStatus(GameStatus.Library);
      setScore({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
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
        if (e.code === 'Space' && status === GameStatus.Ready && !showSettings && !isConfiguringSong && !showMetadataDebug) {
            e.preventDefault();
            startCountdown();
        }
        if (e.code === 'Escape' && status === GameStatus.Playing) {
            e.preventDefault();
            pauseGame();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, showSettings, isConfiguringSong, showMetadataDebug]);

  const handleGameEnd = async (finalScore?: ScoreState) => {
    setStatus(GameStatus.Finished);
    
    const resultScore = finalScore || score;

    if (currentSongId) {
        const songIndex = librarySongs.findIndex(s => s.id === currentSongId);
        if (songIndex !== -1) {
            const song = librarySongs[songIndex];
            const total = notes.length;
            const { rank } = calculateGrade(resultScore.perfect, resultScore.good, resultScore.miss, total);
            
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
                const fullSong = await getSongById(song.id);
                if (fullSong) {
                    const updatedSong = { ...fullSong, bestResult: newResult };
                    await saveSong(updatedSong);
                    await loadLibrary(); 
                }
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
    setLoadingSubText("");
    setErrorMessage(null);
  };

  const replay = () => {
    startCountdown();
  };

  const isGameActive = status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused;

  return (
    <div 
      className="h-[100dvh] w-full flex flex-col transition-colors duration-1000 font-sans text-white select-none relative overflow-hidden"
      style={{ 
        background: status === GameStatus.Library 
            ? '#030304' 
            : `radial-gradient(circle at center, ${theme.secondaryColor}22 0%, #030304 100%)` 
      }}
    >
      
      {/* Audio Calibration Screen */}
      {showCalibration && (
          <AudioCalibration 
            initialOffset={audioOffset} 
            onClose={closeCalibration} 
          />
      )}

      {/* Metadata Debugger Screen */}
      {showMetadataDebug && (
          <MetadataDebugger onClose={() => { setShowMetadataDebug(false); setShowSettings(true); }} />
      )}

      {/* --- MODALS SECTION --- */}
      
      {/* 1. Configuration Modals (Saved in other components mostly) */}
      {isConfiguringSong && pendingFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                 <button onClick={cancelConfiguration} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10 p-2 bg-black/20 rounded-full">
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
                             <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">选定文件</div>
                             <div className="text-lg font-bold text-white break-all line-clamp-2">{pendingFile.name}</div>
                         </div>

                         <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">按键模式</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setSelectedLaneCount(4)} 
                                        disabled={selectedDifficulty === BeatmapDifficulty.Titan}
                                        className={`p-3 rounded-xl text-left font-bold transition-all border 
                                            ${selectedLaneCount === 4 
                                                ? 'bg-neon-blue border-neon-blue text-black' 
                                                : selectedDifficulty === BeatmapDifficulty.Titan
                                                    ? 'bg-transparent border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                                                    : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        4 Keys (标准)
                                    </button>
                                    <button onClick={() => setSelectedLaneCount(6)} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedLaneCount === 6 ? 'bg-neon-blue border-neon-blue text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        6 Keys (宽屏)
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">游玩风格</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setSelectedPlayStyle('THUMB')} 
                                        disabled={selectedDifficulty === BeatmapDifficulty.Titan}
                                        className={`p-3 rounded-xl text-left font-bold transition-all border 
                                            ${selectedPlayStyle === 'THUMB' 
                                                ? 'bg-white border-white text-black' 
                                                : selectedDifficulty === BeatmapDifficulty.Titan
                                                    ? 'bg-transparent border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                                                    : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        双指/拇指
                                    </button>
                                    <button onClick={() => setSelectedPlayStyle('MULTI')} className={`p-3 rounded-xl text-left font-bold transition-all border ${selectedPlayStyle === 'MULTI' ? 'bg-white border-white text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        多指/键盘
                                    </button>
                                </div>
                            </div>
                            
                             <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">谱面元素</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${beatmapFeatures.jumps ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {beatmapFeatures.jumps && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={beatmapFeatures.jumps} onChange={e => setBeatmapFeatures({...beatmapFeatures, jumps: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">多押 (Jumps)</span>
                                            <span className="text-gray-500 text-[10px]">允许同时间出现多个音符</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${beatmapFeatures.holds ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {beatmapFeatures.holds && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={beatmapFeatures.holds} onChange={e => setBeatmapFeatures({...beatmapFeatures, holds: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">长条 (Holds)</span>
                                            <span className="text-gray-500 text-[10px]">需持续按住的长音符</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${beatmapFeatures.catch ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {beatmapFeatures.catch && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={beatmapFeatures.catch} onChange={e => setBeatmapFeatures({...beatmapFeatures, catch: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">滑键 (Catch)</span>
                                            <span className="text-gray-500 text-[10px]">特殊的菱形滑音符</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                             {/* Developer Options */}
                             {isDebugMode && (
                                 <div className="p-4 rounded-xl bg-neon-purple/5 border border-neon-purple/20 space-y-3">
                                    <h3 className="text-sm font-bold text-neon-purple uppercase tracking-widest flex items-center gap-2">
                                        <Bug className="w-3 h-3"/> 开发者选项
                                    </h3>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${skipAI ? 'bg-neon-purple border-neon-purple' : 'border-gray-500'}`}>
                                            {skipAI && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={skipAI} onChange={e => setSkipAI(e.target.checked)} />
                                        <span className="text-gray-300 font-bold group-hover:text-white transition-colors text-sm">跳过 AI 分析 (使用默认结构)</span>
                                    </label>
                                 </div>
                             )}

                         </div>
                     </div>

                     {/* Difficulty Column */}
                     <div className="flex flex-col gap-3">
                         <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">选择难度</h3>
                         {[
                            { id: BeatmapDifficulty.Easy, label: 'Easy', desc: '轻松休闲', color: 'bg-green-500' },
                            { id: BeatmapDifficulty.Normal, label: 'Normal', desc: '标准难度', color: 'bg-blue-500' },
                            { id: BeatmapDifficulty.Hard, label: 'Hard', desc: '进阶挑战', color: 'bg-orange-500' },
                            { id: BeatmapDifficulty.Expert, label: 'Expert', desc: '硬核极限', color: 'bg-red-600' },
                            { id: BeatmapDifficulty.Titan, label: 'TITAN', desc: '6K / 混沌', color: 'bg-purple-600' },
                         ].map((mode) => (
                             <button
                                key={mode.id}
                                onClick={() => handleDifficultySelect(mode.id as BeatmapDifficulty)}
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
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar flex flex-col">
                 <div className="flex items-center justify-between mb-6 shrink-0">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                        <Settings className="w-6 h-6 text-neon-blue" />
                        设置
                    </h2>
                    <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                 </div>
                 
                 <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-200 flex items-start gap-2 shrink-0">
                     <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                     <span>本应用仅支持 Google Gemini API。请确保您的 API Key 有效且具有 gemini-3-flash-preview 模型访问权限。</span>
                 </div>

                 <div className="space-y-6 pb-2">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="font-bold text-sm text-white">音频延迟校准</div>
                            <div className="text-xs text-gray-400 mt-1">当前偏移: {audioOffset > 0 ? `+${audioOffset}` : audioOffset}ms</div>
                        </div>
                        <button 
                            onClick={openCalibration}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Volume2 className="w-3.5 h-3.5" />
                            校准
                        </button>
                    </div>

                    {/* DEBUG TOOLS */}
                    {isDebugMode && (
                        <div className="p-4 bg-neon-purple/10 border border-neon-purple/20 rounded-2xl flex items-center justify-between">
                            <div>
                                <div className="font-bold text-sm text-neon-purple flex items-center gap-1.5">
                                    <Bug className="w-3.5 h-3.5"/> 调试工具
                                </div>
                                <div className="text-xs text-gray-400 mt-1">仅 DEV 模式下可见</div>
                            </div>
                            <button 
                                onClick={openMetadataDebugger}
                                className="px-4 py-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                            >
                                封面解析测试
                            </button>
                        </div>
                    )}

                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${apiKeyStatus === 'valid' ? 'bg-green-500/10 border-green-500/20' : apiKeyStatus === 'invalid' ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/50 border-white/10'}`}>
                         <span className="font-bold text-sm text-gray-200">API 状态</span>
                         {apiKeyStatus === 'valid' ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-bold text-xs uppercase">
                                <Check className="w-3.5 h-3.5"/> 已连接
                            </span>
                         ) : apiKeyStatus === 'checking' ? (
                            <span className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs uppercase">
                                <Loader2 className="w-3.5 h-3.5 animate-spin"/> 验证中...
                            </span>
                         ) : apiKeyStatus === 'invalid' ? (
                            <span className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase">
                                <AlertTriangle className="w-3.5 h-3.5"/> 错误
                            </span>
                         ) : (
                            <span className="flex items-center gap-1.5 text-gray-400 font-bold text-xs uppercase">
                                未配置
                            </span>
                         )}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Gemini API Key</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                value={customApiKey}
                                onChange={(e) => {
                                    setCustomApiKey(e.target.value);
                                    if (apiKeyStatus !== 'missing') setApiKeyStatus('missing'); 
                                }}
                                placeholder={hasEnvKey ? "已配置环境变量" : "在此粘贴 API Key"}
                                className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all outline-none"
                            />
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        </div>
                        {validationError && (
                             <p className="text-[10px] text-red-400 mt-1">{validationError}</p>
                        )}
                        <p className="text-[10px] text-gray-600 leading-relaxed">
                            您的 Key 仅存储在本地浏览器中。如果验证失败，请检查网络连接或 Key 权限。
                        </p>
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={handleSaveSettings}
                            disabled={apiKeyStatus === 'checking'}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {apiKeyStatus === 'checking' ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin"/> 验证中...
                                </>
                            ) : (
                                "保存并验证"
                            )}
                        </button>
                    </div>
                 </div>
             </div>
        </div>
      )}

      {/* Song Loading Overlay (Generic) */}
      {isSongLoading && (
        <LoadingScreen text="加载乐谱" subText="引擎预热中..." />
      )}

      {/* Header - HIDE WHEN PLAYING */}
      {!isGameActive && (
          <header className="p-4 md:p-6 border-b border-white/5 bg-[#030304]/80 backdrop-blur-xl flex justify-between items-center z-40 sticky top-0 shrink-0">
            <div className="flex items-center gap-3 group" onClick={backToLibrary}>
              <div className="relative cursor-pointer">
                  <div className="absolute inset-0 bg-neon-blue blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <Music className="w-7 h-7 md:w-8 md:h-8 relative z-10 transition-colors" style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }} />
              </div>
              <div onClick={handleTitleClick} className="cursor-default">
                  <h1 className="text-xl md:text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:to-white transition-all select-none">
                    NEON<span style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }}>FLOW</span>
                  </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
                 <button 
                   onClick={() => setShowSettings(true)}
                   disabled={status === GameStatus.Analyzing} // Disable setting during analysis
                   className={`p-2.5 md:p-3 rounded-xl transition-all flex items-center gap-2 border 
                      ${status === GameStatus.Analyzing ? 'opacity-50 cursor-not-allowed border-transparent bg-transparent text-gray-600' :
                        apiKeyStatus !== 'valid' ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : 'text-gray-400 border-white/5 hover:text-white hover:bg-white/5'
                      }`}
                   title="设置"
                 >
                   {apiKeyStatus !== 'valid' && status !== GameStatus.Analyzing && <span className="text-xs font-bold hidden md:inline">配置 API</span>}
                   <Settings className="w-5 h-5" />
                 </button>
            </div>
          </header>
      )}

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden w-full">
        
        {/* Background Decorative Elements - Simplified for Mobile */}
        {status !== GameStatus.Library && status !== GameStatus.Playing && status !== GameStatus.Paused && (
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
                hasApiKey={apiKeyStatus === 'valid' || isDebugMode} // Allow creation if debug mode is on
                onOpenSettings={() => setShowSettings(true)}
            />
        )}

        {status === GameStatus.Analyzing && (
          <LoadingScreen text={loadingStage} subText={loadingSubText} />
        )}

        {/* --- START GAME SCREEN (Refined) --- */}
        {status === GameStatus.Ready && (
          <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col">
             
             {/* Immersive Background Layers */}
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                 <div className="absolute inset-0 opacity-20 blur-[120px]" style={{ background: `radial-gradient(circle at top center, ${theme.primaryColor}, transparent 60%)` }}></div>
                 <div className="absolute inset-0 bg-black/60"></div>
                 <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
             </div>

             {/* Top Navigation Bar - Fixed */}
             <div className="relative z-50 flex justify-between items-center p-6 w-full shrink-0">
                <button 
                    onClick={backToLibrary} 
                    className="group flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/5 backdrop-blur-md hover:bg-white/10 active:scale-95 transition-all"
                    aria-label="Back"
                >
                    <ArrowLeft className="w-6 h-6 text-white group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5 backdrop-blur-md text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                    任务简报
                </div>
                <div className="w-12"></div> {/* Spacer for alignment */}
             </div>

             {/* Scrollable Content Area */}
             <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 w-full">
                 <div className="min-h-full flex flex-col items-center justify-center p-6 gap-8 md:gap-12">
                     
                     {/* Album Art / Visualizer */}
                     <div className="relative group shrink-0">
                         <div className="absolute inset-0 bg-gradient-to-br from-black via-transparent to-black opacity-60 z-10 rounded-full"></div>
                         <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border-4 border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.6)] relative overflow-hidden flex items-center justify-center bg-black">
                              <div className="absolute inset-0 animate-spin-slow" style={{ background: `conic-gradient(from 0deg, ${theme.primaryColor}, ${theme.secondaryColor}, ${theme.primaryColor})`, opacity: 0.4, animationDuration: '8s' }}></div>
                              <Music className="w-20 h-20 text-white/40 relative z-20" />
                              {/* Inner Ring */}
                              <div className="absolute inset-4 rounded-full border border-white/10"></div>
                         </div>
                     </div>
                     
                     {/* Title & Info */}
                     <div className="text-center space-y-3 max-w-2xl px-4">
                        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight tracking-tight break-words line-clamp-3" style={{ textShadow: `0 0 30px ${theme.primaryColor}33` }}>
                            {songName}
                        </h1>
                        <div className="flex flex-wrap items-center justify-center gap-3 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {Math.floor((audioBuffer?.duration || 0) / 60)}:{(Math.floor((audioBuffer?.duration || 0) % 60)).toString().padStart(2,'0')}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                            <span>{notes.length} 音符</span>
                            <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                            <span style={{ color: theme.primaryColor }}>{theme.primaryColor === '#bd00ff' ? '6K 泰坦' : '4K 标准'}</span>
                        </div>
                     </div>

                     {/* Stats Grid */}
                     <div className="grid grid-cols-3 gap-3 w-full max-w-md px-2">
                         <div className="bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center hover:bg-white/10 transition-colors">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">密度</div>
                             <div className="text-xl md:text-2xl font-black text-white">{(notes.length / (audioBuffer?.duration || 60)).toFixed(1)} <span className="text-[10px] text-gray-600 font-normal">NPS</span></div>
                         </div>
                         <div className="bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center hover:bg-white/10 transition-colors">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">按键</div>
                             <div className="text-xl md:text-2xl font-black text-white">{theme.primaryColor === '#bd00ff' ? '6' : '4'}</div>
                         </div>
                         <div className="bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center hover:bg-white/10 transition-colors">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">等级</div>
                             <div className="text-xl md:text-2xl font-black text-neon-blue">?</div>
                         </div>
                     </div>
                     
                     {/* Spacing for bottom button on mobile */}
                     <div className="h-24 md:h-0"></div>
                 </div>
             </div>

             {/* Bottom Action Button - Fixed/Sticky */}
             <div className="absolute bottom-0 left-0 right-0 p-6 z-50 md:relative md:bg-transparent md:p-8 md:pt-0 flex justify-center bg-gradient-to-t from-black via-black/90 to-transparent">
                <button 
                    onClick={startCountdown}
                    className="group relative w-full max-w-md py-5 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all hover:scale-[1.02] active:scale-95"
                >
                    <div className="absolute inset-0 bg-white group-hover:bg-neon-blue transition-colors duration-500"></div>
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
                    
                    <div className="relative z-10 flex items-center justify-center gap-3 text-black">
                        <Play className="fill-current w-6 h-6" />
                        <span className="text-xl font-black uppercase tracking-[0.2em]">启动引擎</span>
                    </div>
                </button>
             </div>
          </div>
        )}

        {/* --- PAUSE MENU --- */}
        {status === GameStatus.Paused && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center animate-fade-in">
                 <div className="relative bg-[#0f172a]/80 border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center overflow-hidden">
                     {/* Decorative Neon Borders */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-50"></div>
                     <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-purple to-transparent opacity-50"></div>

                     <div className="mb-8 relative z-10">
                         <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-lg shadow-black/20">
                             <Pause className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                         </div>
                         <h2 className="text-3xl font-black text-white uppercase tracking-[0.2em] mb-1">PAUSED</h2>
                         <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">System Halted</p>
                     </div>

                     <div className="space-y-4 relative z-10">
                         <button 
                             onClick={resumeGame}
                             className="w-full py-4 bg-neon-blue text-black font-black text-lg rounded-xl hover:bg-white hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] transition-all uppercase tracking-widest flex items-center justify-center gap-2 group"
                         >
                             <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
                             继续游戏
                         </button>
                         <button 
                             onClick={quitGame}
                             className="w-full py-4 bg-white/5 text-white font-bold text-lg rounded-xl hover:bg-white/10 hover:border-white/20 transition-all uppercase tracking-widest border border-white/5 flex items-center justify-center gap-2 group"
                         >
                             <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                             退出
                         </button>
                     </div>
                 </div>

                 {/* Quit Confirmation Overlay */}
                 {showQuitConfirm && (
                    <div className="absolute inset-0 z-[110] bg-black/80 flex items-center justify-center animate-fade-in p-4 backdrop-blur-sm">
                        <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-xs shadow-2xl relative">
                            <h3 className="text-xl font-black text-red-400 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5"/> 确认退出
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">当前进度将丢失，确定要返回主菜单吗？</p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowQuitConfirm(false)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition-colors">取消</button>
                                <button onClick={confirmQuit} className="flex-1 py-3 bg-red-500 rounded-xl font-bold hover:bg-red-600 text-white shadow-lg transition-colors">确认退出</button>
                            </div>
                        </div>
                    </div>
                 )}
            </div>
        )}

        {status === GameStatus.Countdown && (
            <div className="z-50 absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-[10rem] md:text-[15rem] font-black italic text-white animate-pulse-fast tracking-tighter drop-shadow-[0_0_50px_rgba(0,0,0,0.8)]" style={{ textShadow: `0 0 80px ${theme.primaryColor}`}}>
                    {countdown > 0 ? countdown : 'GO!'}
                </div>
            </div>
        )}

        {(status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused) && (
            <div className="absolute inset-0 z-0 w-full h-full">
                 {/* In-Game Header (Score) moved to overlay inside GameCanvas or just floating here */}
                 <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-30 flex justify-between pointer-events-none">
                     <div className="flex items-center gap-4">
                        <button onClick={pauseGame} className="pointer-events-auto p-2 bg-black/20 backdrop-blur-md rounded-full border border-white/10 text-white hover:bg-white/20">
                            <Pause className="w-5 h-5" />
                        </button>
                        <div className="text-white font-bold opacity-50 text-xs md:text-sm max-w-[150px] truncate">{songName}</div>
                     </div>

                     <div className="flex gap-4 md:gap-8 font-mono font-bold text-xl select-none">
                        <div className="flex flex-col items-end leading-none gap-1">
                             <span className="text-[8px] md:text-[10px] text-gray-500 tracking-widest">分数</span>
                             <span>{Math.floor(score.score)}</span>
                        </div>
                        <div className="w-px h-8 bg-white/10"></div>
                        <div className="flex flex-col items-start leading-none gap-1">
                             <span className="text-[8px] md:text-[10px] text-gray-500 tracking-widest">连击</span>
                             <span className="text-neon-yellow">{score.combo}</span>
                        </div>
                     </div>
                 </div>

                 <GameCanvas 
                    status={status}
                    audioBuffer={audioBuffer}
                    notes={notes}
                    theme={theme}
                    audioOffset={audioOffset}
                    isPaused={status === GameStatus.Paused} 
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
      
      {/* Footer Instructions - Hide on mobile if playing */}
      {!isGameActive && (
          <footer className="p-4 md:p-6 text-center text-[8px] md:text-[10px] text-gray-700 uppercase tracking-[0.2em] bg-[#030304] shrink-0 border-t border-white/5 select-none" onClick={handleVersionClick}>
             <p className="flex items-center justify-center gap-2">
                 NeonFlow v1.0 • AI Rhythm Engine
                 {isDebugMode && <span className="text-red-500 font-bold flex items-center gap-1"><Bug className="w-3 h-3"/> DEV MODE</span>}
             </p>
          </footer>
      )}
    </div>
  );
}

export default App;
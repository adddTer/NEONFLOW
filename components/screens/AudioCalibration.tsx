import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, Settings, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';
import GameCanvas from '../GameCanvas';
import { GameStatus, Note, AITheme, LaneCount, NoteLane } from '../../types';

interface AudioCalibrationProps {
  initialOffset: number;
  onClose: (newOffset: number) => void;
}

export const AudioCalibration: React.FC<AudioCalibrationProps> = ({ initialOffset, onClose }) => {
  const [offset, setOffset] = useState(initialOffset);
  const [loopKey, setLoopKey] = useState(0);
  const [hideNotes, setHideNotes] = useState(false); // New: Hide falling notes
  const [isPanelExpanded, setIsPanelExpanded] = useState(true); // Collapsible panel

  // Generate Synthetic Song & Map
  const { buffer, notes, theme } = useMemo(() => {
      const duration = 4.0; // Short loop (4 seconds = 2 bars at 120bpm)
      const bpm = 120;
      const beatInterval = 60 / bpm; // 0.5s
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new AudioContextClass();
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, sr * duration, sr);
      const data = buf.getChannelData(0);

      const generatedNotes: Note[] = [];
      
      // Fill Audio & Notes
      for (let t = 0; t < duration; t += beatInterval) {
          if (t >= 1.0 && t < duration - 0.5) {
              // Audio Tick
              const startSample = Math.floor(t * sr);
              const tickLen = Math.floor(sr * 0.05); 
              for (let i = 0; i < tickLen; i++) {
                  if (startSample + i < data.length) {
                      const freq = 1200 - (i / tickLen) * 400;
                      const phase = i * freq * 2 * Math.PI / sr;
                      const raw = Math.sin(phase) > 0 ? 0.8 : -0.8;
                      const vol = Math.exp(-i / (sr * 0.005));
                      data[startSample + i] = raw * vol;
                  }
              }

              // Visual Note (Center Lanes)
              generatedNotes.push({
                  id: `calib-${t}`,
                  time: t,
                  lane: 1, 
                  hit: false,
                  visible: true,
                  duration: 0,
                  isHolding: false,
                  type: 'NORMAL'
              });
               generatedNotes.push({
                  id: `calib-${t}-r`,
                  time: t,
                  lane: 2, 
                  hit: false,
                  visible: true,
                  duration: 0,
                  isHolding: false,
                  type: 'NORMAL'
              });
          }
      }
      
      ctx.close(); // Clean up temp context

      const calibTheme: AITheme = {
          primaryColor: '#ffffff',
          secondaryColor: '#333333',
          perfectColor: '#00f3ff',
          goodColor: '#00f3ff',
          moodDescription: 'Calibration'
      };

      return { buffer: buf, notes: generatedNotes, theme: calibTheme };
  }, []);

  const handleGameEnd = () => {
      // Immediate restart loop
      setLoopKey(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black">
        {/* Game Layer */}
        <div className="absolute inset-0">
            <GameCanvas 
                key={loopKey}
                status={GameStatus.Playing}
                audioBuffer={buffer}
                notes={notes}
                theme={theme}
                audioOffset={offset}
                hideNotes={hideNotes}
                onScoreUpdate={() => {}} // Ignore score updates
                onGameEnd={handleGameEnd}
            />
        </div>

        {/* UI Overlay */}
        <div className="absolute inset-0 z-50 pointer-events-none flex flex-col justify-start p-4 md:p-6">
            
            {/* Header */}
            <div className="flex items-center justify-between pointer-events-auto gap-2">
                <button onClick={() => onClose(offset)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md border border-white/5">
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                
                <div className="flex items-center gap-2">
                    <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-neon-blue" />
                        <span className="font-bold text-white text-sm hidden md:inline">音频延迟校准</span>
                        <span className="font-bold text-white text-sm md:hidden">校准</span>
                    </div>

                    <button 
                        onClick={() => setHideNotes(!hideNotes)}
                        className={`p-2.5 rounded-full transition-colors backdrop-blur-md border border-white/5 ${hideNotes ? 'bg-neon-blue text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        title="隐藏音符 (盲测)"
                    >
                        {hideNotes ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>

                    <button 
                        onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                        className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md border border-white/5 text-white"
                        title={isPanelExpanded ? "收起面板" : "展开面板"}
                    >
                        {isPanelExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Middle Controls (Collapsible) */}
            {isPanelExpanded && (
                <div className="flex flex-col items-center gap-4 pointer-events-auto mt-4 md:mt-8 animate-fade-in w-full">
                    <div className="bg-black/70 backdrop-blur-xl p-6 rounded-3xl border border-white/10 space-y-4 w-full max-w-md shadow-2xl max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="text-center space-y-1">
                            <p className="text-white text-sm font-bold">观测指南</p>
                            <p className="text-gray-400 text-[10px] leading-relaxed">
                                {hideNotes ? (
                                    <>
                                        <span className="text-neon-blue font-bold">音符已隐藏</span><br/>
                                        请闭眼听节奏点击屏幕。<br/>
                                        如果<span className="text-white font-bold">特效</span>比声音晚出现，减少偏移。
                                    </>
                                ) : (
                                    <>
                                        音符与判定线重合时应<span className="text-neon-blue font-bold">正好听到</span>声音。<br/>
                                        声音滞后(蓝牙)则<span className="text-white">增加</span>偏移。
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-4">
                            <button 
                                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all border border-white/10 flex items-center justify-center shrink-0"
                                onClick={() => setOffset(o => o - 5)}
                            >
                                <Minus className="w-5 h-5 text-white" />
                            </button>
                            
                            <div className="w-24 text-center">
                                <div className="text-3xl font-black font-mono text-neon-blue tracking-tighter">
                                    {offset > 0 ? `+${offset}` : offset}
                                </div>
                                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">MS OFFSET</div>
                            </div>

                            <button 
                                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all border border-white/10 flex items-center justify-center shrink-0"
                                onClick={() => setOffset(o => o + 5)}
                            >
                                <Plus className="w-5 h-5 text-white" />
                            </button>
                        </div>

                        <div className="px-2 pb-2">
                            <input 
                                type="range" 
                                min="-200" 
                                max="500" 
                                step="5"
                                value={offset}
                                onChange={(e) => setOffset(Number(e.target.value))}
                                className="w-full accent-neon-blue h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between mt-1 text-[9px] text-gray-500 font-mono">
                                <span>EARLY (-200)</span>
                                <span>LATE (+500)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
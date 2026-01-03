import React, { useEffect, useState } from 'react';
import { Trophy, RefreshCcw, Home, Share2, Star, Zap } from 'lucide-react';
import { GameStatus, ScoreState } from '../../types';
import { calculateGrade, calculateAccuracy } from '../../utils/scoring';

interface ResultScreenProps {
  status: GameStatus;
  score: ScoreState;
  notesCount: number;
  songName: string;
  onReset: () => void;
  onReplay: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ 
  status, 
  score, 
  notesCount,
  songName, 
  onReset, 
  onReplay 
}) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (status === GameStatus.Finished) {
      setTimeout(() => setAnimate(true), 100);
    } else {
      setAnimate(false);
    }
  }, [status]);

  if (status !== GameStatus.Finished) return null;

  const { rank, color, label } = calculateGrade(score.perfect, score.good, score.miss, notesCount);
  const accuracy = calculateAccuracy(score.perfect, score.good, notesCount);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050505]/95 backdrop-blur-xl animate-fade-in custom-scrollbar flex flex-col items-center justify-center">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className={`fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-10 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-red-900' : 'bg-neon-blue'}`}></div>
          <div className={`fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-10 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-orange-900' : 'bg-neon-purple'}`}></div>
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-8 md:gap-16 relative z-10 h-full md:h-auto">
        
        {/* Left: Grade & Title */}
        <div className={`flex flex-col items-center md:items-start transition-all duration-700 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="text-gray-400 text-xs font-bold tracking-[0.4em] uppercase mb-2 flex items-center gap-2 border border-white/10 px-3 py-1 rounded-full bg-white/5">
                <Trophy className="w-3 h-3" /> Result
            </div>
            <h1 className="text-2xl md:text-4xl font-black text-white mb-8 leading-tight text-center md:text-left max-w-md line-clamp-2">
                {songName}
            </h1>
            
            <div className="relative group scale-90 md:scale-100">
                 {/* Rank Shadow Glow */}
                 <div className={`absolute inset-0 blur-3xl opacity-30 ${color.includes('red') ? 'bg-red-500' : 'bg-neon-blue'}`}></div>
                 
                 <div className={`text-[10rem] md:text-[14rem] font-black italic leading-none select-none drop-shadow-2xl ${color}`} style={{ textShadow: '0 0 40px currentColor' }}>
                     {rank}
                 </div>
                 <div className="absolute top-full left-0 w-full text-center text-xl md:text-2xl font-black tracking-[0.5em] text-white opacity-80 uppercase mt-[-10px] md:mt-[-20px]">
                     {label}
                 </div>
            </div>
        </div>

        {/* Right: Stats & Actions */}
        <div className={`flex-1 w-full max-w-md flex flex-col gap-6 transition-all duration-700 delay-200 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            
            {/* Main Stats Card */}
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden group">
                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>

                <div className="grid grid-cols-2 gap-8 mb-8 relative z-10 border-b border-white/5 pb-6">
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Total Score</div>
                        <div className="text-3xl md:text-4xl font-mono font-black text-white tracking-tighter">
                            {Math.floor(score.score).toLocaleString()}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Accuracy</div>
                        <div className="text-3xl md:text-4xl font-mono font-black text-neon-blue tracking-tighter">
                            {accuracy}%
                        </div>
                    </div>
                </div>

                <div className="space-y-3 relative z-10">
                    <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-neon-purple font-bold text-xs uppercase tracking-wider">Perfect</span>
                        <span className="text-lg font-mono font-bold text-white">{score.perfect}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-neon-blue font-bold text-xs uppercase tracking-wider">Good</span>
                        <span className="text-lg font-mono font-bold text-white">{score.good}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-gray-500 font-bold text-xs uppercase tracking-wider">Miss</span>
                        <span className="text-lg font-mono font-bold text-gray-400">{score.miss}</span>
                    </div>
                </div>

                <div className="mt-6 pt-4 flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Max Combo</span>
                        <span className="text-xl font-bold text-neon-yellow">{score.maxCombo}</span>
                    </div>
                    {score.maxCombo === notesCount && (
                         <div className="px-3 py-1 bg-neon-yellow text-black font-black text-[10px] rounded uppercase tracking-wider shadow-lg shadow-neon-yellow/20">
                             Full Combo
                         </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 pb-8 md:pb-0">
                <button 
                    onClick={onReplay}
                    className="py-4 md:py-5 rounded-2xl bg-white text-black font-bold text-base md:text-lg hover:bg-neon-blue hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-xl"
                >
                    <RefreshCcw className="w-5 h-5" />
                    再来一次
                </button>
                <button 
                    onClick={onReset}
                    className="py-4 md:py-5 rounded-2xl bg-white/5 text-white font-bold text-base md:text-lg border border-white/10 hover:bg-white/10 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                    <Home className="w-5 h-5" />
                    返回曲库
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
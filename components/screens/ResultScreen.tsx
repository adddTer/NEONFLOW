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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050505]/95 backdrop-blur-xl animate-fade-in custom-scrollbar">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
          <div className={`fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-20 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-red-900' : 'bg-neon-blue'}`}></div>
          <div className={`fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-orange-900' : 'bg-neon-purple'}`}></div>
      </div>

      <div className="w-full max-w-6xl min-h-full mx-auto flex flex-col md:flex-row items-center justify-between p-8 md:p-16 gap-12 relative z-10">
        
        {/* Left: Grade & Title */}
        <div className={`flex flex-col items-center md:items-start transition-all duration-1000 transform ${animate ? 'translate-x-0 opacity-100' : '-translate-x-20 opacity-0'}`}>
            <h3 className="text-neon-blue text-sm font-bold tracking-[0.4em] uppercase mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Result
            </h3>
            <h1 className="text-4xl md:text-6xl font-black text-white mb-2 leading-tight text-center md:text-left max-w-2xl">
                {songName}
            </h1>
            
            <div className="relative mt-8 group">
                 <div className={`text-[12rem] md:text-[16rem] font-black italic leading-none select-none drop-shadow-[0_0_50px_rgba(255,255,255,0.2)] ${color}`} style={{ textShadow: '0 0 100px currentColor' }}>
                     {rank}
                 </div>
                 <div className="absolute top-full left-0 w-full text-center text-2xl font-bold tracking-[0.5em] text-white opacity-80 uppercase mt-[-20px]">
                     {label}
                 </div>
            </div>
        </div>

        {/* Right: Stats & Actions */}
        <div className={`flex-1 w-full max-w-md flex flex-col gap-6 transition-all duration-1000 delay-300 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            
            {/* Main Stats Card */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Star className="w-24 h-24 rotate-12" />
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                    <div>
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total Score</div>
                        <div className="text-4xl font-mono font-bold text-white tracking-tighter">
                            {Math.floor(score.score).toLocaleString()}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Accuracy</div>
                        <div className="text-4xl font-mono font-bold text-neon-blue tracking-tighter">
                            {accuracy}%
                        </div>
                    </div>
                </div>

                <div className="space-y-3 relative z-10">
                    <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                        <span className="text-neon-purple font-bold text-sm uppercase tracking-wide">Perfect</span>
                        <span className="text-xl font-mono font-bold text-white">{score.perfect}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                        <span className="text-neon-blue font-bold text-sm uppercase tracking-wide">Good</span>
                        <span className="text-xl font-mono font-bold text-white">{score.good}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                        <span className="text-gray-500 font-bold text-sm uppercase tracking-wide">Miss</span>
                        <span className="text-xl font-mono font-bold text-gray-400">{score.miss}</span>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Max Combo</span>
                        <span className="text-2xl font-bold text-neon-yellow">{score.maxCombo}</span>
                    </div>
                    {score.maxCombo === notesCount && (
                         <div className="px-3 py-1 bg-neon-yellow text-black font-black text-xs rounded uppercase tracking-wider">
                             Full Combo
                         </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 pb-8 md:pb-0">
                <button 
                    onClick={onReplay}
                    className="py-5 rounded-2xl bg-white text-black font-bold text-lg hover:bg-neon-blue hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                    <RefreshCcw className="w-5 h-5" />
                    再来一次
                </button>
                <button 
                    onClick={onReset}
                    className="py-5 rounded-2xl bg-white/10 text-white font-bold text-lg border border-white/10 hover:bg-white/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                    <Home className="w-5 h-5" />
                    返回
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
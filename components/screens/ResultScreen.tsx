import React from 'react';
import { Trophy, RefreshCcw, Home } from 'lucide-react';
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
  if (status !== GameStatus.Finished) return null;

  const { rank, color, label } = calculateGrade(score.perfect, score.good, score.miss, notesCount);
  const accuracy = calculateAccuracy(score.perfect, score.good, notesCount);

  return (
    <div className="z-20 text-center space-y-6 p-10 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl animate-fade-in max-w-2xl w-full relative overflow-hidden">
      
      {/* Background Glow */}
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-white/5 to-transparent pointer-events-none`}></div>

      <div className="relative">
        <h3 className="text-sm font-bold tracking-[0.3em] text-gray-500 uppercase mb-2">RESULT</h3>
        <h2 className="text-3xl font-bold text-white mb-6 line-clamp-1 px-4">{songName}</h2>
      </div>

      <div className="py-6 flex flex-col items-center justify-center relative">
          {/* Grade Display */}
          <div className={`text-8xl font-black italic tracking-tighter ${color} scale-110 mb-2`}>
              {rank}
          </div>
          <div className="text-sm font-mono text-gray-400 tracking-wider">{label}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 px-4">
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">分数</div>
          <div className="text-2xl font-mono font-bold text-white">{Math.floor(score.score)}</div>
        </div>
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">最大连击</div>
          <div className="text-2xl font-mono font-bold text-neon-blue">{score.maxCombo}</div>
        </div>
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">准确率</div>
          <div className="text-2xl font-mono font-bold text-white">{accuracy}%</div>
        </div>
      </div>

      <div className="flex justify-between px-10 py-6 bg-black/40 rounded-2xl border border-white/5 text-sm mx-4">
        <div className="text-neon-purple font-bold flex flex-col items-center gap-1">
          <span className="text-3xl">{score.perfect}</span>
          <span className="text-[9px] text-gray-500 uppercase font-normal tracking-wider">完美</span>
        </div>
        <div className="w-px h-10 bg-white/10"></div>
        <div className="text-neon-blue font-bold flex flex-col items-center gap-1">
          <span className="text-3xl">{score.good}</span>
          <span className="text-[9px] text-gray-500 uppercase font-normal tracking-wider">不错</span>
        </div>
        <div className="w-px h-10 bg-white/10"></div>
        <div className="text-gray-400 font-bold flex flex-col items-center gap-1">
          <span className="text-3xl">{score.miss}</span>
          <span className="text-[9px] text-gray-500 uppercase font-normal tracking-wider">失误</span>
        </div>
      </div>

      <div className="flex gap-4 pt-4 px-4">
        <button onClick={onReset} className="flex-1 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors font-bold text-sm tracking-wide flex items-center justify-center gap-2 group">
          <Home className="w-4 h-4 text-gray-400 group-hover:text-white" />
          返回曲库
        </button>
        <button onClick={onReplay} className="flex-1 py-4 rounded-xl bg-white text-black hover:bg-gray-200 transition-colors font-bold text-sm tracking-wide shadow-lg shadow-white/10 flex items-center justify-center gap-2">
          <RefreshCcw className="w-4 h-4" />
          重新开始
        </button>
      </div>
    </div>
  );
};
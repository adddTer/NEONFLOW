import React from 'react';
import { Loader2, Zap, Music } from 'lucide-react';

interface LoadingScreenProps {
  text: string;
  subText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ text, subText }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]/95 backdrop-blur-xl animate-fade-in text-center p-6">
      <div className="relative mb-8">
        {/* Animated Rings */}
        <div className="absolute inset-0 rounded-full border-4 border-neon-blue/20 animate-ping" style={{ animationDuration: '2s' }}></div>
        <div className="absolute inset-[-10px] rounded-full border border-neon-purple/20 animate-spin-slow" style={{ animationDirection: 'reverse' }}></div>
        
        {/* Core Spinner */}
        <div className="w-24 h-24 border-4 border-white/5 border-t-neon-blue rounded-full animate-spin relative z-10 shadow-[0_0_30px_rgba(0,243,255,0.2)]"></div>
        
        {/* Icon */}
        <div className="absolute inset-0 flex items-center justify-center z-20">
           <Zap className="w-8 h-8 text-white animate-pulse" />
        </div>
      </div>

      <h2 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-wider uppercase animate-pulse">
        {text}
      </h2>
      
      {subText && (
        <p className="text-sm md:text-base text-gray-400 font-medium tracking-widest max-w-md leading-relaxed">
          {subText}
        </p>
      )}

      {/* Decorative Loading Bar */}
      <div className="w-64 h-1 bg-white/10 rounded-full mt-8 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-neon-blue to-transparent animate-[shimmer_1.5s_infinite] translate-x-[-100%]"></div>
      </div>
    </div>
  );
};
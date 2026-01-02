import { ScoreState } from '../types';

export interface GradeResult {
    rank: string;
    color: string;
    label: string;
}

export const calculateGrade = (perfect: number, good: number, miss: number, total: number): GradeResult => {
    if (total === 0) return { rank: '?', color: 'text-gray-500', label: '未知' };

    const hitCount = perfect + good;
    const accuracy = hitCount / total;
    const isFullCombo = miss === 0;

    // 必须与 ResultScreen 和 App.tsx 中的逻辑保持完全一致
    // Stricter Grading Scale
    if (perfect === total) {
        return { rank: 'OPUS', color: 'text-neon-purple drop-shadow-[0_0_20px_rgba(189,0,255,0.8)]', label: '收歌' };
    }
    // Divine requires FC and > 99.5% accuracy (almost all perfect)
    if (isFullCombo && accuracy >= 0.995) {
        return { rank: 'DIVINE', color: 'text-neon-pink drop-shadow-[0_0_15px_rgba(255,0,255,0.6)]', label: '神圣' };
    }
    // S requires 98%
    if (accuracy >= 0.98) return { rank: 'S', color: 'text-neon-blue', label: '极佳' };
    // A requires 95%
    if (accuracy >= 0.95) return { rank: 'A', color: 'text-green-400', label: '优秀' };
    // B requires 90%
    if (accuracy >= 0.90) return { rank: 'B', color: 'text-yellow-400', label: '良好' };
    // C requires 80%
    if (accuracy >= 0.80) return { rank: 'C', color: 'text-orange-400', label: '合格' };
    
    return { rank: 'D', color: 'text-red-600', label: '失败' };
};

export const calculateAccuracy = (perfect: number, good: number, total: number): number => {
    if (total === 0) return 0;
    return Math.floor(((perfect + good) / total) * 100);
};
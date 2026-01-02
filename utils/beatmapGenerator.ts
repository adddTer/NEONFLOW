import { Note, NoteLane, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle } from '../types';

const DIFFICULTY_CONFIG = {
    [BeatmapDifficulty.Easy]: {
        thresholdMultiplier: 2.0, 
        minGap: 0.45,
        streamChance: 0.0, 
        holdChance: 0.0,
        jumpChance: 0.0
    },
    [BeatmapDifficulty.Normal]: {
        thresholdMultiplier: 1.4,
        minGap: 0.25,
        streamChance: 0.0,
        holdChance: 0.15,
        jumpChance: 0.0
    },
    [BeatmapDifficulty.Hard]: {
        thresholdMultiplier: 1.0, 
        minGap: 0.15, 
        streamChance: 0.2,
        holdChance: 0.25,
        jumpChance: 0.15
    },
    [BeatmapDifficulty.Expert]: {
        thresholdMultiplier: 0.8, 
        minGap: 0.08, 
        streamChance: 0.5,
        holdChance: 0.3,
        jumpChance: 0.35
    },
    [BeatmapDifficulty.Titan]: {
        thresholdMultiplier: 0.6, // Very sensitive, picks up ghost notes
        minGap: 0.05, // Almost 1/32 stream speed support
        streamChance: 0.8,
        holdChance: 0.2, // Less holds, more tapping
        jumpChance: 0.7 // Frequent chords
    }
};

/**
 * 核心逻辑：生成模式 (Patterning)
 * 避免完全随机，根据上下文生成符合手感的键位
 */
const getNextLanes = (
    count: number, 
    lastLanes: number[], 
    laneCount: number, 
    style: 'stream' | 'jump' | 'simple'
): number[] => {
    const lanes: number[] = [];
    const allLanes = Array.from({length: laneCount}, (_, i) => i);
    
    // 1. 单点逻辑
    if (count === 1) {
        const last = lastLanes[0];
        
        if (style === 'stream') {
            // 交互：尽可能不在同一只手/同一位置连续点击
            // 简单算法：左右交替或阶梯
            const candidates = allLanes.filter(l => Math.abs(l - last) >= 1 && Math.abs(l - last) <= 2);
            if (candidates.length > 0) {
                lanes.push(candidates[Math.floor(Math.random() * candidates.length)]);
            } else {
                lanes.push((last + 1) % laneCount);
            }
        } else {
            // 随机，但尽量不重复
            const candidates = allLanes.filter(l => !lastLanes.includes(l));
            if (candidates.length > 0) {
                lanes.push(candidates[Math.floor(Math.random() * candidates.length)]);
            } else {
                lanes.push(Math.floor(Math.random() * laneCount));
            }
        }
    } 
    // 2. 双押或多押逻辑
    else {
        // 如果是多押 (3+)，尽量分散
        const needed = count;
        
        // 简单的随机填充逻辑，但避免完全重复上一组
        const candidates = allLanes.filter(l => !lastLanes.includes(l));
        
        // 如果候选不够（例如需要3个，但上次用了4个），就重置为全部
        const pool = candidates.length >= needed ? candidates : allLanes;
        
        // Shuffle pool
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        
        lanes.push(...pool.slice(0, needed));
    }
    
    return lanes.sort((a,b) => a-b);
};


export const generateBeatmap = (
    onsets: Onset[], 
    structure: SongStructure, 
    difficulty: BeatmapDifficulty = BeatmapDifficulty.Normal,
    laneCount: LaneCount = 4,
    playStyle: PlayStyle = 'THUMB'
): Note[] => {
    let notes: Note[] = [];
    
    // Force 6K for Titan
    const effectiveLaneCount = difficulty === BeatmapDifficulty.Titan ? 6 : laneCount;
    const effectivePlayStyle = difficulty === BeatmapDifficulty.Titan ? 'MULTI' : playStyle;

    // 1. 按时间排序 (不进行量子化，保持 DSP 原始精度)
    let sortedOnsets = onsets.sort((a, b) => a.time - b.time);
    const config = DIFFICULTY_CONFIG[difficulty];

    // 生成逻辑
    notes = runGenerationPass(sortedOnsets, structure, config, effectiveLaneCount, effectivePlayStyle, difficulty);

    // 保底机制
    if (notes.length < 30 && difficulty !== BeatmapDifficulty.Easy) {
        console.warn("Notes too sparse, retrying with lower threshold...");
        const retryConfig = { ...config, thresholdMultiplier: config.thresholdMultiplier * 0.7 };
        notes = runGenerationPass(sortedOnsets, structure, retryConfig, effectiveLaneCount, effectivePlayStyle, difficulty);
    }
    
    if (notes.length === 0 && sortedOnsets.length > 0) {
        return generateRawFallback(sortedOnsets, effectiveLaneCount);
    }

    return notes;
};

const runGenerationPass = (
    onsets: Onset[], 
    structure: SongStructure, 
    config: any,
    laneCount: LaneCount,
    playStyle: PlayStyle,
    difficulty: BeatmapDifficulty
): Note[] => {
    const notes: Note[] = [];
    let lastLanes: number[] = [Math.floor(laneCount / 2)];
    let lastTime = -10;

    onsets.forEach(onset => {
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[structure.sections.length - 1];

        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.25;
        let dynamicThreshold = baseThreshold * config.thresholdMultiplier;

        if (currentSection.style === 'simple') dynamicThreshold *= 1.3;
        if (onset.energy < dynamicThreshold) return;
        if (onset.time - lastTime < config.minGap) return;

        // Determine number of simultaneous notes
        let simNotes = 1;
        const isTitan = difficulty === BeatmapDifficulty.Titan;

        const allowJump = (currentSection.style === 'jump' || Math.random() < config.jumpChance) && currentSection.intensity > 0.6;
        
        if (allowJump && onset.energy > 0.75) {
            simNotes = 2;
            
            // Titan / Expert logic for Triples/Quads
            if ((isTitan || (playStyle === 'MULTI' && laneCount === 6)) && onset.energy > 0.9) {
                 if (isTitan && Math.random() > 0.4) {
                     simNotes = 3; // Triples common in Titan
                     if (onset.energy > 0.98) simNotes = 4; // Quads on peaks
                 } else if (config.jumpChance > 0.3) {
                     simNotes = 3;
                 }
            }
        }
        
        if (playStyle === 'THUMB' && !isTitan) {
            simNotes = Math.min(simNotes, 2);
        }

        // Generate Lanes with Logic
        const lanes = getNextLanes(simNotes, lastLanes, laneCount, currentSection.style as any);

        // Hold Logic (Reduced for Titan to maintain stream flow, but allowed)
        let isHold = false;
        let duration = 0;
        if (currentSection.style === 'hold' && Math.random() < config.holdChance && simNotes === 1) {
            isHold = true;
            const maxHold = config.minGap > 0.2 ? 0.5 : 1.0;
            duration = Math.min(maxHold, Math.max(0.1, 60 / structure.bpm)); 
        }

        // Catch Note Logic
        let isCatch = false;
        if (!isHold && simNotes === 1) {
            const catchChance = currentSection.style === 'stream' ? 0.2 : 0.05;
            if (Math.random() < catchChance) {
                isCatch = true;
            }
        }

        lanes.forEach(lane => {
            notes.push({
                id: `note-${onset.time}-${lane}`,
                time: onset.time,
                lane: lane as NoteLane,
                hit: false,
                visible: true,
                duration: isHold ? duration : 0,
                isHolding: false,
                type: isCatch ? 'CATCH' : 'NORMAL'
            });
        });

        lastLanes = lanes;
        lastTime = onset.time + (isHold ? duration : 0);
    });

    return notes;
};

const generateRawFallback = (onsets: Onset[], laneCount: number): Note[] => {
    return onsets
        .filter(o => o.energy > 0.1)
        .map((o, idx) => ({
            id: `fallback-${idx}`,
            time: o.time,
            lane: (idx % laneCount) as NoteLane,
            hit: false,
            visible: true,
            duration: 0,
            isHolding: false,
            type: 'NORMAL'
        }));
};

/**
 * 计算谱面的加权难度系数 (用于 UI 显示 1-15+ 级)
 * 重新平衡算法：防止高密度下的数值膨胀
 */
export const calculateDifficultyRating = (notes: Note[], duration: number): number => {
    if (notes.length === 0 || duration === 0) return 0;

    // 1. Average NPS
    const avgNps = notes.length / duration;

    // 2. Peak Density (Notes in 1s window)
    let maxWindowNotes = 0;
    const sortedNotes = notes.sort((a, b) => a.time - b.time);
    
    if (sortedNotes.length > 0) {
        let left = 0;
        for (let right = 0; right < sortedNotes.length; right++) {
            // Sliding window of 1.0 second
            while (sortedNotes[right].time - sortedNotes[left].time > 1.0) {
                left++;
            }
            const currentCount = right - left + 1;
            if (currentCount > maxWindowNotes) {
                maxWindowNotes = currentCount;
            }
        }
    }
    const peakNps = maxWindowNotes; 

    // --- REBALANCED FORMULA (FINAL) ---
    // Reduce weight of PeakNPS significantly to prevent bursts from exploding the score.
    // Use strong logarithmic compression for anything above 10.
    
    const weightedAvg = avgNps * 0.5; // Slightly reduced from 0.65
    const weightedPeak = peakNps * 0.05; // Heavily reduced from 0.15

    let rawScore = weightedAvg + weightedPeak;
    
    // Apply compression
    if (rawScore > 10) {
        // Logarithmic compression:
        // Input 11 -> ~11
        // Input 15 -> ~13
        // Input 25 -> ~15
        // Input 50 -> ~17
        const surplus = rawScore - 10;
        
        // Base 10 + 2.5 * log2(surplus + 1)
        // log2(2) = 1 -> 12.5
        // log2(5) = 2.3 -> 15.75
        // log2(17) = 4 -> 20
        rawScore = 10 + (Math.log2(surplus + 1) * 2.5);
    }
    
    // Hard cap to ensure UI never sees Lv 35 again
    return Math.max(1, Math.min(20, rawScore));
};
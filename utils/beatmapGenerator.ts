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
    // 2. 双押逻辑
    else if (count >= 2) {
        // 尽量对称或分布在两边
        // 4K: (0,3), (1,2), (0,2), (1,3)
        let pairs = [];
        if (laneCount === 4) {
            pairs = [[0,3], [1,2], [0,2], [1,3], [0,1], [2,3]];
        } else {
            pairs = [[0,5], [1,4], [2,3], [0,2], [3,5]];
        }
        
        const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
        lanes.push(...randomPair);
        
        // 如果需要更多键 (3或4)
        while(lanes.length < count) {
            const remaining = allLanes.filter(l => !lanes.includes(l));
            if(remaining.length === 0) break;
            lanes.push(remaining[Math.floor(Math.random() * remaining.length)]);
        }
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
    
    // 1. 按时间排序 (不进行量子化，保持 DSP 原始精度)
    let sortedOnsets = onsets.sort((a, b) => a.time - b.time);
    const config = DIFFICULTY_CONFIG[difficulty];

    // 生成逻辑
    notes = runGenerationPass(sortedOnsets, structure, config, laneCount, playStyle);

    // 保底机制
    if (notes.length < 30 && difficulty !== BeatmapDifficulty.Easy) {
        console.warn("Notes too sparse, retrying with lower threshold...");
        const retryConfig = { ...config, thresholdMultiplier: config.thresholdMultiplier * 0.7 };
        notes = runGenerationPass(sortedOnsets, structure, retryConfig, laneCount, playStyle);
    }
    
    if (notes.length === 0 && sortedOnsets.length > 0) {
        return generateRawFallback(sortedOnsets, laneCount);
    }

    return notes;
};

const runGenerationPass = (
    onsets: Onset[], 
    structure: SongStructure, 
    config: any,
    laneCount: LaneCount,
    playStyle: PlayStyle
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
        const allowJump = (currentSection.style === 'jump' || Math.random() < config.jumpChance) && currentSection.intensity > 0.6;
        
        if (allowJump && onset.energy > 0.75) {
            simNotes = 2;
            if (playStyle === 'MULTI' && laneCount === 6 && onset.energy > 0.9 && config.jumpChance > 0.3) {
                simNotes = 3;
            }
        }
        
        if (playStyle === 'THUMB') {
            simNotes = Math.min(simNotes, 2);
        }

        // Generate Lanes with Logic
        const lanes = getNextLanes(simNotes, lastLanes, laneCount, currentSection.style as any);

        // Hold Logic
        let isHold = false;
        let duration = 0;
        if (currentSection.style === 'hold' && Math.random() < config.holdChance && simNotes === 1) {
            isHold = true;
            const maxHold = config.minGap > 0.2 ? 0.5 : 1.0;
            duration = Math.min(maxHold, Math.max(0.1, 60 / structure.bpm)); 
        }

        lanes.forEach(lane => {
            notes.push({
                id: `note-${onset.time}-${lane}`,
                time: onset.time,
                lane: lane as NoteLane,
                hit: false,
                visible: true,
                duration: isHold ? duration : 0,
                isHolding: false
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
            isHolding: false
        }));
};

/**
 * 计算谱面的加权难度系数 (用于 UI 显示 1-10 级)
 */
export const calculateDifficultyRating = (notes: Note[], duration: number): number => {
    if (notes.length === 0 || duration === 0) return 0;

    const avgNps = notes.length / duration;

    let maxWindowNotes = 0;
    const sortedNotes = notes.sort((a, b) => a.time - b.time);
    
    if (sortedNotes.length > 0) {
        let left = 0;
        for (let right = 0; right < sortedNotes.length; right++) {
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
    
    // Linear / Exponential curve fit for levels 1-10
    const score = (Math.pow(avgNps, 1.2) * 0.4) + (Math.pow(peakNps, 1.1) * 0.15);
    
    return score;
};
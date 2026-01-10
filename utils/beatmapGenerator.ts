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
        thresholdMultiplier: 1.25, 
        minGap: 0.22,
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
        thresholdMultiplier: 0.75, 
        minGap: 0.11,
        streamChance: 0.6,
        holdChance: 0.2, 
        jumpChance: 0.45 
    }
};

export interface BeatmapFeatures {
    jumps: boolean;
    holds: boolean;
    catch: boolean;
}

const getNextLanes = (
    count: number, 
    lastLanes: number[], 
    laneCount: number, 
    style: 'stream' | 'jump' | 'simple'
): number[] => {
    const lanes: number[] = [];
    const allLanes = Array.from({length: laneCount}, (_, i) => i);
    
    if (count === 1) {
        const last = lastLanes[0];
        if (style === 'stream') {
            const candidates = allLanes.filter(l => Math.abs(l - last) >= 1 && Math.abs(l - last) <= 2);
            if (candidates.length > 0) {
                lanes.push(candidates[Math.floor(Math.random() * candidates.length)]);
            } else {
                lanes.push((last + 1) % laneCount);
            }
        } else {
            const candidates = allLanes.filter(l => !lastLanes.includes(l));
            if (candidates.length > 0) {
                lanes.push(candidates[Math.floor(Math.random() * candidates.length)]);
            } else {
                lanes.push(Math.floor(Math.random() * laneCount));
            }
        }
    } 
    else {
        const needed = count;
        const candidates = allLanes.filter(l => !lastLanes.includes(l));
        const pool = candidates.length >= needed ? candidates : allLanes;
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
    playStyle: PlayStyle = 'THUMB',
    features: BeatmapFeatures = { jumps: true, holds: true, catch: true }
): Note[] => {
    let notes: Note[] = [];
    const effectiveLaneCount = difficulty === BeatmapDifficulty.Titan ? 6 : laneCount;
    const effectivePlayStyle = difficulty === BeatmapDifficulty.Titan ? 'MULTI' : playStyle;

    let sortedOnsets = onsets.sort((a, b) => a.time - b.time);
    const config = DIFFICULTY_CONFIG[difficulty];

    notes = runGenerationPass(sortedOnsets, structure, config, effectiveLaneCount, effectivePlayStyle, difficulty, features);

    if (notes.length < 30 && difficulty !== BeatmapDifficulty.Easy) {
        const retryConfig = { ...config, thresholdMultiplier: config.thresholdMultiplier * 0.7 };
        notes = runGenerationPass(sortedOnsets, structure, retryConfig, effectiveLaneCount, effectivePlayStyle, difficulty, features);
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
    difficulty: BeatmapDifficulty,
    features: BeatmapFeatures
): Note[] => {
    const notes: Note[] = [];
    let lastLanes: number[] = [Math.floor(laneCount / 2)];
    let lastTime = -10;
    
    let lastNoteWasCatch = false;

    onsets.forEach(onset => {
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[structure.sections.length - 1];

        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.25;
        let dynamicThreshold = baseThreshold * config.thresholdMultiplier;

        if (currentSection.style === 'simple') dynamicThreshold *= 1.3;
        
        // Catch Chain Logic: Allow extremely small gaps for catch streams (1/16th)
        const minGap = lastNoteWasCatch ? config.minGap * 0.5 : config.minGap;

        if (onset.energy < dynamicThreshold) return;
        if (onset.time - lastTime < minGap) return;

        let simNotes = 1;
        const isTitan = difficulty === BeatmapDifficulty.Titan;
        
        // JUMP LOGIC: Controlled by features.jumps
        if (features.jumps) {
            const allowJump = (currentSection.style === 'jump' || Math.random() < config.jumpChance) && currentSection.intensity > 0.6;
            
            if (allowJump && onset.energy > 0.75) {
                simNotes = 2;
                if ((isTitan || (playStyle === 'MULTI' && laneCount === 6)) && onset.energy > 0.92) {
                     if (isTitan && Math.random() > 0.65) {
                         simNotes = 3; 
                         if (onset.energy > 0.99) simNotes = 4; 
                     } else if (config.jumpChance > 0.35) {
                         simNotes = 3;
                     }
                }
            }
            
            if (playStyle === 'THUMB' && !isTitan) {
                simNotes = Math.min(simNotes, 2);
            }
        } else {
            simNotes = 1;
        }

        const lanes = getNextLanes(simNotes, lastLanes, laneCount, currentSection.style as any);

        // HOLD LOGIC: Controlled by features.holds
        let isHold = false;
        let duration = 0;
        if (features.holds) {
            if (currentSection.style === 'hold' && Math.random() < config.holdChance && simNotes === 1) {
                isHold = true;
                const maxHold = config.minGap > 0.2 ? 0.5 : 1.0;
                duration = Math.min(maxHold, Math.max(0.1, 60 / structure.bpm)); 
            }
        }

        // CATCH LOGIC: Controlled by features.catch
        // Check if environment is suitable for Catch
        const canCatch = features.catch && !isHold && (currentSection.style === 'stream' || onset.energy > 0.8 || lastNoteWasCatch);
        
        lanes.forEach((lane, index) => {
            let type: 'NORMAL' | 'CATCH' = 'NORMAL';

            if (canCatch) {
                let catchProb = 0.1;

                // 1. High Energy / Kiai Section
                if (currentSection.style === 'stream' && currentSection.intensity > 0.7) catchProb = 0.3;
                
                // 2. Chain Logic (If previous was catch, boost prob to create slider feel)
                if (lastNoteWasCatch) {
                    if (onset.time - lastTime < 0.2) {
                         catchProb = 0.85; // High chance to continue chain
                    } else {
                         catchProb = 0.2; // Break chain if slow
                    }
                }

                // 3. Mixed Chords (Titan/Expert): Allow one note in a chord to be catch
                if (simNotes > 1 && isTitan) {
                     // Only make one of them catch usually
                     if (index === 0 && Math.random() < 0.4) {
                         type = 'CATCH';
                     }
                } else if (simNotes === 1) {
                    if (Math.random() < catchProb) {
                        type = 'CATCH';
                    }
                }
            }

            notes.push({
                id: `note-${onset.time}-${lane}`,
                time: onset.time,
                lane: lane as NoteLane,
                hit: false,
                visible: true,
                duration: isHold ? duration : 0,
                isHolding: false,
                type: type
            });
        });

        // Determine if this set contained a catch note for next iteration context
        const hasCatch = notes.slice(-lanes.length).some(n => n.type === 'CATCH');

        lastLanes = lanes;
        lastTime = onset.time + (isHold ? duration : 0);
        lastNoteWasCatch = hasCatch; 
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
    const weightedAvg = avgNps * 1.5; 
    const weightedPeak = peakNps * 0.1;
    let rawScore = weightedAvg + weightedPeak;
    
    if (rawScore > 12) {
        const excess = rawScore - 12;
        rawScore = 12 + Math.pow(excess, 0.75); 
    }
    
    return Math.max(1, parseFloat(rawScore.toFixed(1)));
};
export enum NoteLane {
  Lane1 = 0, // 4K: D | 6K: S
  Lane2 = 1, // 4K: F | 6K: D
  Lane3 = 2, // 4K: J | 6K: F
  Lane4 = 3, // 4K: K | 6K: J
  Lane5 = 4, // 6K: K
  Lane6 = 5  // 6K: L
}

export enum BeatmapDifficulty {
  Easy = 'EASY',
  Normal = 'NORMAL',
  Hard = 'HARD',
  Expert = 'EXPERT',
  Titan = 'TITAN'
}

export type LaneCount = 4 | 6;
export type PlayStyle = 'THUMB' | 'MULTI'; // Thumb = Max 2 simultaneous, Multi = Unlimited
export type NoteType = 'NORMAL' | 'CATCH';

export interface Note {
  time: number; // Time in seconds
  lane: NoteLane;
  id: string;
  hit: boolean;
  visible: boolean;
  duration: number; // 持续时间，0 表示单点，>0 表示长条
  isHolding: boolean; // 是否正在被按住
  type: NoteType; // 新增：音符类型
  missed?: boolean; // 新增：是否已判定为 Miss (用于视觉变灰)
}

// DSP 层输出：原始节奏点
export interface Onset {
  time: number;
  energy: number; // 能量值 (0-1)
  isLowFreq: boolean; // 是否是低频打击 (Kick/Bass)
}

// Gemini 决策层输出：歌曲结构元数据
export interface SongStructure {
  bpm: number;
  sections: SectionInfo[];
}

export interface SectionInfo {
  startTime: number;
  endTime: number;
  type: 'intro' | 'verse' | 'chorus' | 'build' | 'drop' | 'outro';
  intensity: number; // 0.0 - 1.0 (密度倍率)
  style: 'stream' | 'jump' | 'hold' | 'simple'; // 风格偏好
}

export interface GameResult {
    score: number;
    maxCombo: number;
    perfect: number;
    good: number;
    miss: number;
    rank: string; // "S", "A", etc.
    timestamp: number;
}

export interface SavedSong {
  id: string; // UUID
  title: string;
  artist: string;
  album?: string; // AI 推断的专辑
  coverArt?: string; // Base64 image string (Parsed from file)
  createdAt: number;
  duration: number;
  audioData: ArrayBuffer; // 存储音频原文件
  notes: Note[]; // 生成的谱面
  structure: SongStructure; // AI 分析结果
  theme: AITheme; // 生成的主题
  difficultyRating: number; // Calculated weighted difficulty
  laneCount: LaneCount;
  bestResult?: GameResult; // 历史最佳成绩
}

export interface GameConfig {
  speed: number; 
  scrollTime: number; 
}

export enum GameStatus {
  Library = 'LIBRARY', 
  Analyzing = 'ANALYZING',
  Ready = 'READY', 
  Countdown = 'COUNTDOWN',
  Playing = 'PLAYING',
  Paused = 'PAUSED', // NEW
  Finished = 'FINISHED',
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
}

export interface AITheme {
  primaryColor: string; // UI Highlights
  secondaryColor: string; // Background / Ambience
  perfectColor: string; // Specific color for Perfect judgment
  goodColor: string; // Specific color for Good judgment
  moodDescription: string;
}

export const DEFAULT_THEME: AITheme = {
  primaryColor: '#00f3ff',
  secondaryColor: '#ff00ff',
  perfectColor: '#ff00ff',
  goodColor: '#00f3ff',
  moodDescription: 'Ready'
};
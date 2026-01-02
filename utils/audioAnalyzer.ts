import { Onset } from '../types';

// 计算均方根 (RMS) 能量
const calculateRMS = (data: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
};

// 移动平均滤波器
const calculateMovingAverage = (data: number[], windowSize: number) => {
  const averages = new Float32Array(data.length);
  const halfWindow = Math.floor(windowSize / 2);
  
  // 简单实现
  for (let i = 0; i < data.length; i++) {
    let start = Math.max(0, i - halfWindow);
    let end = Math.min(data.length, i + halfWindow);
    let sum = 0;
    for(let j=start; j<end; j++) {
        sum += data[j];
    }
    averages[i] = sum / (end - start);
  }
  return averages;
};

/**
 * DSP Layer: 仅负责提取精确的时间点和能量特征
 * 不做任何游戏性决策（不决定 Lane，不决定 Note 类型）
 */
export const analyzeAudioDSP = async (
  arrayBuffer: ArrayBuffer, 
  audioContext: AudioContext
): Promise<{ buffer: AudioBuffer; onsets: Onset[]; duration: number }> => {
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // 1. 频段分离 (Kick/Bass vs Snare/Melody)
  const offlineContext = new OfflineAudioContext(
    1,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  const lowFilter = offlineContext.createBiquadFilter();
  lowFilter.type = "lowpass";
  lowFilter.frequency.value = 150;

  source.connect(lowFilter);
  lowFilter.connect(offlineContext.destination);
  
  source.start(0);
  const renderedLow = await offlineContext.startRendering();
  
  const lowChannelData = renderedLow.getChannelData(0);
  const fullChannelData = audioBuffer.getChannelData(0);

  const onsets: Onset[] = [];
  const sampleRate = audioBuffer.sampleRate;
  
  // 60 FPS 采样精度 (约 16ms)
  const frameRate = 60;
  const samplesPerFrame = Math.floor(sampleRate / frameRate);
  const totalFrames = Math.floor(lowChannelData.length / samplesPerFrame);

  // 能量谱计算
  const lowEnergies: number[] = [];
  const fullEnergies: number[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const start = i * samplesPerFrame;
    const end = start + samplesPerFrame;
    lowEnergies.push(calculateRMS(lowChannelData.slice(start, end)));
    fullEnergies.push(calculateRMS(fullChannelData.slice(start, end)));
  }

  // 局部动态阈值 (0.5秒窗口，用于捕捉瞬态)
  const localWindow = 0.5 * frameRate; 
  const lowThresholds = calculateMovingAverage(lowEnergies, localWindow);
  const fullThresholds = calculateMovingAverage(fullEnergies, localWindow);

  let lastOnsetTime = -1;
  // 降低物理间隔限制，允许更密集的音符检测 (50ms)
  const minGap = 0.05; 

  for (let i = 0; i < totalFrames; i++) {
      const time = i / frameRate;
      
      if (time - lastOnsetTime < minGap) continue;

      // 判定逻辑：瞬时能量必须显著高于局部平均
      // 降低 Sensitivity 阈值，从 1.2/1.3 降至 1.05/1.1，大幅增加候选点数量
      const lowRatio = lowEnergies[i] / (lowThresholds[i] + 0.00001);
      const fullRatio = fullEnergies[i] / (fullThresholds[i] + 0.00001);
      const absLow = lowEnergies[i];
      const absFull = fullEnergies[i];

      // 降低绝对静音阈值，防止安静片段无音符 (0.05 -> 0.01)
      const silenceThreshold = 0.01;
      
      const isLowHit = lowRatio > 1.05 && absLow > silenceThreshold;
      const isFullHit = fullRatio > 1.1 && absFull > silenceThreshold;

      if (isLowHit || isFullHit) {
          // 标准化能量值 0-1
          // 增加增益乘数 (* 5)，让中等音量的点也能达到较高 energy 值，通过后续筛选
          const energy = Math.min(1, Math.max(absLow, absFull) * 5);
          
          onsets.push({
              time,
              energy,
              isLowFreq: isLowHit && (lowRatio > fullRatio)
          });
          lastOnsetTime = time;
      }
  }

  return { buffer: audioBuffer, onsets, duration: audioBuffer.duration };
};
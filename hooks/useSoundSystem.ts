import { useRef, useCallback, useEffect } from 'react';

export const useSoundSystem = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const buffersRef = useRef<{ perfect: AudioBuffer | null; good: AudioBuffer | null }>({
    perfect: null,
    good: null,
  });

  // Initialize AudioContext and generate buffers
  useEffect(() => {
    const initAudio = () => {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new Ctx();
      audioContextRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.6; // Slightly louder master
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      const sr = ctx.sampleRate;

      // --- Generate "Perfect" Sound (Crisp Rhythm Game Click) ---
      // A mix of high-passed white noise (snap) and a very short tone (body)
      const pDuration = 0.05;
      const pBuffer = ctx.createBuffer(1, sr * pDuration, sr);
      const pData = pBuffer.getChannelData(0);
      
      for (let i = 0; i < pData.length; i++) {
        // 1. Noise Burst
        const t = i / sr;
        const noise = (Math.random() * 2 - 1);
        // Very fast exponential decay for sharpness
        const envelope = Math.exp(-t * 80); 
        pData[i] = noise * envelope;
      }
      buffersRef.current.perfect = pBuffer;

      // --- Generate "Good" Sound (Softer, Woodblock-ish) ---
      const gDuration = 0.05;
      const gBuffer = ctx.createBuffer(1, sr * gDuration, sr);
      const gData = gBuffer.getChannelData(0);
      for (let i = 0; i < gData.length; i++) {
         const t = i / sr;
         // Sine wave starting at 400Hz dropping quickly
         const freq = 400 * Math.exp(-t * 20);
         const val = Math.sin(2 * Math.PI * freq * t);
         const envelope = Math.exp(-t * 40);
         gData[i] = val * envelope * 0.8;
      }
      buffersRef.current.good = gBuffer;
    };

    initAudio();

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const playHitSound = useCallback((type: 'PERFECT' | 'GOOD') => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'suspended') {
        ctx?.resume();
    }
    if (!ctx || !gainNodeRef.current) return;

    const t = ctx.currentTime;

    if (type === 'PERFECT') {
        // Layer 1: The Snappy Noise Buffer
        if (buffersRef.current.perfect) {
            const source = ctx.createBufferSource();
            source.buffer = buffersRef.current.perfect;
            
            // Highpass to remove muddiness
            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 2000;
            
            source.connect(filter);
            filter.connect(gainNodeRef.current);
            source.start(t);
        }

        // Layer 2: A very short high-frequency tick for precision feeling
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(3000, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.03);
        
        oscGain.gain.setValueAtTime(0.3, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        
        osc.connect(oscGain);
        oscGain.connect(gainNodeRef.current);
        osc.start(t);
        osc.stop(t + 0.04);

    } else {
        // Good Sound: Just the buffer
         if (buffersRef.current.good) {
            const source = ctx.createBufferSource();
            source.buffer = buffersRef.current.good;
            source.connect(gainNodeRef.current);
            source.start(t);
        }
    }
  }, []);

  return { playHitSound };
};
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
      masterGain.gain.value = 0.4; // Master volume
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      // Generate "Perfect" Sound (Crisp Snare/Clap style)
      const sr = ctx.sampleRate;
      const pBuffer = ctx.createBuffer(1, sr * 0.15, sr);
      const pData = pBuffer.getChannelData(0);
      for (let i = 0; i < pData.length; i++) {
        // White noise with exponential decay
        const t = i / sr;
        const envelope = Math.exp(-t * 20); 
        pData[i] = (Math.random() * 2 - 1) * envelope;
      }
      buffersRef.current.perfect = pBuffer;

      // Generate "Good" Sound (Thumpy Kick/Woodblock style)
      // We will synthesize this on the fly usually, but a buffer is fine too.
      // Actually, for the "Good" sound, an oscillator sweep is often better, 
      // but let's pre-render a short blip for performance.
      const gBuffer = ctx.createBuffer(1, sr * 0.1, sr);
      const gData = gBuffer.getChannelData(0);
      for (let i = 0; i < gData.length; i++) {
         const t = i / sr;
         const sine = Math.sin(2 * Math.PI * 150 * t); // Low sine
         const envelope = Math.exp(-t * 30);
         gData[i] = sine * envelope;
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
        // High frequency "ping" + Noise Snap
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        osc.connect(oscGain);
        oscGain.connect(gainNodeRef.current);
        osc.start(t);
        osc.stop(t + 0.1);
        oscGain.gain.setValueAtTime(0.5, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        // Add the noise snap buffer
        if (buffersRef.current.perfect) {
            const source = ctx.createBufferSource();
            source.buffer = buffersRef.current.perfect;
            // High pass filter for crispness
            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 1000;
            
            source.connect(filter);
            filter.connect(gainNodeRef.current);
            source.start(t);
        }

    } else {
        // Muted "Thud"
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
        
        osc.connect(oscGain);
        oscGain.connect(gainNodeRef.current);
        
        oscGain.gain.setValueAtTime(0.5, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        osc.start(t);
        osc.stop(t + 0.1);
    }
  }, []);

  return { playHitSound };
};
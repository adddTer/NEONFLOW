import React, { useEffect, useRef } from 'react';
import { Note, ScoreState, GameStatus, AITheme, LaneCount, NoteLane } from '../types';
import { useSoundSystem } from '../hooks/useSoundSystem';

interface GameCanvasProps {
  status: GameStatus;
  audioBuffer: AudioBuffer | null;
  notes: Note[];
  theme: AITheme;
  onScoreUpdate: (score: ScoreState) => void;
  onGameEnd: (finalScore: ScoreState) => void; // UPDATED: Accept score argument
}

// Key mappings
const KEYS_4 = ['d', 'f', 'j', 'k'];
const LABELS_4 = ['D', 'F', 'J', 'K'];

const KEYS_6 = ['s', 'd', 'f', 'j', 'k', 'l'];
const LABELS_6 = ['S', 'D', 'F', 'J', 'K', 'L'];

// Dimensions & Timing
const BASE_TARGET_WIDTH = 90; // Target width per lane on desktop
const HIT_WINDOW_PERFECT = 0.050; // 50ms
const HIT_WINDOW_GOOD = 0.120; // 120ms
const HIT_WINDOW_CATCH = 0.100; // Catch notes have a slightly easier window, essentially "Good" range
const SCROLL_SPEED = 700; 
const SCORE_BASE_PERFECT = 1000;
const SCORE_BASE_GOOD = 500;
const SCORE_HOLD_TICK = 20; 

// IMPORTANT: Delay the audio start by this amount to allow notes to spawn at top and fall down.
// With scroll speed 700 and hit line at ~85% height, notes need time to travel.
const LEAD_IN_TIME = 2.0; // 2 Seconds delay

// Visual Particles
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.color = color;
    this.size = Math.random() * 4 + 2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15; // Gravity
    this.life -= 0.02; // Decay
    this.size *= 0.95;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  status, 
  audioBuffer, 
  notes, 
  theme,
  onScoreUpdate,
  onGameEnd 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  
  const notesRef = useRef<Note[]>([]);
  const scoreRef = useRef<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
  const keyStateRef = useRef<boolean[]>([]);
  const laneMissStateRef = useRef<number[]>([]); 
  const laneHitStateRef = useRef<number[]>([]); 
  const effectRef = useRef<{id: number, text: string, time: number, lane: number, color: string, scale: number}[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const comboScaleRef = useRef<number>(1.0);

  // Determine Lane Count from notes if possible, else default to 4
  const laneCountRef = useRef<LaneCount>(4);
  const keysRef = useRef<string[]>(KEYS_4);
  const labelsRef = useRef<string[]>(LABELS_4);
  const laneWidthRef = useRef<number>(BASE_TARGET_WIDTH);

  const { playHitSound } = useSoundSystem();

  // Determine lanes config on mount/notes change
  useEffect(() => {
      const maxLaneIndex = notes.reduce((max, n) => Math.max(max, n.lane), 0);
      const count = maxLaneIndex > 3 ? 6 : 4;
      laneCountRef.current = count;
      keysRef.current = count === 6 ? KEYS_6 : KEYS_4;
      labelsRef.current = count === 6 ? LABELS_6 : LABELS_4;
      
      // Init states
      keyStateRef.current = new Array(count).fill(false);
      laneMissStateRef.current = new Array(count).fill(0);
      laneHitStateRef.current = new Array(count).fill(0);
  }, [notes]);

  const playMusic = () => {
    if (!audioBuffer) return;
    const ctx = new ((window.AudioContext || (window as any).webkitAudioContext) as any)();
    audioContextRef.current = ctx;
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
       if (status === GameStatus.Playing) {
           // Pass the CURRENT scoreRef value to avoid closure staleness
           onGameEnd(scoreRef.current);
       }
    };
    
    // Start music in the future (after LEAD_IN_TIME)
    const now = ctx.currentTime;
    startTimeRef.current = now + LEAD_IN_TIME;
    source.start(startTimeRef.current);
    
    sourceRef.current = source;
  };

  const stopMusic = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    if (status === GameStatus.Playing) {
      notesRef.current = JSON.parse(JSON.stringify(notes));
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 };
      effectRef.current = [];
      particlesRef.current = [];
      comboScaleRef.current = 1.0;
      
      playMusic();
      requestRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      stopMusic();
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      stopMusic();
    };
  }, [status]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== GameStatus.Playing) return;
      const keyIndex = keysRef.current.indexOf(e.key.toLowerCase());
      if (keyIndex !== -1 && !keyStateRef.current[keyIndex]) {
        keyStateRef.current[keyIndex] = true;
        processHit(keyIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyIndex = keysRef.current.indexOf(e.key.toLowerCase());
      if (keyIndex !== -1) {
        keyStateRef.current[keyIndex] = false;
        processRelease(keyIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [status]);

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
        particlesRef.current.push(new Particle(x, y, color));
    }
  };

  const triggerHitVisuals = (lane: number, type: 'PERFECT' | 'GOOD') => {
      const isPerfect = type === 'PERFECT';
      playHitSound(type);

      laneHitStateRef.current[lane] = 1.0; 
      comboScaleRef.current = 1.5;

      const canvas = canvasRef.current;
      if (canvas) {
          const count = laneCountRef.current;
          const laneW = laneWidthRef.current;
          const totalWidth = laneW * count;
          const startX = (canvas.width - totalWidth) / 2;
          const laneX = startX + lane * laneW + laneW / 2;
          const hitY = canvas.height * 0.85;
          
          const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
          spawnParticles(laneX, hitY, hitColor, isPerfect ? 20 : 10);
      }

      // Effect Text
      const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
      effectRef.current.push({
        id: Math.random(),
        text: type,
        time: performance.now(),
        lane: lane,
        color: hitColor,
        scale: 1.5
      });
  };

  const processHit = (lane: number) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    // Calculate Game Time (can be negative during lead-in)
    const gameTime = ctx.currentTime - startTimeRef.current;

    const hitNote = notesRef.current.find(n => 
      !n.hit && 
      n.lane === lane && 
      n.type === 'NORMAL' && // Only process Normal notes on direct Hit
      Math.abs(gameTime - n.time) < HIT_WINDOW_GOOD
    );

    if (hitNote) {
      const diff = Math.abs(gameTime - hitNote.time);
      let type: 'PERFECT' | 'GOOD' = 'GOOD';
      let baseScore = SCORE_BASE_GOOD;
      const isPerfect = diff < HIT_WINDOW_PERFECT;

      if (isPerfect) {
        type = 'PERFECT';
        baseScore = SCORE_BASE_PERFECT;
        scoreRef.current.perfect++;
      } else {
        scoreRef.current.good++;
      }

      triggerHitVisuals(lane, type);

      hitNote.hit = true;
      if (hitNote.duration > 0) {
          hitNote.isHolding = true;
      } else {
          hitNote.visible = false;
      }
      
      scoreRef.current.combo++;
      if (scoreRef.current.combo > scoreRef.current.maxCombo) {
        scoreRef.current.maxCombo = scoreRef.current.combo;
      }

      scoreRef.current.score += baseScore * (1 + Math.min(scoreRef.current.combo, 100) / 50);
    }
    
    onScoreUpdate({...scoreRef.current});
  };

  const processRelease = (lane: number) => {
      const holdingNote = notesRef.current.find(n => n.lane === lane && n.isHolding);
      if (holdingNote) {
          holdingNote.isHolding = false;
      }
  };

  const gameLoop = (time: number) => {
    if (status !== GameStatus.Playing || !audioContextRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (container && (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight)) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    // Dynamic Lane Width Calculation
    const count = laneCountRef.current;
    const maxPossibleWidth = (canvas.width - 20) / count;
    const laneW = Math.min(BASE_TARGET_WIDTH, maxPossibleWidth);
    laneWidthRef.current = laneW;

    // Game Time = Current Context Time - Start Time
    // Before music starts, this is negative (e.g. -2.0 to 0.0)
    const gameTime = audioContextRef.current.currentTime - startTimeRef.current;
    const duration = audioBuffer?.duration || 1;
    const hitLineY = canvas.height * 0.85;
    
    const totalWidth = laneW * count;
    const startX = (canvas.width - totalWidth) / 2;
    
    // --- Background ---
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#000000');
    bgGrad.addColorStop(1, `${theme.primaryColor}11`); 
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- Draw Lanes ---
    for (let i = 0; i < count; i++) {
        const x = startX + i * laneW;
        const isPressed = keyStateRef.current[i];
        
        // Lane Miss
        if (laneMissStateRef.current[i] > 0) {
            ctx.fillStyle = `rgba(255, 50, 50, ${laneMissStateRef.current[i] * 0.3})`; 
            ctx.fillRect(x, 0, laneW, canvas.height);
            laneMissStateRef.current[i] = Math.max(0, laneMissStateRef.current[i] - 0.05);
        }

        // Hit Flash
        if (laneHitStateRef.current[i] > 0) {
            const alpha = laneHitStateRef.current[i];
            const grad = ctx.createLinearGradient(x, hitLineY, x, canvas.height);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.4})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY, laneW, canvas.height - hitLineY);
            laneHitStateRef.current[i] = Math.max(0, alpha - 0.1);
        }
        
        // Active Lane BG
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(x, 0, laneW, canvas.height);

        // Key Press Beam
        if (isPressed) {
            const grad = ctx.createLinearGradient(x, hitLineY, x, 0);
            grad.addColorStop(0, `${theme.primaryColor}44`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, 0, laneW, hitLineY);
        }

        // Divider
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();

        // Receptor
        const receptorX = x + 4;
        const receptorW = laneW - 8;
        
        ctx.shadowBlur = isPressed ? 20 : 0;
        ctx.shadowColor = theme.primaryColor;
        ctx.fillStyle = isPressed ? theme.primaryColor : 'rgba(255,255,255,0.2)';
        ctx.fillRect(receptorX, hitLineY, receptorW, 12);
        ctx.shadowBlur = 0;
        
        // Label
        const labelY = hitLineY + 40;
        ctx.fillStyle = isPressed ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.font = `bold 24px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(labelsRef.current[i], x + laneW / 2, labelY);
    }
    
    // Right Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(startX + count * laneW, 0);
    ctx.lineTo(startX + count * laneW, canvas.height);
    ctx.stroke();

    // --- Draw & Process Notes ---
    notesRef.current.forEach(note => {
        if (!note.visible) return;

        // CATCH Logic: Check overlap with judgment line AND key state
        if (note.type === 'CATCH' && !note.hit) {
             const timeDiff = Math.abs(gameTime - note.time);
             // If overlapping and key is down
             if (timeDiff <= HIT_WINDOW_CATCH && keyStateRef.current[note.lane]) {
                 // Auto Hit!
                 note.hit = true;
                 note.visible = false;
                 scoreRef.current.perfect++;
                 scoreRef.current.combo++;
                 if (scoreRef.current.combo > scoreRef.current.maxCombo) {
                     scoreRef.current.maxCombo = scoreRef.current.combo;
                 }
                 scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50);
                 
                 triggerHitVisuals(note.lane, 'PERFECT');
                 onScoreUpdate({...scoreRef.current});
             }
        }

        // MISS Logic
        const noteMissTime = note.time + HIT_WINDOW_GOOD;
        if (!note.hit && gameTime > noteMissTime) {
            note.visible = false;
            note.hit = true; 
            scoreRef.current.miss++;
            scoreRef.current.combo = 0;
            laneMissStateRef.current[note.lane] = 1.0; 
            effectRef.current.push({
                id: Math.random(),
                text: 'MISS',
                time: performance.now(),
                lane: note.lane,
                color: '#888888',
                scale: 1.2
            });
            onScoreUpdate({...scoreRef.current});
        }

        // HOLD Logic
        if (note.hit && note.duration > 0 && note.isHolding) {
            const endTime = note.time + note.duration;
            if (gameTime < endTime) {
                if (Math.random() > 0.5) {
                    const lx = startX + note.lane * laneW + laneW / 2 + (Math.random() * 20 - 10);
                    spawnParticles(lx, hitLineY, theme.secondaryColor, 1);
                }
                scoreRef.current.score += SCORE_HOLD_TICK * (1 + Math.min(scoreRef.current.combo, 100) / 100);
            } else {
                note.visible = false;
                note.isHolding = false;
            }
            onScoreUpdate({...scoreRef.current});
        }
        
        // Rendering based on Game Time
        const timeDiff = note.time - gameTime;
        const headY = hitLineY - (timeDiff * SCROLL_SPEED);
        const pad = 6; 
        const noteW = laneW - (pad * 2);
        const noteX = startX + note.lane * laneW + pad;
        
        if (headY > -200 || (headY - note.duration * SCROLL_SPEED) < canvas.height) {
            // Draw Hold Body
            if (note.duration > 0) {
                const bodyHeight = note.duration * SCROLL_SPEED;
                let drawHeadY = headY;
                let drawHeight = bodyHeight;

                if (note.isHolding) {
                    drawHeadY = hitLineY;
                    const remainingTime = (note.time + note.duration) - gameTime;
                    drawHeight = Math.max(0, remainingTime * SCROLL_SPEED);
                }
                ctx.fillStyle = `${theme.secondaryColor}aa`;
                ctx.fillRect(noteX + 4, drawHeadY - drawHeight, noteW - 8, drawHeight);
            }

            if (!note.isHolding || note.duration === 0) {
                if (note.type === 'CATCH') {
                     // Draw Diamond for Catch Note (Flattened)
                     ctx.shadowBlur = 20;
                     ctx.shadowColor = theme.goodColor;
                     ctx.fillStyle = '#000000'; // Hollow center
                     ctx.strokeStyle = theme.goodColor;
                     ctx.lineWidth = 4;
                     
                     const cx = noteX + noteW / 2;
                     const cy = headY;
                     const sizeX = noteW / 2;
                     const sizeY = noteW / 8; // Flattened height (previously /4)
                     
                     ctx.beginPath();
                     ctx.moveTo(cx, cy - sizeY); // Top
                     ctx.lineTo(cx + sizeX, cy); // Right
                     ctx.lineTo(cx, cy + sizeY); // Bottom
                     ctx.lineTo(cx - sizeX, cy); // Left
                     ctx.closePath();
                     ctx.fill();
                     ctx.stroke();

                     // Inner small diamond
                     ctx.fillStyle = theme.goodColor;
                     ctx.beginPath();
                     ctx.moveTo(cx, cy - sizeY/3);
                     ctx.lineTo(cx + sizeX/3, cy);
                     ctx.lineTo(cx, cy + sizeY/3);
                     ctx.lineTo(cx - sizeX/3, cy);
                     ctx.closePath();
                     ctx.fill();

                     ctx.shadowBlur = 0;
                } else {
                    // Draw Normal Rectangle
                     ctx.shadowBlur = 15;
                     ctx.shadowColor = theme.secondaryColor;
                     ctx.fillStyle = theme.secondaryColor;
                     ctx.fillRect(noteX, headY - 14, noteW, 28);
                     ctx.shadowBlur = 0;
                     ctx.fillStyle = 'rgba(255,255,255,0.9)';
                     ctx.fillRect(noteX, headY - 8, noteW, 8);
                }
            } 
        }
    });

    // --- Particles & Effects ---
    particlesRef.current.forEach((p, i) => {
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particlesRef.current.splice(i, 1);
    });

    effectRef.current = effectRef.current.filter(effect => performance.now() - effect.time < 600);
    effectRef.current.forEach(effect => {
        const x = startX + effect.lane * laneW + laneW / 2;
        const progress = (performance.now() - effect.time) / 600;
        const y = hitLineY - 100 - (progress * 50); 
        
        ctx.save();
        ctx.fillStyle = effect.color;
        ctx.font = '900 36px Arial'; 
        ctx.textAlign = 'center';
        
        const currentScale = effect.scale * (1 - progress * 0.5); 
        ctx.translate(x, y);
        ctx.scale(currentScale, currentScale);
        ctx.shadowBlur = 10;
        ctx.shadowColor = effect.color;
        ctx.globalAlpha = 1 - progress; 
        ctx.fillText(effect.text, 0, 0);
        ctx.restore();
    });

    // --- Progress & Combo ---
    const progress = Math.min(1, Math.max(0, gameTime) / duration);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width * progress, 4);

    if (scoreRef.current.combo > 0) {
        comboScaleRef.current = comboScaleRef.current + (1.0 - comboScaleRef.current) * 0.1;
        const combo = scoreRef.current.combo;
        let comboColor = '#ffffff';
        let glowColor = 'transparent';

        if (combo >= 100) { comboColor = '#f9f871'; glowColor = '#f9f871'; } 
        else if (combo >= 50) { comboColor = '#00f3ff'; glowColor = '#00f3ff'; } 

        ctx.save();
        ctx.translate(canvas.width / 2, 100);
        ctx.scale(comboScaleRef.current, comboScaleRef.current);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'italic 900 80px Arial';
        ctx.fillStyle = comboColor;
        ctx.shadowBlur = 20;
        ctx.shadowColor = glowColor;
        ctx.fillText(combo.toString(), 0, 0);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#aaaaaa';
        ctx.shadowBlur = 0;
        ctx.fillText("COMBO", 0, 50);
        ctx.restore();
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div className="relative w-full h-full flex justify-center overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Mobile Controls Overlay - Taller and better feedback */}
      <div className="absolute bottom-0 left-0 right-0 h-40 flex justify-center gap-1 md:hidden pointer-events-none px-2 pb-2">
        {keysRef.current.map((k, i) => (
            <div key={k} className="flex-1 bg-gradient-to-t from-white/20 to-transparent border-x border-white/10 rounded-b-lg flex items-end justify-center pb-4 pointer-events-auto active:bg-white/30 active:from-white/30 touch-none backdrop-blur-[2px] transition-colors"
                onTouchStart={(e) => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); }}
                onTouchEnd={(e) => { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); }}
            >
                <span className="text-white/50 font-bold text-xl">{labelsRef.current[i]}</span>
            </div>
        ))}
      </div>
    </div>
  );
};

export default GameCanvas;
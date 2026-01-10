import React, { useEffect, useRef, useState } from 'react';
import { Note, ScoreState, GameStatus, AITheme, LaneCount, NoteLane } from '../types';
import { useSoundSystem } from '../hooks/useSoundSystem';

interface GameCanvasProps {
  status: GameStatus;
  audioBuffer: AudioBuffer | null;
  notes: Note[];
  theme: AITheme;
  audioOffset: number; 
  hideNotes?: boolean; 
  isPaused?: boolean; // Prop for external pause signal (orientation)
  onScoreUpdate: (score: ScoreState) => void;
  onGameEnd: (finalScore: ScoreState) => void; 
}

// Key mappings (PC Fallback)
const KEYS_4 = ['d', 'f', 'j', 'k'];
const LABELS_4 = ['D', 'F', 'J', 'K'];

const KEYS_6 = ['s', 'd', 'f', 'j', 'k', 'l'];
const LABELS_6 = ['S', 'D', 'F', 'J', 'K', 'L'];

// Dimensions & Timing
const BASE_TARGET_WIDTH = 100; // Slightly larger for better touch targets
const HIT_WINDOW_PERFECT = 0.050; 
const HIT_WINDOW_GOOD = 0.120; 
const HIT_WINDOW_CATCH = 0.100;
// SCROLL_SPEED is now dynamic based on height
const SCORE_BASE_PERFECT = 1000;
const SCORE_BASE_GOOD = 500;
const SCORE_HOLD_TICK = 20; 

const LEAD_IN_TIME = 2.0; 

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
    this.life -= 0.05; // Faster Decay for performance
    this.size *= 0.95;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    // Optimize: Use fillRect instead of arc for better performance
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1.0;
  }
}

interface GhostNote {
    lane: number;
    timeDiff: number; // relative time (noteTime - hitTime)
    life: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  status, 
  audioBuffer, 
  notes, 
  theme,
  audioOffset,
  hideNotes,
  isPaused,
  onScoreUpdate,
  onGameEnd 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Game State Refs (High Frequency)
  const notesRef = useRef<Note[]>([]);
  const scoreRef = useRef<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
  const keyStateRef = useRef<boolean[]>([]);
  const laneMissStateRef = useRef<number[]>([]); 
  const laneHitStateRef = useRef<number[]>([]); 
  const effectRef = useRef<{id: number, text: string, time: number, lane: number, color: string, scale: number}[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const ghostNotesRef = useRef<GhostNote[]>([]); 
  const comboScaleRef = useRef<number>(1.0);

  // Layout Refs (Updated via ResizeObserver)
  const laneCountRef = useRef<LaneCount>(4);
  const keysRef = useRef<string[]>(KEYS_4);
  const labelsRef = useRef<string[]>(LABELS_4);
  const laneWidthRef = useRef<number>(BASE_TARGET_WIDTH);
  const startXRef = useRef<number>(0);
  const scrollSpeedRef = useRef<number>(800);

  // Track the audio pause time to resume correctly
  const pauseTimeRef = useRef<number>(0);
  const totalPauseDurationRef = useRef<number>(0);

  // Touch Tracking for Sliding
  const activeTouchesRef = useRef<Map<number, number>>(new Map()); // Map<TouchIdentifier, LaneIndex>

  const [layout, setLayout] = useState({ startX: 0, laneWidth: 0, count: 4 });

  const { playHitSound } = useSoundSystem();

  // 1. Initialize Game State on Notes Change
  useEffect(() => {
      const maxLaneIndex = notes.reduce((max, n) => Math.max(max, n.lane), 0);
      const count = maxLaneIndex > 3 ? 6 : 4;
      laneCountRef.current = count;
      keysRef.current = count === 6 ? KEYS_6 : KEYS_4;
      labelsRef.current = count === 6 ? LABELS_6 : LABELS_4;
      
      keyStateRef.current = new Array(count).fill(false);
      laneMissStateRef.current = new Array(count).fill(0);
      laneHitStateRef.current = new Array(count).fill(0);

      // Trigger initial layout calculation
      if (containerRef.current) {
          updateLayout(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
  }, [notes]);

  // Layout Calculation Logic
  const updateLayout = (containerWidth: number, containerHeight: number) => {
      const count = laneCountRef.current;
      const maxPossibleWidth = containerWidth / count;
      const laneW = Math.min(BASE_TARGET_WIDTH, maxPossibleWidth);
      const totalWidth = laneW * count;
      const startX = (containerWidth - totalWidth) / 2;

      laneWidthRef.current = laneW;
      startXRef.current = startX;
      
      const dynamicSpeed = Math.max(400, containerHeight * 1.0); 
      scrollSpeedRef.current = dynamicSpeed;
      
      setLayout({ startX, laneWidth: laneW, count });
  };

  // Resize Observer
  useEffect(() => {
      if (!containerRef.current) return;
      const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
              updateLayout(entry.contentRect.width, entry.contentRect.height);
          }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  // 2. Audio Control
  const playMusic = (offset: number = 0) => {
    if (!audioBuffer) return;
    
    // Resume existing context if available, otherwise create new
    let ctx = audioContextRef.current;
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    
    if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: audioBuffer.sampleRate });
        audioContextRef.current = ctx;
    } else if (ctx.state === 'suspended') {
        ctx.resume();
    }
    
    // Stop old source if any
    if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch(e){}
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
       // Only trigger end if we are actually playing and reached the end naturally
       if (status === GameStatus.Playing && ctx?.currentTime && ctx.currentTime > (startTimeRef.current + audioBuffer.duration)) {
           onGameEnd(scoreRef.current);
       }
    };
    
    const now = ctx.currentTime;
    
    // If starting from 0, add lead-in. If resuming, we are already past lead-in.
    // Offset here represents "how much of the song has already played".
    
    if (offset === 0) {
        startTimeRef.current = now + LEAD_IN_TIME;
        source.start(startTimeRef.current);
    } else {
        // Resuming: We need to calculate what the "original" start time would have been relative to NOW
        // current_song_pos = offset
        // now - startTime = offset
        // startTime = now - offset
        startTimeRef.current = now - offset;
        source.start(0, offset);
    }
    
    sourceRef.current = source;
  };

  const stopMusic = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
       // Do not close, just suspend if we might resume, but for full stop/exit:
       if (status === GameStatus.Finished || status === GameStatus.Library) {
           try { audioContextRef.current.close(); } catch(e) {}
           audioContextRef.current = null;
       } else {
           try { audioContextRef.current.suspend(); } catch(e) {}
       }
    }
  };

  // 3. Status Change Management
  useEffect(() => {
    // Initial Start
    if (status === GameStatus.Playing && !audioContextRef.current) {
      notesRef.current = JSON.parse(JSON.stringify(notes));
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 };
      effectRef.current = [];
      particlesRef.current = [];
      ghostNotesRef.current = [];
      comboScaleRef.current = 1.0;
      keyStateRef.current = new Array(laneCountRef.current).fill(false); 
      activeTouchesRef.current.clear();
      totalPauseDurationRef.current = 0;
      
      playMusic(0);
      requestRef.current = requestAnimationFrame(gameLoop);
    } 
    // Resuming from Pause (via Countdown)
    else if (status === GameStatus.Playing && audioContextRef.current?.state === 'suspended') {
         audioContextRef.current.resume();
         // Don't create new source here if simple suspend/resume works, 
         // BUT standard Web Audio resume doesn't seek. 
         // If we suspended via stopMusic/suspend, resume() continues where left off clock-wise.
         requestRef.current = requestAnimationFrame(gameLoop);
    }
    // Entering Pause
    else if (status === GameStatus.Paused) {
        if (audioContextRef.current) {
            audioContextRef.current.suspend();
        }
        // We Keep game loop running but in "freeze" mode to render notes static
        if (!requestRef.current) {
             requestRef.current = requestAnimationFrame(gameLoop);
        }
    }
    // Cleanup on Exit
    else if (status === GameStatus.Library || status === GameStatus.Finished) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopMusic();
      audioContextRef.current = null;
    }
    
    // Countdown Logic (Resuming)
    if (status === GameStatus.Countdown && audioContextRef.current) {
        // Ensure we render the frozen frame during countdown
        requestRef.current = requestAnimationFrame(gameLoop);
    }

  }, [status]);


  // 4. Keyboard Input (PC)
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
      if (status !== GameStatus.Playing) return;
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

  // 5. Advanced Touch Input Handlers (Mobile - Sliding Support)
  const getLaneFromTouchX = (touchX: number) => {
      const laneW = laneWidthRef.current;
      const startX = startXRef.current;
      const count = laneCountRef.current;
      const relativeX = touchX - startX;
      const index = Math.floor(relativeX / laneW);
      if (index >= 0 && index < count) return index;
      return -1;
  };

  const engageLane = (lane: number) => {
      if (lane < 0 || lane >= laneCountRef.current) return;
      keyStateRef.current[lane] = true;
      processHit(lane);
  };

  const disengageLane = (lane: number) => {
      if (lane < 0 || lane >= laneCountRef.current) return;
      const isStillHeld = Array.from(activeTouchesRef.current.values()).includes(lane);
      if (!isStillHeld) {
          keyStateRef.current[lane] = false;
          processRelease(lane);
      }
  };

  const handleGlobalTouch = (e: React.TouchEvent) => {
      if (status !== GameStatus.Playing) return;
      if (e.cancelable && e.type !== 'touchstart') {
          e.preventDefault();
      }

      const changed = e.changedTouches;
      for (let i = 0; i < changed.length; i++) {
          const t = changed[i];
          const touchId = t.identifier;
          const lane = getLaneFromTouchX(t.clientX);
          
          if (e.type === 'touchstart') {
              if (lane !== -1) {
                  activeTouchesRef.current.set(touchId, lane);
                  engageLane(lane);
              }
          } 
          else if (e.type === 'touchmove') {
              const oldLane = activeTouchesRef.current.get(touchId);
              if (lane !== oldLane) {
                  activeTouchesRef.current.set(touchId, lane);
                  if (oldLane !== undefined && oldLane !== -1) disengageLane(oldLane);
                  if (lane !== -1) engageLane(lane);
              }
          }
          else if (e.type === 'touchend' || e.type === 'touchcancel') {
              const oldLane = activeTouchesRef.current.get(touchId);
              activeTouchesRef.current.delete(touchId);
              if (oldLane !== undefined && oldLane !== -1) disengageLane(oldLane);
          }
      }
  };

  // 6. Game Logic
  const getCurrentGameTime = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return 0;
      
      // LATENCY COMPENSATION
      // outputLatency: Time from processing to speaker (Hardware)
      // baseLatency: Processing buffer size latency
      const outputLatency = (ctx as any).outputLatency || 0;
      const baseLatency = (ctx as any).baseLatency || 0;
      
      // We want the visual time to match when the sound actually hits the ear.
      // AudioContext.currentTime is the time of the *next* block to be processed.
      // So the sound heard NOW corresponds to currentTime - outputLatency.
      
      const rawTime = ctx.currentTime - startTimeRef.current;
      return rawTime - (audioOffset / 1000) - (outputLatency + baseLatency);
  };

  const processHit = (lane: number) => {
    if (!audioContextRef.current) return;
    const gameTime = getCurrentGameTime();

    const hitNote = notesRef.current.find(n => 
      !n.hit && 
      !n.missed && 
      n.lane === lane && 
      n.type === 'NORMAL' && 
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

      if (hideNotes) {
          ghostNotesRef.current.push({
              lane: lane,
              timeDiff: hitNote.time - gameTime, 
              life: 1.0
          });
      }

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

  const triggerHitVisuals = (lane: number, type: 'PERFECT' | 'GOOD') => {
      const isPerfect = type === 'PERFECT';
      playHitSound(type);

      laneHitStateRef.current[lane] = 1.0; 
      comboScaleRef.current = 1.5;

      const canvas = canvasRef.current;
      if (canvas) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const laneW = laneWidthRef.current;
          const startX = startXRef.current;
          const laneX = (startX + lane * laneW + laneW / 2) * dpr;
          const hitY = (canvas.height / dpr) * 0.85 * dpr; 
          const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
          spawnParticles(laneX, hitY, hitColor, isPerfect ? 15 : 8); 
      }

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

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
        particlesRef.current.push(new Particle(x, y, color));
    }
  };

  // 7. Render Loop
  const gameLoop = (time: number) => {
    // If we are finished or cleaned up, stop
    if (status === GameStatus.Finished || status === GameStatus.Library || !audioContextRef.current) return;
    
    // If paused, we still render one frame (frozen), but we don't update physics if purely paused
    // However, for resume countdown, we want to render the frozen state repeatedly in case of resize/repaint
    const isFrozen = status === GameStatus.Paused || status === GameStatus.Countdown;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const laneW = laneWidthRef.current;
    const startX = startXRef.current;
    const count = laneCountRef.current;
    const speed = scrollSpeedRef.current; 
    const hitLineY = height * 0.80; 

    // Time Calculation
    const gameTime = getCurrentGameTime();
    const duration = audioBuffer?.duration || 1;

    // --- DRAWING ---
    ctx.clearRect(0, 0, width, height); 
    
    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#000000');
    bgGrad.addColorStop(1, `${theme.primaryColor}22`); 
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw Lanes
    for (let i = 0; i < count; i++) {
        const x = startX + i * laneW;
        const isPressed = keyStateRef.current[i];
        
        if (laneMissStateRef.current[i] > 0) {
            ctx.fillStyle = `rgba(255, 50, 50, ${laneMissStateRef.current[i] * 0.3})`; 
            ctx.fillRect(x, 0, laneW, height);
            if (!isFrozen) laneMissStateRef.current[i] = Math.max(0, laneMissStateRef.current[i] - 0.05);
        }

        if (laneHitStateRef.current[i] > 0) {
            const alpha = laneHitStateRef.current[i];
            const grad = ctx.createLinearGradient(x, hitLineY, x, height);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.4})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY, laneW, height - hitLineY);
            if (!isFrozen) laneHitStateRef.current[i] = Math.max(0, alpha - 0.1);
        }
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(x, 0, laneW, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        if (isPressed) {
            const grad = ctx.createLinearGradient(x, hitLineY, x, 0);
            grad.addColorStop(0, `${theme.primaryColor}55`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, 0, laneW, hitLineY);
        }

        const receptorX = x + 2;
        const receptorW = laneW - 4;
        
        ctx.fillStyle = isPressed ? theme.primaryColor : 'rgba(255,255,255,0.5)';
        ctx.fillRect(receptorX, hitLineY - 2, receptorW, 14); 
        
        if (width >= 768) {
            const labelY = hitLineY + 50;
            ctx.fillStyle = isPressed ? '#ffffff' : 'rgba(255,255,255,0.4)';
            ctx.font = `bold 24px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(labelsRef.current[i], x + laneW / 2, labelY);
        }
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(startX + count * laneW, 0);
    ctx.lineTo(startX + count * laneW, height);
    ctx.stroke();

    // Notes Processing
    notesRef.current.forEach(note => {
        if (!note.visible && !note.missed) return;

        // Skip Hit/Physics logic if frozen
        if (!isFrozen) {
            if (note.hit && !note.missed && !note.isHolding) return;

            // Catch
            if (note.type === 'CATCH' && !note.hit && !note.missed) {
                 const timeDiff = Math.abs(gameTime - note.time);
                 if (timeDiff <= HIT_WINDOW_CATCH && keyStateRef.current[note.lane]) {
                     note.hit = true;
                     note.visible = false;
                     scoreRef.current.perfect++;
                     scoreRef.current.combo++;
                     if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
                     scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50);
                     triggerHitVisuals(note.lane, 'PERFECT');
                     onScoreUpdate({...scoreRef.current});
                 }
            }

            // Miss
            const noteMissTime = note.time + HIT_WINDOW_GOOD;
            if (!note.hit && !note.missed && gameTime > noteMissTime) {
                note.missed = true; 
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

            // Hold Tick
            if (note.hit && note.duration > 0 && note.isHolding) {
                const endTime = note.time + note.duration;
                if (gameTime < endTime) {
                    if (Math.random() > 0.5) {
                        const lx = startX + note.lane * laneW + laneW / 2 + (Math.random() * 20 - 10);
                        spawnParticles(lx * dpr, hitLineY * dpr, theme.secondaryColor, 1);
                    }
                    scoreRef.current.score += SCORE_HOLD_TICK * (1 + Math.min(scoreRef.current.combo, 100) / 100);
                } else {
                    note.visible = false;
                    note.isHolding = false;
                }
                onScoreUpdate({...scoreRef.current});
            }
        } else {
            // In frozen state, still hide hits if they happened before freeze
            if (note.hit && !note.missed && !note.isHolding) return;
        }
        
        // Draw Logic
        const timeDiff = note.time - gameTime;
        const headY = hitLineY - (timeDiff * speed); 
        const pad = 4; 
        const noteW = laneW - (pad * 2);
        const noteX = startX + note.lane * laneW + pad;
        
        if (headY > -200 || (headY - note.duration * speed) < height) {
            if (!hideNotes || note.missed) {
                const isMissed = note.missed;
                const fillColor = isMissed ? '#555555' : theme.secondaryColor;
                const diamondColor = isMissed ? '#555555' : theme.goodColor;
                const alpha = isMissed ? 0.4 : 1.0;

                ctx.globalAlpha = alpha;

                if (note.duration > 0) {
                    const bodyHeight = note.duration * speed;
                    let drawHeadY = headY;
                    let drawHeight = bodyHeight;

                    if (note.isHolding) {
                        drawHeadY = hitLineY;
                        const remainingTime = (note.time + note.duration) - gameTime;
                        drawHeight = Math.max(0, remainingTime * speed);
                    }
                    
                    ctx.fillStyle = isMissed ? fillColor : `${theme.secondaryColor}CC`;
                    ctx.fillRect(noteX + 4, drawHeadY - drawHeight, noteW - 8, drawHeight);
                    
                    ctx.strokeStyle = isMissed ? '#888888' : 'rgba(255,255,255,0.6)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(noteX + 4, drawHeadY - drawHeight, noteW - 8, drawHeight);
                }

                if (!note.isHolding || note.duration === 0) {
                    if (note.type === 'CATCH') {
                        const cx = noteX + noteW / 2;
                        const cy = headY;
                        const sizeX = noteW / 2;
                        const sizeY = noteW / 6;

                        ctx.fillStyle = diamondColor + (isMissed ? '' : '33');
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY - 4); 
                        ctx.lineTo(cx + sizeX + 4, cy); 
                        ctx.lineTo(cx, cy + sizeY + 4); 
                        ctx.lineTo(cx - sizeX - 4, cy); 
                        ctx.closePath();
                        ctx.fill();

                        ctx.fillStyle = isMissed ? '#222' : '#000000'; 
                        ctx.strokeStyle = diamondColor;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY); 
                        ctx.lineTo(cx + sizeX, cy); 
                        ctx.lineTo(cx, cy + sizeY); 
                        ctx.lineTo(cx - sizeX, cy); 
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = diamondColor;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY/2.5);
                        ctx.lineTo(cx + sizeX/2.5, cy);
                        ctx.lineTo(cx, cy + sizeY/2.5);
                        ctx.lineTo(cx - sizeX/2.5, cy);
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        ctx.fillStyle = isMissed ? fillColor : theme.secondaryColor + '44';
                        ctx.fillRect(noteX - 2, headY - 14, noteW + 4, 28);
                        ctx.fillStyle = fillColor;
                        ctx.fillRect(noteX, headY - 12, noteW, 24);
                        ctx.fillStyle = isMissed ? '#aaaaaa' : 'rgba(255,255,255,0.95)';
                        ctx.fillRect(noteX, headY - 8, noteW, 8);
                    }
                } 
                ctx.globalAlpha = 1.0;
            }
        }
    });

    ghostNotesRef.current = ghostNotesRef.current.filter(g => g.life > 0);
    ghostNotesRef.current.forEach(g => {
        const y = hitLineY - (g.timeDiff * speed);
        const laneX = startX + g.lane * laneW + 4;
        const noteW = laneW - 8;
        ctx.globalAlpha = g.life;
        ctx.fillStyle = theme.secondaryColor;
        ctx.fillRect(laneX, y - 12, noteW, 24);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(laneX, y - 12, noteW, 24);
        ctx.globalAlpha = 1.0;
        if (!isFrozen) g.life -= 0.05;
    });

    particlesRef.current.forEach((p, i) => {
        if (!isFrozen) p.update();
        p.draw(ctx);
        if (p.life <= 0) particlesRef.current.splice(i, 1);
    });

    effectRef.current = effectRef.current.filter(effect => performance.now() - effect.time < 600);
    effectRef.current.forEach(effect => {
        const x = startX + effect.lane * laneW + laneW / 2;
        // Pause visual effect animation if frozen
        const progress = isFrozen ? 0 : (performance.now() - effect.time) / 600;
        const y = hitLineY - 80 - (progress * 50); 
        ctx.save();
        ctx.fillStyle = effect.color;
        ctx.font = '900 36px Arial'; 
        ctx.textAlign = 'center';
        const currentScale = effect.scale * (1 - progress * 0.5); 
        ctx.translate(x, y);
        ctx.scale(currentScale, currentScale);
        ctx.globalAlpha = 1 - progress; 
        ctx.fillText(effect.text, 0, 0);
        ctx.restore();
    });

    const progress = Math.min(1, Math.max(0, gameTime) / duration);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width * progress, 4);

    if (scoreRef.current.combo > 0) {
        if (!isFrozen) comboScaleRef.current = comboScaleRef.current + (1.0 - comboScaleRef.current) * 0.1;
        const combo = scoreRef.current.combo;
        let comboColor = '#ffffff';
        if (combo >= 100) { comboColor = '#f9f871'; } 
        else if (combo >= 50) { comboColor = '#00f3ff'; } 

        ctx.save();
        ctx.translate(width / 2, height * 0.2); 
        ctx.scale(comboScaleRef.current, comboScaleRef.current);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const minDim = Math.min(width, height);
        const fontSize = Math.min(60, minDim * 0.15); 
        ctx.font = `italic 900 ${fontSize}px Arial`;
        ctx.fillStyle = comboColor;
        ctx.fillText(combo.toString(), 0, 0);
        ctx.font = `bold ${fontSize * 0.4}px Arial`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText("COMBO", 0, fontSize * 0.6);
        ctx.restore();
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div 
        ref={containerRef} 
        className="relative w-full h-full flex justify-center overflow-hidden bg-black touch-none select-none"
        style={{ touchAction: 'none' }}
        onTouchStart={handleGlobalTouch}
        onTouchMove={handleGlobalTouch}
        onTouchEnd={handleGlobalTouch}
        onTouchCancel={handleGlobalTouch}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div 
            className="absolute inset-y-0 z-20 pointer-events-none"
            style={{
                left: layout.startX,
                width: layout.laneWidth * layout.count
            }}
      >
        {new Array(layout.count).fill(0).map((_, i) => (
            <div 
                key={i} 
                className="absolute top-0 bottom-0 border-x border-white/5 bg-gradient-to-t from-white/10 to-transparent"
                style={{
                    left: i * layout.laneWidth,
                    width: layout.laneWidth
                }}
            />
        ))}
      </div>
    </div>
  );
};

export default GameCanvas;
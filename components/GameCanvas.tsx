import React, { useEffect, useRef, useState } from 'react';
import { Note, ScoreState, GameStatus, AITheme, LaneCount, NoteLane } from '../types';
import { useSoundSystem } from '../hooks/useSoundSystem';

interface GameCanvasProps {
  status: GameStatus;
  audioBuffer: AudioBuffer | null;
  notes: Note[];
  theme: AITheme;
  audioOffset: number; 
  hideNotes?: boolean; // Changed: Hide notes but keep judgment line
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

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  status, 
  audioBuffer, 
  notes, 
  theme,
  audioOffset,
  hideNotes,
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
  const comboScaleRef = useRef<number>(1.0);

  // Layout Refs (Updated via ResizeObserver)
  const laneCountRef = useRef<LaneCount>(4);
  const keysRef = useRef<string[]>(KEYS_4);
  const labelsRef = useRef<string[]>(LABELS_4);
  const laneWidthRef = useRef<number>(BASE_TARGET_WIDTH);
  const startXRef = useRef<number>(0);
  const scrollSpeedRef = useRef<number>(800);

  // Touch Tracking for Sliding
  const activeTouchesRef = useRef<Map<number, number>>(new Map()); // Map<TouchIdentifier, LaneIndex>

  // React State for DOM Overlay (Touch Zones) - retained for visual guides only
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
      // Cap width on Desktop, Full width on Mobile
      const laneW = Math.min(BASE_TARGET_WIDTH, maxPossibleWidth);
      
      const totalWidth = laneW * count;
      const startX = (containerWidth - totalWidth) / 2;

      laneWidthRef.current = laneW;
      startXRef.current = startX;

      // Dynamic Scroll Speed: Scale with height to keep reaction time consistent
      // Target reaction time: ~0.8s from top to hitline (80% down)
      // Speed = (Height * 0.8) / 0.8 = Height
      // We clamp minimum speed to avoid it being too slow on very small windows
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
  const playMusic = () => {
    if (!audioBuffer) return;
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    // Optimization: Request low latency interactive mode
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    audioContextRef.current = ctx;
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
       if (status === GameStatus.Playing) {
           onGameEnd(scoreRef.current);
       }
    };
    
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
      try { audioContextRef.current.close(); } catch(e) {}
      audioContextRef.current = null;
    }
  };

  // 3. Lifecycle Management
  useEffect(() => {
    if (status === GameStatus.Playing) {
      notesRef.current = JSON.parse(JSON.stringify(notes));
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 };
      effectRef.current = [];
      particlesRef.current = [];
      comboScaleRef.current = 1.0;
      keyStateRef.current = new Array(laneCountRef.current).fill(false); 
      activeTouchesRef.current.clear();

      playMusic();
      requestRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopMusic();
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopMusic();
    };
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
      // Use current refs for latest layout data
      const laneW = laneWidthRef.current;
      const startX = startXRef.current;
      const count = laneCountRef.current;

      const relativeX = touchX - startX;
      const index = Math.floor(relativeX / laneW);
      if (index >= 0 && index < count) return index;
      return -1;
  };

  // Helper: Force key state on, and trigger hit
  const engageLane = (lane: number) => {
      if (lane < 0 || lane >= laneCountRef.current) return;
      keyStateRef.current[lane] = true;
      processHit(lane);
  };

  // Helper: Release key state ONLY if no other fingers are holding it
  const disengageLane = (lane: number) => {
      if (lane < 0 || lane >= laneCountRef.current) return;
      
      // Check if any active touch is currently mapped to this lane
      const isStillHeld = Array.from(activeTouchesRef.current.values()).includes(lane);
      
      if (!isStillHeld) {
          keyStateRef.current[lane] = false;
          processRelease(lane);
      }
  };

  const handleGlobalTouch = (e: React.TouchEvent) => {
      if (status !== GameStatus.Playing) return;
      // Prevent defaults to stop scrolling/zooming
      if (e.cancelable && e.type !== 'touchstart') {
          // Allow touchstart to pass through sometimes if needed, but usually we want to block all
          e.preventDefault();
      }
      // e.preventDefault() on touchstart in a passive listener (React 18 default) might warn, 
      // but 'touch-action: none' CSS handles the scrolling prevention.

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
              
              // Lane changed?
              if (lane !== oldLane) {
                  // 1. Update Map (if we moved to a new lane, track it; if off-track, track -1)
                  activeTouchesRef.current.set(touchId, lane);

                  // 2. Handle Release of Old Lane
                  if (oldLane !== undefined && oldLane !== -1) {
                      disengageLane(oldLane);
                  }

                  // 3. Handle Press of New Lane (Glissando)
                  if (lane !== -1) {
                      engageLane(lane);
                  }
              }
          }
          else if (e.type === 'touchend' || e.type === 'touchcancel') {
              const oldLane = activeTouchesRef.current.get(touchId);
              if (oldLane !== undefined && oldLane !== -1) {
                  activeTouchesRef.current.delete(touchId);
                  disengageLane(oldLane);
              } else {
                  activeTouchesRef.current.delete(touchId);
              }
          }
      }
  };

  // 6. Game Logic
  const processHit = (lane: number) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    // Apply Audio Offset
    // audioOffset is in ms. Positive means audio is late (laggy), so we subtract it from gameTime.
    // gameTime is "how far are we into the song?"
    // If audio is 0.2s late, when song is at 1.0s, the user actually hears 0.8s.
    // So logic should behave as if we are at 0.8s.
    const gameTime = (ctx.currentTime - startTimeRef.current) - (audioOffset / 1000);

    const hitNote = notesRef.current.find(n => 
      !n.hit && 
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
    
    // In blind mode (hideNotes), allow clicking empty space to trigger hit visuals
    // This provides feedback on WHERE the user thought the note was
    if (hideNotes && !hitNote) {
        triggerHitVisuals(lane, 'GOOD'); // Dummy visual feedback
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
          
          // Particles use Logical Pixels * DPR
          const laneX = (startX + lane * laneW + laneW / 2) * dpr;
          const hitY = (canvas.height / dpr) * 0.85 * dpr; // Height is already scaled
          
          const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
          spawnParticles(laneX, hitY, hitColor, isPerfect ? 15 : 8); // Reduced particle count
      }

      const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
      
      // Always show text feedback (even if notes are hidden), 
      // but maybe suppress it if the user wants purely audio? 
      // User request said "Not hide judgment line, but hide elements". 
      // Usually implies hiding the falling notes. Hit effect is useful.
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
    if (status !== GameStatus.Playing || !audioContextRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- HIGH DPI & RESIZE HANDLING ---
    // Cap DPR to 2 for performance on mobile 3x/4x screens
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        // updateLayout is handled by ResizeObserver
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    
    // Use Ref Values for Drawing (Guarantees sync with Logic)
    const laneW = laneWidthRef.current;
    const startX = startXRef.current;
    const count = laneCountRef.current;
    const speed = scrollSpeedRef.current; // Dynamic Speed
    const hitLineY = height * 0.80; 

    // Calculate Game Time with Offset
    const rawTime = audioContextRef.current.currentTime - startTimeRef.current;
    const gameTime = rawTime - (audioOffset / 1000);
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
        
        // Lane Miss Red Flash (Always show for feedback)
        if (laneMissStateRef.current[i] > 0) {
            ctx.fillStyle = `rgba(255, 50, 50, ${laneMissStateRef.current[i] * 0.3})`; 
            ctx.fillRect(x, 0, laneW, height);
            laneMissStateRef.current[i] = Math.max(0, laneMissStateRef.current[i] - 0.05);
        }

        // Lane Hit White Flash
        if (laneHitStateRef.current[i] > 0) {
            const alpha = laneHitStateRef.current[i];
            const grad = ctx.createLinearGradient(x, hitLineY, x, height);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.4})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY, laneW, height - hitLineY);
            laneHitStateRef.current[i] = Math.max(0, alpha - 0.1);
        }
        
        // Always draw lanes (even if hideNotes is on)
        // Lane Divider / Track
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(x, 0, laneW, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Key Press Beam
        if (isPressed) {
            const grad = ctx.createLinearGradient(x, hitLineY, x, 0);
            grad.addColorStop(0, `${theme.primaryColor}55`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, 0, laneW, hitLineY);
        }

        // RECEPTOR (Always visible)
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
    
    // Right Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(startX + count * laneW, 0);
    ctx.lineTo(startX + count * laneW, height);
    ctx.stroke();

    // Notes Processing
    notesRef.current.forEach(note => {
        if (!note.visible) return;

        // CATCH Auto-Hit Logic
        if (note.type === 'CATCH' && !note.hit) {
             const timeDiff = Math.abs(gameTime - note.time);
             if (timeDiff <= HIT_WINDOW_CATCH && keyStateRef.current[note.lane]) {
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

        // MISS
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

        // HOLD Tick
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
        
        // Draw Logic
        const timeDiff = note.time - gameTime;
        const headY = hitLineY - (timeDiff * speed); // Use dynamic speed
        const pad = 4; 
        const noteW = laneW - (pad * 2);
        const noteX = startX + note.lane * laneW + pad;
        
        // Calculate rendering position
        if (headY > -200 || (headY - note.duration * speed) < height) {
            // ONLY DRAW IF NOTES ARE NOT HIDDEN
            if (!hideNotes) {
                if (note.duration > 0) {
                    // Hold Body
                    const bodyHeight = note.duration * speed;
                    let drawHeadY = headY;
                    let drawHeight = bodyHeight;

                    if (note.isHolding) {
                        drawHeadY = hitLineY;
                        const remainingTime = (note.time + note.duration) - gameTime;
                        drawHeight = Math.max(0, remainingTime * speed);
                    }
                    
                    ctx.fillStyle = `${theme.secondaryColor}CC`;
                    ctx.fillRect(noteX + 4, drawHeadY - drawHeight, noteW - 8, drawHeight);
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(noteX + 4, drawHeadY - drawHeight, noteW - 8, drawHeight);
                }

                if (!note.isHolding || note.duration === 0) {
                    if (note.type === 'CATCH') {
                        // ... Draw Diamond ...
                        const cx = noteX + noteW / 2;
                        const cy = headY;
                        const sizeX = noteW / 2;
                        const sizeY = noteW / 6;

                        ctx.fillStyle = theme.goodColor + '33';
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY - 4); 
                        ctx.lineTo(cx + sizeX + 4, cy); 
                        ctx.lineTo(cx, cy + sizeY + 4); 
                        ctx.lineTo(cx - sizeX - 4, cy); 
                        ctx.closePath();
                        ctx.fill();

                        ctx.fillStyle = '#000000'; 
                        ctx.strokeStyle = theme.goodColor;
                        ctx.lineWidth = 3;
                        
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY); 
                        ctx.lineTo(cx + sizeX, cy); 
                        ctx.lineTo(cx, cy + sizeY); 
                        ctx.lineTo(cx - sizeX, cy); 
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = theme.goodColor;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - sizeY/2.5);
                        ctx.lineTo(cx + sizeX/2.5, cy);
                        ctx.lineTo(cx, cy + sizeY/2.5);
                        ctx.lineTo(cx - sizeX/2.5, cy);
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        // ... Draw Rect ...
                        ctx.fillStyle = theme.secondaryColor + '44';
                        ctx.fillRect(noteX - 2, headY - 14, noteW + 4, 28);

                        ctx.fillStyle = theme.secondaryColor;
                        ctx.fillRect(noteX, headY - 12, noteW, 24);
                        
                        ctx.fillStyle = 'rgba(255,255,255,0.95)';
                        ctx.fillRect(noteX, headY - 8, noteW, 8);
                    }
                } 
            }
        }
    });

    particlesRef.current.forEach((p, i) => {
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particlesRef.current.splice(i, 1);
    });

    effectRef.current = effectRef.current.filter(effect => performance.now() - effect.time < 600);
    effectRef.current.forEach(effect => {
        const x = startX + effect.lane * laneW + laneW / 2;
        const progress = (performance.now() - effect.time) / 600;
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
        comboScaleRef.current = comboScaleRef.current + (1.0 - comboScaleRef.current) * 0.1;
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
      
      {/* 
         Visual indicators for lanes (non-interactive, just guides)
      */}
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
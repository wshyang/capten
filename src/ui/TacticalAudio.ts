/**
 * Procedural Web Audio synthesizer for crisp tactical sound effects.
 * 100% self-contained — no external audio asset dependencies.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  public init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public playBlip(freq = 440, duration = 0.08) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Planning Timer Rhythm "Doo" Tick:
   * Plays a rounded, warm "doo" sound during each second tick of the planning timer.
   * Regular (>10s remaining): Subtle, warm low-mid "doo" pitch (240Hz -> 180Hz, 0.09s duration, gentle volume).
   * Last 10 seconds (<=10s remaining): Longer and louder urgent "doo" pulse (320Hz -> 220Hz, 0.25s duration, punchy gain).
   */
  public playTimerTick(isUrgent = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Rounded warm "doo" waveform using sine / triangle
      osc.type = isUrgent ? 'triangle' : 'sine';

      const startFreq = isUrgent ? 320 : 240;
      const endFreq = isUrgent ? 210 : 180;
      const duration = isUrgent ? 0.26 : 0.09;
      const peakGain = isUrgent ? 0.28 : 0.09;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.linearRampToValueAtTime(endFreq, now + duration);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
      gain.gain.linearRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  /**
   * Planning Timer Expired Alarm Tone:
   * A higher-pitched, louder, sustained warm "dooo" alarm that sounds for 3.0 seconds
   * upon countdown timer expiration.
   */
  public playTimerExpiredDooo() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const duration = 3.0;

      // Dual oscillators for rich, warm, higher-pitched "dooo" timbre
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      // Higher pitched glide: 480Hz -> 380Hz over 3.0 seconds
      osc1.frequency.setValueAtTime(480, now);
      osc1.frequency.linearRampToValueAtTime(380, now + duration);

      osc2.frequency.setValueAtTime(480, now);
      osc2.frequency.linearRampToValueAtTime(380, now + duration);

      // Louder peak gain (0.42) with warm attack and sustained 3.0s decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.42, now + 0.06);
      gain.gain.setValueAtTime(0.38, now + 1.5);
      gain.gain.linearRampToValueAtTime(0.18, now + 2.5);
      gain.gain.linearRampToValueAtTime(0.0001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch {}
  }

  public playPassWhoosh() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch {}
  }

  public playIntercepted() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Sharp descending snatch transient (480Hz -> 160Hz)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.linearRampToValueAtTime(140, now + 0.22);

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.linearRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // 2. Heavy leather capture impact thud (Sub-bass transient: 110Hz -> 40Hz)
      const oscThud = this.ctx.createOscillator();
      const gainThud = this.ctx.createGain();
      oscThud.type = 'sine';
      oscThud.frequency.setValueAtTime(110, now);
      oscThud.frequency.linearRampToValueAtTime(40, now + 0.28);

      gainThud.gain.setValueAtTime(0.4, now);
      gainThud.gain.linearRampToValueAtTime(0.001, now + 0.28);

      oscThud.connect(gainThud);
      gainThud.connect(this.ctx.destination);
      oscThud.start(now);
      oscThud.stop(now + 0.28);

      // 3. Minor alert chord sting (Eb4 + Bb3 dissonance alert)
      [311.13, 466.16].forEach((freq, idx) => {
        const oscSting = this.ctx!.createOscillator();
        const gainSting = this.ctx!.createGain();
        oscSting.type = 'triangle';
        oscSting.frequency.setValueAtTime(freq, now + 0.04);

        gainSting.gain.setValueAtTime(0.22, now + 0.04);
        gainSting.gain.linearRampToValueAtTime(0.001, now + 0.35 + idx * 0.05);

        oscSting.connect(gainSting);
        gainSting.connect(this.ctx!.destination);
        oscSting.start(now + 0.04);
        oscSting.stop(now + 0.35 + idx * 0.05);
      });

      // 4. Full stadium crowd cheering roar on successful interception lunge
      this.playCrowdCheer(2.0);
    } catch {}
  }

  /**
   * Procedural crowd cheer & roar audio effect:
   * Synthesizes an excited stadium crowd cheer with multi-layered noise formants,
   * swelling amplitude envelope, applause shimmer, and cheering vocal harmonics.
   */
  public playCrowdCheer(duration = 2.0) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // 1. Organic Pink / Crowd Noise generation
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.14;
        b6 = white * 0.115926;
      }

      // Noise source
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // Bandpass 1: Stadium roar vocal body (600Hz -> 1100Hz -> 750Hz)
      const bandpass1 = this.ctx.createBiquadFilter();
      bandpass1.type = 'bandpass';
      bandpass1.frequency.setValueAtTime(600, now);
      bandpass1.frequency.linearRampToValueAtTime(1150, now + 0.3);
      bandpass1.frequency.linearRampToValueAtTime(700, now + duration);
      bandpass1.Q.setValueAtTime(2.0, now);

      // Bandpass 2: Cheering applause & whistling shimmer (1800Hz -> 2600Hz)
      const bandpass2 = this.ctx.createBiquadFilter();
      bandpass2.type = 'bandpass';
      bandpass2.frequency.setValueAtTime(1800, now);
      bandpass2.frequency.linearRampToValueAtTime(2600, now + 0.25);
      bandpass2.frequency.linearRampToValueAtTime(1900, now + duration);
      bandpass2.Q.setValueAtTime(1.5, now);

      // Master crowd envelope: fast excitement rise, roaring peak, smooth cheer fadeout
      const crowdGain = this.ctx.createGain();
      crowdGain.gain.setValueAtTime(0.001, now);
      crowdGain.gain.linearRampToValueAtTime(0.42, now + 0.15); // Fast snatch swell
      crowdGain.gain.linearRampToValueAtTime(0.35, now + 0.6); // Sustained roar
      crowdGain.gain.linearRampToValueAtTime(0.18, now + 1.2);
      crowdGain.gain.linearRampToValueAtTime(0.001, now + duration);

      noiseSource.connect(bandpass1);
      noiseSource.connect(bandpass2);
      bandpass1.connect(crowdGain);
      bandpass2.connect(crowdGain);
      crowdGain.connect(this.ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + duration);

      // 2. Harmonic Cheering Chorus (Vocal fanfare chords: C4, E4, G4, C5, E5)
      const cheerNotes = [
        { freq: 261.63, delay: 0.02, peak: 0.12 },
        { freq: 329.63, delay: 0.04, peak: 0.14 },
        { freq: 392.00, delay: 0.06, peak: 0.14 },
        { freq: 523.25, delay: 0.08, peak: 0.16 },
        { freq: 659.25, delay: 0.10, peak: 0.12 },
      ];

      cheerNotes.forEach(({ freq, delay, peak }) => {
        const osc = this.ctx!.createOscillator();
        const oscGain = this.ctx!.createGain();

        // Rich warm saw/triangle hybrid feel
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq * 0.94, now + delay);
        osc.frequency.linearRampToValueAtTime(freq, now + delay + 0.2);
        osc.frequency.linearRampToValueAtTime(freq * 1.02, now + delay + 0.8);

        oscGain.gain.setValueAtTime(0.001, now + delay);
        oscGain.gain.linearRampToValueAtTime(peak, now + delay + 0.15);
        oscGain.gain.linearRampToValueAtTime(peak * 0.7, now + delay + 0.6);
        oscGain.gain.linearRampToValueAtTime(0.001, now + delay + 1.4);

        osc.connect(oscGain);
        oscGain.connect(this.ctx!.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 1.4);
      });
    } catch {
      // Ignore audio errors
    }
  }

  public playGoal() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.22, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.001, now + i * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.35);
      });
    } catch {}
  }

  /**
   * Jump-Ball Mini-Game Win Chime:
   * A fast ascending 4-note staccato possession fanfare (C5 -> E5 -> G5 -> C6)
   * with a crisp possession capture chirp, completely distinct from the stadium crowd roar!
   */
  public playJumpBallWin() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.001, now + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.06 + 0.02);
        gain.gain.linearRampToValueAtTime(0.001, now + idx * 0.06 + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.2);
      });
    } catch {}
  }

  public playCardChime() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime);
      osc.frequency.setValueAtTime(880.0, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }

  /**
   * General match whistle
   */
  public playWhistle() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      osc.frequency.setValueAtTime(1750, this.ctx.currentTime + 0.06);
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {}
  }

  /**
   * Authentic Referee Foul Whistle:
   * Two sharp piercing blasts with dual-frequency modulation (2200Hz + 2450Hz) and tremolo beating
   */
  public playFoulWhistle() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Blast 1 (Short sharp chirp: 0s -> 0.12s)
      this.createWhistleBlast(now, 0.12);

      // Blast 2 (Long decisive foul blast: 0.16s -> 0.45s)
      this.createWhistleBlast(now + 0.16, 0.30);
    } catch {}
  }

  private createWhistleBlast(startTime: number, duration: number) {
    if (!this.ctx) return;

    // Dual oscillators simulating referee pea-whistle resonance
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Tremolo modulation (LFO)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2150, startTime);
    osc1.frequency.linearRampToValueAtTime(2350, startTime + duration * 0.4);
    osc1.frequency.linearRampToValueAtTime(2200, startTime + duration);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2450, startTime);
    osc2.frequency.linearRampToValueAtTime(2600, startTime + duration * 0.4);
    osc2.frequency.linearRampToValueAtTime(2400, startTime + duration);

    // LFO for characteristic rapid flutter
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(45, startTime);
    lfoGain.gain.setValueAtTime(0.06, startTime);

    gain.gain.setValueAtTime(0.0, startTime);
    gain.gain.linearRampToValueAtTime(0.26, startTime + 0.02);
    gain.gain.setValueAtTime(0.24, startTime + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

    lfo.connect(lfoGain.gain);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    lfo.start(startTime);

    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
    lfo.stop(startTime + duration);
  }
}

export const soundEngine = new SoundEngine();

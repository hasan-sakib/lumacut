/** Memory and cache telemetry. Frames opened must always balance frames closed (rule 7). */
export interface StatsSnapshot {
  framesOpened: number;
  framesClosed: number;
  openFrames: number;
  iteratorsOpened: number;
  iteratorsClosed: number;
  openIterators: number;
  seeks: number;
  sequentialReads: number;
  skippedFrames: number;
  textureCount: number;
  textureBytes: number;
  pooledTextureCount: number;
  pooledTextureBytes: number;
  textureHits: number;
  textureMisses: number;
  textureEvictions: number;
  targetCount: number;
  targetBytes: number;
  nestedRenders: number;
  layersDrawn: number;
  /** Full-screen shader passes run for colour, effects and transitions. */
  fxPasses: number;
  rendersCompleted: number;
}

export class EngineStats {
  framesOpened = 0;
  framesClosed = 0;
  iteratorsOpened = 0;
  iteratorsClosed = 0;
  seeks = 0;
  sequentialReads = 0;
  skippedFrames = 0;
  textureCount = 0;
  textureBytes = 0;
  pooledTextureCount = 0;
  pooledTextureBytes = 0;
  textureHits = 0;
  textureMisses = 0;
  textureEvictions = 0;
  /** RGBA16F render targets in use or pooled (accumulation buffers). */
  targetCount = 0;
  targetBytes = 0;
  nestedRenders = 0;
  layersDrawn = 0;
  fxPasses = 0;
  rendersCompleted = 0;

  get openFrames(): number {
    return this.framesOpened - this.framesClosed;
  }

  get openIterators(): number {
    return this.iteratorsOpened - this.iteratorsClosed;
  }

  snapshot(): StatsSnapshot {
    return {
      framesOpened: this.framesOpened,
      framesClosed: this.framesClosed,
      openFrames: this.openFrames,
      iteratorsOpened: this.iteratorsOpened,
      iteratorsClosed: this.iteratorsClosed,
      openIterators: this.openIterators,
      seeks: this.seeks,
      sequentialReads: this.sequentialReads,
      skippedFrames: this.skippedFrames,
      textureCount: this.textureCount,
      textureBytes: this.textureBytes,
      pooledTextureCount: this.pooledTextureCount,
      pooledTextureBytes: this.pooledTextureBytes,
      textureHits: this.textureHits,
      textureMisses: this.textureMisses,
      textureEvictions: this.textureEvictions,
      targetCount: this.targetCount,
      targetBytes: this.targetBytes,
      nestedRenders: this.nestedRenders,
      layersDrawn: this.layersDrawn,
      fxPasses: this.fxPasses,
      rendersCompleted: this.rendersCompleted,
    };
  }

  /** Throws if any frame or decoder is still open: call when the engine should be idle. */
  assertQuiescent(): void {
    if (this.openFrames !== 0 || this.openIterators !== 0) {
      throw new Error(
        `Engine is not quiescent: ${String(this.openFrames)} frame(s) and ` +
          `${String(this.openIterators)} decoder iterator(s) still open`,
      );
    }
  }
}

/** Defaults sized for a mid-range laptop; override per engine. */
export interface EngineLimits {
  /** GPU memory the texture cache may hold (decoded frames, nested compositions). */
  textureBudgetBytes: number;
  /** Concurrent per-clip frame readers (each keeps a hardware decoder busy). */
  maxReaders: number;
}

export const DEFAULT_LIMITS: EngineLimits = {
  textureBudgetBytes: 256 * 1024 * 1024,
  maxReaders: 6,
};

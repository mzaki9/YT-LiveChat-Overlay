/**
 * Performance monitoring, zero-allocation ring buffers, and RAM metrics for YouTube Live Chat Overlay
 */

const UPDATE_BUFFER_SIZE = 20;
const updateBuffer = new Float32Array(UPDATE_BUFFER_SIZE);
let updateIndex = 0;
let updateCount = 0;
let updateSum = 0;
let avgUpdateTime = 0;

let adaptiveInterval = 600;
let frameDropCount = 0;

let lastIframeLoadDuration = 0;
const FRAME_BUFFER_SIZE = 30;
const frameBuffer = new Float32Array(FRAME_BUFFER_SIZE);
let frameIndex = 0;
let frameCount = 0;
let frameSum = 0;
let totalFramesTracked = 0;

const MIN_INTERVAL = 400;
const MAX_INTERVAL = 1200;
const TARGET_UPDATE_TIME = 16.67; // 60fps budget (16.67ms)

/**
 * Measure and adapt update performance with O(1) running sum and zero array allocations
 */
function measureUpdatePerformance(updateFunction) {
  return function(...args) {
    const startTime = performance.now();
    const result = updateFunction.apply(this, args);
    const updateTime = performance.now() - startTime;

    if (updateCount >= UPDATE_BUFFER_SIZE) {
      updateSum -= updateBuffer[updateIndex];
    } else {
      updateCount++;
    }
    updateBuffer[updateIndex] = updateTime;
    updateSum += updateTime;
    updateIndex = (updateIndex + 1) % UPDATE_BUFFER_SIZE;

    avgUpdateTime = updateCount > 0 ? updateSum / updateCount : 0;
    adaptUpdateInterval();
    return result;
  };
}

/**
 * Adapt update interval based on performance metrics
 */
function adaptUpdateInterval() {
  if (avgUpdateTime > TARGET_UPDATE_TIME) {
    adaptiveInterval = Math.min(MAX_INTERVAL, adaptiveInterval + 50);
    frameDropCount++;
  } else if (avgUpdateTime < TARGET_UPDATE_TIME * 0.5 && frameDropCount === 0) {
    adaptiveInterval = Math.max(MIN_INTERVAL, adaptiveInterval - 25);
  }

  if (frameDropCount > 5) {
    frameDropCount = Math.max(0, frameDropCount - 1);
  }
}

/**
 * Track an animation frame execution time using ring buffer to avoid GC pressure
 */
function recordAnimationFrameTime(durationMs) {
  totalFramesTracked++;

  if (frameCount >= FRAME_BUFFER_SIZE) {
    frameSum -= frameBuffer[frameIndex];
  } else {
    frameCount++;
  }
  frameBuffer[frameIndex] = durationMs;
  frameSum += durationMs;
  frameIndex = (frameIndex + 1) % FRAME_BUFFER_SIZE;

  if (durationMs > TARGET_UPDATE_TIME * 1.5) {
    frameDropCount++;
  }
}

/**
 * Record iframe attach-to-load duration
 */
function recordIframeLoadDuration(durationMs) {
  lastIframeLoadDuration = durationMs;
}

/**
 * Get current adaptive interval
 */
function getAdaptiveInterval() {
  return adaptiveInterval;
}

/**
 * Inspect heap memory usage (Chromium performance.memory API)
 */
function getMemoryStats() {
  if (typeof performance !== "undefined" && performance.memory) {
    return {
      usedHeapMB: Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)),
      totalHeapMB: Number((performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)),
      heapLimitMB: Number((performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2))
    };
  }
  return null;
}

/**
 * Reset performance metrics
 */
function resetPerformanceMetrics() {
  updateBuffer.fill(0);
  updateIndex = 0;
  updateCount = 0;
  updateSum = 0;
  avgUpdateTime = 0;

  frameBuffer.fill(0);
  frameIndex = 0;
  frameCount = 0;
  frameSum = 0;

  adaptiveInterval = 600;
  frameDropCount = 0;
  totalFramesTracked = 0;
}

/**
 * Get performance stats
 */
function getPerformanceStats() {
  const avgFrameDuration = frameCount > 0 ? (frameSum / frameCount) : 0;
  const estimatedFps = avgFrameDuration > 0
    ? Math.min(60, Math.round(1000 / avgFrameDuration))
    : 60;

  const recentMeasurements = [];
  const sampleCount = Math.min(5, updateCount);
  for (let i = 0; i < sampleCount; i++) {
    const idx = (updateIndex - 1 - i + UPDATE_BUFFER_SIZE) % UPDATE_BUFFER_SIZE;
    recentMeasurements.unshift(Number(updateBuffer[idx].toFixed(2)));
  }

  return {
    avgUpdateTime: Number(avgUpdateTime.toFixed(2)),
    avgFrameDuration: Number(avgFrameDuration.toFixed(2)),
    estimatedFps,
    adaptiveInterval,
    frameDropCount,
    totalFramesTracked,
    lastIframeLoadDurationMs: Number(lastIframeLoadDuration.toFixed(2)),
    lastMeasurements: recentMeasurements,
    memory: getMemoryStats()
  };
}

globalThis.__ytOverlayPerf = {
  getStats: getPerformanceStats,
  getMemoryStats,
  recordFrame: recordAnimationFrameTime,
  recordIframeLoad: recordIframeLoadDuration,
  reset: resetPerformanceMetrics
};


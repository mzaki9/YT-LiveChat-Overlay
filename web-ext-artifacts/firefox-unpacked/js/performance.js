/**
 * Performance monitoring, zero-allocation ring buffers, and RAM metrics for YouTube Live Chat Overlay
 */

let lastIframeLoadDuration = 0;
const FRAME_BUFFER_SIZE = 30;
const frameBuffer = new Float32Array(FRAME_BUFFER_SIZE);
let frameIndex = 0;
let frameCount = 0;
let frameSum = 0;
let totalFramesTracked = 0;
let frameDropCount = 0;

const TARGET_UPDATE_TIME = 16.67; // 60fps budget (16.67ms)

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
 * Inspect heap memory usage (Chromium performance.memory API)
 */
function getMemoryStats() {
  if (typeof performance !== "undefined" && performance.memory) {
    return {
      usedHeapMB: Number(
        (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
      ),
      totalHeapMB: Number(
        (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
      ),
      heapLimitMB: Number(
        (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2),
      ),
    };
  }
  return null;
}

/**
 * Reset performance metrics
 */
function resetPerformanceMetrics() {
  frameBuffer.fill(0);
  frameIndex = 0;
  frameCount = 0;
  frameSum = 0;
  frameDropCount = 0;
  totalFramesTracked = 0;
  lastIframeLoadDuration = 0;
}

/**
 * Get performance stats
 */
function getPerformanceStats() {
  const avgFrameDuration = frameCount > 0 ? frameSum / frameCount : 0;
  const estimatedFps =
    avgFrameDuration > 0
      ? Math.min(60, Math.round(1000 / avgFrameDuration))
      : 60;

  return {
    avgFrameDuration: Number(avgFrameDuration.toFixed(2)),
    estimatedFps,
    frameDropCount,
    totalFramesTracked,
    lastIframeLoadDurationMs: Number(lastIframeLoadDuration.toFixed(2)),
    memory: getMemoryStats(),
  };
}

globalThis.__ytOverlayPerf = {
  getStats: getPerformanceStats,
  getMemoryStats,
  recordFrame: recordAnimationFrameTime,
  recordIframeLoad: recordIframeLoadDuration,
  reset: resetPerformanceMetrics,
};

/**
 * Performance monitoring and adaptive metrics for YouTube Live Chat Overlay
 */

let lastUpdateTime = 0;
let updateTimes = [];
let avgUpdateTime = 0;
let adaptiveInterval = 600;
let frameDropCount = 0;

let lastIframeLoadDuration = 0;
let frameRenderTimes = [];
let totalFramesTracked = 0;

const MIN_INTERVAL = 400;
const MAX_INTERVAL = 1200;
const TARGET_UPDATE_TIME = 16.67; // 60fps budget (16.67ms)

/**
 * Measure and adapt update performance
 */
function measureUpdatePerformance(updateFunction) {
  return function(...args) {
    const startTime = performance.now();
    const result = updateFunction.apply(this, args);
    const endTime = performance.now();
    
    const updateTime = endTime - startTime;
    updateTimes.push(updateTime);
    if (updateTimes.length > 20) {
      updateTimes.shift();
    }
    
    avgUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
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
 * Track an animation frame execution time
 */
function recordAnimationFrameTime(durationMs) {
  totalFramesTracked++;
  frameRenderTimes.push(durationMs);
  if (frameRenderTimes.length > 30) {
    frameRenderTimes.shift();
  }
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
 * Reset performance metrics
 */
function resetPerformanceMetrics() {
  updateTimes = [];
  frameRenderTimes = [];
  avgUpdateTime = 0;
  adaptiveInterval = 600;
  frameDropCount = 0;
  totalFramesTracked = 0;
}

/**
 * Get performance stats
 */
function getPerformanceStats() {
  const avgFrameDuration = frameRenderTimes.length > 0
    ? (frameRenderTimes.reduce((sum, t) => sum + t, 0) / frameRenderTimes.length)
    : 0;
  const estimatedFps = avgFrameDuration > 0
    ? Math.min(60, Math.round(1000 / avgFrameDuration))
    : 60;

  return {
    avgUpdateTime: Number(avgUpdateTime.toFixed(2)),
    avgFrameDuration: Number(avgFrameDuration.toFixed(2)),
    estimatedFps,
    adaptiveInterval,
    frameDropCount,
    totalFramesTracked,
    lastIframeLoadDurationMs: Number(lastIframeLoadDuration.toFixed(2)),
    lastMeasurements: updateTimes.slice(-5)
  };
}

globalThis.__ytOverlayPerf = {
  getStats: getPerformanceStats,
  recordFrame: recordAnimationFrameTime,
  recordIframeLoad: recordIframeLoadDuration,
  reset: resetPerformanceMetrics
};

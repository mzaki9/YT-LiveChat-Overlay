/**
 * Performance monitoring and adaptive updates
 */

// Performance monitoring variables
let lastUpdateTime = 0;
let updateTimes = [];
let avgUpdateTime = 0;
let adaptiveInterval = 500; // Start with 500ms
let lastNativeUpdate = 0;
let lastHyperChatUpdate = 0;
let hyperChatDominant = false;
let frameDropCount = 0;
let updatesSinceLastAdjust = 0;
let recentLongTaskCount = 0;

let longTaskObserver = null;
const canObserveLongTasks = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes?.('longtask');
if (canObserveLongTasks) {
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries && entries.length > 0) {
        recentLongTaskCount += entries.length;
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch (error) {
    console.debug('Long task observer unavailable', error);
    longTaskObserver = null;
  }
}

// Adaptive interval configuration
const MIN_INTERVAL = 250;  // Minimum 250ms between updates
const MAX_INTERVAL = 1200; // Maximum 1.2s between updates
const TARGET_UPDATE_TIME = 16; // Target 16ms update time (60fps budget)
const NATIVE_ACTIVE_TARGET = 320;

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

    // Keep only last 10 measurements for rolling average
    if (updateTimes.length > 10) {
      updateTimes.shift();
    }

    // Calculate average update time
    avgUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
    updatesSinceLastAdjust++;

    const metadata = args[2];
    if (metadata?.processedNative) {
      lastNativeUpdate = endTime;
    }
    if (metadata?.processedHyperChat) {
      lastHyperChatUpdate = endTime;
    }

    if (updatesSinceLastAdjust >= 3 || recentLongTaskCount > 0) {
      adaptUpdateInterval();
    }

    return result;
  };
}

/**
 * Adapt update interval based on performance metrics
 */
function adaptUpdateInterval() {
  const overBudget = avgUpdateTime - TARGET_UPDATE_TIME;
  const underBudget = (TARGET_UPDATE_TIME * 0.6) - avgUpdateTime;

  const now = performance.now();
  const nativeActive = now - lastNativeUpdate < 1200;
  const hyperRecent = now - lastHyperChatUpdate < 1200;
  hyperChatDominant = !nativeActive && hyperRecent;

  if (hyperChatDominant) {
    adaptiveInterval = 450;
    updatesSinceLastAdjust = 0;
    return;
  }

  if (nativeActive && adaptiveInterval > NATIVE_ACTIVE_TARGET) {
    adaptiveInterval = Math.max(
      MIN_INTERVAL,
      Math.min(NATIVE_ACTIVE_TARGET, adaptiveInterval - 80)
    );
  }

  if (overBudget > 4 || recentLongTaskCount > 0) {
    const penalty = Math.max(60, overBudget * 4);
    adaptiveInterval = Math.min(MAX_INTERVAL, adaptiveInterval + penalty);
    frameDropCount = Math.min(frameDropCount + 1, 10);
    recentLongTaskCount = Math.max(0, recentLongTaskCount - 1);
  } else if (underBudget > 0 && frameDropCount <= 1) {
    const gain = Math.max(25, Math.abs(underBudget) * 3);
    adaptiveInterval = Math.max(MIN_INTERVAL, adaptiveInterval - gain);
    frameDropCount = Math.max(0, frameDropCount - 1);
  } else {
    frameDropCount = Math.max(0, frameDropCount - 1);
  }

  updatesSinceLastAdjust = 0;
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
  avgUpdateTime = 0;
  adaptiveInterval = 500;
  frameDropCount = 0;
  updatesSinceLastAdjust = 0;
  recentLongTaskCount = 0;
  lastNativeUpdate = 0;
  lastHyperChatUpdate = 0;
  hyperChatDominant = false;
}

/**
 * Get performance stats
 */
function getPerformanceStats() {
  return {
    avgUpdateTime: avgUpdateTime.toFixed(2),
    adaptiveInterval,
    frameDropCount,
    longTasksCaptured: recentLongTaskCount,
    lastMeasurements: updateTimes.slice(-5),
    hyperChatDominant,
    lastNativeUpdate,
    lastHyperChatUpdate
  };
}

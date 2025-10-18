/**
 * Performance monitoring and adaptive updates
 */

// Performance monitoring variables
let lastUpdateTime = 0;
let updateTimes = [];
let avgUpdateTime = 0;
let adaptiveInterval = 600; // Start with 600ms
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
const MIN_INTERVAL = 400;  // Minimum 400ms between updates
const MAX_INTERVAL = 1200; // Maximum 1.2s between updates
const TARGET_UPDATE_TIME = 16; // Target 16ms update time (60fps budget)

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

    // Adapt interval based on performance
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
  adaptiveInterval = 600;
  frameDropCount = 0;
  updatesSinceLastAdjust = 0;
  recentLongTaskCount = 0;
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
    lastMeasurements: updateTimes.slice(-5)
  };
}

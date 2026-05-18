/**
 * Performance monitoring and adaptive updates
 */

// Performance monitoring variables
let lastUpdateTime = 0;
let updateTimes = [];
let avgUpdateTime = 0;
let adaptiveInterval = 600; // Start with 600ms
let frameDropCount = 0;

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
    
    // Adapt interval based on performance
    adaptUpdateInterval();
    
    return result;
  };
}

/**
 * Adapt update interval based on performance metrics
 */
function adaptUpdateInterval() {
  // If updates are taking too long, increase interval
  if (avgUpdateTime > TARGET_UPDATE_TIME) {
    adaptiveInterval = Math.min(MAX_INTERVAL, adaptiveInterval + 50);
    frameDropCount++;
  } 
  // If updates are fast and we have headroom, decrease interval
  else if (avgUpdateTime < TARGET_UPDATE_TIME * 0.5 && frameDropCount === 0) {
    adaptiveInterval = Math.max(MIN_INTERVAL, adaptiveInterval - 25);
  }
  
  // Reset frame drop count periodically
  if (frameDropCount > 5) {
    frameDropCount = Math.max(0, frameDropCount - 1);
  }
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
}

/**
 * Get performance stats
 */
function getPerformanceStats() {
  return {
    avgUpdateTime: avgUpdateTime.toFixed(2),
    adaptiveInterval,
    frameDropCount,
    lastMeasurements: updateTimes.slice(-5)
  };
}

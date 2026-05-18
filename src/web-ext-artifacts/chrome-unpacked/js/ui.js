/**
 * UI handling functions
 */

// Save container position and size to localStorage
function saveContainerPosition(element) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Save position as percentages for responsive behavior
  localStorage.setItem("chatOverlayLeft", (rect.left / viewportWidth * 100).toFixed(2));
  localStorage.setItem("chatOverlayTop", (rect.top / viewportHeight * 100).toFixed(2));
  localStorage.setItem("chatOverlayWidth", (rect.width / viewportWidth * 100).toFixed(2));
  localStorage.setItem("chatOverlayHeight", (rect.height / viewportHeight * 100).toFixed(2));
}

// Make an element draggable using the provided drag handle
function makeDraggable(element, dragHandle) {
  let isDragging = false;
  let lastX, lastY;

  dragHandle.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
  });

  function onDrag(e) {
    if (!isDragging) return;
    const deltaX = e.clientX - lastX;
    const deltaY = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    
    // Calculate new position
    let newLeft = element.offsetLeft + deltaX;
    let newTop = element.offsetTop + deltaY;
    
    // Get viewport and element dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;
    
    // Constrain to viewport bounds
    newLeft = Math.max(0, Math.min(newLeft, viewportWidth - elementWidth));
    newTop = Math.max(0, Math.min(newTop, viewportHeight - elementHeight));
    
    requestAnimationFrame(() => {
      element.style.top = `${newTop}px`;
      element.style.left = `${newLeft}px`;
    });
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    saveContainerPosition(element);
  }
}

// Make an element resizable using the provided resize handle
function makeResizable(element, resizer) {
  let isResizing = false;
  let startX, startY;
  let startWidth, startHeight;
  const MIN_WIDTH = 200;  // Minimum width in pixels
  const MIN_HEIGHT = 150; // Minimum height in pixels
  const PADDING = 5;      // Padding from viewport edge in pixels

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    isResizing = true;
    
    // Store initial cursor position
    startX = e.clientX;
    startY = e.clientY;
    
    // Store initial element dimensions
    startWidth = element.offsetWidth;
    startHeight = element.offsetHeight;
    
    // Add a class to indicate resizing state and prevent transitions
    element.classList.add("resizing");
    
    // Add event listeners for resizing
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
  });

  function onResize(e) {
    if (!isResizing) return;
    
    // Calculate the change in mouse position from the initial mousedown
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get element position
    const elementLeft = element.offsetLeft;
    const elementTop = element.offsetTop;
    
    // Calculate new dimensions based on initial size plus mouse movement
    let newWidth = startWidth + deltaX;
    let newHeight = startHeight + deltaY;
    
    // Prevent negative resizing (flipping) by enforcing minimum size
    newWidth = Math.max(MIN_WIDTH, newWidth);
    newHeight = Math.max(MIN_HEIGHT, newHeight);
    
    // Constrain to viewport bounds
    newWidth = Math.min(newWidth, viewportWidth - elementLeft - PADDING);
    newHeight = Math.min(newHeight, viewportHeight - elementTop - PADDING);
    
    // Apply the new dimensions with requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      element.style.width = `${newWidth}px`;
      element.style.height = `${newHeight}px`;
    });
  }

  function stopResize() {
    if (!isResizing) return;
    
    isResizing = false;
    element.classList.remove("resizing");
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
    
    // Save the new position and size
    saveContainerPosition(element);
  }
}
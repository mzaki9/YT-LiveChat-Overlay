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
  let startClientX, startClientY;
  let startLeft = 0;
  let startTop = 0;
  let pendingFrame = 0;
  let targetLeft = 0;
  let targetTop = 0;
  let activePointerId = null;

  dragHandle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragHandle.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    isDragging = true;
    startClientX = e.clientX;
    startClientY = e.clientY;
    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    targetLeft = startLeft;
    targetTop = startTop;
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.transform = "none";
    element.classList.add("dragging");
    disableIframePointerEvents(true);
  });

  dragHandle.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    onDrag(e);
  });

  dragHandle.addEventListener("pointerup", (e) => {
    stopDrag(e);
  });

  dragHandle.addEventListener("pointercancel", (e) => {
    stopDrag(e);
  });

  dragHandle.addEventListener("lostpointercapture", (e) => {
    stopDrag(e);
  });

  function disableIframePointerEvents(disable) {
    const iframes = element.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.style.pointerEvents = disable ? "none" : "auto";
    });
  }

  function onDrag(e) {
    if (!isDragging) return;

    targetLeft = startLeft + (e.clientX - startClientX);
    targetTop = startTop + (e.clientY - startClientY);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;

    targetLeft = Math.max(0, Math.min(targetLeft, viewportWidth - elementWidth));
    targetTop = Math.max(0, Math.min(targetTop, viewportHeight - elementHeight));

    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      element.style.left = `${targetLeft}px`;
      element.style.top = `${targetTop}px`;
    });
  }

  function stopDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    activePointerId = null;
    if (pendingFrame) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
    element.classList.remove("dragging");
    disableIframePointerEvents(false);
    saveContainerPosition(element);
  }
}

// Make an element resizable using the provided resize handle
function makeResizable(element, resizer) {
  let isResizing = false;
  let startX, startY;
  let startWidth, startHeight;
  let pendingFrame = 0;
  let activePointerId = null;
  const MIN_WIDTH = 200;
  const MIN_HEIGHT = 150;
  const PADDING = 5;

  resizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resizer.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = element.offsetWidth;
    startHeight = element.offsetHeight;
    element.classList.add("resizing");
    disableIframePointerEvents(true);
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!isResizing) return;
    onResize(e);
  });

  resizer.addEventListener("pointerup", (e) => {
    stopResize(e);
  });

  resizer.addEventListener("pointercancel", (e) => {
    stopResize(e);
  });

  resizer.addEventListener("lostpointercapture", (e) => {
    stopResize(e);
  });

  function disableIframePointerEvents(disable) {
    const iframes = element.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.style.pointerEvents = disable ? "none" : "auto";
    });
  }

  function onResize(e) {
    if (!isResizing) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const elementLeft = element.offsetLeft;
    const elementTop = element.offsetTop;

    let newWidth = startWidth + deltaX;
    let newHeight = startHeight + deltaY;

    newWidth = Math.max(MIN_WIDTH, newWidth);
    newHeight = Math.max(MIN_HEIGHT, newHeight);

    newWidth = Math.min(newWidth, viewportWidth - elementLeft - PADDING);
    newHeight = Math.min(newHeight, viewportHeight - elementTop - PADDING);

    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      element.style.width = `${newWidth}px`;
      element.style.height = `${newHeight}px`;
    });
  }

  function stopResize(e) {
    if (!isResizing) return;
    isResizing = false;
    activePointerId = null;
    if (pendingFrame) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
    element.classList.remove("resizing");
    disableIframePointerEvents(false);
    saveContainerPosition(element);
  }
}

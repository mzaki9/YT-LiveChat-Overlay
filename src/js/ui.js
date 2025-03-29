/**
 * UI handling functions
 */

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
      requestAnimationFrame(() => {
        element.style.top = `${element.offsetTop + deltaY}px`;
        element.style.left = `${element.offsetLeft + deltaX}px`;
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
    let lastX, lastY, startWidth, startHeight;
  
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isResizing = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const style = window.getComputedStyle(element);
      startWidth = parseInt(style.width, 10);
      startHeight = parseInt(style.height, 10);
      document.addEventListener("mousemove", onResize);
      document.addEventListener("mouseup", stopResize);
    });
  
    function onResize(e) {
      if (!isResizing) return;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      requestAnimationFrame(() => {
        element.style.width = `${element.offsetWidth + deltaX}px`;
        element.style.height = `${element.offsetHeight + deltaY}px`;
      });
    }
  
    function stopResize() {
      isResizing = false;
      document.removeEventListener("mousemove", onResize);
      document.removeEventListener("mouseup", stopResize);
      saveContainerPosition(element);
    }
  }
  
  // Create a toggle button for showing/hiding the chat overlay
  function createToggleButton(videoPlayer, toggleCallback) {
    const toggleButton = document.createElement("button");
    toggleButton.id = "toggle-chat-overlay";
    toggleButton.textContent = "Chat Overlay";
    toggleButton.title = "Toggle Live Chat Overlay (Alt+C)";
    videoPlayer.appendChild(toggleButton);
    
    toggleButton.addEventListener("click", toggleCallback, { passive: true });
    
    return toggleButton;
  }
  
  // Set up settings panel with opacity control
  function setupSettingsPanel(settingsIcon, settingsPanel, overlayChatContainer) {
    let isSettingsPanelVisible = false;
    
    // Set up opacity slider
    const savedOpacity = localStorage.getItem("chatOverlayOpacity") || 50;
    const opacitySlider = settingsPanel.querySelector("#opacity-slider");
    
    if (opacitySlider) {
      opacitySlider.value = savedOpacity;
      overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${savedOpacity / 100})`;
      overlayChatContainer.style.transition = "background-color 0.1s ease";
      
      opacitySlider.addEventListener("input", (e) => {
        const opacity = e.target.value / 100;
        overlayChatContainer.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
        localStorage.setItem("chatOverlayOpacity", e.target.value);
      });
    }
    
    // Toggle settings panel visibility
    settingsIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      isSettingsPanelVisible = !isSettingsPanelVisible;
      settingsPanel.classList.toggle("show", isSettingsPanelVisible);
    });
    
    // Close settings panel when clicking outside
    document.addEventListener("click", (e) => {
      if (!settingsPanel.contains(e.target) && !settingsIcon.contains(e.target)) {
        isSettingsPanelVisible = false;
        settingsPanel.classList.remove("show");
      }
    });
  }
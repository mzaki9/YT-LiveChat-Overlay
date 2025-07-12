/**
 * Chat handling functionality
 */

// Variables to track chat messages
let lastMessageId = null;
let processedMessageIds = new Set();
const MAX_MESSAGES = 100;
const MAX_NEW_MESSAGES = 100;
// Maximum size for the sliding window of processed IDs
const MAX_PROCESSED_IDS = 500;

// DOM Element Pool for chat messages
const elementPool = {
  messages: [],
  profileImgs: [],
  authors: [],
  messageTexts: [],
  badges: [],
  contentContainers: [], // Add content container pool

  // Get or create a chat message element
  getMessage: function () {
    if (this.messages.length > 0) {
      return this.messages.pop();
    }
    return document.createElement("div");
  },

  // Get or create a profile image element
  getProfileImg: function () {
    if (this.profileImgs.length > 0) {
      return this.profileImgs.pop();
    }
    return document.createElement("img");
  },

  // Get or create an author element
  getAuthor: function () {
    if (this.authors.length > 0) {
      return this.authors.pop();
    }
    return document.createElement("span");
  },

  // Get or create a message text element
  getMessageText: function () {
    if (this.messageTexts.length > 0) {
      return this.messageTexts.pop();
    }
    return document.createElement("span");
  },

  // Get or create a badge element
  getBadge: function () {
    if (this.badges.length > 0) {
      return this.badges.pop();
    }
    return document.createElement("img");
  },
  
  // Get or create a content container
  getContentContainer: function() {
    if (this.contentContainers.length > 0) {
      return this.contentContainers.pop();
    }
    return document.createElement("div");
  },

  // Return elements to the pool
  recycle: function (element) {
    // Clear the element of any content and event listeners
    if (!element) {
      return;
    }

    // Remove all event listeners by cloning and replacing
    const cleanElement = element.cloneNode(false);

    // Clear children if it's a container
    while (element.firstChild) {
      const child = element.firstChild;
      element.removeChild(child);

      // Determine type of child and recycle it
      if (child.classList?.contains("chat-message-profile")) {
        // Clear src to prevent memory leaks from image references
        if (child.tagName === 'IMG') child.src = '';
        this.profileImgs.push(child);
      } else if (child.classList?.contains("chat-message-content")) {
        // Recycle the content container directly
        child.innerHTML = ''; // Clear all children
        this.contentContainers.push(child);
      } else if (child.classList?.contains("chat-message-author")) {
        // Clear any styling
        child.style = '';
        this.authors.push(child);
      } else if (child.classList?.contains("chat-message-text")) {
        // Clear any content
        child.innerHTML = '';
        this.messageTexts.push(child);
      } else if (child.classList?.contains("chat-badge")) {
        // Clear src to prevent memory leaks from image references
        if (child.tagName === 'IMG') child.src = '';
        this.badges.push(child);
      }
    }

    // Add the empty parent element back to the pool
    if (cleanElement.classList?.contains("chat-message")) {
      // Remove all styles, classes, and attributes except the class 'chat-message'
      cleanElement.setAttribute("class", "chat-message");
      cleanElement.style = "";
      this.messages.push(cleanElement);
    }
  },
  
  // Clear pools to specified size limit
  trimPools: function(maxPoolSize = MAX_MESSAGES) {
    this.messages.length = Math.min(this.messages.length, maxPoolSize);
    this.profileImgs.length = Math.min(this.profileImgs.length, maxPoolSize);
    this.authors.length = Math.min(this.authors.length, maxPoolSize);
    this.messageTexts.length = Math.min(this.messageTexts.length, maxPoolSize);
    this.badges.length = Math.min(this.badges.length, maxPoolSize);
    this.contentContainers.length = Math.min(this.contentContainers.length, maxPoolSize);
  }
};

// Determine author class based on YouTube's classes
function getChatMessageAuthorClass(item) {
  const authorNameElement = item.querySelector("#author-name");
  if (authorNameElement.classList.contains("member")) {
    return "author-member";
  }if (authorNameElement.classList.contains("moderator")) {
    return "author-moderator";
  }
  return "";
}

function createChatMessageElement(
  authorName,
  authorPhoto,
  badgeUrl,
  messageText,
  authorClass,
  messageHTML
) {
  // Get a message element from the pool
  const chatMessageElement = elementPool.getMessage();
  chatMessageElement.className = "chat-message";

  // Cache settings once for batch processing
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false";
  const colorfulEnabled = localStorage.getItem("chatColorfulEnabled") !== "false";

  if (avatarsEnabled) {
    const profileImg = elementPool.getProfileImg();
    profileImg.className = "chat-message-profile";
    // Use data URI for missing avatars to avoid network requests
    profileImg.src = authorPhoto || "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzk5OSIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTQuMmMtMi41IDAtNC43MS0xLjI4LTYtMy4yMi4wMy0xLjk5IDQtMy4wOCA2LTMuMDggMS45OSAwIDUuOTcgMS4wOSA2IDMuMDgtMS4yOSAxLjk0LTMuNSAzLjIyLTYgMy4yMnoiLz48L3N2Zz4=";
    chatMessageElement.appendChild(profileImg);
  }

  // Use content container from pool
  const chatMessageContent = elementPool.getContentContainer();
  chatMessageContent.className = "chat-message-content";
  // Ensure it's empty
  chatMessageContent.textContent = '';
  chatMessageElement.appendChild(chatMessageContent);

  const chatMessageAuthor = elementPool.getAuthor();
  chatMessageAuthor.className = `chat-message-author ${authorClass}`;
  chatMessageAuthor.textContent = authorName;

  // Apply color only if needed
  if (!authorClass) {
    const colorfulEnabled =
      localStorage.getItem("chatColorfulEnabled") !== "false";
    if (colorfulEnabled) {
      chatMessageAuthor.style.color = getColorFromName(authorName);
    } else {
      chatMessageAuthor.style.color = "";
    }
  }

  chatMessageContent.appendChild(chatMessageAuthor);

  // Add badge if present
  if (badgeUrl) {
    const badgeImg = elementPool.getBadge();
    badgeImg.className = "chat-badge";
    badgeImg.src = badgeUrl;
    badgeImg.alt = "Badge";
    chatMessageContent.appendChild(badgeImg);
  }

  const messageSpan = elementPool.getMessageText();
  messageSpan.className = "chat-message-text";

  // Use fragment instead of innerHTML when available
  if (messageHTML?.isDocumentFragment) {
    // Clear existing content first
    messageSpan.textContent = '';
    // Append the fragment
    messageSpan.appendChild(messageHTML);
  } else if (typeof messageHTML === "string") {
    // Fall back to innerHTML for backward compatibility
    messageSpan.innerHTML = messageHTML;
  } else {
    // Use textContent for simple messages with no formatting (much faster than innerHTML)
    messageSpan.textContent = messageText;
  }

  chatMessageContent.appendChild(messageSpan);

  return chatMessageElement;
}

// Check if a message ID is in our sliding window
function isMessageProcessed(messageId) {
  return processedMessageIds.has(messageId);
}

// Add a message ID to our sliding window, removing old ones if needed
function addProcessedMessageId(messageId) {
  processedMessageIds.add(messageId);

  // If we've exceeded our window size, remove oldest entries
  if (processedMessageIds.size > MAX_PROCESSED_IDS) {
    const removeCount = Math.floor(MAX_PROCESSED_IDS * 0.2);
    const idsArray = Array.from(processedMessageIds);
    processedMessageIds = new Set(idsArray.slice(removeCount));
  }
}

function updateChatMessages(liveChatFrame, chatMessagesContainer) {
  // Only process if the overlay is visible
  if (!isOverlayVisible || !liveChatFrame || !chatMessagesContainer) {
    return false;
  }

  const chatDocument = liveChatFrame.contentDocument;
  if (!chatDocument) {
    return false;
  }

  // Cache scroll measurements once
  const scrollTop = chatMessagesContainer.scrollTop;
  const clientHeight = chatMessagesContainer.clientHeight;
  const scrollHeight = chatMessagesContainer.scrollHeight;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

  // Use more specific selector with single query
  const chatItems = chatDocument.querySelectorAll(
    "yt-live-chat-text-message-renderer:not([processed]), yt-live-chat-paid-message-renderer:not([processed])"
  );

  // Use document fragment for batch DOM updates
  const fragment = document.createDocumentFragment();
  let newMessages = 0;
  
  // Process only visible + buffer zone items for better performance
  const containerHeight = chatMessagesContainer.clientHeight;
  const avgMessageHeight = 40; // Approximate message height
  const visibleCount = Math.ceil(containerHeight / avgMessageHeight);
  const bufferSize = Math.min(20, visibleCount); // Buffer for smooth scrolling
  
  // Process only the most recent messages that could be visible
  const totalItems = chatItems.length;
  const maxProcessItems = Math.min(MAX_NEW_MESSAGES, visibleCount + bufferSize);
  const startIndex = Math.max(0, totalItems - maxProcessItems);
  
  for (let i = startIndex; i < totalItems; i++) {
    const item = chatItems[i];
    
    // Mark as processed in DOM to avoid reprocessing
    item.setAttribute('processed', 'true');
    
    // Skip items without IDs or already processed in memory
    const messageId = item.getAttribute("id");
    if (!messageId || isMessageProcessed(messageId)) {
      continue;
    }

    // Mark as processed early to prevent duplicates even if processing fails
    addProcessedMessageId(messageId);

    try {
      // Early filtering - skip if no meaningful content
      const messageElement = item.querySelector("#message");
      if (!messageElement || !messageElement.textContent.trim()) {
        continue;
      }
      
      // Cache common DOM queries
      const authorNameElement = item.querySelector("#author-name");
      const authorName = authorNameElement?.textContent || "Unknown";
      
      // Skip if no author name (invalid message)
      if (!authorName || authorName === "Unknown") {
        continue;
      }
      
      const authorClass = authorNameElement ? getChatMessageAuthorClass(item) : "";
      
      // Use optional chaining for potentially missing elements
      const authorPhoto = item.querySelector("#img")?.src || "";

      // Simplified badge detection - use optional chaining
      const badgeImg = item.querySelector(
        "yt-live-chat-author-badge-renderer img"
      );
      const badgeUrl = badgeImg?.src || null;

      // Get message content with null safety
      const messageText = messageElement.textContent || "";
      
      // Create message HTML only if we have actual content
      let messageHTML = null;
      if (messageElement.childNodes.length > 1) { // Only process if more than just text
        messageHTML = createMessageFragment(messageElement);
      }

      // Create the chat message element and add to fragment
      const chatMessageElement = createChatMessageElement(
        authorName,
        authorPhoto,
        badgeUrl,
        messageText,
        authorClass,
        messageHTML
      );

      fragment.appendChild(chatMessageElement);
      newMessages++;
    } catch (error) {
      // Silently catch errors to prevent breaking the chat functionality
      console.error("Error processing chat message:", error);
    }
  }

  // Only manipulate DOM if we have new messages
  if (newMessages === 0) {
    return false;
  }

  // Add all messages at once
  chatMessagesContainer.appendChild(fragment);

  // Remove old messages more efficiently
  const childrenCount = chatMessagesContainer.childElementCount;
  if (childrenCount > MAX_MESSAGES) {
    const elementsToRemove = childrenCount - MAX_MESSAGES;
    // Bulk remove oldest messages and recycle them
    for (let i = 0; i < elementsToRemove; i++) {
      const oldElement = chatMessagesContainer.firstChild;
      if (oldElement) {
        chatMessagesContainer.removeChild(oldElement);
        elementPool.recycle(oldElement);
      }
    }
  }

  // Auto-scroll only if we were already at the bottom
  if (isAtBottom) {
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    });
  }

  return true;
}

// Helper function to create a document fragment from a message element
function createMessageFragment(messageElement) {
  // Create a new document fragment
  const messageFragment = document.createDocumentFragment();

  // Optimize by checking length once
  const nodeCount = messageElement.childNodes.length;
  
  // Process and clone each node from the original message
  for (let j = 0; j < nodeCount; j++) {
    const node = messageElement.childNodes[j];

    try {
      // Handle different node types
      switch (node.nodeType) {
        case Node.TEXT_NODE:
          // For text nodes, just clone them
          messageFragment.appendChild(node.cloneNode(true));
          break;
        
        case Node.ELEMENT_NODE:
          if (node.tagName === "IMG") {
            // For image nodes (emoticons), apply our styling
            const imgClone = node.cloneNode(false); // shallow clone for performance
            imgClone.classList.add("chat-emoticon");
            
            // Apply all styles at once for better performance
            Object.assign(imgClone.style, {
              height: "1em",
              width: "auto",
              verticalAlign: "middle",
              objectFit: "contain"
            });
            
            messageFragment.appendChild(imgClone);
          } else {
            // For other element nodes, clone them
            messageFragment.appendChild(node.cloneNode(true));
          }
          break;
          
        default:
          // Skip other node types
          break;
      }
    } catch (error) {
      // Catch errors for individual nodes without breaking the entire process
      console.error("Error processing message node:", error);
    }
  }

  // Keep reference to the fragment for the message element
  messageFragment.isDocumentFragment = true;
  return messageFragment;
}

// Clear chat message tracking variables
function resetChatTracking() {
  lastMessageId = null;
  processedMessageIds.clear(); // Clear the Set

  // Trim element pools to prevent excessive memory usage
  elementPool.trimPools(MAX_MESSAGES);
  
  // Force garbage collection of any removed elements not in pool
  if (window.gc) {
    try {
      window.gc();
    } catch (e) {
      // GC not available, that's fine
    }
  }
}

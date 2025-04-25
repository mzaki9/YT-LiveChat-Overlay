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
  } else if (authorNameElement.classList.contains("moderator")) {
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

  // Create fewer DOM elements
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false";

  if (avatarsEnabled) {
    const profileImg = elementPool.getProfileImg();
    profileImg.className = "chat-message-profile";
    profileImg.src =
      authorPhoto ||
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
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
  if (messageHTML && messageHTML.isDocumentFragment) {
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

  // Check if we're near the bottom before adding messages
  const isAtBottom =
    chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight >=
    chatMessagesContainer.scrollHeight - 50;

  // Use selector once and then filter to minimize DOM operations
  const chatItems = chatDocument.querySelectorAll(
    "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer"
  );

  // Use document fragment for batch DOM updates
  const fragment = document.createDocumentFragment();
  let newMessages = 0;
  
  // Process only the most recent messages (more efficient than reverse iteration)
  const totalItems = chatItems.length;
  const startIndex = Math.max(0, totalItems - MAX_NEW_MESSAGES);
  
  for (let i = startIndex; i < totalItems; i++) {
    const item = chatItems[i];
    
    // Skip items without IDs or already processed
    const messageId = item.getAttribute("id");
    if (!messageId || isMessageProcessed(messageId)) {
      continue;
    }

    // Mark as processed early to prevent duplicates even if processing fails
    addProcessedMessageId(messageId);

    try {
      // Cache common DOM queries
      const authorNameElement = item.querySelector("#author-name");
      const authorName = authorNameElement ? authorNameElement.textContent : "Unknown";
      const authorClass = authorNameElement ? getChatMessageAuthorClass(item) : "";
      
      // Use optional chaining for potentially missing elements
      const authorPhoto = item.querySelector("#img")?.src || "";

      // Simplified badge detection - use optional chaining
      const badgeImg = item.querySelector(
        "yt-live-chat-author-badge-renderer img"
      );
      const badgeUrl = badgeImg?.src || null;

      // Get message content with null safety
      const messageElement = item.querySelector("#message");
      const messageText = messageElement?.textContent || "";
      
      // Create message HTML only if we have actual content
      let messageHTML = null;
      if (messageElement && messageElement.childNodes.length > 0) {
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

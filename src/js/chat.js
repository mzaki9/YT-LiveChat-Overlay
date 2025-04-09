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

function createChatMessageElement(authorName, authorPhoto, badgeUrl, messageText, authorClass) {
  const chatMessageElement = document.createElement("div");
  chatMessageElement.className = "chat-message";

  // Create fewer DOM elements
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false";
  
  if (avatarsEnabled) {
    const profileImg = document.createElement("img");
    profileImg.className = "chat-message-profile";
    profileImg.src = authorPhoto || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
    chatMessageElement.appendChild(profileImg);
  }

  const chatMessageContent = document.createElement("div");
  chatMessageContent.className = "chat-message-content";

  const chatMessageAuthor = document.createElement("span");
  chatMessageAuthor.className = `chat-message-author ${authorClass}`;
  chatMessageAuthor.textContent = authorName;

  // Apply color only if needed
  if (!authorClass) {
    const colorfulEnabled = localStorage.getItem("chatColorfulEnabled") !== "false";
    if (colorfulEnabled) {
      chatMessageAuthor.style.color = getColorFromName(authorName);
    }
  }

  chatMessageContent.appendChild(chatMessageAuthor);

  // Add badge if present
  if (badgeUrl) {
    const badgeImg = document.createElement("img");
    badgeImg.className = "chat-badge";
    badgeImg.src = badgeUrl;
    badgeImg.alt = "Badge";
    chatMessageContent.appendChild(badgeImg);
  }

  const messageSpan = document.createElement("span");
  messageSpan.className = "chat-message-text";
  messageSpan.textContent = messageText;
  chatMessageContent.appendChild(messageSpan);

  chatMessageElement.appendChild(chatMessageContent);
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
  if (!isOverlayVisible || !liveChatFrame || !chatMessagesContainer) return false;

  const chatDocument = liveChatFrame.contentDocument;
  if (!chatDocument) return false;

  // Use querySelector instead of querySelectorAll when possible
  const chatItems = chatDocument.querySelectorAll(
    "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer"
  );
  
  // Instead of creating an array with slice, just process the last items
  const totalItems = chatItems.length;
  const startIndex = Math.max(0, totalItems - MAX_NEW_MESSAGES);
  let newMessages = 0;
  const fragment = document.createDocumentFragment();
  
  // Check if we're near the bottom before adding messages
  const isAtBottom = chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight >= 
                    chatMessagesContainer.scrollHeight - 50;
  
  // Process only the newest messages by using a reverse loop
  for (let i = totalItems - 1; i >= startIndex; i--) {
    const item = chatItems[i];
    const messageId = item.getAttribute('id');
    
    if (!messageId || isMessageProcessed(messageId)) continue;
    
    addProcessedMessageId(messageId);
    
    // Use textContent instead of clone when possible
    const authorName = item.querySelector("#author-name")?.textContent || "Unknown";
    const authorPhoto = item.querySelector("#img")?.src || "";

    // Simplified badge detection
    let badgeUrl = null;
    const badgeImg = item.querySelector("yt-live-chat-author-badge-renderer img");
    if (badgeImg && badgeImg.src) {
      badgeUrl = badgeImg.src;
    }

    // Create a simplified message element
    const messageText = item.querySelector("#message")?.textContent || "";
    const authorClass = getChatMessageAuthorClass(item);

    const chatMessageElement = createChatMessageElement(
      authorName,
      authorPhoto,
      badgeUrl,
      messageText,
      authorClass
    );
    
    fragment.appendChild(chatMessageElement);
    newMessages++;
  }

  // Only manipulate DOM if we have new messages
  if (newMessages === 0) return false;
  
  // Add all messages at once
  chatMessagesContainer.appendChild(fragment);
  
  // Remove old messages more efficiently
  while (chatMessagesContainer.childElementCount > MAX_MESSAGES) {
    chatMessagesContainer.removeChild(chatMessagesContainer.firstChild);
  }
  
  // Auto-scroll only if we were already at the bottom
  if (isAtBottom) {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  return true;
}

// Clear chat message tracking variables
function resetChatTracking() {
  lastMessageId = null;
  processedMessageIds.clear(); // Clear the Set
}
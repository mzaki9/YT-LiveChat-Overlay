/**
 * Chat handling functionality
 */

// Variables to track chat messages
let lastMessageId = null;
let processedMessageIds = new Set();
const MAX_MESSAGES = 100;

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

// Create a chat message element
function createChatMessageElement(
  authorName,
  authorPhoto,
  badgeUrl,
  messageElement,
  authorClass
) {
  const chatMessageElement = document.createElement("div");
  chatMessageElement.className = "chat-message";

  // Simplified animation - just a gentle slide-in
  chatMessageElement.style.animation = "messageFadeSimple 0.1s ease forwards";

  // Create time stamp element
  const timeStamp = document.createElement("span");
  timeStamp.className = "chat-message-timestamp";
  const now = new Date();
  timeStamp.textContent = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  // Check if timestamps are enabled
  const timestampsEnabled =
    localStorage.getItem("chatTimestampsEnabled") !== "false";
  if (!timestampsEnabled) {
    timeStamp.style.display = "none";
  }

  // Profile image with fallback
  const profileImg = document.createElement("img");
  profileImg.className = "chat-message-profile";
  profileImg.src =
    authorPhoto ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
  profileImg.alt = authorName;
  profileImg.onerror = function () {
    this.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
  };

  // Check if avatars are enabled 
  const avatarsEnabled = localStorage.getItem("chatAvatarsEnabled") !== "false";
  if (!avatarsEnabled) {
    profileImg.style.display = "none";
  }

  chatMessageElement.appendChild(profileImg);

  const chatMessageContent = document.createElement("div");
  chatMessageContent.className = "chat-message-content";
  chatMessageElement.appendChild(chatMessageContent);

  // Author container with name and badge
  const chatMessageAuthor = document.createElement("div");
  chatMessageAuthor.className = `chat-message-author ${authorClass}`;

  // Add timestamp to author line
  chatMessageAuthor.appendChild(timeStamp);

  if (badgeUrl) {
    const badgeImg = document.createElement("img");
    badgeImg.className = "chat-badge";
    badgeImg.src = badgeUrl;
    badgeImg.alt = "Badge";
    chatMessageAuthor.appendChild(badgeImg);
  }

  const authorText = document.createTextNode(authorName);
  chatMessageAuthor.appendChild(authorText);
  chatMessageContent.appendChild(chatMessageAuthor);

  // Message text
  const messageContainer = document.createElement("div");
  messageContainer.className = "chat-message-text";
  messageContainer.appendChild(messageElement);
  chatMessageContent.appendChild(messageContainer);

  return chatMessageElement;
}

function updateChatMessages(liveChatFrame, chatMessagesContainer) {
  const chatDocument = liveChatFrame.contentDocument;
  if (!chatDocument) return false;

  const MAX_NEW_MESSAGES = 30;
  const chatItems = Array.from(chatDocument.querySelectorAll(
    "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer"
  )).slice(-MAX_NEW_MESSAGES);
  
  // Process new messages only
  let newMessages = [];
  
  for (const item of chatItems) {
    const messageId = item.getAttribute('id');
    if (!messageId || processedMessageIds.has(messageId)) continue;
    
    processedMessageIds.add(messageId);
    
    const authorName = item.querySelector("#author-name")?.textContent || "Unknown";
    const authorPhoto = item.querySelector("#img")?.src || "";
    const badgeElement = item.querySelector("yt-live-chat-author-badge-renderer #img");
    const messageElement = item.querySelector("#message")?.cloneNode(true) || document.createTextNode("");

    const authorClass = getChatMessageAuthorClass(item);

    const chatMessageElement = createChatMessageElement(
      authorName,
      authorPhoto,
      badgeElement?.src,
      messageElement,
      authorClass
    );
    
    newMessages.push(chatMessageElement);
  }

  // Check if we have any new messages to add
  if (newMessages.length === 0) return false;

  // Check if we're near the bottom before adding messages
  const isAtBottom = chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight >= 
                    chatMessagesContainer.scrollHeight - 50;
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  newMessages.forEach(msg => fragment.appendChild(msg));
  chatMessagesContainer.appendChild(fragment);
  
  while (chatMessagesContainer.childElementCount > MAX_MESSAGES) {
    chatMessagesContainer.firstElementChild.remove();
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

// Clear chat message tracking variables
function resetChatTracking() {
  lastMessageId = null;
  processedMessageIds.clear();
}

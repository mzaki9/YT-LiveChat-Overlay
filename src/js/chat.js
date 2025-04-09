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

  // Return elements to the pool
  recycle: function (element) {
    // Clear the element of any content and event listeners
    if (!element) return;

    // Clear children if it's a container
    while (element.firstChild) {
      const child = element.firstChild;
      element.removeChild(child);

      // Determine type of child and recycle it
      if (child.classList.contains("chat-message-profile")) {
        this.profileImgs.push(child);
      } else if (child.classList.contains("chat-message-author")) {
        this.authors.push(child);
      } else if (child.classList.contains("chat-message-text")) {
        this.messageTexts.push(child);
      } else if (child.classList.contains("chat-badge")) {
        this.badges.push(child);
      }
    }

    // Add the empty parent element back to the pool
    if (element.classList.contains("chat-message")) {
      // Remove all styles, classes, and attributes except the class 'chat-message'
      const classValue = "chat-message";
      element.setAttribute("class", classValue);
      element.style = "";
      this.messages.push(element);
    }
  },
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

  // Check if the message element already has a content container
  let chatMessageContent = chatMessageElement.querySelector(
    ".chat-message-content"
  );
  if (!chatMessageContent) {
    chatMessageContent = document.createElement("div");
    chatMessageContent.className = "chat-message-content";
    chatMessageElement.appendChild(chatMessageContent);
  } else {
    // Clear existing content
    chatMessageContent.innerHTML = "";
  }

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
    while (messageSpan.firstChild) {
      messageSpan.removeChild(messageSpan.firstChild);
    }
    // Append the fragment
    messageSpan.appendChild(messageHTML);
  } else if (typeof messageHTML === "string") {
    // Fall back to innerHTML for backward compatibility
    messageSpan.innerHTML = messageHTML;
  } else {
    // Use textContent for simple messages with no formatting
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
  if (!isOverlayVisible || !liveChatFrame || !chatMessagesContainer)
    return false;

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
  const isAtBottom =
    chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight >=
    chatMessagesContainer.scrollHeight - 50;

  for (let i = totalItems - 1; i >= startIndex; i--) {
    const item = chatItems[i];
    const messageId = item.getAttribute("id");

    if (!messageId || isMessageProcessed(messageId)) continue;

    addProcessedMessageId(messageId);

    // Use textContent for basic text
    const authorName =
      item.querySelector("#author-name")?.textContent || "Unknown";
    const authorPhoto = item.querySelector("#img")?.src || "";

    // Simplified badge detection
    let badgeUrl = null;
    const badgeImg = item.querySelector(
      "yt-live-chat-author-badge-renderer img"
    );
    if (badgeImg && badgeImg.src) {
      badgeUrl = badgeImg.src;
    }

    // Get both text and HTML content for the message
    const messageElement = item.querySelector("#message");
    const messageText = messageElement?.textContent || "";
    let messageHTML = null;


    if (messageElement) {
      // Instead of using innerHTML, create a DocumentFragment
      const messageFragment = document.createDocumentFragment();

      // Process and clone each node from the original message
      for (let j = 0; j < messageElement.childNodes.length; j++) {
        const node = messageElement.childNodes[j];

        // Handle different node types
        if (node.nodeType === Node.TEXT_NODE) {
          // For text nodes, just clone them
          messageFragment.appendChild(node.cloneNode(true));
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.tagName === "IMG"
        ) {
          // For image nodes (emoticons), apply our styling
          const imgClone = node.cloneNode(true);
          imgClone.classList.add("chat-emoticon");
          imgClone.style.height = "1em";
          imgClone.style.width = "auto";
          imgClone.style.verticalAlign = "middle";
          imgClone.style.objectFit = "contain";
          messageFragment.appendChild(imgClone);
        } else {
          // For other node types (like emoji spans), clone them properly
          messageFragment.appendChild(node.cloneNode(true));
        }
      }

      // Keep reference to the fragment for the message element
      messageFragment.isDocumentFragment = true;
      messageHTML = messageFragment;
    }

    const authorClass = getChatMessageAuthorClass(item);

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
  }

  // Only manipulate DOM if we have new messages
  if (newMessages === 0) return false;

  // Add all messages at once
  chatMessagesContainer.appendChild(fragment);

  // Remove old messages more efficiently and recycle them
  while (chatMessagesContainer.childElementCount > MAX_MESSAGES) {
    const oldElement = chatMessagesContainer.firstChild;
    chatMessagesContainer.removeChild(oldElement);
    elementPool.recycle(oldElement);
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

  // Clear the element pools if we have too many cached elements
  if (elementPool.messages.length > MAX_MESSAGES * 2) {
    elementPool.messages.length = MAX_MESSAGES;
  }
  if (elementPool.profileImgs.length > MAX_MESSAGES * 2) {
    elementPool.profileImgs.length = MAX_MESSAGES;
  }
  if (elementPool.authors.length > MAX_MESSAGES * 2) {
    elementPool.authors.length = MAX_MESSAGES;
  }
  if (elementPool.messageTexts.length > MAX_MESSAGES * 2) {
    elementPool.messageTexts.length = MAX_MESSAGES;
  }
  if (elementPool.badges.length > MAX_MESSAGES * 2) {
    elementPool.badges.length = MAX_MESSAGES;
  }
}

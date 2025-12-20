/**
 * Chat functionality
 * Handles chat UI, message sending/receiving, and WebSocket integration
 */

import { sendCommand, addEventListener as onWebSocketEvent, sessionID } from './websocket.js';

let currentUsername = null;
let isChatActive = false;

/**
 * Initialize chat functionality
 * Sets up event listeners and WebSocket handlers
 */
export function initChat() {
    console.log('[Chat] Initializing chat');

    // Set up login form handlers
    const usernameInput = document.getElementById('chat-username');
    const loginButton = document.querySelector('#chat-login button');
    
    if (usernameInput && loginButton) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinChat();
            }
        });
        
        loginButton.addEventListener('click', joinChat);
    }

    // Set up message input handlers
    const messageInput = document.getElementById('chat-message');
    const sendButton = document.querySelector('#chat-input-area button');
    
    if (messageInput && sendButton) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
        
        sendButton.addEventListener('click', sendChatMessage);
    }

    // Listen for incoming chat messages from WebSocket
    onWebSocketEvent('chatMessage', (payload) => {
        try {
            if (payload && payload.message && payload.username) {
                displayMessage(payload.username, payload.message, payload.timestamp, payload.username === currentUsername);
            }
        } catch (err) {
            console.error('[Chat] Error handling chat message:', err);
        }
    });

    // Listen for chat system messages (user joined, left, etc.)
    onWebSocketEvent('chatSystem', (payload) => {
        try {
            if (payload && payload.message) {
                displaySystemMessage(payload.message);
            }
        } catch (err) {
            console.error('[Chat] Error handling system message:', err);
        }
    });

    // Handle WebSocket connection events
    onWebSocketEvent('open', () => {
        console.log('[Chat] WebSocket connected');
        if (isChatActive && currentUsername) {
            // Rejoin chat if already logged in
            sendCommand({
                type: 'chatJoin',
                username: currentUsername,
                sessionID: sessionID
            });
        }
    });

    onWebSocketEvent('close', () => {
        console.log('[Chat] WebSocket disconnected');
        if (isChatActive) {
            displaySystemMessage('Verbinding verbroken. Opnieuw verbinden...');
        }
    });

    console.log('[Chat] Chat initialized');
}

/**
 * Join the chat with a username
 */
export function joinChat() {
    const usernameInput = document.getElementById('chat-username');
    const username = usernameInput ? usernameInput.value.trim() : '';

    if (!username) {
        alert('Voer een naam in om te beginnen.');
        return;
    }

    if (username.length > 20) {
        alert('Naam mag maximaal 20 tekens lang zijn.');
        return;
    }

    currentUsername = username;
    isChatActive = true;

    // Hide login screen and show chat interface
    const loginScreen = document.getElementById('chat-login');
    const chatInterface = document.getElementById('chat-interface');
    const displayName = document.getElementById('display-name');

    if (loginScreen) loginScreen.style.display = 'none';
    if (chatInterface) chatInterface.style.display = 'flex';
    if (displayName) displayName.textContent = username;

    // Clear chat box and show welcome message
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.innerHTML = '<div class="chat-empty">Welkom in de chat! Begin het gesprek.</div>';
    }

    // Send join message to server
    sendCommand({
        type: 'chatJoin',
        username: username,
        sessionID: sessionID
    });

    console.log(`[Chat] Joined chat as: ${username}`);
}

/**
 * Send a chat message
 */
export function sendChatMessage() {
    if (!isChatActive || !currentUsername) {
        console.warn('[Chat] Cannot send message: not joined to chat');
        return;
    }

    const messageInput = document.getElementById('chat-message');
    const message = messageInput ? messageInput.value.trim() : '';

    if (!message) {
        return;
    }

    // Send message via WebSocket
    sendCommand({
        type: 'chatMessage',
        username: currentUsername,
        message: message,
        sessionID: sessionID,
        timestamp: Date.now()
    });

    // Clear input field
    if (messageInput) {
        messageInput.value = '';
    }

    console.log(`[Chat] Message sent: ${message}`);
}

/**
 * Display a chat message in the chat box
 */
function displayMessage(username, message, timestamp, isOwnMessage) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    // Remove empty state message if present
    const emptyState = chatBox.querySelector('.chat-empty');
    if (emptyState) {
        emptyState.remove();
    }

    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOwnMessage ? 'own-message' : 'other-message'}`;

    const time = timestamp ? new Date(timestamp).toLocaleTimeString('nl-NL', { 
        hour: '2-digit', 
        minute: '2-digit' 
    }) : new Date().toLocaleTimeString('nl-NL', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    messageDiv.innerHTML = `
        <div class="message-author">${escapeHtml(username)}</div>
        <div class="message-text">${escapeHtml(message)}</div>
        <div class="message-time">${time}</div>
    `;

    chatBox.appendChild(messageDiv);

    // Auto-scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Display a system message (user joined, left, etc.)
 */
function displaySystemMessage(message) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    // Remove empty state message if present
    const emptyState = chatBox.querySelector('.chat-empty');
    if (emptyState) {
        emptyState.remove();
    }

    const systemDiv = document.createElement('div');
    systemDiv.className = 'chat-message system-message';
    systemDiv.style.cssText = 'align-self: center; background: var(--pill); color: var(--muted); font-style: italic; font-size: 12px; padding: 6px 12px;';
    systemDiv.textContent = message;

    chatBox.appendChild(systemDiv);

    // Auto-scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Leave the chat
 */
export function leaveChat() {
    if (isChatActive && currentUsername) {
        sendCommand({
            type: 'chatLeave',
            username: currentUsername,
            sessionID: sessionID
        });
    }

    currentUsername = null;
    isChatActive = false;

    // Show login screen and hide chat interface
    const loginScreen = document.getElementById('chat-login');
    const chatInterface = document.getElementById('chat-interface');
    const usernameInput = document.getElementById('chat-username');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (chatInterface) chatInterface.style.display = 'none';
    if (usernameInput) {
        usernameInput.value = '';
        usernameInput.focus();
    }

    console.log('[Chat] Left chat');
}


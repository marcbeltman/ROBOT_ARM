/**
 * Robot Arm Client - servo control and gripper commands
 * Wires range inputs and buttons to WebSocket servo commands
 */

import { sendCommand } from './websocket.js';

/**
 * Initialize robot arm control handlers
 * Connects all sliders to their value displays and WebSocket commands
 */
export function initRobotArmClient() {
    console.log('[Client] Initializing Robot Arm client');
    
    // Define servo mappings: input element id → value display id
    const servoMap = [
        { id: 'baseSpin', val: 'valBaseSpin' },
        { id: 'baseArm', val: 'valBaseArm' },
        { id: 'midArm', val: 'valMidArm' },
        { id: 'gripper', val: 'valGripper' },
        { id: 'cameraPan', val: 'valCameraPan' },
        { id: 'cameraTilt', val: 'valCameraTilt' }
    ];

    // Wire each servo slider to update display and send command
    servoMap.forEach(pair => {
        const inputEl = document.getElementById(pair.id);
        const valueEl = document.getElementById(pair.val);

        if (!inputEl || !valueEl) {
            console.warn(`[Client] Missing element: input=${pair.id}, value=${pair.val}`);
            return;
        }

        function updateServo() {
            const value = inputEl.value;
            valueEl.textContent = value;
            
            // Send servo command via WebSocket
            sendCommand({
                type: 'servo',
                servo: pair.id,
                value: value
            });
            console.debug(`[Client] Servo ${pair.id} → ${value}`);
        }

        // Update on both input (dragging) and change (release)
        inputEl.addEventListener('input', updateServo);
        inputEl.addEventListener('change', updateServo);
    });

    // Wire gripper buttons
    const openBtn = document.getElementById('openBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            sendCommand({ type: 'gripper', action: 'open' });
            flashStatus('Open');
            console.debug('[Client] Gripper: open');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            sendCommand({ type: 'gripper', action: 'close' });
            flashStatus('Close');
            console.debug('[Client] Gripper: close');
        });
    }

    console.log('[Client] Robot Arm client initialized');
}

/**
 * Flash a temporary message in the status display
 */
function flashStatus(text) {
    const statusSpan = document.querySelector('.status span:nth-child(2)');
    if (!statusSpan) {
        console.warn('[Client] Status display element not found');
        return;
    }

    const originalText = statusSpan.textContent;
    statusSpan.textContent = text;
    
    setTimeout(() => {
        statusSpan.textContent = originalText;
    }, 800);
}

/**
 * Utility: send a custom servo command
 */
export function moveServo(servoId, value) {
    sendCommand({
        type: 'servo',
        servo: servoId,
        value: value
    });
}

/**
 * Utility: send gripper command
 */
export function controlGripper(action) {
    if (action !== 'open' && action !== 'close') {
        console.error('[Client] Invalid gripper action:', action);
        return;
    }
    
    sendCommand({
        type: 'gripper',
        action: action
    });
    flashStatus(action.charAt(0).toUpperCase() + action.slice(1));
}

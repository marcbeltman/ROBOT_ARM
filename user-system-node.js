/**
 * USER-SYSTEM NODE (High-Speed + Auto-Promotion Edition)
 */
const QUEUE_KEY = 'userQueue';
const PRESENCE_KEY = 'globalPresence';
const TIMEOUT_MS = 10000; 
const CLEANUP_INTERVAL = 1000; 

function getQueue() { return global.get(QUEUE_KEY) || []; }
function getPresence() { return global.get(PRESENCE_KEY) || {}; }
function getUserMap() { return global.get('userMap') || {}; }

function broadcast() {
    const queue = getQueue();
    const presence = getPresence();
    node.send([null, null, { payload: { queue, presence }, topic: "MasterUpdate" }]);
}

// === A. ONDERHOUD (1x per seconde) ===
const interval = setInterval(() => {
    let queue = getQueue();
    let presence = getPresence();
    let userMap = getUserMap();
    const now = Date.now();
    let changed = false;
    const oldOwnerUUID = queue.length > 0 ? queue[0].uuid : null;

    for (let uuid in presence) {
        if (now - presence[uuid].lastSeen > TIMEOUT_MS) {
            delete presence[uuid];
            delete userMap[uuid];
            queue = queue.filter(u => u.uuid !== uuid);
            changed = true;
        }
    }

    if (changed) {
        global.set('userMap', userMap);
        global.set(QUEUE_KEY, queue);
        global.set(PRESENCE_KEY, presence);
        broadcast();
        
        // Als de eigenaar is weggevallen door timeout, informeer de nieuwe nummer 1
        if (queue.length > 0 && queue[0].uuid !== oldOwnerUUID) {
            node.send([null, { 
                payload: { type: "sessionActive", status: "owner" }, 
                _session: { id: queue[0].socket } 
            }, null]);
        }
    }
}, CLEANUP_INTERVAL);

node.on('close', () => clearInterval(interval));

// === B. BERICHT AFHANDELING ===
if (typeof msg.payload === "string") {
    try { msg.payload = JSON.parse(msg.payload); } catch (e) { return null; }
}

const payload = msg.payload;
const incomingUUID = payload.sessionID;
if (!incomingUUID) return null;

const now = Date.now();
let queue = getQueue();
let presence = getPresence();
let userMap = getUserMap();
const currentSocketID = msg._session ? msg._session.id : null;

// 1. REGISTREER AANWEZIGHEID
const isNewVisitor = !presence[incomingUUID];
presence[incomingUUID] = { lastSeen: now, socket: currentSocketID };
global.set(PRESENCE_KEY, presence);
if (isNewVisitor) { broadcast(); }

// 2. CHAT JOIN
if (payload.type === "chatJoin") {
    userMap[incomingUUID] = payload.username || "Gast";
    global.set('userMap', userMap);
    if (queue.findIndex(u => u.uuid === incomingUUID) === -1) {
        queue.push({ uuid: incomingUUID, socket: currentSocketID, lastSeen: now });
    }
    global.set(QUEUE_KEY, queue);
    broadcast();
    // Flow loopt door naar sectie C voor de persoonlijke reply
}

// 3. HEARTBEAT
else if (payload.type === "heartbeat") {
    const idx = queue.findIndex(u => u.uuid === incomingUUID);
    if (idx !== -1) {
        queue[idx].lastSeen = now;
        queue[idx].socket = currentSocketID;
        global.set(QUEUE_KEY, queue);
    }
    // Als ze in userMap staan maar niet in queue (bijv. na visibility reconnect)
    else if (userMap[incomingUUID]) {
        queue.push({ uuid: incomingUUID, socket: currentSocketID, lastSeen: now });
        global.set(QUEUE_KEY, queue);
        broadcast();
    }
}

// 4. DISCONNECT / LEAVE (Verbeterde logica)
else if (payload.type === "disconnect" || payload.type === "chatLeave") {
    const wasOwner = (queue.length > 0 && queue[0].uuid === incomingUUID);
    
    // Verwijder uit alle lijsten
    queue = queue.filter(u => u.uuid !== incomingUUID);
    delete presence[incomingUUID];
    delete userMap[incomingUUID];
    
    global.set('userMap', userMap);
    global.set(QUEUE_KEY, queue);
    global.set(PRESENCE_KEY, presence);
    
    // 1. Informeer de verlater (zodat website knoppen blokkeert)
    node.send([null, { 
        payload: { type: "viewerStatus", status: "watching" }, 
        _session: msg._session 
    }, null]);

    // 2. Als de owner wegving, informeer de nieuwe nummer 1 direct
    if (wasOwner && queue.length > 0) {
        node.send([null, { 
            payload: { type: "sessionActive", status: "owner" }, 
            _session: { id: queue[0].socket } 
        }, null]);
    }

    broadcast();
    return null; // Stop hier voor dit bericht
}

// 5. ROBOT CONTROL
if (payload.type === "robotControl") {
    if (queue.length > 0 && queue[0].uuid === incomingUUID) {
        queue[0].lastSeen = now;
        msg._originalSession = msg._session;
        delete msg._session;
        return [msg, null, null];
    }
    return [null, { payload: { type: "error", message: "Geen rechten" }, _session: msg._session }, null];
}

// === C. FEEDBACK NAAR DE GEBRUIKER (Bij heartbeat/join) ===
const qIdx = queue.findIndex(u => u.uuid === incomingUUID);
let reply = { _session: msg._session };
if (qIdx === 0) reply.payload = { type: "sessionActive", status: "owner" };
else if (qIdx > 0) reply.payload = { type: "queueWait", position: qIdx + 1 };
else reply.payload = { type: "viewerStatus" };

return [null, reply, null];
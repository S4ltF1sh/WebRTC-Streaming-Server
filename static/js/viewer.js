/**
 * Viewer client-side logic
 * Handles receiving and displaying WebRTC streams
 */

(function() {
    'use strict';

    // State
    let pc = null;
    let ws = null;
    let roomId = null;
    let iceCandidateBuffer = [];
    let remoteDescriptionSet = false;

    // DOM elements
    const joinForm = document.getElementById('joinForm');
    const videoSection = document.getElementById('videoSection');
    const roomInput = document.getElementById('roomInput');
    const joinBtn = document.getElementById('joinBtn');
    const remoteVideo = document.getElementById('remoteVideo');
    const status = document.getElementById('status');
    const unmuteBtn = document.getElementById('unmuteBtn');

    // Configuration
    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    /**
     * Initialize application
     */
    function init() {
        joinBtn.addEventListener('click', joinRoom);
        unmuteBtn.addEventListener('click', toggleMute);
        window.addEventListener('beforeunload', cleanup);
        
        // Auto-join from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) {
            roomInput.value = urlRoomId;
            setTimeout(joinRoom, 100);
        }
    }

    /**
     * Join a streaming room
     */
    async function joinRoom() {
        roomId = roomInput.value.trim();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }
        
        joinForm.style.display = 'none';
        videoSection.style.display = 'block';
        
        createPeerConnection();
        connectSignalingServer();
    }

    /**
     * Create WebRTC peer connection
     */
    function createPeerConnection() {
        pc = new RTCPeerConnection(ICE_SERVERS);
        
        pc.ontrack = handleTrack;
        pc.onicecandidate = handleLocalIceCandidate;
        pc.onconnectionstatechange = handleConnectionStateChange;
    }

    /**
     * Connect to signaling server
     */
    function connectSignalingServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/viewer?room=${roomId}`);
        
        ws.onopen = handleWsOpen;
        ws.onmessage = handleWsMessage;
        ws.onerror = handleWsError;
        ws.onclose = handleWsClose;
    }

    /**
     * WebSocket event handlers
     */
    function handleWsOpen() {
        console.log('Connected to signaling server');
        updateStatus('Waiting for streamer...', 'connecting');
    }

    async function handleWsMessage(event) {
        const message = JSON.parse(event.data);
        console.log('Received:', message.type);
        
        switch (message.type) {
            case 'offer':
                await handleOffer(message.sdp);
                break;
            case 'ice_candidate':
                await handleRemoteIceCandidate(message.candidate);
                break;
            case 'error':
                updateStatus('Error: ' + message.message, 'error');
                break;
        }
    }

    function handleWsError(error) {
        console.error('WebSocket error:', error);
        updateStatus('Connection error', 'error');
    }

    function handleWsClose() {
        console.log('WebSocket closed');
        cleanup();
    }

    /**
     * WebRTC event handlers
     */
    function handleTrack(event) {
        console.log('Received remote track:', event.track.kind);
        
        // Only set srcObject once when first track arrives
        if (!remoteVideo.srcObject && event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('Video srcObject set');
            
            remoteVideo.play().catch(err => {
                console.error('Autoplay blocked:', err);
            });
        }
        
        updateStatus('Connected - Receiving stream', 'connected');
    }

    function handleLocalIceCandidate(event) {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ice_candidate',
                candidate: event.candidate
            }));
        }
    }

    function handleConnectionStateChange() {
        console.log('Connection state:', pc.connectionState);
        
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            updateStatus('Disconnected', 'error');
        } else if (pc.connectionState === 'connected') {
            console.log('P2P connection established');
        }
    }

    /**
     * Signaling message handlers
     */
    async function handleOffer(sdp) {
        console.log('Received offer');
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            remoteDescriptionSet = true;
            console.log('Remote description set');
            
            // Process buffered ICE candidates
            if (iceCandidateBuffer.length > 0) {
                console.log(`Processing ${iceCandidateBuffer.length} buffered ICE candidates`);
                for (const candidate of iceCandidateBuffer) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (error) {
                        console.error('Error adding buffered candidate:', error);
                    }
                }
                iceCandidateBuffer = [];
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            ws.send(JSON.stringify({
                type: 'answer',
                sdp: pc.localDescription
            }));
            
            console.log('Sent answer');
        } catch (error) {
            console.error('Error handling offer:', error);
            updateStatus('Error: ' + error.message, 'error');
        }
    }

    async function handleRemoteIceCandidate(candidate) {
        if (!candidate) return;
        
        if (!remoteDescriptionSet) {
            console.log('Buffering ICE candidate');
            iceCandidateBuffer.push(candidate);
            return;
        }
        
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    /**
     * Toggle mute/unmute
     */
    function toggleMute() {
        if (remoteVideo.muted) {
            remoteVideo.muted = false;
            unmuteBtn.textContent = '🔊Mute';
            unmuteBtn.style.background = '#4CAF50';
        } else {
            remoteVideo.muted = true;
            unmuteBtn.textContent = '🔇Unmute';
            unmuteBtn.style.background = '#667eea';
        }
    }

    /**
     * Cleanup resources
     */
    function cleanup() {
        if (pc) {
            pc.close();
            pc = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        remoteVideo.srcObject = null;
        remoteDescriptionSet = false;
        iceCandidateBuffer = [];
    }

    /**
     * Update status display
     */
    function updateStatus(msg, type) {
        status.textContent = msg;
        status.className = 'status ' + type;
    }

    // Initialize on load
    init();
})();
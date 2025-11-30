/**
 * Streamer client-side logic
 * Handles webcam streaming and WebRTC peer connections
 */

(function() {
    'use strict';

    // State
    let localStream = null;
    let peerConnections = new Map();
    let iceCandidateBuffers = new Map();
    let ws = null;
    let roomId = null;

    // DOM elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const localVideo = document.getElementById('localVideo');
    const shareSection = document.getElementById('shareSection');
    const shareLink = document.getElementById('shareLink');
    const copyBtn = document.getElementById('copyBtn');
    const status = document.getElementById('status');
    const stats = document.getElementById('stats');
    const videoSelect = document.getElementById('videoSelect');
    const audioSelect = document.getElementById('audioSelect');
    const permissionSection = document.getElementById('permissionSection');
    const deviceSelectorsSection = document.getElementById('deviceSelectorsSection');
    const selectDeviceBtn = document.getElementById('selectDeviceBtn');

    // Configuration
    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    const KEEPALIVE_INTERVAL = 30000; // 30 seconds

    /**
     * Initialize application
     */
    function init() {
        startBtn.addEventListener('click', startStreaming);
        stopBtn.addEventListener('click', stopStreaming);
        copyBtn.addEventListener('click', copyLink);
        selectDeviceBtn.addEventListener('click', requestDevicePermission);
        window.addEventListener('beforeunload', stopStreaming);
        
        // Try to enumerate devices without permission
        getDevicesWithoutPermission();
    }

    /**
     * Enumerate devices without requesting permission
     * Show button to request permission if labels not available
     */
    async function getDevicesWithoutPermission() {
        try {
            var devices = await navigator.mediaDevices.enumerateDevices();
            
            var hasPermission = devices.some(function(device) {
                return device.label !== '';
            });
            
            if (!hasPermission) {
                // Show permission button
                permissionSection.style.display = 'block';
                deviceSelectorsSection.style.display = 'none';
                console.log('Waiting for device permission');
                return;
            }
            
            // Has permission - show device selectors
            permissionSection.style.display = 'none';
            deviceSelectorsSection.style.display = 'block';
            populateDeviceDropdowns(devices);
            
        } catch (error) {
            console.error('Error enumerating devices:', error);
            permissionSection.style.display = 'block';
            deviceSelectorsSection.style.display = 'none';
        }
    }

    /**
     * Request device permission and show dropdowns
     */
    async function requestDevicePermission() {
        try {
            var tempStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Stop the temporary stream immediately
            tempStream.getTracks().forEach(function(track) {
                track.stop();
            });
            
            // Hide permission section, show device selectors
            permissionSection.style.display = 'none';
            deviceSelectorsSection.style.display = 'block';
            
            // Get devices with labels
            await getDevicesWithLabels();
            
        } catch (error) {
            console.error('Permission error:', error);
            
            var errorMsg = 'Cannot access camera/microphone. ';
            if (error.name === 'NotFoundError') {
                errorMsg += 'No devices found. Please check your camera/microphone connection.';
            } else if (error.name === 'NotAllowedError') {
                errorMsg += 'Permission denied. Please allow access in browser settings.';
            } else if (error.name === 'NotReadableError') {
                errorMsg += 'Device is being used by another application.';
            } else {
                errorMsg += 'Please try again or restart your browser.';
            }
            
            alert(errorMsg);
        }
    }

    /**
     * Populate device dropdowns with devices (initial load)
     */
    function populateDeviceDropdowns(devices) {
        videoSelect.innerHTML = '';
        audioSelect.innerHTML = '';
        
        // Add default options only
        var defaultVideoOption = document.createElement('option');
        defaultVideoOption.text = 'Default Camera';
        defaultVideoOption.value = '';
        videoSelect.appendChild(defaultVideoOption);
        
        var defaultAudioOption = document.createElement('option');
        defaultAudioOption.text = 'Default Microphone';
        defaultAudioOption.value = '';
        audioSelect.appendChild(defaultAudioOption);
        
        var videoCount = 0;
        var audioCount = 0;
        
        devices.forEach(function(device) {
            var option = document.createElement('option');
            option.value = device.deviceId;
            
            if (device.kind === 'videoinput') {
                videoCount++;
                option.text = device.label || 'Camera ' + videoCount;
                videoSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioCount++;
                option.text = device.label || 'Microphone ' + audioCount;
                audioSelect.appendChild(option);
            }
        });
        
        videoSelect.disabled = false;
        audioSelect.disabled = false;
        videoSelect.style.display = 'block';
        audioSelect.style.display = 'block';
        
        console.log('Devices populated');
    }

    /**
     * Populate device dropdowns with close/mute options (when streaming)
     */
    function populateDeviceDropdownsWithControls(devices) {
        var currentVideoValue = videoSelect.value;
        var currentAudioValue = audioSelect.value;
        
        videoSelect.innerHTML = '';
        audioSelect.innerHTML = '';
        
        // Add default options
        var defaultVideoOption = document.createElement('option');
        defaultVideoOption.text = 'Default Camera';
        defaultVideoOption.value = '';
        videoSelect.appendChild(defaultVideoOption);
        
        // Add "Close Camera" option
        var closeVideoOption = document.createElement('option');
        closeVideoOption.text = '❌ Close Camera';
        closeVideoOption.value = 'close';
        videoSelect.appendChild(closeVideoOption);
        
        var defaultAudioOption = document.createElement('option');
        defaultAudioOption.text = 'Default Microphone';
        defaultAudioOption.value = '';
        audioSelect.appendChild(defaultAudioOption);
        
        // Add "Mute Microphone" option
        var muteAudioOption = document.createElement('option');
        muteAudioOption.text = '🔇 Mute Microphone';
        muteAudioOption.value = 'mute';
        audioSelect.appendChild(muteAudioOption);
        
        var videoCount = 0;
        var audioCount = 0;
        
        devices.forEach(function(device) {
            var option = document.createElement('option');
            option.value = device.deviceId;
            
            if (device.kind === 'videoinput') {
                videoCount++;
                option.text = device.label || 'Camera ' + videoCount;
                videoSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioCount++;
                option.text = device.label || 'Microphone ' + audioCount;
                audioSelect.appendChild(option);
            }
        });
        
        // Restore previous selection
        videoSelect.value = currentVideoValue;
        audioSelect.value = currentAudioValue;
        
        console.log('Devices populated with controls');
    }

    /**
     * Enumerate devices with full labels (after permission granted)
     */
    async function getDevicesWithLabels() {
        try {
            var devices = await navigator.mediaDevices.enumerateDevices();
            
            var currentVideoValue = videoSelect.value;
            var currentAudioValue = audioSelect.value;
            
            // Use normal populate (without close/mute options)
            populateDeviceDropdowns(devices);
            
            // Restore previous selection
            videoSelect.value = currentVideoValue;
            audioSelect.value = currentAudioValue;
            
            console.log('Devices enumerated with labels');
        } catch (error) {
            console.error('Error enumerating devices:', error);
        }
    }

    /**
     * Start streaming
     */
    async function startStreaming() {
        try {
            var videoDeviceId = videoSelect.value;
            var audioDeviceId = audioSelect.value;
            
            var constraints = {
                video: videoDeviceId ? 
                    { deviceId: { exact: videoDeviceId }, width: 1280, height: 720 } : 
                    { width: 1280, height: 720 },
                audio: audioDeviceId ? 
                    { deviceId: { exact: audioDeviceId } } : 
                    true
            };
            
            console.log('Using constraints:', constraints);
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            localVideo.srcObject = localStream;
            
            // Get devices and populate WITH close/mute options
            var devices = await navigator.mediaDevices.enumerateDevices();
            populateDeviceDropdownsWithControls(devices);
            
            connectSignalingServer();
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            
            // Add event listeners to switch devices
            videoSelect.addEventListener('change', switchCamera);
            audioSelect.addEventListener('change', switchMicrophone);
            
        } catch (error) {
            console.error('Error starting stream:', error);
            alert('Cannot access webcam: ' + error.message);
        }
    }

    /**
     * Switch camera while streaming
     */
    async function switchCamera() {
        if (!localStream) return;
        
        try {
            var videoDeviceId = videoSelect.value;
            
            // Check if user wants to close camera
            if (videoDeviceId === 'close') {
                var oldVideoTrack = localStream.getVideoTracks()[0];
                if (oldVideoTrack) {
                    // Stop and remove video track
                    oldVideoTrack.stop();
                    localStream.removeTrack(oldVideoTrack);
                    
                    // Stop sending video to all viewers
                    peerConnections.forEach(function(pc) {
                        var sender = pc.getSenders().find(function(s) {
                            return s.track && s.track.kind === 'video';
                        });
                        if (sender) {
                            sender.replaceTrack(null);
                        }
                    });
                    
                    // Black out local video
                    localVideo.srcObject = null;
                    
                    console.log('Camera closed');
                }
                return;
            }
            
            var constraints = videoDeviceId ? 
                { deviceId: { exact: videoDeviceId }, width: 1280, height: 720 } : 
                { width: 1280, height: 720 };
            
            console.log('Switching camera to:', videoDeviceId);
            
            // Get new video stream
            var newStream = await navigator.mediaDevices.getUserMedia({
                video: constraints,
                audio: false
            });
            
            var newVideoTrack = newStream.getVideoTracks()[0];
            var oldVideoTrack = localStream.getVideoTracks()[0];
            
            if (oldVideoTrack) {
                // Replace existing track
                localStream.removeTrack(oldVideoTrack);
                localStream.addTrack(newVideoTrack);
                
                // Replace track in all peer connections
                peerConnections.forEach(function(pc) {
                    var sender = pc.getSenders().find(function(s) {
                        return s.track && s.track.kind === 'video';
                    });
                    if (sender) {
                        sender.replaceTrack(newVideoTrack);
                    }
                });
                
                oldVideoTrack.stop();
            } else {
                // Camera was closed before, add new track
                localStream.addTrack(newVideoTrack);

                // Add track to all peer connections and renegotiate
                var renegotiatePromises = [];
                peerConnections.forEach(function(pc, viewerId) {
                    // Check if already has video sender
                    var sender = pc.getSenders().find(function(s) {
                        return s.track === null || (s.track && s.track.kind === 'video');
                    });

                    if (sender && sender.track === null) {
                        // Sender exists but track is null - need to replace AND renegotiate
                        renegotiatePromises.push(
                            sender.replaceTrack(newVideoTrack).then(function() {
                                return pc.createOffer();
                            }).then(function(offer) {
                                return pc.setLocalDescription(offer);
                            }).then(function() {
                                ws.send(JSON.stringify({
                                    type: 'offer',
                                    viewer_id: viewerId,
                                    sdp: pc.localDescription
                                }));
                                console.log('Sent renegotiation offer to viewer after reopening camera:', viewerId);
                            })
                        );
                    } else if (sender && sender.track) {
                        // Sender has active track - just replace it
                        renegotiatePromises.push(sender.replaceTrack(newVideoTrack));
                    } else {
                        // No video sender exists, need to add track and renegotiate
                        pc.addTrack(newVideoTrack, localStream);

                        // Renegotiate connection
                        renegotiatePromises.push(
                            pc.createOffer().then(function(offer) {
                                return pc.setLocalDescription(offer);
                            }).then(function() {
                                ws.send(JSON.stringify({
                                    type: 'offer',
                                    viewer_id: viewerId,
                                    sdp: pc.localDescription
                                }));
                                console.log('Sent renegotiation offer to viewer:', viewerId);
                            })
                        );
                    }
                });

                await Promise.all(renegotiatePromises);
            }
            
            // Update local video element
            localVideo.srcObject = localStream;
            
            console.log('Camera switched successfully');
            
        } catch (error) {
            console.error('Error switching camera:', error);
            alert('Cannot switch camera: ' + error.message);
        }
    }

    /**
     * Switch microphone while streaming
     */
    async function switchMicrophone() {
        if (!localStream) return;
        
        try {
            var audioDeviceId = audioSelect.value;
            
            // Check if user wants to mute
            if (audioDeviceId === 'mute') {
                var oldAudioTrack = localStream.getAudioTracks()[0];
                if (oldAudioTrack) {
                    // Disable audio track (mute)
                    oldAudioTrack.enabled = false;
                    console.log('Microphone muted');
                }
                return;
            }
            
            var constraints = audioDeviceId ? 
                { deviceId: { exact: audioDeviceId } } : 
                true;
            
            console.log('Switching microphone to:', audioDeviceId);
            
            // Get new audio stream
            var newStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: constraints
            });
            
            var newAudioTrack = newStream.getAudioTracks()[0];
            var oldAudioTrack = localStream.getAudioTracks()[0];
            
            if (oldAudioTrack) {
                // Replace existing track
                localStream.removeTrack(oldAudioTrack);
                localStream.addTrack(newAudioTrack);
                
                // Replace track in all peer connections
                peerConnections.forEach(function(pc) {
                    var sender = pc.getSenders().find(function(s) {
                        return s.track && s.track.kind === 'audio';
                    });
                    if (sender) {
                        sender.replaceTrack(newAudioTrack);
                    } else {
                        // If no sender (mic was muted before), add new track
                        pc.addTrack(newAudioTrack, localStream);
                    }
                });
                
                oldAudioTrack.stop();
            } else {
                // Mic was muted before, add new track
                localStream.addTrack(newAudioTrack);
                
                // Add track to all peer connections
                peerConnections.forEach(function(pc) {
                    pc.addTrack(newAudioTrack, localStream);
                });
            }
            
            console.log('Microphone switched successfully');
            
        } catch (error) {
            console.error('Error switching microphone:', error);
            alert('Cannot switch microphone: ' + error.message);
        }
    }

    /**
     * Connect to signaling server
     */
    function connectSignalingServer() {
        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + window.location.host + '/ws/streamer');
        
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
        updateStatus('Waiting for viewers...', 'waiting');
        
        // Start keepalive ping
        setInterval(function() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, KEEPALIVE_INTERVAL);
    }

    async function handleWsMessage(event) {
        var message = JSON.parse(event.data);
        console.log('Received:', message.type);
        
        switch (message.type) {
            case 'room_created':
                handleRoomCreated(message.room_id);
                break;
            case 'viewer_joined':
                await handleViewerJoined(message.viewer_id);
                break;
            case 'answer':
                await handleAnswer(message.viewer_id, message.sdp);
                break;
            case 'ice_candidate':
                await handleIceCandidate(message.viewer_id, message.candidate);
                break;
            case 'viewer_left':
                handleViewerLeft(message.viewer_id);
                break;
        }
    }

    function handleWsError(error) {
        console.error('WebSocket error:', error);
        updateStatus('Connection error', 'waiting');
    }

    function handleWsClose(event) {
        console.log('WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });
        stopStreaming();
    }

    /**
     * Signaling message handlers
     */
    function handleRoomCreated(id) {
        roomId = id;
        var url = window.location.origin + '/viewer?room=' + roomId;
        shareLink.value = url;
        shareSection.style.display = 'block';
        updateStatus('Room created! Share the link with viewers.', 'streaming');
    }

    async function handleViewerJoined(viewerId) {
        console.log('New viewer:', viewerId);
        
        var pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnections.set(viewerId, pc);
        
        localStream.getTracks().forEach(function(track) {
            pc.addTrack(track, localStream);
        });
        
        pc.onicecandidate = function(event) {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'ice_candidate',
                    viewer_id: viewerId,
                    candidate: event.candidate
                }));
            }
        };
        
        pc.onconnectionstatechange = function() {
            console.log('Viewer ' + viewerId + ' state: ' + pc.connectionState);
            if (pc.connectionState === 'connected') {
                updateStatus('Streaming to ' + peerConnections.size + ' viewer(s)', 'streaming');
            }
        };
        
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            type: 'offer',
            viewer_id: viewerId,
            sdp: pc.localDescription
        }));
        
        updateStats();
    }

    async function handleAnswer(viewerId, sdp) {
        var pc = peerConnections.get(viewerId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log('Answer received from viewer ' + viewerId);
            
            var buffer = iceCandidateBuffers.get(viewerId) || [];
            console.log('Processing ' + buffer.length + ' buffered ICE candidates');
            for (var i = 0; i < buffer.length; i++) {
                var candidate = buffer[i];
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error('Error adding buffered ICE candidate:', error);
                }
            }
            iceCandidateBuffers.delete(viewerId);
        }
    }

    async function handleIceCandidate(viewerId, candidate) {
        var pc = peerConnections.get(viewerId);
        if (!pc || !candidate) return;
        
        if (!pc.remoteDescription) {
            console.log('Buffering ICE candidate for viewer ' + viewerId);
            if (!iceCandidateBuffers.has(viewerId)) {
                iceCandidateBuffers.set(viewerId, []);
            }
            iceCandidateBuffers.get(viewerId).push(candidate);
            return;
        }
        
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate for ' + viewerId + ':', error);
        }
    }

    function handleViewerLeft(viewerId) {
        var pc = peerConnections.get(viewerId);
        if (pc) {
            pc.close();
            peerConnections.delete(viewerId);
            console.log('Viewer ' + viewerId + ' left');
            updateStats();
            
            if (peerConnections.size === 0) {
                updateStatus('Waiting for viewers...', 'waiting');
            }
        }
    }

    /**
     * Stop streaming
     */
    function stopStreaming() {
        // Remove device change listeners
        videoSelect.removeEventListener('change', switchCamera);
        audioSelect.removeEventListener('change', switchMicrophone);
        
        peerConnections.forEach(function(pc) {
            pc.close();
        });
        peerConnections.clear();
        
        if (localStream) {
            localStream.getTracks().forEach(function(track) {
                track.stop();
            });
            localStream = null;
        }
        
        if (ws) {
            ws.close();
            ws = null;
        }
        
        localVideo.srcObject = null;
        shareSection.style.display = 'none';
        status.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        // Restore dropdowns without close/mute options
        getDevicesWithLabels();
        
        updateStats();
    }

    /**
     * Copy share link to clipboard
     */
    function copyLink() {
        shareLink.select();
        document.execCommand('copy');
        alert('Link copied to clipboard!');
    }

    /**
     * UI update functions
     */
    function updateStatus(msg, type) {
        status.textContent = msg;
        status.className = 'status ' + type;
        status.style.display = 'block';
    }

    function updateStats() {
        stats.textContent = 'Connected viewers: ' + peerConnections.size;
    }

    // Initialize on load
    init();
})();
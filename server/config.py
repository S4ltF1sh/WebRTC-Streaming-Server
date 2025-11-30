"""
Configuration settings for WebRTC streaming server
"""

# Server settings
HOST = '0.0.0.0'
PORT = 8080

# WebRTC settings
ICE_SERVERS = [
    {'urls': 'stun:stun.l.google.com:19302'},
    {'urls': 'stun:stun1.l.google.com:19302'},
    {'urls': 'stun:stun2.l.google.com:19302'}
]

# Room settings
ROOM_CLEANUP_HOURS = 24

# Logging
DEBUG = True
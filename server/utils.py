"""
Utility functions for the WebRTC streaming server
"""

import secrets


def generate_room_id():
    """Generate a secure random room ID"""
    return secrets.token_urlsafe(8)


def generate_viewer_id():
    """Generate a secure random viewer ID"""
    return secrets.token_urlsafe(8)
"""
Data models for the WebRTC streaming application
"""

from datetime import datetime


class Room:
    """Represents a streaming room with one streamer and multiple viewers"""
    
    def __init__(self, room_id):
        self.room_id = room_id
        self.created_at = datetime.now()
        self.streamer = None
        self.viewers = set()
    
    def add_streamer(self, ws):
        """Add streamer WebSocket connection to the room"""
        self.streamer = ws
        print(f"Streamer joined room: {self.room_id}")
    
    def add_viewer(self, ws):
        """Add viewer WebSocket connection to the room"""
        self.viewers.add(ws)
        print(f"Viewer joined room: {self.room_id} (Total viewers: {len(self.viewers)})")
    
    def remove_viewer(self, ws):
        """Remove viewer WebSocket connection from the room"""
        self.viewers.discard(ws)
        print(f"Viewer left room: {self.room_id} (Remaining: {len(self.viewers)})")
    
    def is_empty(self):
        """Check if room has no active connections"""
        return self.streamer is None and len(self.viewers) == 0
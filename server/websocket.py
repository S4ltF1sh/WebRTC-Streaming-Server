"""
WebSocket handlers for signaling between streamer and viewers
"""

import json
from aiohttp import web

from .models import Room
from .utils import generate_room_id, generate_viewer_id


# Store active rooms and viewer connections
rooms = {}
viewer_connections = {}


async def websocket_handler_streamer(request):
    """
    WebSocket handler for streamer
    Manages streamer connection and forwards messages to viewers
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # Create new room
    room_id = generate_room_id()
    room = Room(room_id)
    room.add_streamer(ws)
    rooms[room_id] = room
    
    # Send room ID to streamer
    await ws.send_json({
        'type': 'room_created',
        'room_id': room_id
    })
    
    print(f"Room created: {room_id}")
    print(f"  Streamer WebSocket: {id(ws)}")
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data.get('type')
                
                # Handle ping/pong for keepalive
                if msg_type == 'ping':
                    await ws.send_json({'type': 'pong'})
                    continue
                
                viewer_id = data.get('viewer_id')
                print(f"[Streamer -> Server] {msg_type} for viewer {viewer_id}")
                
                # Forward message to specific viewer
                if viewer_id and viewer_id in viewer_connections:
                    _, viewer_ws = viewer_connections[viewer_id]
                    try:
                        forward_data = {'type': msg_type}
                        if 'sdp' in data:
                            forward_data['sdp'] = data['sdp']
                        if 'candidate' in data:
                            forward_data['candidate'] = data['candidate']
                        
                        await viewer_ws.send_json(forward_data)
                        print(f"[Server -> Viewer {viewer_id}] {msg_type}")
                    except Exception as e:
                        print(f"Error forwarding to viewer {viewer_id}: {e}")
                else:
                    print(f"Viewer {viewer_id} not found in connections")
                
            elif msg.type == web.WSMsgType.ERROR:
                print(f'WebSocket error: {ws.exception()}')
    finally:
        # Cleanup on disconnect
        print(f"Streamer left room: {room_id}")
        
        if room_id in rooms:
            room = rooms[room_id]
            # Notify all viewers that streamer left
            for viewer_ws in list(room.viewers):
                try:
                    await viewer_ws.send_json({'type': 'streamer_left'})
                    await viewer_ws.close()
                except:
                    pass
            
            # Remove room
            del rooms[room_id]
    
    return ws


async def websocket_handler_viewer(request):
    """
    WebSocket handler for viewer
    Manages viewer connection and forwards messages to streamer
    """
    room_id = request.rel_url.query.get('room')
    
    print(f"Viewer attempting to join room: {room_id}")
    print(f"  Available rooms: {list(rooms.keys())}")
    
    # Validate room exists
    if not room_id or room_id not in rooms:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json({
            'type': 'error',
            'message': f'Room {room_id} not found'
        })
        await ws.close()
        print(f"Room {room_id} not found")
        return ws
    
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    room = rooms[room_id]
    viewer_id = generate_viewer_id()
    room.add_viewer(ws)
    
    # Store viewer connection
    viewer_connections[viewer_id] = (room_id, ws)
    
    print(f"Viewer {viewer_id} joined room {room_id}")
    print(f"  Viewer WebSocket: {id(ws)}")
    print(f"  Streamer exists: {room.streamer is not None}")
    print(f"  Streamer WebSocket: {id(room.streamer) if room.streamer else 'None'}")
    
    # Notify streamer about new viewer
    if room.streamer:
        try:
            await room.streamer.send_json({
                'type': 'viewer_joined',
                'viewer_id': viewer_id
            })
            print(f"[Server -> Streamer] viewer_joined: {viewer_id}")
        except Exception as e:
            print(f"Error notifying streamer: {e}")
    else:
        print(f"No streamer in room {room_id}")
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data.get('type')
                
                print(f"[Viewer {viewer_id} -> Server] {msg_type}")
                
                # Forward message to streamer
                if room.streamer:
                    try:
                        forward_data = {
                            'type': msg_type,
                            'viewer_id': viewer_id,
                        }
                        if 'sdp' in data:
                            forward_data['sdp'] = data['sdp']
                        if 'candidate' in data:
                            forward_data['candidate'] = data['candidate']
                        
                        await room.streamer.send_json(forward_data)
                        print(f"[Server -> Streamer] {msg_type} from {viewer_id}")
                    except Exception as e:
                        print(f"Error forwarding to streamer: {e}")
                else:
                    print(f"No streamer to forward to")
                
            elif msg.type == web.WSMsgType.ERROR:
                print(f'WebSocket error: {ws.exception()}')
    finally:
        # Cleanup on disconnect
        print(f"Viewer {viewer_id} left room: {room_id}")
        room.remove_viewer(ws)
        
        # Remove from connections dict
        if viewer_id in viewer_connections:
            del viewer_connections[viewer_id]
        
        # Notify streamer
        if room.streamer:
            try:
                await room.streamer.send_json({
                    'type': 'viewer_left',
                    'viewer_id': viewer_id
                })
            except:
                pass
        
        # Remove room if empty
        if room.is_empty():
            if room_id in rooms:
                del rooms[room_id]
                print(f"Room {room_id} deleted (empty)")
    
    return ws
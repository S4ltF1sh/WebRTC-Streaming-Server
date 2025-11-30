"""
Main application setup and initialization
"""
import socket
from aiohttp import web

from .routes import setup_routes
from .websocket import websocket_handler_streamer, websocket_handler_viewer
from .config import HOST, PORT


async def init_app():
    """Initialize the aiohttp application"""
    app = web.Application()
    
    # Setup routes
    setup_routes(app)
    
    # Setup WebSocket routes
    app.router.add_get('/ws/streamer', websocket_handler_streamer)
    app.router.add_get('/ws/viewer', websocket_handler_viewer)
    
    return app


def get_local_ip():
    """Get local IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

def print_banner():
    """Print startup banner"""
    local_ip = get_local_ip()
    
    print("=" * 70)
    print("P2P WebRTC Streaming Server")
    print("=" * 70)
    print(f"Local:     http://localhost:{PORT}")
    print(f"Network:   http://{local_ip}:{PORT}")
    print(f"Streamer:  http://localhost:{PORT}/streamer")
    print(f"Viewer:    http://localhost:{PORT}/viewer")
    print("=" * 70)
    print("Server only handles signaling - Video streams P2P directly!")
    print("=" * 70)


def run():
    """Run the application"""
    print_banner()
    web.run_app(init_app(), host=HOST, port=PORT)
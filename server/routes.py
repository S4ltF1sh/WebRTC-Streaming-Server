"""
HTTP route handlers for the WebRTC streaming application
"""

from aiohttp import web
import pathlib


TEMPLATES_DIR = pathlib.Path(__file__).parent.parent / 'templates'
STATIC_DIR = pathlib.Path(__file__).parent.parent / 'static'


async def index(request):
    """Serve the landing page"""
    with open(TEMPLATES_DIR / 'index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    return web.Response(text=html, content_type='text/html')


async def streamer_page(request):
    """Serve the streamer interface"""
    with open(TEMPLATES_DIR / 'streamer.html', 'r', encoding='utf-8') as f:
        html = f.read()
    return web.Response(text=html, content_type='text/html')


async def viewer_page(request):
    """Serve the viewer interface"""
    with open(TEMPLATES_DIR / 'viewer.html', 'r', encoding='utf-8') as f:
        html = f.read()
    return web.Response(text=html, content_type='text/html')


def setup_routes(app):
    """Setup all application routes"""
    # Page routes
    app.router.add_get('/', index)
    app.router.add_get('/streamer', streamer_page)
    app.router.add_get('/viewer', viewer_page)
    
    # Static files
    app.router.add_static('/static', STATIC_DIR)
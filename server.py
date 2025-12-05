import http.server
import socketserver
import sys

PORT = 8000

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Send headers to prevent caching
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # Allow CORS just in case
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        # Log the request for visibility
        print(f"Request: {self.path}")
        super().do_GET()

if __name__ == '__main__':
    # Allow port to be passed as argument
    if len(sys.argv) > 1:
        PORT = int(sys.argv[1])

    print(f"🚀 Starting No-Cache Python Server on port {PORT}")
    print(f"📂 Serving files from current directory")
    print(f"🔄 Caching is DISABLED (files will reload on refresh)")
    print(f"Press Ctrl+C to stop")
    
    # Allow address reuse to prevent 'Address already in use' errors on restart
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")

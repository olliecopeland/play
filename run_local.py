#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(BASE_DIR)
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("localhost", PORT), handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"Serving files from {BASE_DIR}")
    print(f"Open {url} in your browser.")
    webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down server")

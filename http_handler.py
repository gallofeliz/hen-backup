#!/usr/bin/env python

import socketserver, http.server
from jsonrpc import JSONRPCResponseManager, dispatcher

class HttpServer:
    def __init__(self, service, port, logger):


        class Handler(http.server.SimpleHTTPRequestHandler):
            def do_GET(self):
                self.send_response(500)

            def do_PUT(self):
                self.send_response(500)

            def do_DELETE(self):
                self.send_response(500)

            def do_OPTIONS(self):
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()

            def do_POST(self):

                logger.info('Receive HTTP request')

                try:
                    response = JSONRPCResponseManager.handle(self.rfile.read(int(self.headers['Content-Length'])), dispatcher).json
                    self.send_response(200)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-type','application/json')
                    self.end_headers()
                    self.wfile.write(bytes(response, 'utf8'))
                except Exception as inst:
                    self.send_response(500)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-type','text/html')
                    self.end_headers()
                    self.wfile.write(bytes(str(inst), 'utf8'))





        for method in service.get_public_methods():
            dispatcher[method] = getattr(service, method)

        self.httpd = socketserver.ThreadingTCPServer(('', port), Handler)
    def start(self):
        self.httpd.serve_forever()
    def stop(self):
        self.httpd.server_close()

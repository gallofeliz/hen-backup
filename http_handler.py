#!/usr/bin/env python

import socketserver, http.server
from jsonrpc import JSONRPCResponseManager, dispatcher
from base64 import b64encode

class HttpServer:
    def __init__(self, service, method_names, port, logger, credentials):

        basic_header_value = 'Basic ' + b64encode(bytes('%s:%s' % (credentials['username'], credentials['password']), 'utf-8')).decode('ascii')

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_OPTIONS(self):
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                self.end_headers()

            def do_POST(self):

                logger.info('Receive HTTP request')

                if self.headers.get('Authorization') != basic_header_value:
                    self.send_response(401)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('WWW-Authenticate', 'Basic realm="Expected auth"')
                    self.send_header('Content-type','application/json')
                    self.end_headers()
                    self.wfile.write(bytes('{"error": {"code": "invalid-auth", "message": "Invalid Auth"}, "id": null, "jsonrpc": "2.0"}', 'utf8'))
                    return

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

        for method in method_names:
            dispatcher[method] = getattr(service, method)

        self.httpd = socketserver.ThreadingTCPServer(('', port), Handler)
    def start(self):
        self.httpd.serve_forever()
    def stop(self):
        self.httpd.server_close()

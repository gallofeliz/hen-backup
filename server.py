import socketserver, http.server, json, threading

def stats(config):
    return {
        'backups': config['backups']
    }

def run_server(config, logger):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if (self.path == '/favicon.ico'):
                return

            try:
                data = stats(config)
                self.send_response(200)
                self.send_header('Content-type','application/json')
                self.end_headers()
                self.wfile.write(bytes(json.dumps(data), 'utf8'))
            except Exception as inst:
                self.send_response(500)
                self.send_header('Content-type','text/html')
                self.end_headers()
                self.wfile.write(bytes(str(inst), 'utf8'))
                logger.exception('ERROR', extra={'action': 'httpd', 'status': 'running'})

    httpd = socketserver.TCPServer(('', config['server']['port']), Handler)
    httpd.serve_forever()
    #httpd.server_close()

def run_threaded_server(config, logger):
    threading.Thread(target=run_server, args=(config, logger,)).start()

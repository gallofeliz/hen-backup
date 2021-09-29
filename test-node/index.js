const http = require('http');
const child_process = require('child_process');

const requestListener = function (req, res) {
  res.writeHead(200);


  const proc = child_process.spawn('restic', ['dump', 'cbaa5728c139b8043aa1e8256bfe005ec572abb709eb3ced620717d4243758e1', '/'], {
      env: {
          'RESTIC_REPOSITORY': 'test/repositories/app2',
          'RESTIC_PASSWORD': 'bca'
      }
  });

proc.stdout.pipe(res)


proc.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

proc.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
    res.end();
});


}

const server = http.createServer(requestListener);
server.listen(9090);


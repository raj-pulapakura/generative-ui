import { createServer } from 'node:http';

const port = Number(process.env.PORT) || 3001;

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      message: 'Server is running',
      method: req.method,
      path: req.url,
      timestamp: new Date().toISOString()
    })
  );
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

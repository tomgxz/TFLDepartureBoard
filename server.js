const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 80;

const URLS = [
    {urlpath: "/robots.txt", fp: path.join(__dirname, 'html', 'robots.txt')},
    {urlpath: "/data/", fp: path.join(__dirname, 'html', 'data.html')},
    
    {urlpath: "", fp: path.join(__dirname, 'html', 'board.html')},
    {urlpath: "/", fp: path.join(__dirname, 'html', 'board.html')},
    {urlpath: "/*/", fp: path.join(__dirname, 'html', 'board.html')},
    {urlpath: "/*/*/", fp: path.join(__dirname, 'html', 'board.html')},
    {urlpath: "/*/*/*/", fp: path.join(__dirname, 'html', 'board.html')}
]

const SLASH_REDIRECT_EXCULDE = ["/robots.txt", "/favicon.ico"]

function wildcardToRegex(pattern) {
    // Replace ** with (.*), * with ([^/]+), and escape slashes
    let regexStr = '^' + pattern
        .replace(/\*\*/g, '(.*)')
        .replace(/\*/g, '([^/]+)')
        .replace(/\//g, '\\/') + '$';

    return new RegExp(regexStr);
}

function serveFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }

        const ext = path.extname(filePath);
        const contentType = getContentType(ext);
        if (contentType) res.setHeader('Content-Type', contentType);

        res.writeHead(200);
        res.end(data);
    });
}

function getContentType(ext) {
    return {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
    const parsed_url = url.parse(req.url)

    if (parsed_url.pathname.split("/")[1] == "static") {
        const filePath = path.join(__dirname, 'static', parsed_url.pathname.replace('/static/', ''));
        return serveFile(filePath, res);    
    }

    if (!(parsed_url.pathname.slice(-1) == "/") && !SLASH_REDIRECT_EXCULDE.includes(parsed_url.pathname)){
        res.writeHead(302, { Location: parsed_url.pathname + "/" });
        res.end();

        return;
    }

    for (const route of URLS) {
        const regex = wildcardToRegex(route.urlpath);
        const match = regex.exec(parsed_url.pathname);
        if (match) {
            let fileToServe = route.fp;

            if (route.append_suffix && match[1]) {
                const suffix = match[1];
                fileToServe = path.join(route.fp, suffix);
            }

            return serveFile(fileToServe, res);
        }
    }

    res.writeHead(302, { Location: "/" });
    res.end();
});


server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

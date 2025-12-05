let http = require('http');
let fs = require('fs');
const express = require('express');

const app = express();

app.listen(8080);


let handleRequest = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    console.log('request sent');
    console.log(req.url, req.method);
    fs.readFile('./index', null, function (error, data) {
        if (error) {
            res.writeHead(404);
            res.write('File not found!');
        }
        else {
            res.write(data);
        }
        res.end();
    })
}


http.createServer(handleRequest).listen(8080);

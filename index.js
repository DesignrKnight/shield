const express = require('express');
const requestIp = require('request-ip');

const app = express();

const ipMiddleware = function (req, res, next) {
	const clientIp = requestIp.getClientIp(req);
	console.log(clientIp);
	next();
};

app.use(ipMiddleware);

app.get('/', function (req, res) {
	res.send('root');
});

app.listen(process.env.PORT || 5000, () => {
	console.log('now listening for requests on port 5000');
});

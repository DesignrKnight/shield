const express = require('express');
const requestIP = require('request-ip');
const nodeCache = require('node-cache');

const IPCache = new nodeCache({ stdTTL: 10, deleteOnExpire: false, checkperiod: 5 });

const app = express();

IPCache.on('expired', (key, value) => {
	if (new Date() - value[value.length - 1] > 10000) {
		IPCache.del(key);
	}
	console.log('key', key, 'value', IPCache.get(key));
});

const updateCache = (ip) => {
	let cachedIP = IPCache.get(ip);
	if (!cachedIP) {
		cachedIP = [];
	}
	cachedIP.push(new Date());
	IPCache.set(ip, cachedIP, (IPCache.getTtl(ip) - Date.now()) / 1000 || 10);
};
const ipMiddleware = function (req, res, next) {
	const clientIp = requestIP.getClientIp(req);
	updateCache(clientIp);
	// IPCache.set(clientIp, new Date(), 30);
	// const date1 = new Date();
	// const date2 = new Date('2021-04-30T11:30:25.236Z');
	// console.log((date2 - date1) / 1000);
	console.log(IPCache.get(clientIp));
	console.log('TTL', IPCache.getTtl(clientIp));
	next();
};

app.use(ipMiddleware);

app.get('/', function (req, res) {
	res.send('root');
});

app.listen(process.env.PORT || 5000, () => {
	console.log('now listening for requests on port 5000');
});

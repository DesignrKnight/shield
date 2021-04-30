const express = require('express');
const requestIP = require('request-ip');
const nodeCache = require('node-cache');

const IPCache = new nodeCache({ stdTTL: 10, deleteOnExpire: false, checkperiod: 15 });
IPCache.flushAll();

const app = express();

IPCache.on('expired', (key, value) => {
	if (new Date() - value[value.length - 1] > 10000) {
		IPCache.del(key);
	} else {
		let count = 0;
		value.find(function (element) {
			count = count + 1;
			return new Date() - element < 10000;
		});
		if (count == value.length) {
			return;
		}
		value.splice(0, count);
		IPCache.set(key, value, 10 - (new Date() - value[0]) / 1000);
	}
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
	const IPArray = IPCache.get(clientIp);
	if (IPArray.length > 1) {
		const rps = (1000 * 60 * IPArray.length) / (IPArray[IPArray.length - 1] - IPArray[0]);
		if (rps > 20) {
			console.log('You are hitting limit', key);
		}
	}
	next();
};

app.use(ipMiddleware);

app.get('/', function (req, res) {
	res.send('root');
});

app.listen(process.env.PORT || 5000, () => {
	console.log('now listening for requests on port 5000');
});

const express = require('express');
const requestIP = require('request-ip');
const nodeCache = require('node-cache');
const axios = require('axios');
require('dotenv').config();

const app = express();

const TIME_FRAME_IN_S = 10;
const TIME_FRAME_IN_MS = TIME_FRAME_IN_S * 1000;
const MS_TO_S = 1 / 1000;
const RPS_LIMIT = 2;

const IPCache = new nodeCache({ stdTTL: TIME_FRAME_IN_S, deleteOnExpire: false, checkperiod: TIME_FRAME_IN_S });

IPCache.on('expired', (key, value) => {
	if (new Date() - value[value.length - 1] > TIME_FRAME_IN_MS) {
		IPCache.del(key);
	} else {
		const updatedValue = value.filter(function (element) {
			return new Date() - element < TIME_FRAME_IN_MS;
		});
		IPCache.set(key, updatedValue, TIME_FRAME_IN_S - (new Date() - updatedValue[0]) * MS_TO_S);
	}
});

const updateCache = (ip) => {
	let IPArray = IPCache.get(ip) || [];
	IPArray.push(new Date());
	IPCache.set(ip, IPArray, (IPCache.getTtl(ip) - Date.now()) * MS_TO_S || TIME_FRAME_IN_S);
};
const ipMiddleware = async function (req, res, next) {
	const clientIP = requestIP.getClientIp(req);
	updateCache(clientIP);
	const IPArray = IPCache.get(clientIP);
	if (IPArray.length > 1) {
		const rps = IPArray.length / ((IPArray[IPArray.length - 1] - IPArray[0]) * MS_TO_S);
		if (rps > RPS_LIMIT) {
			const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.ACCOUNT_ID}/rules/lists/${process.env.LIST_ID}/items`;
			const body = [{ ip: clientIP, comment: 'Banned IP address via Rate Limiter' }];
			const headers = {
				'X-Auth-Email': process.env.ACCOUNT_MAIL,
				'X-Auth-Key': process.env.API_KEY,
			};
			try {
				await axios.post(url, body, { headers: headers });
			} catch (error) {
				console.log(error);
			}

			console.log('You are hitting limit', clientIP);
		}
	}
	next();
};

app.use(ipMiddleware);

app.get('/', (req, res) => {
	res.send('Successful response.');
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`Example app is listening on port ${process.env.PORT || 3000}`);
});

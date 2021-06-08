# How to Build a Rate Limiter with Node.js on App Platform

### Introduction
Rate limiting is a strategy for limiting network traffic. It puts a cap on how often someone can repeat an action within a certain timeframe like calling an API. You should learn this topic as any application without a basic layer of protection against rate-limit abuse is prone to overloading the application and severely hamper the proper functioning of the application for legitimate users.

You will build a Node.js server that will check the IP Address of the request and also calculate the rate of these requests by comparing timestamps of request per user. If an IP Address crosses the limit you have set for the application, it will call Cloudflare's API, add the IP to a list. You will then configure a Cloudflare Firewall Rule that will ban all requests that have IP Address in the list.

When you have finished following along, you will have built a Node.js project deployed on DigitalOcean’s App Platform that protects a Cloudflare routed domain with rate-limiting.

## Prerequisites
Before you begin this guide, you will need:
- A [Cloudflare](https://www.cloudflare.com/) account.
- A registered domain added to your Cloudflare account. The guide on [how to mitigate DDoS attacks against your website with Cloudflare](https://www.digitalocean.com/community/tutorials/how-to-mitigate-ddos-attacks-against-your-website-with-cloudflare) can help you set this up. This article on [introduction to DNS terminology, components, and concepts](https://www.digitalocean.com/community/tutorials/an-introduction-to-dns-terminology-components-and-concepts) can also be of assistance.
- Basic Express server with Node.js. Follow [How To Get Started with Node.js and Express](https://www.digitalocean.com/community/tutorials/nodejs-express-basics) article up to Step 2.
- A [GitHub account](https://github.com/) and [git installed](https://www.digitalocean.com/community/tutorials/how-to-contribute-to-open-source-getting-started-with-git) on your local machine. This article on [how to push the project to GitHub](https://www.digitalocean.com/community/tutorials/how-to-push-an-existing-project-to-github) would be useful.
- A [DigitalOcean](https://www.digitalocean.com/products/app-platform/) account 

## Step 1 — Setting up the Node.js Project with DigitalOcean's App Platform
Open the project directory of the basic Express server with your code editor. Create a new file by the name `.gitignore` in the root directory of the project. Add the following lines to the newly created `.gitignore` file:
```gitignore
[label .gitignore]
node_modules/
.env
```
The first line above is a directive to git to not track the `node_modules` directory. This would enable to keep your repository size small. The `node_modules` can be generated when required by running the command `npm install`. The second line prevents the environment variable file from being tracked. You would create the `.env` file in further steps. 

Open the `server.js` in your code editor and modify the following lines of code:
```js
[label server.js]
...
app.listen(<^>process.env.PORT || 3000<^>, () => {
	console.log(<^>`Example app is listening on port ${process.env.PORT || 3000}`<^>);
});
```
The above change to conditionally use the `PORT` from environment variable enables the application to dyamically have the server running on the assigned `PORT` or use `3000` as the fallback one. 
<$>[note]
**Note:** The string in `console.log()` is wrapped within backticks(`) and not within quotes. This enables you to use template literals which provides the capability to have expressions within strings. 
<$>

Visit your terminal window and run your application:
```command
node server.js
```
Then, visit `localhost:3000` in your web browser. Your browser window will display: `Successful response`. Your terminal window will display:
```
[secondary_label Output]
Example app is listening on port 3000
```

Initialise git in the root directory of the project and push the code to your GitHub account. Open the [App Platform dashboard](https://cloud.digitalocean.com/apps/) in browser and click on the button named `Create App`. Choose GitHub and authorize with GitHub, select the project(the one that you pushed to GitHub) from the list of projects to be deployed from GitHub to App Platform. Review the configuration, then give a name to the app, then choose the plan of the project. You can choose the USD 5/mo plan for development phase and scale up later as per the application's requirement. Once ready, click Launch App. 

Click the Deployments tab to see the details of the deployment. Once deployment finishes, you can open the URL below the project name on dashboard to view it on browser. Your browser window will display: `Successful response`.Navigate to Runtime Logs tab on App Platform dashboard and you should get the following output:
```
[secondary_label Output]
Example app is listening on port 8080
```
<$>[note]
**Note:** The port number 8080 is the default assigned port by the App Platform. You can override this by changing the configuration while reviewing the app before deployment. 
<$>

## Step 2 — Caching User's IP Address and Calculating Requests per Second

You will store the user's IP Address in cache with an array of timestamps to monitor the requests per second of each user's IP Address. You will use two npm packages: `node-cache` and `request-ip` to aid in the process. Install the `node-cache` and `request-ip` package via npm. 
```command
npm i node-cache request-ip
```
Open the `server.js` file in code editor and add following lines of code below `const express = require('express');`
```js
[label server.js]
...
const requestIP = require('request-ip');
const nodeCache = require('node-cache');
...
```
The first line here grabs the `requestIP` module from `request-ip` package you installed. This module captures the user's IP Address used to make the request to the server. The second line grabs the `nodeCache` module from the `node-cache` package you installed. This module creates an in-memory cache which you will use to keep the track of user's requests per second. 

Define a set of constants to be reused in the application. 
```js
[label server.js]
...
const TIME_FRAME_IN_S = 10;
const TIME_FRAME_IN_MS = TIME_FRAME_IN_S * 1000;
const MS_TO_S = 1 / 1000;
const RPS_LIMIT = 2;
...
```
`TIME_FRAME_IN_S` is a constant that will determine the time period over which your application will average the request's time. Increasing the time period will increase the cache size, hence consume more memory. `TIME_FRAME_IN_MS` is the same constant but in a different unit, milliseconds. The `MS_TO_S` is conversion factor you will use to convert time in milliseconds to seconds. The `RPS_LIMIT` is the threshold limit of the application that will trigger the rate limiter, change the value as the per your application's requirements. `RPS_LIMIT` as `2` is a moderate value that would trigger easily during development phase.  

With Express, you can write and use *middleware* functions, which have access to all HTTP requests coming to ypur server. To define a middleware function, you will call `app.use()` and pass it a function. Create a function named `ipMiddleware` as middleware.

```js
[label server.js]
...
const ipMiddleware = async function (req, res, next) {
    const clientIP = requestIP.getClientIp(req);
    next();
};
app.use(ipMiddleware);
...
```
The `getClientIp()` function provided by `requestIP` takes the request as paramter from the middleware. The `next()` call directs the middleware to go to the next middleware function if there is one. In your example, it would take the request to the GET route `/`. This is important to include at the end of your function - otherwise, the request will get stuck on this middleware. 

Intiliase an instance of `node-cache` by adding the following, below the constants.
```js
[label server.js]
...
const IPCache = new nodeCache({ stdTTL: TIME_FRAME_IN_S, deleteOnExpire: false, checkperiod: TIME_FRAME_IN_S });
...
```
In the above line, you are overriding the default values of the parameters.`stdTTL` is the interval in seconds after which a key-value pair of cache element would be evicted from cache. `deleteOnExpire` is set to `false` as you would write a custom expiry callback function. `checkperiod` is the interval in seconds after which an automatic check for expired elements is trigerred. The default value is `600` and as your application's element expiry is set to a value less than that, the check for expiry should also happen sooner. You would find the [node-cache npm package's docs page](https://www.npmjs.com/package/node-cache) useful.

Create `updateCache()` function to add the timestamp of the request to cache. You will be creating a new key-value pair for new IP Address and would append to existing key-value pair if IP Address exists in cache. The value would be an array of timestamps cooresponding to each request made to your application. 
```js
[label server.js]
...
const updateCache = (ip) => {
	let IPArray = IPCache.get(ip) || [];
	IPArray.push(new Date());
	IPCache.set(ip, IPArray, (IPCache.getTtl(ip) - Date.now()) * MS_TO_S || TIME_FRAME_IN_S);
};
...
```
The first line in the function gets the array of timestamps for the given IP Address or if null, initialises with empty array. Then you will push the present timestamp into the array using the `new Date()` function provided natively in Javascript. The `.set()` function provided by `node-cache` takes three arguments: key, value and the TTL. This TTL will override the standard TTL set while initialising by setting value to `stdTTL`. If the IP Address already exists in the cache, then you will use the existing TTL, else you will set TTL to be `TIME_FRAME_IN_S`. The TTL for existing key-value pair is calculated by subtracting the present timestamp from the expiry timestamp. The difference is then converted to seconds and passed as third argument to `.set()` function. The .`getTtl()` function takes a key, IP Address in your case, as argument and returns the TTL of the key-value pair as timestamp. It returns `undefined` if IP Address does not exist in cache already, hence the fallback value of `TIME_FRAME_IN_S` will be used.

<$>[note]
**Note:** Timestamps natively by Javascript is stored in milliseconds whereas the `node-cache` module uses seconds, hence the conversion. 
<$>

In the `ipMiddleware` middleware, add the following lines to calculate the requests per second of the IP Address calling your application.
```js
[label server.js]
...
    updateCache(clientIP);
	const IPArray = IPCache.get(clientIP);
	if (IPArray.length > 1) {
		const rps = IPArray.length / ((IPArray[IPArray.length - 1] - IPArray[0]) * MS_TO_S);
		if (rps > RPS_LIMIT) {
            console.log('You are hitting limit', clientIP);
		}
	}
...
```
The first line adds the timestamp of the request made by the IP Address to the cache by calling the `updateCache()` function you declared above. The second line gets the array of timestamps for the IP Address. If the number of elements in the array of timestamps is greater than one(calculating requests per second needs minimum two timestamps) and the requests per second is more than the threshold value you defined in the constants, you will `console.log` the IP Address. You will calculate the requests per second by dividing the number of requests by the difference in time interval and converting the units to seconds. 

During initialisation of the `node-cache` instance `IPCache`, you had set `deleteOnExpire` to be `false`, hence you need to handle the `expired` event manually. `node-cache` provides a callback function that gets triggered on `expired` event. Add the following lines of code:
```js
[label server.js]
...
IPCache.on('expired', (key, value) => {
	if (new Date() - value[value.length - 1] > TIME_FRAME_IN_MS) {
		IPCache.del(key);
	}
});
...
```
The callback function has the key and value of the expired element as the arguments. In your cache, the value is an array of timestamps of requests. Line 2 of the above code checks if the last element in the array is at least `TIME_FRAME_IN_S` in past than the present time. You are adding new elements to the end of array, hence if the last element is at least `TIME_FRAME_IN_S` in past than the present time, then all elements are at least `TIME_FRAME_IN_S` in past than the present time; hence delete the key from your cache. The `.del()` function takes the key as argument and deletes the element from cache.

For the instances when <^>some<^> elements of the array is at least `TIME_FRAME_IN_S` in past than the present time, you need to handle it by removing selected items from the cache. Add the following code in the callback function below the above code.

```js
[label server.js]
...
	else {
		const updatedValue = value.filter(function (element) {
			return <^>new Date() - element < TIME_FRAME_IN_MS<^>;
		});
		IPCache.set(key, updatedValue, TIME_FRAME_IN_S - (new Date() - updatedValue[0]) * MS_TO_S);
	}
...
```
The `filter` function provided natively by Javascript provides a callback function to have your own custome criteria to filter element. In your case, the highlighted line checks for elements that are least `TIME_FRAME_IN_S` in past than the present time. The filtered elements are then added to the `updatedValue` variable. You would then update the cache with `updatedValue` and new TTL. The TTL is set to match the initial TTL of the first element in `updatedValue` 
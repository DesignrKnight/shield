# How to Build a Rate Limiter with Node.js on App Platform

### Introduction
Rate limiting is a network traffic management approach. It limits how many times someone may repeat an operation in a given duration, such as using an API. You should learn about this topic since any service without a basic layer of security against rate-limit abuse is prone to overload and substantially hampering the app's proper operation for legitimate customers.

You will build a Node.js server that will check the IP address of the request and also calculate the rate of these requests by comparing the timestamp of requests per user. If an IP address crosses the limit you have set for the application, you will call Cloudflare's API, add the IP address to a list. You will then configure a Cloudflare Firewall Rule that will ban all requests with IP addresses in the list.

When you have finished following along, you will have built a Node.js project deployed on DigitalOcean’s App Platform that protects a Cloudflare routed domain with rate-limiting.

## Prerequisites
Before you begin this guide, you will need:
- A [Cloudflare](https://www.cloudflare.com/) account.
- A registered domain added to your Cloudflare account. The guide on [how to mitigate DDoS attacks against your website with Cloudflare](https://www.digitalocean.com/community/tutorials/how-to-mitigate-ddos-attacks-against-your-website-with-cloudflare) can help you set this up. This article on [introduction to DNS terminology, components, and concepts](https://www.digitalocean.com/community/tutorials/an-introduction-to-dns-terminology-components-and-concepts) can also be of assistance.
- Basic Express server with Node.js. Follow [How To Get Started with Node.js and Express](https://www.digitalocean.com/community/tutorials/nodejs-express-basics) article up to Step 2.
- A [GitHub account](https://github.com/) and [git installed](https://www.digitalocean.com/community/tutorials/how-to-contribute-to-open-source-getting-started-with-git) on your local machine. This article on [how to push the project to GitHub](https://www.digitalocean.com/community/tutorials/how-to-push-an-existing-project-to-github) would be useful.
- A [DigitalOcean](https://www.digitalocean.com/products/app-platform/) account.

## Step 1 — Setting up the Node.js Project with DigitalOcean's App Platform
Open the project directory of the basic Express server with your code editor. Create a new file by the name `.gitignore` in the root directory of the project. Add the following lines to the newly created `.gitignore` file:
```gitignore
[label .gitignore]
node_modules/
.env
```
The first line above is a directive to git not to track the `node_modules` directory. This would enable you to keep your repository size small. The `node_modules` can be generated when required by running the command `npm install`. The second line prevents the environment variable file from being tracked. You would create the `.env` file in further steps. 

Open the `server.js` in your code editor and modify the following lines of code:
```js
[label server.js]
...
app.listen(<^>process.env.PORT || 3000<^>, () => {
    console.log(<^>`Example app is listening on port ${process.env.PORT || 3000}`<^>);
});
```
The above change to conditionally use the `PORT` from the environment variable enables the application to dynamically have the server running on the assigned `PORT` or use `3000` as the fallback one. 

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

Initialise git in the root directory of the project and push the code to your GitHub account. Open the [App Platform dashboard](https://cloud.digitalocean.com/apps/) in the browser and click on the `Create App` button. Choose GitHub and authorise with GitHub, select the project(the one that you pushed to GitHub) from the list of projects to be deployed from GitHub to App Platform. Review the configuration, then give a name to the app, then choose the plan of the project. You can select the USD 5/mo plan for the development phase and scale up later as per the application's requirement. Once ready, click Launch App. 

Navigate to the Settings tab's Domains section. Add your domain routed via Cloudflare to the Domains section in the dashboard. Select <^>You manage your domain<^> to get *CNAME* record to be added to DNS. Click <^>Add Domain<^> on DigitalOcean's dashboard after you add the DNS record on Cloudflare.

Click the Deployments tab to see the details of the deployment. Once deployment finishes, you can open `<^>your_domain<^>` to view it on the browser. Your browser window will display: `Successful response`. Navigate to the Runtime Logs tab on the App Platform dashboard, and you should get the following output:
```
[secondary_label Output]
Example app is listening on port 8080
```
<$>[note]
**Note:** The port number 8080 is the default assigned port by the App Platform. You can override this by changing the configuration while reviewing the app before deployment. 
<$>

## Step 2 — Caching User's IP address and Calculating Requests per Second

You will store the user's IP address in a *cache* with an array of timestamps to monitor the requests per second of each user's IP address. You will use two npm packages: `node-cache` and `request-ip` to aid in the process. Install the `node-cache` and `request-ip` package via npm on your terminal. 
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
The first line here grabs the `requestIP` module from `request-ip` package you installed. This module captures the user's IP address used to request the server. The second line grabs the `nodeCache` module from the `node-cache` package you installed. This module creates an in-memory cache which you will use to keep track of user's requests per second. 

Define a set of constants in `server.js` to be reused in the application. 
```js
[label server.js]
...
const TIME_FRAME_IN_S = 10;
const TIME_FRAME_IN_MS = TIME_FRAME_IN_S * 1000;
const MS_TO_S = 1 / 1000;
const RPS_LIMIT = 2;
...
```
`TIME_FRAME_IN_S` is a constant that will determine the period over which your application will average the user's timestamps. Increasing the period will increase the cache size, hence consume more memory. `TIME_FRAME_IN_MS` is the same constant but in a different unit, milliseconds. The `MS_TO_S` is the conversion factor you will use to convert time in milliseconds to seconds. The `RPS_LIMIT` is the threshold limit of the application that will trigger the rate limiter, change the value as per your application's requirements. `RPS_LIMIT` as `2` is a moderate value that would trigger conveniently during the development phase.  

With Express, you can write and use *middleware* functions, which have access to all HTTP requests coming to your server. To define a middleware function, you will call `app.use()` and pass it a function. Create a function named `ipMiddleware` as middleware.

```js
[label server.js]
...
const ipMiddleware = async function (req, res, next) {
    const clientIP = requestIP.getClientIp(req);
    next();
};
app.use(ipMiddleware);

app.get('/', (req, res) => {
...
```
The `getClientIp()` function provided by `requestIP` takes the request object,`req` from the middleware, as parameter . The `next()` call directs the middleware to go to the next middleware function if there is one. In your example, it would take the request to the GET route `/`. This is important to include at the end of your function otherwise, the request will get stuck on this middleware. 

Initialise an instance of `node-cache` by adding the following, below the constants.
```js
[label server.js]
...
const IPCache = new nodeCache({ stdTTL: TIME_FRAME_IN_S, deleteOnExpire: false, checkperiod: TIME_FRAME_IN_S });
...
```
In the above line, you are overriding the default values of the parameters. `stdTTL` is the interval in seconds after which a key-value pair of cache element would be evicted from the cache. `deleteOnExpire` is set to `false` as you would write a custom callback function to handle the `expired` event. `checkperiod` is the interval in seconds after which an automatic check for expired elements is triggered. The default value is `600`, and as your application's element expiry is set to a value less than that, the check for expiry should also happen sooner. You would find the [node-cache npm package's docs page](https://www.npmjs.com/package/node-cache) useful. The following diagram will help you to visualise how data is stored in cache. 
![Schematic Representation of Data Stored in Cache](https://i.imgur.com/k4bMon8.png)

Create `updateCache()` function to add the timestamp of the request to cache. You will be creating a new key-value pair for the new IP address and would append to the existing key-value pair if IP address exists in the cache. The value would be an array of timestamps corresponding to each request made to your application. 
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
The first line in the function gets the array of timestamps for the given IP address or, if null, initialises with an empty array. Then you will push the present timestamp into the array using the `new Date()` function provided natively in Javascript. The `.set()` function provided by `node-cache` takes three arguments: key, value and the TTL. This TTL will override the standard TTL set while initialising by setting the value of `stdTTL`. If the IP address already exists in the cache, then you will use the existing TTL; else, you will set TTL to be `TIME_FRAME_IN_S`. The TTL for the current key-value pair is calculated by subtracting the present timestamp from the expiry timestamp. The difference is then converted to seconds and passed as the third argument to `.set()` function. The .`getTtl()` function takes a key, IP address in your case, as an argument and returns the TTL of the key-value pair as a timestamp. It returns `undefined` if IP address does not exist in cache already; hence the fallback value of `TIME_FRAME_IN_S` will be used.

<$>[note]
**Note:** Timestamps natively by Javascript is stored in milliseconds, whereas the `node-cache` module uses seconds, hence the conversion. 
<$>

In the `ipMiddleware` middleware, add the following lines to calculate the requests per second of the IP address calling your application.
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
The first line adds the timestamp of the request made by the IP address to the cache by calling the `updateCache()` function you declared above. The second line gets the array of timestamps for the IP address. If the number of elements in the array of timestamps is greater than one(calculating requests per second needs a minimum of two timestamps) and the requests per second are more than the threshold value you defined in the constants, you will `console.log` the IP address. You will calculate the requests per second by dividing the number of requests by the difference in a time interval and converting the units to seconds. 

During initialisation of the `node-cache` instance `IPCache`, you had set `deleteOnExpire` to be `false`; hence you need to handle the `expired` event manually. `node-cache` provides a callback function that gets triggered on `expired` event. Add the following lines of code:
```js
[label server.js]
...
IPCache.on('expired', (key, value) => {
    <^>if (new Date() - value[value.length - 1] > TIME_FRAME_IN_MS)<^> {
        IPCache.del(key);
    }
});
...
```
The callback function has the key and value of the expired element as the arguments. In your cache, the value is an array of timestamps of requests. Highlighted line of the above code checks if the last element in the array is at least `TIME_FRAME_IN_S` in the past than the present time. You are adding new elements to the end of the array; hence if the last element is at least `TIME_FRAME_IN_S` in the past than the present time, then all elements are at least `TIME_FRAME_IN_S` in the past than the current time; hence delete the key from your cache. The `.del()` function takes the key as an argument and deletes the element from the cache.

For the instances when <^>some<^> elements of the array are at least `TIME_FRAME_IN_S` in the past than the present time, you need to handle it by removing selected items from the cache. Add the following code in the callback function below the above code.

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
The `filter` function provided natively by Javascript provides a callback function to have your custom criteria to filter element. In your case, the highlighted line checks for elements that are least `TIME_FRAME_IN_S` in the past than the present time. The filtered elements are then added to the `updatedValue` variable. You would then update the cache with `updatedValue` and new TTL. The TTL is set to match the initial TTL of the first element in `updatedValue`, hence triggering this `on('expired')` callback function when the next element is to be removed from the cache. The updated value for TTL is calculated by the difference of `TIME_FRAME_IN_S` and the time expired since the first request's timestamp in `updatedValue`.

Visit your terminal window and run your application:
```command
node server.js
```
Then, visit `localhost:3000` in your web browser. Your browser window will display: `Successful response`. Refresh the page repeatedly to hit the `RPS_LIMIT`. Your terminal window will display:
```
[secondary_label Output]
Example app is listening on port 3000
You are hitting limit ::1
```
<$>[note]
**Note:** The IP address for localhost is shown as `::1`. It would capture the public IP of the user when deployed outside localhost. 
<$>

## Step 3 — Setting up the Cloudflare Firewall

Visit the [Clouflare dashboard](https://dash.cloudflare.com/) in your browser, log in and navigate to your account's homepage. Open Lists under Configurations tab. Create a new List with `<^>your_list<^>` as the name. 

<$>[note]
**Note:** The Lists section is available on your Cloudflare account's dashboard page and not your Cloudflare domain's dashboard page. 
<$>

Navigate to the Home tab and open `<^>your_domain<^>`'s dashboard. Open the Firewall tab and click on <^>Create a Firewall rule<^> under the <^>Firewall Rules<^> section. Give `<^>your_rule_name<^>` to the Firewall to identify it. In the Field, select `IP Source Address` from the drop-down, `is in list` for the Operator and `<^>your_list<^>` for the Value. Under the drop-down for <^>Choose an action<^>, select `Block` and click Deploy.

Create a `.env` file in the project's root directory with the following lines to call Cloudflare API from your application.
```env
[label .env]
ACCOUNT_MAIL=<^>your_cloudflare_login_mail<^>
API_KEY=<^>your_api_key<^>
ACCOUNT_ID=<^>your_account_id<^>
LIST_ID=<^>your_list_id<^>
```
Get `API_KEY` from the API Tokens tab on the Profile page of your Cloudflare dashboard. View the Global API Key by entering your password. Visit the Lists section under the Configurations tab on the account's homepage. Click the `<^>your_list<^>` list you created above. Get the `ACCOUNT_ID` and `LIST_ID` from the URL of `<^>your_list<^>` in the browser. The URL is of the format below:
`https://dash.cloudflare.com/<^>your_account_id<^>/configurations/lists/<^>your_list_id<^>`

<$>[warning]
**Note:** Make sure the content of `.env` is kept confidential and not made public
<$>

Install the `axios` and `dotenv` package via npm on your terminal. 
```command
npm i axios dotenv
```
Open the `server.js` file in code editor and add following lines of code below `const nodeCache = require('node-cache');`
```js
[label server.js]
...
const axios = require('axios');
require('dotenv').config();
...
```
The first line here grabs the `axios` module from `axios` package you installed. This module will be used to make network calls to Cloudflare's API. The second line requires and configures the `dotenv` module enabling `process.env` to have the keys and values you defined in your `.env` file.

Add the following to the `if` condition within `ipMiddleware` to call Cloudflare API.
```js
[label server.js]
...
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.ACCOUNT_ID}/rules/lists/${process.env.LIST_ID}/items`;
    const body = [{ ip: <^>clientIP<^>, comment: '<^>your_comment<^>' }];
    const headers = {
        'X-Auth-Email': process.env.ACCOUNT_MAIL,
        'X-Auth-Key': process.env.API_KEY,
    };
    try {
        await axios.post(url, body, { headers });
    } catch (error) {
        console.log(error);
    }
    console.log('You are hitting limit', clientIP);
...
```
The URL to add an item to `<^>your_list<^>` is of the format `https://api.cloudflare.com/client/v4/accounts/<^>your_account_id<^>/rules/lists/<^>your_account_id<^>/items`. The Cloudflare API takes your `ACCOUNT_MAIL` and `API_KEY` in the header of the request with the key as `X-Auth-Email` and `X-Auth-Key` respectively. The body of the request takes an array of object with `ip` as the IP address to add to the list and `comment` with `<^>your_comment<^>` to identify the entry. The POST request made via `axios.post` is wrapped in a try-catch block to handle errors if any, that may occur. The `axios.post` function takes the `url`, `body` and an object with `headers` to make the request. 

To test your application on the local system, change the <^>clientIP<^> with a test IP address like `198.51.100.0` because Cloudflare does not accept the localhost's IP address in its Lists.
 
Visit your terminal window and run your application:
```command
node server.js
```
Then, visit `localhost:3000` in your web browser. Your browser window will display: `Successful response`. Refresh the page repeatedly to hit the `RPS_LIMIT`. Your terminal window will display:
```
[secondary_label Output]
Example app is listening on port 3000
You are hitting limit ::1
```
When you have hit the limit, open the Cloudflare dashboard and navigate to the `<^>your_list<^>`'s page. You will see the above IP address you put in the code added to your Cloudflare's List named `<^>your_list<^>`. The Firewall would work after deploying the application.
<$>[warning]
**Note:** Make sure to revert the above edit of changing `clientIP` to test IP address before deploying or pushing the code to GitHub. 
<$>

Deploy your application by committing the changes and pushing the code to GitHub. As you have set up auto-deploy, the code from GitHub would be automatically deployed to your DigitalOcean's App Platform. As your `.env` is not added to GitHub, you will need to add it to App Platform via the Settings tab at App-Level Environment Variables section. Add the key-value pair from your project's `.env` to be accessed by your application on the App Platform. Open `<^>your_domain<^>` in your browser after deployment finishes and refresh the page repeatedly to hit the `RPS_LIMIT`. Once you hit the limit, the browser will show Cloudflare's Firewall page.
![Cloudflare's Error 1020 Page](https://i.imgur.com/5xYFRwW.png)

Navigate to the Runtime Logs tab on the App Platform dashboard, and you should get the following output.
```
[secondary_label Output]
...
You are hitting limit <^>your_public_ip<^>
```
You can open `<^>your_domain<^>` from different device or via VPN to see that the Firewall bans only the IP address in `<^>your_list<^>`. You can delete the IP address from `<^>your_list<^>` through your Cloudflare dashboard.
<$>[note]
**Note:** Sometimes, it takes few seconds for the Firewall to trigger due to the cached response from the browser. 
<$>

## Conclusion
In this article, you built a Node.js project deployed on DigitalOcean's App Platform connected to your domain routed via Cloudflare. You protected your domain against rate-limit misuse by configuring a Firewall Rule on Cloudflare. From here, you can modify the Firewall Rule to show JS Challenge or CAPTCHA instead of banning the user. The [Cloudflare documentation](https://developers.cloudflare.com/firewall/cf-firewall-rules/actions#supported-actions) details the process.
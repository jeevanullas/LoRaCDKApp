const https = require('https');
const aws = require("aws-sdk");

const client = new aws.SecretsManager();

exports.handler = async (event, context) => {
    
    const timestampInMilliseconds = (event.timestamp);
    const date = new Date(timestampInMilliseconds);
    const options = { timeZone: 'Australia/Brisbane' };
    const formattedDate = date.toLocaleString('en-US', options);

    const payload = {
        Temperature: event.transformed_payload.Temperature,
        Humidity: event.transformed_payload.Humidity,
        Pressure: event.transformed_payload.Pressure,
        Gas: event.transformed_payload.Gas,
        Timestamp: formattedDate
    };
    
    const postData = JSON.stringify(payload);

    const secretResponse = await client.getSecretValue({SecretId: process.env.SECRET_NAME}).promise();
    const data = JSON.parse(secretResponse.SecretString);
    const username =  data.username;
    const password = data.password;

    const postOptions = {
        hostname: '',
        path: '',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        },
       rejectUnauthorized: false // Ignore SSL certificate verification
    };

    const getOptions = {
        hostname: '',
        path: '',
        method: 'GET',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        },
        rejectUnauthorized: false // Ignore SSL certificate verification
    };

    // Function to perform an HTTP request
    const performHttpRequest = (options, data, requestType) => {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseBody = '';

                res.on('data', (chunk) => {
                    responseBody += chunk;
                });

                res.on('end', () => {
                    resolve(responseBody);
                });
            });

            req.on('error', (error) => {
                console.error(`${requestType} Error: `, error);
                reject(error);
            });

            req.write(data);
            req.end();
        })
    };

    // Example usage of the performHttpRequest function for POST
    const postResponse = await performHttpRequest(postOptions, postData, 'POST');
    console.log('HTTP POST Response: ', postResponse);
    
    // Example usage of the performHttpRequest function for GET
    const getResponse = await performHttpRequest(getOptions, '', 'GET');
    console.log('HTTP GET Response: ', getResponse);
    
    return 'HTTP requests initiated';
};
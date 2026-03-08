const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'models/imagen-4.0-generate-001';

async function generateImage(prompt, outputPath) {
    if (!API_KEY) {
        throw new Error('GEMINI_API_KEY not found in .env');
    }
    console.log(`Generating image for: "${prompt}"...`);
    
    const data = JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: { sampleCount: 1 }
    });

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/${MODEL}:predict?key=${API_KEY}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`API Error ${res.statusCode}: ${body}`));
                }
                const response = JSON.parse(body);
                console.log('Full Response Structure:', JSON.stringify(response, null, 2));
                
                if (!response.predictions || response.predictions.length === 0) {
                    return reject(new Error('No predictions in response'));
                }

                const prediction = response.predictions[0];
                console.log('Prediction Object:', JSON.stringify(prediction, null, 2));
                const imageBase64 = prediction.bytesBase64 || (prediction.image && prediction.image.bytesBase64) || prediction.bytes;

                if (imageBase64) {
                    fs.writeFileSync(outputPath, Buffer.from(imageBase64, 'base64'));
                    console.log(`Successfully saved image to ${outputPath}`);
                    resolve();
                } else {
                    console.error('Unexpected Prediction Structure:', JSON.stringify(prediction, null, 2));
                    reject(new Error('Could find no image data in prediction'));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

const prompt = process.argv[2];
const output = process.argv[3];

if (!prompt || !output) {
    console.error('Usage: node generate_image_api.js "prompt" output.png');
    process.exit(1);
}

generateImage(prompt, output)
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });

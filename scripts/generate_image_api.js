const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-pro-image-preview";

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateImage(prompt, outputPath) {
    if (!API_KEY) {
        throw new Error('GEMINI_API_KEY not found in .env');
    }
    console.log(`Generating image for: "${prompt}"...`);
    
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const response = await result.response;
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const buffer = Buffer.from(part.inlineData.data, 'base64');
                fs.writeFileSync(outputPath, buffer);
                console.log(`Successfully saved image to ${outputPath}`);
                return;
            }
        }
        throw new Error('No image data found in response');
    } catch (err) {
        throw err;
    }
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

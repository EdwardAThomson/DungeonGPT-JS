const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-pro-image-preview";

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

// Batch 27 (Ancient Wards & Artifacts) - High-Depth Style
const items = [
    { key: 'crown_of_sunfire', prompt: 'A radiant golden crown that blazes with inner fire. Painterly digital fantasy art with rich polished gold and flame textures, dramatic cinematic lighting, and soft light bloom. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset.' },
    { key: 'seal_of_binding', prompt: 'An ancient seal inscribed with eldritch wards. Painterly digital fantasy art with rich weathered stone and glowing rune textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset.' },
    { key: 'purified_heart_shard', prompt: 'A crystallized fragment of the Rot-Heart, cleansed of corruption. Painterly digital fantasy art with rich crystal and internal light textures, dramatic cinematic lighting, and a soft warm radiance. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset.' },
];

async function runBatch() {
    for (const item of items) {
        try {
            const outputPath = path.join(__dirname, `../public/assets/icons/items/${item.key}.png`);
            await generateImage(item.prompt, outputPath);
            console.log(`Successfully saved ${item.key}.png`);
        } catch (err) {
            console.error(`Failed to generate ${item.key}:`, err.message);
        }
    }
}

runBatch();

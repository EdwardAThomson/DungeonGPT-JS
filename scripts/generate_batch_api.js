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
            // Optional: imageConfig for 1:1 ratio
            // config: { imageConfig: { aspectRatio: "1:1" } }
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

// Batch 19 & Alternative Leather Armor
const items = [
    { key: 'leather_armor', prompt: 'A set of heavy, dark brown boiled leather armor with visible stitching, thick straps, and iron buckles, showing a rugged and organic texture without any metallic sheen, stylized digital game art icon, clean bold lines, vibrant leather textures, premium aesthetics. Perfectly centered on a solid dark charcoal background (#2c2c2c). High quality, 2D game asset style.' },
    { key: 'gemstone', prompt: 'A large, uncut sparkling sapphire with many facets that catch and refract brilliant blue light, stylized digital game art icon, clean bold lines, vibrant crystal lighting, premium aesthetics. Perfectly centered on a solid dark charcoal background (#2c2c2c). High quality, 2D game asset style.' },
    { key: 'pearl', prompt: 'A perfect, oversized white pearl with a shimmering iridescent luster, glowing with a soft, ethereal moonlight glow, stylized digital game art icon, clean bold lines, vibrant smooth textures, premium aesthetics. Perfectly centered on a solid dark charcoal background (#2c2c2c). High quality, 2D game asset style.' },
    { key: 'rare_gem', prompt: 'A brilliant, teardrop-shaped ruby of exceptional purity, pulsing with an inner fire and emitting a warm red radiance, stylized digital game art icon, clean bold lines, vibrant gem lighting, premium aesthetics. Perfectly centered on a solid dark charcoal background (#2c2c2c). High quality, 2D game asset style.' },
    { key: 'bar_stool_leg', prompt: 'A heavy, splintered wooden leg from a tavern stool, with a few bent nails sticking out and showing signs of use in a brawl, stylized digital game art icon, clean bold lines, detailed wood textures, premium aesthetics. Perfectly centered on a solid dark charcoal background (#2c2c2c). High quality, 2D game asset style.' }
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

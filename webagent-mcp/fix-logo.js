import { Jimp } from 'jimp';

const LOGO_PATH = 'C:/Coding/WebMCP/website/assets/icon.png';

async function processLogo() {
    console.log('🖼️ Processing logo:', LOGO_PATH);

    const image = await Jimp.read(LOGO_PATH);

    // Loop through all pixels
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
        const r = image.bitmap.data[idx + 0];
        const g = image.bitmap.data[idx + 1];
        const b = image.bitmap.data[idx + 2];

        // Remove bright green (chroma key) - the green is very pure
        // Green > 200, Red < 100, Blue < 100
        if (g > 180 && r < 120 && b < 120) {
            image.bitmap.data[idx + 3] = 0;
        }
    });

    // Write using promise wrapper
    await new Promise((resolve, reject) => {
        image.write(LOGO_PATH, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    console.log('✅ Logo processed! Green removed.');
}

processLogo().catch(console.error);

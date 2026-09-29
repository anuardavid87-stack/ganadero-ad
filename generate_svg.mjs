import fs from 'fs';
import path from 'path';

const iconPngPath = path.resolve('icon.png');
const pngBuffer = fs.readFileSync(iconPngPath);
const base64Png = pngBuffer.toString('base64');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
  <image width="512" height="512" href="data:image/png;base64,${base64Png}" />
</svg>
`;

const targets = [
  'icon.svg',
  'frontend/icon.svg',
  'frontend/public/icon.svg',
  'www/icon.svg',
  'android/app/src/main/assets/public/icon.svg'
];

for (const t of targets) {
  const dir = path.dirname(t);
  if (fs.existsSync(dir)) {
    fs.writeFileSync(t, svgContent, 'utf8');
    console.log(`[OK] SVG escrito en ${t}`);
  }
}

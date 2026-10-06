/**
 * GANADERO AD - SINCRONIZADOR DE RECURSOS PARA ANDROID
 * Prepara la carpeta `www/` con todos los activos web listos para compilar en Android Studio
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const WWW_DIR = path.join(ROOT_DIR, 'www');

if (!fs.existsSync(WWW_DIR)) {
  fs.mkdirSync(WWW_DIR, { recursive: true });
}

// 1. Copiar bundle.js
const bundleSrc = fs.existsSync(path.join(ROOT_DIR, 'frontend', 'bundle.js'))
  ? path.join(ROOT_DIR, 'frontend', 'bundle.js')
  : path.join(ROOT_DIR, 'bundle.js');

if (fs.existsSync(bundleSrc)) {
  fs.copyFileSync(bundleSrc, path.join(WWW_DIR, 'bundle.js'));
  console.log('✓ www/bundle.js copiado');
}

// 2. Copiar styles.css y tailwind.min.css
const cssSrc = path.join(ROOT_DIR, 'frontend', 'src', 'styles.css');
if (fs.existsSync(cssSrc)) {
  fs.copyFileSync(cssSrc, path.join(WWW_DIR, 'styles.css'));
  console.log('✓ www/styles.css copiado');
}
const twSrc = path.join(ROOT_DIR, 'tailwind.min.css');
if (fs.existsSync(twSrc)) {
  fs.copyFileSync(twSrc, path.join(WWW_DIR, 'tailwind.min.css'));
  console.log('✓ www/tailwind.min.css copiado');
}

// 3. Copiar iconos y manifest
const iconFiles = ['icon.svg', 'icon.png', 'icon-192.png', 'favicon.ico', 'manifest.webmanifest'];
for (const file of iconFiles) {
  const src = path.join(ROOT_DIR, 'frontend', 'public', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(WWW_DIR, file));
    console.log(`✓ www/${file} copiado`);
  }
}

// 4. Descargar / Copiar SheetJS local para soporte 100% offline en potreros
const xlsxLocal = path.join(WWW_DIR, 'xlsx.full.min.js');
async function asegurarSheetJS() {
  if (!fs.existsSync(xlsxLocal)) {
    console.log('Descargando SheetJS local para empaquetado offline...');
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(xlsxLocal, text, 'utf8');
        console.log(`✓ www/xlsx.full.min.js descargado (${text.length} bytes)`);
      } else {
        console.warn('No se pudo descargar SheetJS desde CDN, se usará enlace en línea.');
      }
    } catch (e) {
      console.warn('Aviso: modo offline de SheetJS omitido:', e.message);
    }
  }
}

// 5. Generar index.html para Android
let html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

// Reemplazar rutas relativas para el esquema de Capacitor
html = html.replace(/\.\/frontend\/public\/manifest\.webmanifest/g, './manifest.webmanifest');
html = html.replace(/\.\/frontend\/public\/icon\.svg/g, './icon.svg');
html = html.replace(/\.\/frontend\/public\/icon\.png/g, './icon.png');
html = html.replace(/\.\/frontend\/public\/icon-192\.png/g, './icon-192.png');
html = html.replace(/\.\/frontend\/src\/styles\.css/g, './styles.css');
html = html.replace(/src="\.\/bundle\.js"/g, 'src="./bundle.js"');

// Si SheetJS existe localmente, priorizarlo antes que la CDN
if (fs.existsSync(xlsxLocal)) {
  html = html.replace(
    '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>',
    '<script src="./xlsx.full.min.js"></script>'
  );
}

fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html, 'utf8');
console.log('✓ www/index.html generado para Android');

await asegurarSheetJS();

// Re-actualizar index.html con SheetJS local si se acaba de descargar
if (fs.existsSync(xlsxLocal)) {
  html = fs.readFileSync(path.join(WWW_DIR, 'index.html'), 'utf8');
  if (html.includes('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')) {
    html = html.replace(
      '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>',
      '<script src="./xlsx.full.min.js"></script>'
    );
    fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html, 'utf8');
  }
}

console.log('✓ Sincronización de www/ finalizada con éxito.');

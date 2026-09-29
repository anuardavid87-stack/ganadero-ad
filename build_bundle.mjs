/**
 * BOVITRACK PRO PWA - BUNDLER AUTOMATIZADO PARA COMPATIBILIDAD FILE:// Y HTTP://
 * Concatena todos los módulos en orden de dependencias en un único archivo `frontend/bundle.js`
 * sin `type="module"` para que `index.html` funcione 100% tanto con doble clic (file://)
 * como a través de servidor web HTTP (run_app.bat / server.ps1).
 */

import fs from 'fs';
import path from 'path';

const files = [
  'frontend/src/core/zootecnia.js',
  'frontend/src/core/auditorIA.js',
  'frontend/src/core/finanzas.js',
  'frontend/src/core/supabaseSync.js',
  'frontend/src/core/nutricionIA.js',
  'frontend/src/core/exportadorBackup.js',
  'frontend/src/ui/AutosuggestAnimales.js',
  'frontend/src/components/FichaAnimal.js',
  'frontend/src/components/PanelAlertas.js',
  'frontend/src/components/TablaDinamica.js',
  'frontend/src/components/DashboardGrafico.js',
  'frontend/src/components/ImportadorExcel.js',
  'frontend/src/components/ModuloAdmin.js',
  'frontend/src/components/ModuloReproduccion.js',
  'frontend/src/components/PestanaAnimales.js',
  'frontend/src/components/ModuloTraslados.js',
  'frontend/src/components/ModuloIngresosDiarios.js',
  'frontend/src/components/ModuloNutricion.js',
  'frontend/src/components/CuadriculaMasiva.js',
  'frontend/src/app.js'
];

let bundleCode = '';

for (const f of files) {
  let code = fs.readFileSync(f, 'utf8');

  // Eliminar declaraciones import
  code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  code = code.replace(/import\s+['"][^'"]+['"];?/g, '');

  // Eliminar exportaciones ES
  code = code.replace(/export\s+class\s+/g, 'class ');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+let\s+/g, 'let ');
  code = code.replace(/export\s+default\s+/g, '');
  code = code.replace(/export\s*\{[\s\S]*?\};?/g, '');

  bundleCode += `\n// ============================================================================\n// ARCHIVO: ${f}\n// ============================================================================\n${code}\n`;
}

// Envolver en IIFE con inicialización robusta para DOM listo
const finalBundle = `/**
 * BOVITRACK PRO PWA - STANDALONE COMPATIBILITY BUNDLE
 * Compatible con file:// (doble clic directo en Windows) y http:// (PWA en campo)
 * Generado automáticamente: ${new Date().toISOString()}
 */
(function() {
  "use strict";

${bundleCode}

})();
`;

fs.writeFileSync('frontend/bundle.js', finalBundle, 'utf8');
console.log(`✓ frontend/bundle.js generado con éxito (${finalBundle.length} bytes).`);

// Copiar a la raíz como bovitrack_bundle.js y bundle.js
fs.writeFileSync('bovitrack_bundle.js', finalBundle, 'utf8');
console.log(`✓ bovitrack_bundle.js generado en la raíz.`);
fs.writeFileSync('bundle.js', finalBundle, 'utf8');
console.log(`✓ bundle.js generado en la raíz.`);

// Copiar a www si existe
if (fs.existsSync('www')) {
  fs.writeFileSync('www/bundle.js', finalBundle, 'utf8');
  console.log(`✓ www/bundle.js sincronizado.`);
}

// Actualizar cache buster en index.html de frontend y sincronizar con index.html raíz
const versionTag = 'v=' + Date.now();
if (fs.existsSync('frontend/index.html')) {
  let fHtml = fs.readFileSync('frontend/index.html', 'utf8');
  fHtml = fHtml.replace(/src="\.\/bundle\.js(\?[^"]*)?"/g, `src="./bundle.js?${versionTag}"`);
  fs.writeFileSync('frontend/index.html', fHtml, 'utf8');
  console.log(`✓ frontend/index.html actualizado con cache buster (${versionTag}).`);

  // Generar root index.html adaptando rutas relativas
  let rootHtml = fHtml
    .replace(/href="\.\/public\/manifest\.webmanifest"/g, 'href="./manifest.webmanifest"')
    .replace(/href="\.\/public\/favicon\.ico"/g, 'href="./favicon.ico"')
    .replace(/href="\.\/public\/icon\.svg"/g, 'href="./icon.svg"')
    .replace(/href="\.\/public\/icon\.png"/g, 'href="./icon.png"')
    .replace(/src="\.\/public\/icon\.png"/g, 'src="./icon.png"')
    .replace(/src="\.\/public\/icon-192\.png"/g, 'src="./icon-192.png"')
    .replace(/href="\.\/public\//g, 'href="./frontend/public/')
    .replace(/src="\.\/public\//g, 'src="./frontend/public/')
    .replace(/href="\.\/src\/styles\.css"/g, 'href="./frontend/src/styles.css"');
  fs.writeFileSync('index.html', rootHtml, 'utf8');
  console.log(`✓ index.html raíz sincronizado con frontend/index.html (${versionTag}).`);
}

// Sincronizar activos PWA (manifest, sw, icon, favicon) en todas las ubicaciones necesarias
const pwaFiles = ['manifest.webmanifest', 'sw.js', 'icon.svg', 'icon.png', 'icon-192.png', 'favicon.ico'];
if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
for (const pwaFile of pwaFiles) {
  const src = fs.existsSync(`frontend/public/${pwaFile}`) ? `frontend/public/${pwaFile}` : (fs.existsSync(pwaFile) ? pwaFile : null);
  if (src) {
    fs.copyFileSync(src, pwaFile);
    fs.copyFileSync(src, `public/${pwaFile}`);
    if (!fs.existsSync(`frontend/${pwaFile}`)) fs.copyFileSync(src, `frontend/${pwaFile}`);
    if (fs.existsSync('www')) fs.copyFileSync(src, `www/${pwaFile}`);
  }
}
console.log('✓ Activos PWA (manifest, sw, icon) sincronizados en raíz, frontend y www.');

// Validación de sintaxis
try {
  new Function(finalBundle);
  console.log('✓ Sintaxis del bundle verificada: 100% válida sin errores.');
} catch (err) {
  console.error('✗ Error de sintaxis en el bundle:', err.message);
  process.exit(1);
}

/**
 * BOVITRACK PRO PWA - BUNDLER AUTOMATIZADO PARA COMPATIBILIDAD FILE:// Y HTTP://
 * Concatena todos los módulos en orden de dependencias en un único archivo `frontend/bundle.js`
 * sin `type="module"` para que `index.html` funcione 100% tanto con doble clic (file://)
 * como a través de servidor web HTTP (run_app.bat / server.ps1).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
    .replace(/href="\.\/src\/styles\.css"/g, 'href="./styles.css"');
  fs.writeFileSync('index.html', rootHtml, 'utf8');
  console.log(`✓ index.html raíz sincronizado con frontend/index.html (${versionTag}).`);

  // Sincronizar index.html en public/ para despliegues Vercel/Static
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/index.html', rootHtml, 'utf8');
  console.log(`✓ public/index.html generado para Vercel.`);
}

// Compilar y sincronizar Tailwind CSS Local
try {
  console.log('Compilando Tailwind CSS local para uso 100% offline...');
  execSync('npx tailwindcss -i ./tailwind-input.css -o ./tailwind.min.css --minify', { stdio: 'ignore', shell: true });
  console.log('✓ tailwind.min.css compilado con éxito.');
} catch (e) {
  console.warn('Aviso: compilación de Tailwind CLI omitida o fallida, usando versión existente:', e.message);
}

// Sincronizar tailwind.min.css en todas las carpetas destino
if (fs.existsSync('tailwind.min.css')) {
  const twContent = fs.readFileSync('tailwind.min.css');
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/tailwind.min.css', twContent);
  if (fs.existsSync('frontend')) fs.writeFileSync('frontend/tailwind.min.css', twContent);
  if (fs.existsSync('frontend/public')) fs.writeFileSync('frontend/public/tailwind.min.css', twContent);
  if (fs.existsSync('www')) fs.writeFileSync('www/tailwind.min.css', twContent);
  const androidPublic = 'android/app/src/main/assets/public';
  if (fs.existsSync(androidPublic)) fs.writeFileSync(path.join(androidPublic, 'tailwind.min.css'), twContent);
  console.log('✓ tailwind.min.css sincronizado en raíz, frontend, public, www y android.');
}

// Sincronizar estilos CSS personalizados
if (fs.existsSync('frontend/src/styles.css')) {
  const css = fs.readFileSync('frontend/src/styles.css', 'utf8');
  fs.writeFileSync('styles.css', css, 'utf8');
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/styles.css', css, 'utf8');
  if (fs.existsSync('www')) fs.writeFileSync('www/styles.css', css, 'utf8');
  if (fs.existsSync('frontend')) fs.writeFileSync('frontend/styles.css', css, 'utf8');
  const androidPublic = 'android/app/src/main/assets/public';
  if (fs.existsSync(androidPublic)) fs.writeFileSync(path.join(androidPublic, 'styles.css'), css);
  console.log(`✓ styles.css sincronizado en raíz, frontend, public, www y android.`);
}

// Sincronizar SheetJS (xlsx.full.min.js) para soporte offline de importación/exportación
const xlsxSrc = fs.existsSync('xlsx.full.min.js') ? 'xlsx.full.min.js' : (fs.existsSync('www/xlsx.full.min.js') ? 'www/xlsx.full.min.js' : null);
if (xlsxSrc) {
  const xlsxContent = fs.readFileSync(xlsxSrc);
  fs.writeFileSync('xlsx.full.min.js', xlsxContent);
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/xlsx.full.min.js', xlsxContent);
  if (fs.existsSync('frontend')) fs.writeFileSync('frontend/xlsx.full.min.js', xlsxContent);
  if (fs.existsSync('www')) fs.writeFileSync('www/xlsx.full.min.js', xlsxContent);
  const androidPublic = 'android/app/src/main/assets/public';
  if (fs.existsSync(androidPublic)) fs.writeFileSync(path.join(androidPublic, 'xlsx.full.min.js'), xlsxContent);
  console.log('✓ xlsx.full.min.js sincronizado para funcionamiento sin internet.');
}

// Sincronizar bundles en public/ y android
if (fs.existsSync('bundle.js')) {
  fs.copyFileSync('bundle.js', 'public/bundle.js');
  fs.copyFileSync('bundle.js', 'public/bovitrack_bundle.js');
}

// Sincronizar APK si existe
if (fs.existsSync('Ganadero_AD.apk')) {
  fs.copyFileSync('Ganadero_AD.apk', 'public/Ganadero_AD.apk');
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
    const androidPublic = 'android/app/src/main/assets/public';
    if (fs.existsSync(androidPublic)) fs.copyFileSync(src, path.join(androidPublic, pwaFile));
  }
}
console.log('✓ Activos PWA (manifest, sw, icon, html, bundle, css, xlsx) sincronizados en raíz, frontend, public, www y android.');

// Validación de sintaxis
try {
  new Function(finalBundle);
  console.log('✓ Sintaxis del bundle verificada: 100% válida sin errores.');
} catch (err) {
  console.error('✗ Error de sintaxis en el bundle:', err.message);
  process.exit(1);
}

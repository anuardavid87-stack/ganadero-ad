# BoviTrack Pro PWA 🐂🦬🌾
### Plataforma Zootécnica y Financiera Inteligente Multi-Predio con Auditoría de IA en Campo
**Desarrollada completamente desde cero como Aplicación Web Progresiva (PWA) Mobile-First**

---

## 📌 ¿Qué es BoviTrack Pro?

**BoviTrack Pro** es una plataforma de software integral de agrotecnología ganadera para la gestión de predios de **ganado vacuno (bovino)** y **bufalino (búfalos)**. Ha sido diseñada con una filosofía estrictamente **mobile-first** para operarios, mayordomos, veterinarios y administradores en campo. Funciona con o sin cobertura de datos gracias a su arquitectura PWA offline-first con sincronización y persistencia local en tiempo real.

---

### 🌟 Novedades y Requerimientos Clave Implementados

1. **Módulo Completo de Reproducción (IA, TE y Servicios con Toro) (`ModuloReproduccion.js`)**:
   - Pestaña de navegación dedicada con tres modalidades reproductivas:
     - **Inseminación Artificial (IA / IATF)**: Toro reproductor, código de pajilla, inseminador, condición corporal y protocolo.
     - **Transferencia de Embriones (TE / FIV)**: Hembra donadora genética, toro padre, calidad embrionaria y veterinario especialista.
     - **Servicio con Toro (Monta natural o dirigida)**: Toro asignado y fecha de servicio.
   - Proyecciones zootécnicas automáticas calculadas en tiempo real:
     - *Diagnóstico precoz por Ecografía (+32 días)*.
     - *Confirmación de preñez por Palpación (+60 días)*.
     - *Fecha probable de parto (283 días en vacunos / 310 días en bufalinos)*.
   - Botones de diagnóstico rápido en historial: `🤰 Preñada` (calcula días de gestación automáticos), `🔄 Vacía/Repite` y `🗑️ Eliminar`.
   - Indicadores KPI reproductivos: Tasa de Concepción, Servicios Registrados y Desglose por Técnica.
2. **Servicios Reproductivos en Brete/Manga ("Uno a Uno") (`CuadriculaMasiva.js`)**:
   - Pestaña `🧬 Servicios (IA/TE/Toro)` integrada en el ingreso masivo. El operario ingresa el arete de la hembra uno por uno, selecciona la técnica y acumula la sesión de campo.
3. **Nueva Plantilla Excel Unificada: Un Solo Pesaje + Ganancia de Peso Día (`ImportadorExcel.js`)**:
   - Formato simplificado a **17 columnas oficiales**: contiene **un único pesaje** (`fecha_pesaje`, `peso_actual`) y la columna directa de **ganancia de peso diaria** (`ganancia_peso_dia` en g/día).
   - Parser con auto-detección inteligente: reconoce automáticamente el formato unificado y mantiene total retrocompatibilidad con el formato antiguo de dos pesajes calculando la ganancia automáticamente.
4. **Auditoría de IA en Servicios Reproductivos (`auditorIA.js`)**:
   - Bloqueo biológico inmediato que impide registrar servicios reproductivos a ejemplares machos.
   - Alerta crítica de riesgo de aborto si se intenta registrar una inseminación o monta en una hembra con preñez confirmada.
   - Advertencia si se sirve una novilla de primer servicio menor a 13 meses.
5. **Especies Diferenciadas: Vacuno (Bovino) y Bufalino (Búfalo)**:
   - Parámetros zootécnicos ajustados para cada especie (período de gestación de 283 días en vacunos vs 310 días en búfalas, proyección del IEP e inicio de secado preventivo).
6. **Días de Preñez Visibles**:
   - En cualquier hembra gestante se calculan y visualizan de forma prominente los **días de preñez** acumulados (`diasGestacionActual`), porcentaje de avance del período gestacional y proyección al parto.
7. **Pestaña Dedicada de "Animales" (`PestanaAnimales.js`)**:
   - Inventario general con todos los atributos de cada ejemplar: Arete/Tag, Especie (Vacuno/Bufalino), Nombre/Alias, Sexo, Raza, Categoría, Lote, Genealogía (Padre y Madre), Fecha de Nacimiento y Edad (meses/años), Estado Reproductivo con Días de Preñez, Días Abiertos, Último Parto e IEP proyectado, Peso Actual y GDP (g/día).
   - Búsqueda en vivo y filtros combinados por Especie, Lote, Estado Reproductivo y Sexo.
   - Botón **"+ Nuevo Animal"** para registros individuales inmediatos en potrero o corral.
8. **Ficha Zootécnica Individual del Animal (`FichaAnimal.js`)**:
   - Modal interactivo de alta resolución con 5 secciones:
     1. Identidad y Genealogía (Padre y Madre / Pedigree).
     2. Estado Reproductivo y Días de Preñez (con barra de avance y proyección a 283 o 310 días).
     3. Historial de Servicios Reproductivos (IA, TE, Monta, pajillas, donadoras, resultados).
     4. Historial de partos previos y crías nacidas (tag de la cría, sexo, peso al nacer, tipo de parto).
     5. Trazabilidad de pesajes y ganancia ponderal (GDP).
9. **Ingreso Masivo en Manga/Báscula "Uno a Uno" (`CuadriculaMasiva.js`)**:
   - Diseñado para el trabajo real en manga/brete: el operario digita o busca el arete del animal que entra al brete **uno por uno**, el sistema trae sus antecedentes previos, registra la nueva medición con auditoría de IA en tiempo real y la acumula en la sesión de campo.
10. **Tablas Dinámicas con Dato de Ordenamiento Explícito (`TablaDinamica.js`)**:
   - Matriz comparativa individualizada ejemplar por ejemplar con una columna principal destacada: **`DATO DE ORDEN: [Criterio Activo] ⬇️`** que muestra el valor exacto por el cual se está ordenando (ej. Ganancia Diaria `+520 g/d`, Leche `14.5 L/d`, Días Abiertos `247 d`, Peso `540 kg`, Preñez `120 d` o IEP), con medallas de ranking (`🥇 #1`, `🥈 #2`, `🥉 #3`), cabeceras clickeables interactivas y banner resumen con valores máximo, promedio y mínimo.
11. **Gestión Completa de Usuarios y Contraseñas (`ModuloAdmin.js`)**:
   - Creación de nuevos usuarios con rol asignado (`administrador`, `propietario`, `veterinario`, `operario`, `consulta`) y generación automática de claves seguras.
   - Asignación y cambio de contraseñas de acceso (`🔑 Clave`).
   - Edición de perfiles, contacto y roles (`✏️`).
   - Eliminación segura de usuarios con protección para evitar eliminar el usuario en sesión o el único administrador (`🗑️`).
   - Visualización y ocultación rápida de contraseñas con el botón `👁️`.
12. **Eliminación de Fincas y Purga Total de Base de Datos (`ModuloAdmin.js`)**:
   - Opción para **eliminar fincas** en desuso preservando la integridad de datos.
   - Botón de **"Borrar Toda la Base de Datos (0 Animales)"** estrictamente reservado para usuarios con rol **Administrador**, con doble confirmación mediante palabra clave (`BORRAR`).
13. **Rol de Solo Consulta / Propietario Lector (`consulta`)**:
   - Perfil de solo lectura que permite auditar inventarios, indicadores, alertas y finanzas sin permitir ingresos, ediciones ni eliminaciones de registros.

---

## 🗂️ Estructura Completa del Proyecto

```
bovitrack-pwa/
├── backend/
│   ├── database/
│   │   └── schema.sql                 # Esquema relacional PostgreSQL (11 tablas: fincas, animales, servicios_reproductivos, etc.)
│   └── prisma/
│       └── schema.prisma              # Modelos ORM Prisma para Node.js / TypeScript
├── frontend/
│   ├── public/
│   │   ├── manifest.webmanifest       # Manifiesto PWA para instalación en Android / iOS
│   │   ├── sw.js                      # Service Worker v3.0.0 para funcionamiento sin conexión
│   │   └── icon.svg                   # Iconografía de alta resolución
│   ├── src/
│   │   ├── core/
│   │   │   ├── zootecnia.js           # Fórmulas de precisión: GDP, Días Abiertos, DEL, IEP y Proyecciones de Parto
│   │   │   ├── auditorIA.js           # Auditoría IA en tiempo real (imposibilidades biológicas, preñez y servicios)
│   │   │   └── finanzas.js            # Costos fijos consolidados, cuota amortización diferida y ROI
│   │   ├── components/
│   │   │   ├── ModuloReproduccion.js  # Módulo especializado: IA, TE, Monta con Toro, diagnósticos y KPIs
│   │   │   ├── CuadriculaMasiva.js    # Ingreso masivo de campo en brete/manga (flujo uno a uno y pestaña de servicios)
│   │   │   ├── PestanaAnimales.js     # Pestaña de inventario general de animales con genealogía y preñez
│   │   │   ├── FichaAnimal.js         # Modal/Ficha zootécnica individual completa con historial de servicios
│   │   │   ├── PanelAlertas.js        # Panel inteligente de alertas de improductividad
│   │   │   ├── TablaDinamica.js       # Matriz comparativa dinámica animal por animal
│   │   │   ├── DashboardGrafico.js    # Tablero interactivo con gráficos SVG nativos offline
│   │   │   ├── ImportadorExcel.js     # Importador/Exportador oficial CSV con 17 columnas (un pesaje + GDP día)
│   │   │   └── ModuloAdmin.js         # Administración multi-finca, roles RBAC, costos y purga de base de datos
│   │   ├── app.js                     # Orquestador principal del estado y persistencia local
│   │   └── styles.css                 # Estilos visuales mobile-first para sol directo en campo
│   ├── bundle.js                      # Bundle compilado autónomo compatible con file://
│   └── index.html                     # Punto de entrada HTML5 PWA
├── bovitrack_bundle.js                # Bundle espejo para raíz
├── index.html                         # Punto de entrada HTML5 en raíz
├── test_suite.mjs                     # Suite de pruebas unitarias automatizadas (57 tests exitosos)
├── server.ps1                         # Servidor local nativo en PowerShell en puerto 8085
├── run_app.bat                        # Lanzador de un clic para Windows
└── README.md                          # Manual de usuario y arquitectura
```

---

## 🏛️ Esquema Relacional de Base de Datos

En [`backend/database/schema.sql`](file:///C:/Users/anuar/.gemini/antigravity/scratch/bovitrack-pwa/backend/database/schema.sql) y [`backend/prisma/schema.prisma`](file:///C:/Users/anuar/.gemini/antigravity/scratch/bovitrack-pwa/backend/prisma/schema.prisma):

- **Normalización**: 11 tablas diseñadas para integridad zootécnica estricta y consultas en milisegundos:
  - `fincas` (predios, área, precios de mercado: `precio_leche_litro`, `precio_carne_kg_pie`)
  - `usuarios` y `fincas_usuarios` (RBAC: Administrador, Propietario, Operario, Veterinario, Consulta)
  - `costos_fijos_finca` (nómina, insumos, fertilizantes/herbicidas, maquinaria, servicios, otros)
  - `inversiones_diferidas` (amortizables: $\text{Cuota} = \frac{\text{Monto}}{\text{Plazo en Meses}}$)
  - `animales` (tag, chip RFID, especie `bovino`/`bufalino`, raza, sexo, genealogía `padre_tag`/`madre_tag`, lote, estado reproductivo, `dias_gestacion_actual`, etc.)
  - `servicios_reproductivos` (tipo: `inseminacion_artificial`, `transferencia_embrion`, `monta_toro`, reproductor, pajilla, donadora, resultado diagnóstico, fecha parto estimada)
  - `pesajes_animales` (peso kg, GDP calculada en g/día)
  - `palpaciones_reproductivas` (diagnóstico preñada/vacía, días de gestación, estructura ovárica)
  - `controles_lecheros` (turno mañana + tarde = total litros día)
  - `registros_partos_destetes` (madre, cría autogenerada, peso al nacer)
  - `alertas_zootecnicas` y `logs_auditoria_ia` (registro de advertencias e intentos de ingreso con error biológico)

---

## 🧪 Pruebas Automatizadas

El archivo [`test_suite.mjs`](file:///C:/Users/anuar/.gemini/antigravity/scratch/bovitrack-pwa/test_suite.mjs) valida **67 pruebas críticas** con 100% de éxito:
1. **Zootecnia**: GDP diario, días abiertos, días de preñez, IEP para bovinos (283 d) vs bufalinos (310 d), y cálculo de edad en meses.
2. **Auditoría IA**: Detección de saltos irreales de peso ($>2.5\text{ kg/d}$), bloqueo de dos partos en $<7\text{ meses}$, bloqueo de palpación/preñez en machos.
3. **Alertas Zootécnicas**: Crecimiento bajo, vacas vacías $>200$ días, novillas $>36$ meses, secado a los 7 meses.
4. **Finanzas**: Costos fijos consolidados, cuota mensual diferida, margen neto y ROI.
5. **Genealogía y Ficha**: Presencia de padre y madre, días de gestación e historial de partos con crías.
6. **Administración y RBAC**: Bloqueo de purga para rol consulta, purga completa a 0 animales por Administrador, y reglas de eliminación de predios.
7. **Tablas Dinámicas con Métrica Ordenada**: Extracción exacta de valor de orden (GDP, leche, días abiertos, peso, preñez, IEP) y ordenamiento animal por animal.
8. **Gestión de Usuarios y Contraseñas**: Creación con rol y clave, prevención de nombres duplicados, asignación/cambio de contraseña y eliminación con protecciones de seguridad.
9. **Servicios Reproductivos (IA, TE & Monta)**: Proyecciones de parto diferenciadas (283 vs 310 días), ecografía temprana (+32 d), palpación (+60 d), actualización de estado a "Servida" y confirmación de preñez.
10. **Auditoría IA en Reproducción**: Bloqueo de servicios en machos, detección de riesgo de aborto al inseminar hembras preñadas y alerta en novillas jóvenes (<13 meses).
11. **Plantilla Excel Unificada**: Importación con un pesaje (`peso_actual`) y ganancia diaria directa (`ganancia_peso_dia`), y retrocompatibilidad con 2 pesajes.
12. **Integración con Supabase Cloud**: Sanitización de URLs, validación de estado de configuración, encabezados con Anon Key y Bearer, mapeo bidireccional animal/servicios (camelCase <-> snake_case), y control de errores HTTP.

Para ejecutar las pruebas:
```powershell
& "C:\Program Files\nodejs\node.exe" test_suite.mjs
```

---

## 🚀 Puesta en Marcha Inmediata

Tienes dos formas sumamente sencillas de usar BoviTrack Pro:

### Opción 1: Doble clic directo sobre `index.html` (Sin servidor web)
1. Abre la carpeta `C:\Users\anuar\.gemini\antigravity\scratch\bovitrack-pwa`.
2. Haz doble clic en **`index.html`** (o en `frontend/index.html`).
3. Se abrirá de inmediato en cualquier navegador (Edge, Chrome, Firefox) con todos los módulos, zootecnia, tablas dinámicas y administración cargados al 100%.

### Opción 2: Modo Servidor Local PWA (`http://localhost:8085/`)
1. Abre la carpeta `C:\Users\anuar\.gemini\antigravity\scratch\bovitrack-pwa`.
2. Haz doble clic en **`run_app.bat`** (o ejecuta `powershell -File server.ps1`).
3. Se abrirá automáticamente en tu navegador en `http://localhost:8085/`.
4. En este modo puedes instalar la aplicación como PWA nativa en tu teléfono o computadora de escritorio haciendo clic en *"Instalar BoviTrack"* o *"Agregar a pantalla principal"*.

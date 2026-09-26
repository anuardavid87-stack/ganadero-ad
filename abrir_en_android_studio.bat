@echo off
chcp 65001 > nul
echo =====================================================================
echo   GANADERO AD - APERTURA DIRECTA EN ANDROID STUDIO
echo =====================================================================
echo.

set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%ANDROID_HOME%\platform-tools;%PATH%"

set "STUDIO_EXE=C:\Program Files\Android\Android Studio\bin\studio64.exe"
set "PROYECTO_ANDROID=%~dp0android"

if not exist "%STUDIO_EXE%" (
    echo [ERROR] No se encontro Android Studio en "%STUDIO_EXE%".
    echo Por favor verifica la ruta de instalacion.
    pause
    exit /b 1
)

echo Sincronizando ultimos cambios de la aplicacion...
call node "%~dp0sync_android.mjs"
call cmd /c npx cap copy android

echo.
echo Abriendo proyecto en Android Studio:
echo "%PROYECTO_ANDROID%"
echo.

start "" "%STUDIO_EXE%" "%PROYECTO_ANDROID%"

echo [OK] Android Studio ha sido iniciado con el proyecto Ganadero AD.
echo Puedes conectar tu celular por USB o usar el Emulador para correr la app.
echo.
pause

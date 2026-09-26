@echo off
chcp 65001 > nul
echo =====================================================================
echo   GANADERO AD - COMPILACION DEL INSTALADOR APK PARA CELULAR
echo =====================================================================
echo.

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo 1. Empaquetando bundle y hojas de calculo offline...
call node "%~dp0build_bundle.mjs"
call node "%~dp0sync_android.mjs"
call cmd /c npx cap copy android

echo.
echo 2. Compilando APK con Gradle de Android Studio...
cd /d "%~dp0android"
call gradlew.bat assembleDebug

if %ERRORLEVEL% equ 0 (
    echo.
    echo =====================================================================
    echo   [EXITO] APK COMPILADO SATISFACTORIAMENTE
    echo =====================================================================
    cd /d "%~dp0"
    if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
        copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "%~dp0Ganadero_AD_debug.apk" > nul
        echo.
        echo Se ha copiado el instalador listo a la raiz del proyecto:
        echo   %~dp0Ganadero_AD_debug.apk
        echo.
        echo Ya puedes pasar este archivo a tu celular Android e instalarlo.
    )
) else (
    echo.
    echo [ERROR] Hubo un problema compilando con Gradle.
    echo Revisa el registro arriba o abre el proyecto con "abrir_en_android_studio.bat".
)

echo.
pause

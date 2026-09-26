@echo off
chcp 65001 > nul
echo ========================================================
echo   GANADERO AD - SINCRONIZADOR CON GITHUB
echo ========================================================
echo.
set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
if not exist "%GIT_CMD%" set "GIT_CMD=git"

echo [1/3] Verificando cambios locales...
"%GIT_CMD%" status -s

echo.
echo [2/3] Sincronizando con rama main remota...
"%GIT_CMD%" branch -M main
"%GIT_CMD%" push -u origin main

if %ERRORLEVEL% equ 0 (
  echo.
  echo ========================================================
  echo  ✓ ¡Repositorio sincronizado con éxito en GitHub!
  echo  URL: https://github.com/anuardavid87-stack/ganadero-ad
  echo ========================================================
) else (
  echo.
  echo ⚠️ No se pudo completar el push.
  echo Recuerda que primero debes haber creado el repositorio
  echo vacío "ganadero-ad" en https://github.com/new
)
echo.
pause

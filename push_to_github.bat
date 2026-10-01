@echo off
chcp 65001 > nul
echo ===================================================
echo   Soliq Expert Bot - GitHub'ga yuklash vositasi
echo ===================================================
echo.
cd /d "c:\Users\MasterChip\.gemini\antigravity\playground\cobalt-apollo"
echo Kodlar GitHub profilingizga yuklanmoqda...
echo (Agar brauzerda oyna ochilsa, "Sign in with your browser" tugmasini bosing)
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ===================================================
    echo [MUVAFFAQIYAT] Barcha kodlar GitHub'ga yuklandi!
    echo ===================================================
) else (
    echo ===================================================
    echo [XATOLIK] Yuklash amalga oshmadi.
    echo ===================================================
)
echo.
pause

@echo off
set "CLI=C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe"
set "SIGN=C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_SigningTool_CLI.exe"
set "LOADER=C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\ExternalLoader\MX25UM51245G_STM32N6570-NUCLEO.stldr"

set "RAW_BIN=C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\STM32CubeIDE\NUCLEO-N657X0-Q\uvc\Release\x-cube-n6-ai-people-detection-tracking-uvc-nucleo.bin"
set "ALIGNED_BIN=C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\STM32CubeIDE\NUCLEO-N657X0-Q\uvc\Release\N6_Aligned_Signed.bin"

echo ==============================================
echo =   STM32N657X0-Q NUCLEO FLASHING SCRIPT     =
echo ==============================================
echo Assurez-vous que STM32CubeProgrammer est FERME !
echo Laissez la carte en mode "Boot from Flash" ou "Development".
echo.

echo [0/4] Alignement et Signature Officielle STM32 (-align)...
"%SIGN%" -bin "%RAW_BIN%" -nk -t ssbl -hv 2.3 -align -o "%ALIGNED_BIN%"
if %ERRORLEVEL% neq 0 (
    echo ERREUR PENDANT LA SIGNATURE !
    pause
    exit /b
)

echo.
echo [1/4] Effacement complet de la Flash Externe (Patiente...)
"%CLI%" -c port=SWD -el "%LOADER%" -e all

echo.
echo [2/4] Ecriture du FSBL a 0x70000000...
"%CLI%" -c port=SWD -el "%LOADER%" --skipErase -w "C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\FSBL\ai_fsbl.hex" -v

echo.
echo [3/4] Ecriture des poids de l'IA (network_data.hex)...
"%CLI%" -c port=SWD -el "%LOADER%" --skipErase -w "C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\Model\NUCLEO-N657X0-Q\network_data.hex" -v

echo.
echo [4/4] Ecriture de l'Application a 0x70100000...
"%CLI%" -c port=SWD -el "%LOADER%" --skipErase -w "%ALIGNED_BIN%" 0x70100000 -v

echo.
echo ==============================================
echo TOUT EST TERMINE SANS ERREUR SI AUCUN MESSAGE ROUGE !
echo 1. Le module STM32 a gere lui-meme l'alignement de 0x400 octets !
echo 2. Passez physiquement l'interrupteur sur "Boot From Flash"
echo 3. Debranchez et rebranchez le cable USB (Power Cycle complet)
echo 4. Regardez la console série !!
echo ==============================================
pause

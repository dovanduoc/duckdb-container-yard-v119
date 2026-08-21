@echo off
setlocal
chcp 65001 >nul
title KIEM THU TU DONG HE THONG - FASTAPI VA DUCKDB V119

echo ==============================================================================
echo   QUY TRINH KIEM THU TU DONG TOAN DIEN - FASTAPI VA DUCKDB V119
echo ==============================================================================
echo.

python src\tester.py
if errorlevel 1 goto :failed

echo.
echo --- HTTP INTEGRATION TESTS QUA FASTAPI TESTCLIENT ---
python src\test_api_http.py
if errorlevel 1 goto :failed

echo.
echo [PASS] TOAN BO KIEM THU DA HOAN THANH.
goto :end

:failed
echo.
echo [FAIL] CO KIEM THU KHONG DAT.
exit /b 1

:end
pause

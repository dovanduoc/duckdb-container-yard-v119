@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title HE THONG PHAN TICH CONTAINER TON BAI - DUCKDB VA FASTAPI V119

echo ==============================================================================
echo   HE THONG PHAN TICH VA GIAM SAT CONTAINER TON BAI - DUCKDB VA FASTAPI V119
echo ==============================================================================
echo.

:: 1. Tu dong phat hien phien ban Python thich hop nhat tren he thong
set "PY_CMD="

:: Kiem tra neu co Python 3.12 qua Python Launcher
py -3.12 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3.12"
) else (
    :: Kiem tra neu co Python 3.11
    py -3.11 --version >nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=py -3.11"
    ) else (
        :: Kiem tra neu co Python 3.10
        py -3.10 --version >nul 2>&1
        if %errorlevel% equ 0 (
            set "PY_CMD=py -3.10"
        ) else (
            :: Mac dinh su dung python
            set "PY_CMD=python"
        )
    )
)

echo [1/3] Kiem tra phien ban Python dang su dung...
%PY_CMD% --version
echo.

:: 2. Kiem tra va cai dat thu vien
echo [2/3] Kiem tra moi truong thu vien (FastAPI, DuckDB, Pandas)...
%PY_CMD% -c "import fastapi, uvicorn, duckdb, pandas" 2>nul
if %errorlevel% neq 0 (
    echo [THONG BAO] Dang cai dat thu vien FastAPI, DuckDB, Pandas cho %PY_CMD%...
    %PY_CMD% -m pip install --upgrade pip --quiet --no-warn-script-location
    %PY_CMD% -m pip install --only-binary :all: -r requirements.txt --quiet --no-warn-script-location
    if %errorlevel% neq 0 (
        %PY_CMD% -m pip install --prefer-binary -r requirements.txt --quiet --no-warn-script-location
    )
)
echo       -^> Moi truong Python da san sang 100%%!

echo.
echo [3/3] Chay kiem thu tu dong xac nhan DuckDB Engine...
%PY_CMD% src\tester.py
if %errorlevel% neq 0 (
    echo [CANH BAO] Kiem thu gap loi.
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo   DANG KHOI DONG MAY CHU WEB FASTAPI VA MO TRINH DUYET...
echo ------------------------------------------------------------------------------
echo   Dia chi Web SPA:    http://localhost:8000
echo   Tai lieu Swagger:   http://localhost:8000/docs
echo   Nhan Ctrl + C de dung may chu.
echo ==============================================================================
echo.

%PY_CMD% app_server.py
if %errorlevel% neq 0 (
    echo [LOI] May chu gap su co khi khoi chay.
    pause
)

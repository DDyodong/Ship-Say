@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Safety AI Control

set "PROJECT_DIR=%~dp0"
set "COMPOSE_PROJECT=safety-ai-control"
set "FRONTEND_URL=http://localhost:5173"
set "BACKEND_URL=http://localhost:8180"
set "DOCKER_CLI="
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

if not exist "%PROJECT_DIR%compose.yml" (
    echo [ERROR] compose.yml was not found.
    echo Keep this launcher in the project folder and try again.
    pause
    exit /b 1
)

for /f "delims=" %%D in ('where.exe docker 2^>nul') do if not defined DOCKER_CLI set "DOCKER_CLI=%%D"
if not defined DOCKER_CLI if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "DOCKER_CLI=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not defined DOCKER_CLI if exist "%LocalAppData%\Docker\resources\bin\docker.exe" set "DOCKER_CLI=%LocalAppData%\Docker\resources\bin\docker.exe"

if not defined DOCKER_CLI (
    echo [ERROR] Docker Desktop is not installed or docker.exe could not be found.
    echo Install Docker Desktop, start it once, and then run this file again.
    echo https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo [1/3] Checking Docker Desktop...
"%DOCKER_CLI%" info >nul 2>&1
if errorlevel 1 (
    if exist "%DOCKER_DESKTOP%" (
        echo Starting Docker Desktop. This can take a minute...
        start "" "%DOCKER_DESKTOP%"
        call :wait_for_docker 120
        if errorlevel 1 goto :docker_failed
    ) else (
        goto :docker_failed
    )
)

pushd "%PROJECT_DIR%"

echo [2/3] Building and starting database, backend, and frontend...
"%DOCKER_CLI%" compose -p "%COMPOSE_PROJECT%" up -d --build
if errorlevel 1 goto :start_failed

echo [3/3] Waiting for the services to become ready...
call :wait_for_url "%BACKEND_URL%/api/health" 120
if errorlevel 1 (
    echo [WARN] The backend did not answer before the timeout.
    goto :service_failed
)

call :wait_for_url "%FRONTEND_URL%" 60
if errorlevel 1 (
    echo [WARN] The frontend did not answer before the timeout.
    goto :service_failed
)

echo.
echo All services are running.
echo Frontend: %FRONTEND_URL%
echo Backend : %BACKEND_URL%
echo.
start "" "%FRONTEND_URL%"
echo The browser has been opened.
echo Press any key in this window to stop all services.
pause >nul

echo Stopping all services...
"%DOCKER_CLI%" compose -p "%COMPOSE_PROJECT%" down
popd
echo Done.
timeout /t 2 /nobreak >nul
exit /b 0

:wait_for_docker
for /L %%I in (1,1,%~1) do (
    "%DOCKER_CLI%" info >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1

:wait_for_url
set "WAIT_URL=%~1"
for /L %%I in (1,1,%~2) do (
    powershell.exe -NoLogo -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri $env:WAIT_URL -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; exit 1" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 2 /nobreak >nul
)
exit /b 1

:docker_failed
echo.
echo [ERROR] Docker Desktop is not running.
echo Start Docker Desktop and run this file again.
pause
exit /b 1

:start_failed
echo.
echo [ERROR] The services could not be started.
"%DOCKER_CLI%" compose -p "%COMPOSE_PROJECT%" logs --tail 100
popd
pause
exit /b 1

:service_failed
echo.
echo Recent service logs:
"%DOCKER_CLI%" compose -p "%COMPOSE_PROJECT%" logs --tail 100
echo.
echo Press any key to stop the services.
pause >nul
"%DOCKER_CLI%" compose -p "%COMPOSE_PROJECT%" down
popd
exit /b 1

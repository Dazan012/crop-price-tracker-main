@echo off
REM ============================================================
REM Smart Crops Notification Engine — Windows Scheduled Task
REM ============================================================
REM Usage: Run this script via Windows Task Scheduler
REM
REM To install (run once as Administrator):
REM   schtasks /create /tn "SmartCrops_Notif_Opportunity" /tr "E:\project 1\crop-price-tracker\notification_cron.bat opportunity" /sc minute /mo 10
REM   schtasks /create /tn "SmartCrops_Notif_Price" /tr "E:\project 1\crop-price-tracker\notification_cron.bat price" /sc minute /mo 30
REM   schtasks /create /tn "SmartCrops_Notif_Transport" /tr "E:\project 1\crop-price-tracker\notification_cron.bat transport" /sc minute /mo 60
REM   schtasks /create /tn "SmartCrops_Notif_Personalized" /tr "E:\project 1\crop-price-tracker\notification_cron.bat personalized" /sc minute /mo 60
REM
REM To remove:
REM   schtasks /delete /tn "SmartCrops_Notif_Opportunity" /f
REM   schtasks /delete /tn "SmartCrops_Notif_Price" /f
REM   schtasks /delete /tn "SmartCrops_Notif_Transport" /f
REM   schtasks /delete /tn "SmartCrops_Notif_Personalized" /f
REM
REM To check status:
REM   schtasks /query /tn "SmartCrops_Notif_*"
REM ============================================================

set PROJECT_DIR=E:\project 1\crop-price-tracker
set PYTHON=%PROJECT_DIR%\venv\Scripts\python.exe
set MANAGE=%PROJECT_DIR%\manage.py

set MODE=%~1
if "%MODE%"=="" set MODE=all

echo [%date% %time%] Running notification engine (mode=%MODE%)...
"%PYTHON%" "%MANAGE%" run_notification_engine --mode=%MODE%
echo [%date% %time%] Done.

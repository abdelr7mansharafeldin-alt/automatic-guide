@echo off
title سنترال شرف الدين - تشغيل النظام
echo ======================================================
echo          سنترال شرف الدين - إدارة فودافون كاش
echo ======================================================
echo.
echo جاري تشغيل خادم قاعدة البيانات والواجهات البرمجية...
echo.

:: Start server in background
start /B python server.py

:: Wait 2 seconds for server boot
timeout /t 2 /nobreak >nul

:: Open browser
echo جاري فتح النظام في المتصفح...
start http://localhost:5000/index.html

echo.
echo النظام يعمل الآن بنجاح!
echo يرجى إبقاء هذه النافذة مفتوحة طوال فترة العمل.
echo لإغلاق النظام، يمكنك إغلاق هذه النافذة أو الضغط على Ctrl+C.
echo ======================================================
echo.

:: Keep script window active to show server output
python server.py

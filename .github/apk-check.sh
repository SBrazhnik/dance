#!/bin/bash
# Установка APK в эмулятор, запуск, скриншоты и поиск падений
set -x
mkdir -p out
APK=$(ls apk/*.apk | head -1)
adb install -r "$APK" 2>&1 | tee out/install.txt
adb logcat -c
adb shell am start -W -n ru.danceclub.app/.MainActivity 2>&1 | tee out/start.txt
sleep 3;  adb exec-out screencap -p > out/1-splash.png
sleep 25; adb exec-out screencap -p > out/2-loaded.png
sleep 20; adb exec-out screencap -p > out/3-later.png
# поворот экрана — приложение не должно падать
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1; sleep 6; adb exec-out screencap -p > out/4-landscape.png
adb shell settings put system user_rotation 0; sleep 4
# кнопка «назад» на главном экране — закрыть, затем снова открыть
adb shell input keyevent 4; sleep 2
adb shell am start -W -n ru.danceclub.app/.MainActivity; sleep 15; adb exec-out screencap -p > out/5-reopen.png
adb shell pidof ru.danceclub.app > out/pid.txt || echo "НЕ ЗАПУЩЕНО" > out/pid.txt
adb logcat -d -b crash > out/crash.txt
adb logcat -d | grep -iE "AndroidRuntime|FATAL|chromium.*(error|ERR)|danceclub" | tail -200 > out/logcat.txt
adb shell dumpsys package ru.danceclub.app | grep -E "versionName|versionCode" > out/version.txt
ls -la out
exit 0

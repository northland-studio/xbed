#!/bin/bash
PID=$(systemctl show -p MainPID --value bedwars)
echo "PID=$PID"
ps -o pid,pcpu,rss,etime -p "$PID" 2>/dev/null
echo
echo "=== 线程栈（主线程 / Server thread）==="
/opt/java11/bin/jstack "$PID" 2>/dev/null | awk '/^"Server thread"/,/^$/' | head -40
echo
echo "=== 其他可疑线程（WAITING/BLOCKED 且非空闲）==="
/opt/java11/bin/jstack "$PID" 2>/dev/null | grep -A4 -E '^"(Server thread|Craft Scheduler|main)"' | head -40

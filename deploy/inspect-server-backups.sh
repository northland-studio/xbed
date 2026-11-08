#!/bin/bash
for d in /opt/xbed-bedwars.bak-20261108-013809 /opt/xbed-bedwars.bak-20261108-013905; do
  echo "=== $d ==="
  ls "$d" | head -6
  echo -n '  插件 jar 数: '; ls "$d"/plugins/*.jar 2>/dev/null | wc -l
  echo -n '  XBedSync: '; ls "$d"/plugins/XBedSync.jar 2>/dev/null || echo '无'
  echo -n '  AuthMe: '; ls "$d"/plugins/AuthMe* 2>/dev/null | head -1 || echo '无'
  echo -n '  FairFight: '; ls "$d"/plugins/FairFight* 2>/dev/null | head -1 || echo '无'
  echo -n '  Arenas 备份: '; ls -d "$d"/plugins/BedWars1058/Arenas.bak* 2>/dev/null | head -1 || echo '无'
  echo -n '  debug: '; grep -m1 '^debug:' "$d/plugins/BedWars1058/config.yml" 2>/dev/null || echo '无 config'
  echo -n '  sky minPlayers: '; grep -m1 '^minPlayers:' "$d/plugins/BedWars1058/Arenas/sky.yml" 2>/dev/null || echo '无'
  echo
done

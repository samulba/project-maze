#!/bin/sh
# Setzt den Spielserver-Upstream in die nginx-Konfiguration ein.
# envsubst bekommt bewusst nur diese eine Variable, damit nginx-eigene
# Variablen ($uri, $host, $http_upgrade …) unangetastet bleiben.
set -eu

: "${MAZE_SERVER_UPSTREAM:=server:2567}"
export MAZE_SERVER_UPSTREAM

envsubst '${MAZE_SERVER_UPSTREAM}' \
  < /etc/nginx/maze-default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "maze: proxying /ws and /health to ${MAZE_SERVER_UPSTREAM}"

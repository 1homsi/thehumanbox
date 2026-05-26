#!/usr/bin/env bash
set -euo pipefail

# Installs two systemd user units for the lab on EC2:
#   thb-lab-trace.service  — continuously stream sim traces to JSONL
#   thb-lab-report.timer   — daily report aggregator at 04:00 UTC
#
# Designed to run as a regular user, not root. Logs to journalctl.
#
# Usage:
#   bash install_systemd_units.sh [--user]
#
# After install:
#   systemctl --user start  thb-lab-trace
#   systemctl --user status thb-lab-trace
#   systemctl --user enable thb-lab-report.timer
#   journalctl --user -u thb-lab-trace -f

SCOPE="--user"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)   SCOPE="--user"; shift ;;
    --system) SCOPE="";       shift ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_PY="${LAB_DIR}/.venv/bin/python"

if [[ ! -x "${VENV_PY}" ]]; then
  echo "lab venv not found at ${VENV_PY} — run ec2_bootstrap.sh first" >&2
  exit 1
fi

if [[ "${SCOPE}" == "--user" ]]; then
  UNIT_DIR="${HOME}/.config/systemd/user"
else
  UNIT_DIR="/etc/systemd/system"
fi
mkdir -p "${UNIT_DIR}"

cat > "${UNIT_DIR}/thb-lab-trace.service" <<EOF
[Unit]
Description=The Human Box lab — live trace collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${LAB_DIR}
EnvironmentFile=-%h/.thb-lab.env
ExecStart=${VENV_PY} ${LAB_DIR}/scripts/trace_collector.py --url \${THB_SIM_WS:-ws://localhost:8000/ws} --output ${LAB_DIR}/datasets/captured/live.jsonl
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

cat > "${UNIT_DIR}/thb-lab-report.service" <<EOF
[Unit]
Description=The Human Box lab — daily report aggregator

[Service]
Type=oneshot
WorkingDirectory=${LAB_DIR}
EnvironmentFile=-%h/.thb-lab.env
ExecStart=${VENV_PY} ${LAB_DIR}/scripts/build_report.py
StandardOutput=journal
StandardError=journal
EOF

cat > "${UNIT_DIR}/thb-lab-report.timer" <<EOF
[Unit]
Description=Run the lab daily report aggregator

[Timer]
OnCalendar=04:00 UTC
Persistent=true
Unit=thb-lab-report.service

[Install]
WantedBy=timers.target
EOF

systemctl ${SCOPE} daemon-reload
echo "installed units in ${UNIT_DIR}"
echo "next steps:"
echo "  systemctl ${SCOPE} enable --now thb-lab-trace.service"
echo "  systemctl ${SCOPE} enable --now thb-lab-report.timer"

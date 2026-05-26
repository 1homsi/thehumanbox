#!/usr/bin/env bash
set -euo pipefail

# EC2 bootstrap for thehumanbox lab.
# Idempotent — safe to re-run. Detects Ubuntu / Amazon Linux 2023.
#
# What it does:
#   1) Installs Python 3.11+ + venv + build deps
#   2) Installs the lab package + extras (dev,trace,inference)
#   3) Creates runs/, datasets/, models/cache dirs
#   4) Writes ~/.thb-lab.env with the WS_URL pointing at the sim
#   5) Verifies the install with `make smoke` + `make eval`
#
# Usage:
#   bash ec2_bootstrap.sh [--sim-host <host:port>]
#
# By default expects the sim to be reachable at ws://localhost:8000.
# Override with --sim-host so the trace_collector connects to the
# right place when sim and lab run on separate boxes.

SIM_HOST="${SIM_HOST:-localhost:8000}"
INSTALL_TRAIN="${INSTALL_TRAIN:-0}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sim-host) SIM_HOST="$2"; shift 2 ;;
    --with-train) INSTALL_TRAIN=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\033[1;36m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

if [[ ! -f /etc/os-release ]]; then
  fail "cannot detect OS — /etc/os-release missing"
fi

. /etc/os-release
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"
log "detected OS: ${OS_ID} (${OS_LIKE})"

if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_LIKE" == *"debian"* ]]; then
  log "installing apt packages"
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip python3-dev \
    build-essential pkg-config git curl ca-certificates \
    libssl-dev libffi-dev
elif [[ "$OS_ID" == "amzn" || "$OS_LIKE" == *"rhel"* || "$OS_LIKE" == *"fedora"* ]]; then
  log "installing dnf packages"
  sudo dnf install -y \
    python3.11 python3.11-devel python3-pip \
    gcc gcc-c++ make pkgconf-pkg-config git curl \
    openssl-devel libffi-devel
else
  warn "unrecognised distro ${OS_ID}; trying to continue with whatever python3 exists"
fi

if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 not found after package install"
fi

PY_VERSION="$(python3 --version | awk '{print $2}')"
PY_MAJOR="$(echo "$PY_VERSION" | cut -d. -f1)"
PY_MINOR="$(echo "$PY_VERSION" | cut -d. -f2)"
if (( PY_MAJOR < 3 || (PY_MAJOR == 3 && PY_MINOR < 11) )); then
  fail "python ${PY_VERSION} is too old (need 3.11+)"
fi
log "python ${PY_VERSION} ok"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${LAB_DIR}"

VENV_DIR="${LAB_DIR}/.venv"
if [[ ! -d "${VENV_DIR}" ]]; then
  log "creating venv at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

# shellcheck source=/dev/null
source "${VENV_DIR}/bin/activate"

log "upgrading pip / wheel / setuptools"
pip install --upgrade --quiet pip wheel setuptools

EXTRAS="dev,trace,inference"
if [[ "${INSTALL_TRAIN}" == "1" ]]; then
  EXTRAS="${EXTRAS},train"
  log "installing lab + extras: ${EXTRAS} (train flag enables transformers/peft)"
else
  log "installing lab + extras: ${EXTRAS} (skip --with-train to add training deps)"
fi
pip install --quiet -e ".[${EXTRAS}]"

log "creating workspace directories"
mkdir -p runs datasets/generated datasets/captured models/cache logs

ENV_FILE="${HOME}/.thb-lab.env"
log "writing ${ENV_FILE}"
cat >"${ENV_FILE}" <<EOF
# thehumanbox lab environment
# Source this in your shell:  source ~/.thb-lab.env
export THB_LAB_DIR="${LAB_DIR}"
export THB_SIM_WS="ws://${SIM_HOST}/ws"
export THB_SIM_HTTP="http://${SIM_HOST}"
export PATH="${VENV_DIR}/bin:\$PATH"
EOF

if ! grep -q "thb-lab.env" "${HOME}/.bashrc" 2>/dev/null; then
  echo "" >> "${HOME}/.bashrc"
  echo "# thehumanbox lab" >> "${HOME}/.bashrc"
  echo "[ -f \"\$HOME/.thb-lab.env\" ] && source \"\$HOME/.thb-lab.env\"" >> "${HOME}/.bashrc"
  log "added .thb-lab.env source to ~/.bashrc"
fi

if [[ "${SKIP_VERIFY}" != "1" ]]; then
  log "running verification: make smoke"
  if make smoke; then
    log "smoke OK"
  else
    warn "smoke failed — install is in place but the sample dataset path may need attention"
  fi
  log "running verification: make eval"
  if make eval; then
    log "eval OK"
  else
    warn "eval failed — backend probe may need the dummy backend wired in"
  fi
fi

log "done. open a new shell or run: source ~/.thb-lab.env"
log "test the trace collector with: python scripts/trace_collector.py --url \"\$THB_SIM_WS\""

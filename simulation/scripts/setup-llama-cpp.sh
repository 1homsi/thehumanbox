#!/usr/bin/env bash
# One-shot bootstrap for llama.cpp + a Q4_K_M Gemma 3 270m GGUF on the
# EC2 box (or any Linux dev machine). Idempotent: re-running skips any
# step that's already done.
#
# Targets c7g (Graviton3, ARM64) - llama.cpp's NEON + SVE kernels are
# the reason we chose that instance type - but works on x86_64 too since
# the CMake flag we pass (-DGGML_NATIVE=ON) lets llama.cpp pick its
# best ISA automatically.
#
# What this does:
#   1. Installs build deps (build-essential, cmake, libcurl-dev) if
#      they're not already present. Uses apt; skip the dep step if you
#      already have them.
#   2. Clones (or pulls) llama.cpp into $LLAMA_CPP_DIR.
#   3. CMake-builds llama-cli + llama-server with native CPU flags.
#   4. Downloads gemma-3-270m-it-Q4_K_M.gguf into <llama.cpp>/models/
#      via huggingface-cli (preferred - handles auth + caching) with
#      a curl fallback for ungated mirrors.
#   5. Smoke-tests by booting llama-server, hitting /v1/models, and
#      tearing it back down.
#
# What this does NOT do (deliberate - we keep EC2 hand-bootstrapped):
#   - Install a systemd unit. There's an example unit file at
#     scripts/llama-server.service.example you can `sudo cp` and
#     `systemctl enable` yourself when you're ready to make it
#     persistent.
#   - Modify the running simulation. After verifying llama-server is
#     up, point the sim at it with:
#       export LLM_URL=http://127.0.0.1:8080/v1
#       export LLM_MODEL=gemma-3-270m-it
#       export LLM_KEY=local
#
# Env knobs (all optional, sane defaults):
#   LLAMA_CPP_DIR   where to clone (default: $HOME/llama.cpp)
#   LLAMA_REF       llama.cpp git ref (default: master)
#   GEMMA_REPO      HF repo holding the GGUF (default: ggml-org/gemma-3-270m-it-GGUF)
#   GEMMA_FILE      filename inside that repo (default: gemma-3-270m-it-Q4_K_M.gguf)
#   SKIP_DEPS=1     skip apt install (use if you don't have sudo)
#   SKIP_SMOKE=1    skip the boot+curl smoke test at the end

set -euo pipefail

LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$HOME/llama.cpp}"
LLAMA_REF="${LLAMA_REF:-master}"
# unsloth's GGUF mirror is the most reliable ungated source for the
# Gemma 3 270m IT Q4_K_M file. ggml-org's path existed historically
# but currently 404s; bartowski is a fine fallback with a different
# naming convention - override via GEMMA_REPO / GEMMA_FILE.
GEMMA_REPO="${GEMMA_REPO:-unsloth/gemma-3-270m-it-GGUF}"
GEMMA_FILE="${GEMMA_FILE:-gemma-3-270m-it-Q4_K_M.gguf}"
SKIP_DEPS="${SKIP_DEPS:-0}"
SKIP_SMOKE="${SKIP_SMOKE:-0}"

MODELS_DIR="$LLAMA_CPP_DIR/models"
MODEL_PATH="$MODELS_DIR/$GEMMA_FILE"
BUILD_DIR="$LLAMA_CPP_DIR/build"
SERVER_BIN="$BUILD_DIR/bin/llama-server"

arch_name="$(uname -m)"
echo "==> Detected arch: $arch_name"
case "$arch_name" in
  aarch64|arm64) echo "    Native target: ARM64 (NEON + SVE on Graviton3)" ;;
  x86_64|amd64)  echo "    Native target: x86_64 (AVX2/AVX-512 if present)" ;;
  *)             echo "    Unknown arch - GGML_NATIVE will still try its best" ;;
esac

# ── 1. Build deps ────────────────────────────────────────────────────────
if [[ "$SKIP_DEPS" != "1" ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "==> Installing build deps via apt (sudo required)"
    sudo apt-get update -y
    sudo apt-get install -y --no-install-recommends \
      build-essential cmake git curl ca-certificates \
      libcurl4-openssl-dev pkg-config python3-pip
  else
    echo "==> apt-get not found - skipping dep install. Make sure you have:"
    echo "    build-essential, cmake, git, curl, libcurl-openssl-dev, python3-pip"
  fi
else
  echo "==> SKIP_DEPS=1, not touching apt"
fi

# ── 2. Clone / update llama.cpp ───────────────────────────────────────────
if [[ -d "$LLAMA_CPP_DIR/.git" ]]; then
  echo "==> llama.cpp already cloned at $LLAMA_CPP_DIR, fetching latest"
  git -C "$LLAMA_CPP_DIR" fetch --tags --quiet
  git -C "$LLAMA_CPP_DIR" checkout "$LLAMA_REF"
  git -C "$LLAMA_CPP_DIR" pull --ff-only --quiet || true
else
  echo "==> Cloning llama.cpp into $LLAMA_CPP_DIR"
  git clone --depth 1 --branch "$LLAMA_REF" https://github.com/ggml-org/llama.cpp.git "$LLAMA_CPP_DIR"
fi

# ── 3. Build ──────────────────────────────────────────────────────────────
# -DGGML_NATIVE=ON: pick the best ISA for the host (NEON/SVE on Graviton,
#   AVX2/AVX-512 on Intel/AMD). The single biggest perf knob.
# -DLLAMA_CURL=ON: let llama-server pull models by HF id at runtime if you
#   ever want to swap models without re-running this script.
# -DCMAKE_BUILD_TYPE=Release: matters - debug builds are 5-10x slower.
if [[ -x "$SERVER_BIN" ]] && [[ "${REBUILD:-0}" != "1" ]]; then
  echo "==> llama-server already built at $SERVER_BIN, skipping (REBUILD=1 to force)"
else
  echo "==> Configuring + building llama.cpp (this takes a few minutes)"
  cmake -S "$LLAMA_CPP_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DGGML_NATIVE=ON \
    -DLLAMA_CURL=ON
  cmake --build "$BUILD_DIR" --config Release --target llama-server llama-cli -j "$(nproc)"
fi

# ── 4. Download the Gemma 3 270m Q4_K_M GGUF ──────────────────────────────
# Tries three paths in order:
#   1. `hf download` (huggingface_hub >= 1.0, the modern CLI)
#   2. `huggingface-cli download` (legacy huggingface_hub < 1.0)
#   3. direct curl from the HF resolve URL
# Each path is sandboxed with `if ! ... ; then` so we can fall through
# to the next on failure instead of `set -e` killing the whole script.
# Anonymous downloads work for ungated mirrors (unsloth, bartowski);
# the official google/gemma-3 repo is gated and needs `hf auth login`.
mkdir -p "$MODELS_DIR"
if [[ -s "$MODEL_PATH" ]]; then
  echo "==> Model already present at $MODEL_PATH ($(du -h "$MODEL_PATH" | cut -f1))"
else
  echo "==> Fetching $GEMMA_REPO/$GEMMA_FILE"
  hf_url="https://huggingface.co/$GEMMA_REPO/resolve/main/$GEMMA_FILE"
  fetched=0
  if command -v hf >/dev/null 2>&1; then
    echo "    -> hf download (modern CLI)"
    if hf download "$GEMMA_REPO" "$GEMMA_FILE" --local-dir "$MODELS_DIR"; then
      fetched=1
    else
      echo "    hf download failed, trying next method"
    fi
  fi
  if [[ "$fetched" -eq 0 ]] && command -v huggingface-cli >/dev/null 2>&1; then
    echo "    -> huggingface-cli (legacy)"
    # Suppress the deprecation-warning noise but keep stderr if it actually fails.
    if huggingface-cli download "$GEMMA_REPO" "$GEMMA_FILE" \
        --local-dir "$MODELS_DIR" --local-dir-use-symlinks False 2>/dev/null; then
      fetched=1
    else
      echo "    huggingface-cli failed, trying next method"
    fi
  fi
  if [[ "$fetched" -eq 0 ]]; then
    echo "    -> direct curl from $hf_url"
    if curl -L --fail --progress-bar -o "$MODEL_PATH" "$hf_url"; then
      fetched=1
    fi
  fi
  if [[ "$fetched" -eq 0 ]] || [[ ! -s "$MODEL_PATH" ]]; then
    echo "!! All download methods failed."
    echo "   Check HF access; gated repos need:  hf auth login"
    echo "   Or override with:  GEMMA_REPO=... GEMMA_FILE=...  re-run"
    exit 1
  fi
  echo "    Saved $(du -h "$MODEL_PATH" | cut -f1) -> $MODEL_PATH"
fi

# ── 5. Smoke test ─────────────────────────────────────────────────────────
if [[ "$SKIP_SMOKE" != "1" ]]; then
  echo "==> Smoke-testing llama-server (boot, /v1/models, shutdown)"
  log="$(mktemp)"
  "$SERVER_BIN" \
    --model "$MODEL_PATH" \
    --host 127.0.0.1 --port 8080 \
    --ctx-size 4096 \
    --n-predict 64 \
    --threads "$(nproc)" \
    >"$log" 2>&1 &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true; rm -f "$log"' EXIT

  # llama-server prints "main: server is listening" once it's ready.
  for _ in $(seq 1 60); do
    if grep -q "server is listening" "$log" 2>/dev/null; then break; fi
    sleep 1
  done

  if ! grep -q "server is listening" "$log" 2>/dev/null; then
    echo "!! llama-server didn't come up in 60s. Tail of log:"
    tail -n 30 "$log"
    exit 1
  fi

  echo "    /v1/models response:"
  curl -fsS http://127.0.0.1:8080/v1/models | head -c 500
  echo
  echo "    Tearing down smoke-test server."
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - EXIT
  rm -f "$log"
fi

# ── Done ──────────────────────────────────────────────────────────────────
cat <<EOF

==> Ready.

    Start the server (foreground):
      $SERVER_BIN \\
        --model $MODEL_PATH \\
        --host 127.0.0.1 --port 8080 \\
        --ctx-size 4096 \\
        --threads $(nproc)

    Point the sim at it:
      export LLM_URL=http://127.0.0.1:8080/v1
      export LLM_MODEL=gemma-3-270m-it
      export LLM_KEY=local

    Quick sanity from outside the process:
      curl -s http://127.0.0.1:8080/v1/chat/completions \\
        -H 'Content-Type: application/json' \\
        -d '{"model":"gemma-3-270m-it","messages":[{"role":"user","content":"one short thought, under 12 words"}]}'

    Make it persistent (manual, our convention):
      sudo cp scripts/llama-server.service.example /etc/systemd/system/llama-server.service
      sudo systemctl daemon-reload && sudo systemctl enable --now llama-server
EOF

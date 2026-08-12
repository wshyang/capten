#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scripts/setup_onnx_toolchain.sh
#
# One-shot host bootstrap for the ONNX conversion pipeline. Creates a Python
# venv at .venv-onnx/ and installs the pinned tf2onnx toolchain into it.
#
# Idempotent: safe to re-run. Will only reinstall if the pinned manifest
# under .venv-onnx/.installed-versions is missing or stale.
#
# Usage:
#     ./scripts/setup_onnx_toolchain.sh            # install / repair
#     ./scripts/setup_onnx_toolchain.sh --force    # blow away venv & reinstall
#     ./scripts/setup_onnx_toolchain.sh --check    # verify only (exit 1 if bad)
#
# Requirements the host must already provide:
#     * python3 (>= 3.9, < 3.13)  --  tf-cpu + tf2onnx don't yet support 3.13
#     * python3-venv               --  Debian/Ubuntu split this out; auto apt-installed
#     * ~2 GB free disk space      --  TensorFlow wheel is fat
# ---------------------------------------------------------------------------

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv-onnx"
MARK_FILE="${VENV_DIR}/.installed-versions"

# ---- Pinned versions -------------------------------------------------------
# Do NOT bump these casually. tf2onnx has a very narrow supported TF range and
# newer TensorFlow releases regularly break the ONNX export path. The pins
# below are the last combination verified to produce a bit-identical fp32
# ONNX graph for our 32/64-channel dual-head ResNet.
#
# The "PINNED_MANIFEST" string is written into MARK_FILE after a successful
# install and used to detect stale venvs on subsequent runs.
readonly PIN_TF="tensorflow-cpu==2.16.2"
readonly PIN_TFJS_CONVERTER="tensorflowjs==4.22.0"
readonly PIN_TF2ONNX="tf2onnx==1.16.1"
readonly PIN_ONNX="onnx==1.16.2"
readonly PIN_ONNXSIM="onnxsim==0.4.36"
readonly PIN_ORT="onnxruntime==1.19.2"
readonly PINNED_MANIFEST="${PIN_TF};${PIN_TFJS_CONVERTER};${PIN_TF2ONNX};${PIN_ONNX};${PIN_ONNXSIM};${PIN_ORT}"

log()  { printf "\033[1;34m[onnx-setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[onnx-setup]\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[1;31m[onnx-setup ERROR]\033[0m %s\n" "$*" >&2; exit 1; }

# ---- Argument parsing ------------------------------------------------------
MODE="install"
for arg in "$@"; do
  case "$arg" in
    --force) MODE="force" ;;
    --check) MODE="check" ;;
    -h|--help)
      sed -n '3,25p' "$0"
      exit 0
      ;;
    *) fail "Unknown flag: $arg (see --help)" ;;
  esac
done

# ---- Host prerequisites ----------------------------------------------------
command -v python3 >/dev/null 2>&1 || fail "python3 not found on PATH."

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
case "${PY_VER}" in
  3.9|3.10|3.11|3.12) : ;;
  *) fail "Python ${PY_VER} is not supported by tf2onnx 1.16 (need 3.9–3.12)." ;;
esac

# On Debian/Ubuntu, `python3 -m venv` needs the python3-venv package. Detect
# and auto-install it via sudo if we're allowed. On systems without sudo we
# print the manual command and abort.
if ! python3 -m venv --help >/dev/null 2>&1; then
  warn "python3-venv module not available."
  if command -v apt-get >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      log "Installing python3-venv via sudo apt-get…"
      sudo apt-get update -qq
      sudo apt-get install -y --no-install-recommends "python3-venv"
    else
      fail "Please run: sudo apt-get install -y python3-venv    (then re-run this script)"
    fi
  else
    fail "python3-venv missing and no apt-get available. Install it via your OS package manager."
  fi
fi

# ---- Check mode: verify existing venv only ---------------------------------
if [[ "${MODE}" == "check" ]]; then
  [[ -d "${VENV_DIR}" ]] || fail "venv missing at ${VENV_DIR}"
  [[ -f "${MARK_FILE}" ]] || fail "venv exists but was not installed by this script (missing ${MARK_FILE})"
  ACTUAL=$(cat "${MARK_FILE}")
  if [[ "${ACTUAL}" != "${PINNED_MANIFEST}" ]]; then
    fail "venv pinned versions drifted. Expected: ${PINNED_MANIFEST}. Found: ${ACTUAL}"
  fi
  log "OK — venv at ${VENV_DIR} matches pinned manifest."
  exit 0
fi

# ---- Force mode: rm -rf the venv ------------------------------------------
if [[ "${MODE}" == "force" ]]; then
  log "--force: removing existing venv at ${VENV_DIR}"
  rm -rf "${VENV_DIR}"
fi

# ---- Skip reinstall if already good ---------------------------------------
if [[ -f "${MARK_FILE}" ]] && [[ "$(cat "${MARK_FILE}")" == "${PINNED_MANIFEST}" ]]; then
  log "Toolchain already installed and pinned versions match. Nothing to do."
  log "  (Pass --force to reinstall from scratch, or --check to verify.)"
  exit 0
fi

# ---- Create venv -----------------------------------------------------------
if [[ ! -d "${VENV_DIR}" ]]; then
  log "Creating Python venv at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

log "Upgrading pip / wheel inside venv (pinning setuptools for pkg_resources compatibility)"
pip install --quiet --upgrade pip wheel

# tensorflow_hub (a transitive dep of `tensorflowjs`) still does
# `from pkg_resources import parse_version`. pkg_resources was removed from
# setuptools 71+, so if we let pip pull the latest setuptools tensorflowjs's
# converter dies at import time. Pin to the last setuptools that still ships
# pkg_resources.
pip install --quiet "setuptools<70"

# ---- Install pinned toolchain ---------------------------------------------
# tensorflow-cpu is installed FIRST so tf2onnx's binary wheel resolves against
# the right TF version. onnxsim's C++ build wheel is prebuilt on PyPI for the
# supported Pythons, so this should be pip-only (no compiler needed).
log "Installing pinned ONNX conversion toolchain (this can take 2–4 minutes)…"
pip install --quiet \
  "${PIN_TF}" \
  "${PIN_TFJS_CONVERTER}" \
  "${PIN_TF2ONNX}" \
  "${PIN_ONNX}" \
  "${PIN_ONNXSIM}" \
  "${PIN_ORT}"

# ---- Smoke test ------------------------------------------------------------
log "Smoke-testing tf2onnx CLI"
python -c "import tf2onnx, onnx, onnxsim, onnxruntime, tensorflow as tf; \
print(f'tf={tf.__version__} tf2onnx={tf2onnx.__version__} onnx={onnx.__version__} onnxruntime={onnxruntime.__version__}')"

command -v tensorflowjs_converter >/dev/null 2>&1 \
  || fail "tensorflowjs_converter CLI missing after install. Check pip logs above."

log "Smoke-testing tensorflowjs_converter CLI (must import cleanly)"
# --help is safe: it does the full import graph without needing an input file.
if ! tensorflowjs_converter --help > /dev/null 2>&1; then
  warn "tensorflowjs_converter --help failed. Full error follows:"
  tensorflowjs_converter --help || true
  fail "tensorflowjs_converter cannot import its dependencies. This usually means a setuptools/pkg_resources mismatch; delete .venv-onnx and re-run with --force."
fi

# ---- Persist success marker ------------------------------------------------
printf '%s' "${PINNED_MANIFEST}" > "${MARK_FILE}"
log "✅  ONNX toolchain ready at ${VENV_DIR}"
log ""
log "Next step — convert your checkpoints:"
log "    ./scripts/setup_onnx_toolchain.sh   # (no-op, verifies install)"
log "    npm run onnx:convert                # runs scripts/convert_checkpoint_to_onnx.ts"
log ""
log "Or invoke directly:"
log "    node --loader ts-node/esm scripts/convert_checkpoint_to_onnx.ts"

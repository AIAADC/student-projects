#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/AIMFllyYS/0-1-CLI.git"
DEFAULT_DIR="${HOME}/zero-one-cli"
MIN_NODE_MAJOR=18
SKIP_CONFIRM="${SKIP_CONFIRM:-false}"

confirm_step() {
  local message="$1"
  if [[ "${SKIP_CONFIRM}" == "true" ]]; then
    return 0
  fi
  read -r -p "${message} [Y/n] " response
  [[ -z "${response}" || "${response}" == "Y" || "${response}" == "y" ]]
}

write_header() {
  printf "\n========================================\n"
  printf "  %s\n" "$1"
  printf "========================================\n"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

node_major() {
  if has_command node; then
    node --version | sed -E 's/^v([0-9]+).*/\1/'
  else
    printf "0"
  fi
}

install_hint() {
  local name="$1"
  printf "\n%s is required.\n" "${name}"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf "Install it with Homebrew or the official installer.\n"
  else
    printf "Install it with your system package manager or the official installer.\n"
  fi
}

write_header "0-1 CLI installer"
printf "Repository: %s\n" "${REPO_URL}"
printf "\nThis script will check Git/Node.js, clone or reuse the repo, build it, and register the global hi command.\n"

if ! confirm_step "Start installation?"; then
  printf "Installation cancelled.\n"
  exit 0
fi

write_header "Check Git"
if has_command git; then
  git --version
else
  install_hint "Git"
  exit 1
fi

write_header "Check Node.js"
major="$(node_major)"
if [[ "${major}" -lt "${MIN_NODE_MAJOR}" ]]; then
  install_hint "Node.js >= ${MIN_NODE_MAJOR}"
  exit 1
fi
node --version

if ! has_command npm; then
  install_hint "npm"
  exit 1
fi

write_header "Prepare repository"
install_dir="${INSTALL_DIR:-}"
if [[ -z "${install_dir}" ]]; then
  read -r -p "Install directory [default: ${DEFAULT_DIR}] " install_dir
  install_dir="${install_dir:-${DEFAULT_DIR}}"
fi

if [[ -d "${install_dir}/.git" ]]; then
  printf "Using existing repository: %s\n" "${install_dir}"
  cd "${install_dir}"
  if confirm_step "Pull latest changes?"; then
    git pull --ff-only
  fi
elif [[ -e "${install_dir}" ]]; then
  printf "Directory already exists and is not a git repository: %s\n" "${install_dir}"
  exit 1
else
  if confirm_step "Clone repository to ${install_dir}?"; then
    git clone "${REPO_URL}" "${install_dir}"
    cd "${install_dir}"
  else
    printf "Installation cancelled.\n"
    exit 1
  fi
fi

write_header "Install dependencies"
if confirm_step "Run npm install?"; then
  npm install
fi

write_header "Build"
if confirm_step "Run npm run build?"; then
  npm run build
fi

write_header "Register hi command"
if confirm_step "Run npm link to register hi globally?"; then
  npm link
fi

write_header "Done"
printf "Try:\n"
printf "  hi --help\n"
printf "  hi --chat\n"
printf "  hi --paths\n"

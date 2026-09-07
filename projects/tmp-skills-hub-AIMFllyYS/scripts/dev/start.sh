#!/usr/bin/env sh
# skill-hub 一键启动脚本（Linux / macOS / Git Bash）。
#
# 用法:
#   ./scripts/dev/start.sh [OPTIONS]
#
# 选项:
#   -h, --help            显示本帮助信息
#   --home <path>         库存基座目录(默认 ~/.skills-hub)
#   --port <port>         本地面板端口(默认 4321)
#   --yes                 非交互环境显式授权全部写操作
#   --skip-install        跳过 pnpm install,只执行 build + bootstrap
#
# 示例:
#   ./scripts/dev/start.sh --home /tmp/skill-hub-sandbox --port 4322 --yes

set -e

HOME_DIR=""
PORT="4321"
YES=""
SKIP_INSTALL=""

print_help() {
  sed -n '2,15p' "$0" | sed 's/^# //'
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    --home)
      HOME_DIR="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --yes)
      YES="1"
      shift
      ;;
    --skip-install)
      SKIP_INSTALL="1"
      shift
      ;;
    *)
      echo "未知参数: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

# 0. 环境检查
echo "== 检查运行环境 =="

if ! command -v node >/dev/null 2>&1; then
  echo "node 未安装。请先安装 Node.js >= 22: https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR=$(node --version | sed -E 's/^v([0-9]+).*/\1/')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "node 版本过低: $(node --version),需要 >= 22。" >&2
  exit 1
fi
echo "node: $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 未安装。请先安装: npm install -g pnpm" >&2
  exit 1
fi
echo "pnpm: $(pnpm --version)"

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO_ROOT"

# 1. 安装依赖
if [ -z "$SKIP_INSTALL" ]; then
  echo "== 安装依赖 =="
  pnpm install
fi

# 2. 构建全仓
echo "== 构建全仓 =="
pnpm build

# 3. 组装 bootstrap 参数
BOOTSTRAP_ARGS="node packages/cli/dist/index.js bootstrap --port $PORT"
if [ -n "$HOME_DIR" ]; then
  BOOTSTRAP_ARGS="$BOOTSTRAP_ARGS --home $HOME_DIR"
fi
if [ -n "$YES" ]; then
  BOOTSTRAP_ARGS="$BOOTSTRAP_ARGS --yes"
fi

# 4. 一键启动
echo "== 启动 skill-hub =="
echo "执行: $BOOTSTRAP_ARGS"
eval "$BOOTSTRAP_ARGS"

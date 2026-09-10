#!/usr/bin/env bash
#
# 部署脚本：doc 帮助文档（VitePress）本地构建 -> SSH/rsync 同步到服务器
#
# 站点 base 为 /testdog-doc/（见 docs/.vitepress/config.mts），
# 服务器 nginx 需把 /testdog-doc/ 映射到 DEPLOY_PATH 目录，例如：
#   location /testdog-doc/ { alias /opt/testdog/doc/; try_files $uri $uri/ $uri/index.html; }
# 服务器没装 rsync 时脚本自动降级为 tar 管道部署（等效 --delete，旧文件不残留）
#
# 用法：
#   ./deploy.sh                          # 构建 + 同步
#   ./deploy.sh --no-build               # 跳过本地构建，直接同步已有产物
#   ./deploy.sh --dry-run                # 试运行（rsync -n，不实际写入远端）
#   ./deploy.sh --no-backup              # 跳过备份询问
#   ./deploy.sh --env-file .env.prod     # 指定其它配置文件（默认读取 .env.deploy）
#
# 必填配置（环境变量 / 命令行参数 / .env.deploy 文件，三者任选其一）：
#   DEPLOY_HOST   服务器 IP 或域名        （等价于 --host）
#   DEPLOY_PATH   服务器部署目录          （等价于 --path，默认 /opt/testdog/doc）
#
# 可选配置：
#   DEPLOY_USER         SSH 用户（默认 root）          （等价于 --user）
#   DEPLOY_PORT         SSH 端口（默认 22）            （等价于 --port）
#   SSH_KEY             私钥路径                       （等价于 --key）
#   DEPLOY_PASS         SSH 密码（密码登录）            写入 .env.deploy，需本机装 sshpass
#   DEPLOY_BACKUP_DIR   备份目录，默认与 DEPLOY_PATH 同级（$(dirname DEPLOY_PATH)/.backups）
#   DEPLOY_EXCLUDE      rsync 排除规则（| 分隔，匹配产物内相对路径）
#   DEPLOY_KEEP_BACKUPS 保留历史版本份数（默认 5）
#
# 优先级：命令行参数 > 环境变量 > .env.deploy 文件 > 脚本默认值
#
set -euo pipefail

# 脚本所在目录即 doc/ 目录（文档站点根）
DOC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# VitePress 构建产物目录
DIST_DIR="$DOC_DIR/docs/.vitepress/dist"
# 部署配置文件：脚本启动时自动读取（可用 --env-file 覆盖）
ENV_FILE="$DOC_DIR/.env.deploy"
ENV_FILE_EXPLICIT=0

# 行为开关
DO_BUILD=1
DO_BACKUP=1
DO_DRY_RUN=0

# ───────────────────────── 颜色输出 ─────────────────────────
if [[ -t 1 ]]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_RESET=$'\033[0m'
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_RESET=""
fi
info() { printf "%s==> %s%s\n" "$C_CYAN" "$C_RESET" "$*"; }
ok()   { printf "%s✓ %s%s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s! %s%s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s✗ %s%s\n" "$C_RED"   "$C_RESET" "$*" >&2; }
step() { printf "\n%s▶ %s%s%s\n" "$C_BOLD" "$C_CYAN" "$*" "$C_RESET"; }

# 读取部署配置文件（.env.deploy）；环境变量 / 命令行参数已设置的值不被文件覆盖
load_deploy_env() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  # 记录当前值（环境变量 / 命令行参数优先于文件）
  local _h="${DEPLOY_HOST-}" _u="${DEPLOY_USER-}" _p="${DEPLOY_PORT-}" _pa="${DEPLOY_PATH-}" _k="${SSH_KEY-}" _pw="${DEPLOY_PASS-}"
  # shellcheck disable=SC1090
  source "$f" || { err "读取配置文件失败，请检查语法: $f"; exit 1; }
  if [[ -n "$_h"  ]]; then DEPLOY_HOST="$_h";  fi
  if [[ -n "$_u"  ]]; then DEPLOY_USER="$_u";  fi
  if [[ -n "$_p"  ]]; then DEPLOY_PORT="$_p";  fi
  if [[ -n "$_pa" ]]; then DEPLOY_PATH="$_pa"; fi
  if [[ -n "$_k"  ]]; then SSH_KEY="$_k";      fi
  if [[ -n "$_pw" ]]; then DEPLOY_PASS="$_pw"; fi
}

# ───────────────────────── 参数解析 ─────────────────────────
usage() {
  cat <<'EOF'
用法：
  ./deploy.sh                          # 构建 + 同步
  ./deploy.sh --no-build               # 跳过本地构建，直接同步已有产物
  ./deploy.sh --dry-run                # 试运行（rsync -n，不实际写入远端）
  ./deploy.sh --no-backup              # 跳过备份询问
  ./deploy.sh --env-file .env.prod     # 指定其它配置文件（默认读取 .env.deploy）

配置优先级：命令行参数 > 环境变量 > .env.deploy 文件 > 脚本默认值
服务器地址 / 路径等写入 doc/.env.deploy 后即可直接 ./deploy.sh。

可配置项（环境变量 / .env.deploy 均可）：
  DEPLOY_HOST   服务器 IP 或域名（必填）   --host
  DEPLOY_PATH   服务器部署目录            --path   （默认 /opt/testdog/doc，nginx 的 /testdog-doc/ 需映射到这里）
  DEPLOY_USER   SSH 用户                  --user   （默认 root）
  DEPLOY_PORT   SSH 端口                  --port   （默认 22）
  SSH_KEY       私钥路径（密钥登录）       --key
  DEPLOY_PASS   SSH 密码（密码登录）       写入 .env.deploy，需本机装 sshpass
  DEPLOY_BACKUP_DIR   备份目录（默认 $(dirname DEPLOY_PATH)/.backups，与部署目录同级）
  DEPLOY_EXCLUDE   rsync 排除规则（| 分隔，匹配产物内相对路径）
  DEPLOY_KEEP_BACKUPS   服务器端保留历史版本份数（默认 5）
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)        DO_BUILD=0; shift ;;
    --no-backup)       DO_BACKUP=0; shift ;;
    --dry-run)         DO_DRY_RUN=1; shift ;;
    --host)            DEPLOY_HOST="$2"; shift 2 ;;
    --host=*)          DEPLOY_HOST="${1#--host=}"; shift ;;
    --path)            DEPLOY_PATH="$2"; shift 2 ;;
    --path=*)          DEPLOY_PATH="${1#--path=}"; shift ;;
    --user)            DEPLOY_USER="$2"; shift 2 ;;
    --user=*)          DEPLOY_USER="${1#--user=}"; shift ;;
    --port)            DEPLOY_PORT="$2"; shift 2 ;;
    --port=*)          DEPLOY_PORT="${1#--port=}"; shift ;;
    --key)             SSH_KEY="$2"; shift 2 ;;
    --key=*)           SSH_KEY="${1#--key=}"; shift ;;
    --env-file)        ENV_FILE="$2"; ENV_FILE_EXPLICIT=1; shift 2 ;;
    --env-file=*)      ENV_FILE="${1#--env-file=}"; ENV_FILE_EXPLICIT=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *) err "未知参数: $1"; usage; exit 1 ;;
  esac
done

# 读取部署配置文件（环境变量 / 命令行参数优先于文件）
load_deploy_env "$ENV_FILE"
if [[ $ENV_FILE_EXPLICIT = 1 && ! -f "$ENV_FILE" ]]; then
  warn "配置文件不存在: ${ENV_FILE}（将使用环境变量 / 命令行参数）"
fi

# 应用脚本默认值（仅填充未设置的项）
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/testdog/doc}"
SSH_KEY="${SSH_KEY:-}"
DEPLOY_PASS="${DEPLOY_PASS:-}"
DEPLOY_EXCLUDE="${DEPLOY_EXCLUDE:-".DS_Store"}"
DEPLOY_KEEP_BACKUPS="${DEPLOY_KEEP_BACKUPS:-5}"
# 备份目录默认放在 DEPLOY_PATH 的同级（如 doc -> .backups 在 doc 的父目录下）
DEPLOY_BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$(dirname "$DEPLOY_PATH")/.backups}"

[[ -n "$DEPLOY_HOST" ]] || { err "必须指定服务器地址：在 .env.deploy 中设置 DEPLOY_HOST，或用 --host，或导出 DEPLOY_HOST 环境变量"; usage; exit 1; }

# ───────────────────────── SSH / rsync 公共参数 ─────────────────────────
SSH_OPTS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
[[ -n "$SSH_KEY" && -f "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -n "${DEPLOY_PASS:-}" ]]; then
  # 密码登录：用 sshpass 注入；-e 从 SSHPASS 环境变量读取，避免密码出现在命令行/ps
  if ! command -v sshpass >/dev/null 2>&1; then
    err "已配置 DEPLOY_PASS 但未安装 sshpass"
    printf "  macOS:  brew install hudochenkov/sshpass/sshpass\n" >&2
    printf "  Ubuntu: apt install sshpass\n" >&2
    exit 1
  fi
  export SSHPASS="$DEPLOY_PASS"
  RSYNC_E="sshpass -e ssh ${SSH_OPTS[*]}"
else
  RSYNC_E="ssh ${SSH_OPTS[*]}"
fi

# 远程命令执行（按需注入 sshpass / 端口 / 私钥）
rssh() {
  if [[ -n "${DEPLOY_PASS:-}" ]]; then
    sshpass -e ssh "${SSH_OPTS[@]}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$@"
  fi
}

# 时间戳（macOS / Linux 兼容）
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"

# 把 | 分隔的排除规则展开为 rsync 多 --exclude
rsync_exclude_args() {
  local args=()
  if [[ -n "$DEPLOY_EXCLUDE" ]]; then
    IFS='|' read -r -a patterns <<< "$DEPLOY_EXCLUDE"
    for p in "${patterns[@]}"; do
      args+=(--exclude="$p")
    done
  fi
  # ${args[@]+...} 写法：macOS 自带 bash 3.2 在 set -u 下展开空数组会报 unbound variable
  printf '%s\n' ${args[@]+"${args[@]}"}
}

# ───────────────────────── 构建 ─────────────────────────
build_all() {
  step "构建帮助文档（VitePress）"
  # 依赖缺失时先安装（doc/ 有 package-lock.json，用 npm ci 保证可复现）
  if [[ ! -d "$DOC_DIR/node_modules" ]]; then
    info "doc/node_modules 不存在，先安装依赖（npm ci）"
    (cd "$DOC_DIR" && npm ci --no-audit --no-fund)
  fi
  local start; start=$(date +%s)
  (cd "$DOC_DIR" && npm run build)
  local end; end=$(date +%s)
  ok "构建完成，耗时 $((end - start))s"

  [[ -d "$DIST_DIR" ]] || { err "缺少编译产物 $DIST_DIR"; return 1; }

  # 显示产物大小
  du -sh "$DIST_DIR" 2>/dev/null | sed 's/^/    /'
}

# ───────────────────────── 备份 ─────────────────────────
backup_remote() {
  [[ $DO_BACKUP -eq 1 ]] || { info "跳过备份（--no-backup）"; return 0; }

  if ! rssh "$REMOTE" "test -d $DEPLOY_PATH" >/dev/null 2>&1; then
    info "服务器端无已部署内容，无需备份"
    return 0
  fi

  printf "%s? 部署前是否备份服务器上当前版本?%s [y/N] " "$C_YELLOW" "$C_RESET"
  read -r ans
  [[ "${ans:-N}" =~ ^[Yy]$ ]] || { info "跳过备份"; return 0; }

  step "备份服务器当前版本到 $DEPLOY_BACKUP_DIR"
  rssh "$REMOTE" "DEPLOY_PATH='$DEPLOY_PATH' BAK_PARENT='$DEPLOY_BACKUP_DIR' KEEP='$DEPLOY_KEEP_BACKUPS' TS='$TIMESTAMP' bash -s" <<'REMOTE_EOF'
set -e
DEPLOY_PATH="${DEPLOY_PATH:?}"
BAK_PARENT="${BAK_PARENT:?}"
KEEP="${KEEP:-5}"
BAK_DIR="$BAK_PARENT/backup-$TS"
mkdir -p "$BAK_PARENT"
rm -f "$BAK_PARENT/latest"
# 整目录复制（cp -a 保留权限/链接）；容许少量文件读不到
cp -a "$DEPLOY_PATH/." "$BAK_DIR/" 2>/dev/null || true
ln -s "$BAK_DIR" "$BAK_PARENT/latest"
# 仅保留最近 KEEP 份
ls -1t "$BAK_PARENT" | grep '^backup-' | tail -n +$((KEEP + 1)) | while read -r d; do
  rm -rf "$BAK_PARENT/$d"
done
echo "  备份到：$BAK_DIR"
echo "  当前保留份数：$(ls -1 "$BAK_PARENT" | grep -c '^backup-')"
REMOTE_EOF
  ok "备份完成"
}

# ───────────────────────── 同步产物 ─────────────────────────
ensure_remote_dirs() {
  info "确保远端目录存在: $DEPLOY_PATH  与  $DEPLOY_BACKUP_DIR"
  rssh "$REMOTE" "mkdir -p '$DEPLOY_PATH' '$DEPLOY_BACKUP_DIR'"
}

# 检测远端是否有 rsync（结果缓存，避免重复连接）
REMOTE_HAS_RSYNC=""
remote_has_rsync() {
  if [[ -z "$REMOTE_HAS_RSYNC" ]]; then
    if rssh "$REMOTE" "command -v rsync >/dev/null 2>&1"; then
      REMOTE_HAS_RSYNC=1
    else
      REMOTE_HAS_RSYNC=0
    fi
  fi
  [[ "$REMOTE_HAS_RSYNC" = 1 ]]
}

# 回退方案：远端无 rsync 时用 tar 管道上传
# 先传到 .incoming 临时目录、再整体替换部署目录，等效 --delete（远端旧文件不残留）
sync_build_tar() {
  local incoming="$DEPLOY_PATH.incoming-$TIMESTAMP"
  local old="$DEPLOY_PATH.old-$TIMESTAMP"

  step "tar 管道上传到 $REMOTE:$incoming"
  rssh "$REMOTE" "rm -rf '$incoming' && mkdir -p '$incoming'"
  tar -C "$DIST_DIR" -czf - . | rssh "$REMOTE" "tar -xzf - -C '$incoming'"
  ok "上传完成"

  step "替换部署目录 $DEPLOY_PATH"
  rssh "$REMOTE" "DP='$DEPLOY_PATH' INC='$incoming' OLD='$old' bash -c 'rm -rf \"\$OLD\"; if [ -d \"\$DP\" ]; then mv \"\$DP\" \"\$OLD\"; fi; mv \"\$INC\" \"\$DP\" && rm -rf \"\$OLD\"'"
  ok "部署目录已替换"
}

# 整体同步 dist/ -> DEPLOY_PATH/；--delete 会清空目标中本地没有的旧文件
sync_build() {
  info "整体同步 docs/.vitepress/dist/ -> $REMOTE:$DEPLOY_PATH/"

  # 远端没装 rsync（精简镜像 / docker 容器常见）时降级为 tar 管道
  if ! remote_has_rsync; then
    warn "远端无 rsync，改用 tar 管道部署（在服务器上安装 rsync 可恢复增量同步）"
    if [[ $DO_DRY_RUN -eq 1 ]]; then
      info "试运行模式：tar 方式不支持 --dry-run，跳过上传（产物大小：$(du -sh "$DIST_DIR" | cut -f1)）"
      return 0
    fi
    sync_build_tar
    ok "同步完成"
    return 0
  fi

  info "  (--delete 会清空远端 $DEPLOY_PATH 中本地产物没有的旧文件)"

  local exclude_args=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && exclude_args+=("$line")
  done < <(rsync_exclude_args)

  local dry_args=()
  [[ $DO_DRY_RUN -eq 1 ]] && dry_args+=(--dry-run)

  # ${arr[@]+...} 写法：macOS 自带 bash 3.2 在 set -u 下展开空数组会报 unbound variable
  rsync -avz --delete -e "$RSYNC_E" \
    ${dry_args[@]+"${dry_args[@]}"} \
    ${exclude_args[@]+"${exclude_args[@]}"} \
    "$DIST_DIR/" "$REMOTE:$DEPLOY_PATH/"
  ok "同步完成"
}

# ───────────────────────── 主流程 ─────────────────────────
info "部署目标: $REMOTE:$DEPLOY_PATH"
info "构建: $([ $DO_BUILD = 1 ] && echo yes || echo no)  |  备份: $([ $DO_BACKUP = 1 ] && echo yes || echo no)  |  试运行: $([ $DO_DRY_RUN = 1 ] && echo yes || echo no)"

# 1. 构建
if [[ $DO_BUILD = 1 ]]; then
  build_all
else
  [[ -d "$DIST_DIR" ]] || { err "未找到已有产物 $DIST_DIR，请先构建（去掉 --no-build）"; exit 1; }
  info "跳过本地构建，使用现有 $DIST_DIR"
fi

# 2. 确保远端目录
ensure_remote_dirs

# 3. 同步前询问备份（在同步前做，避免上传完才发现需要备份）
backup_remote

# 4. 同步产物（rsync 整体同步 + --delete）
sync_build

step "部署完成"
ok "$REMOTE:$DEPLOY_PATH"
printf "  备份目录: %s\n" "$DEPLOY_BACKUP_DIR"
printf "  部署时间戳: %s\n" "$TIMESTAMP"

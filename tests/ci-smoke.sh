#!/usr/bin/env bash
# CI 里跑冒烟测试（B3）：
#   - 输出全部存进 smoke-logs/，失败时工作流会把这个目录作为 artifact 上传
#   - Chrome 没起来（smoke.js 退出码 3，还没跑到任何检查）自动重试一次；检查没过（退出码 1）不重试
#   - 失败时把 FAIL 行和最后 40 行写成 GitHub 标注（::error::），在 Actions 页面和 API 里都能直接看到
set +e
LOG_DIR="${SMOKE_LOG_DIR:-smoke-logs}"
export SMOKE_LOG_DIR="$LOG_DIR"
mkdir -p "$LOG_DIR"

# GitHub 标注里换行、百分号要转义
esc() { sed -e 's/%/%25/g' -e 's/\r/%0D/g' | awk 'BEGIN { ORS = "%0A" } { print }'; }

run() {
    node tests/smoke.js 2>&1 | tee "$LOG_DIR/smoke-$1.log"
    return "${PIPESTATUS[0]}"
}

run 1; code=$?; log="$LOG_DIR/smoke-1.log"
if [ "$code" -eq 3 ]; then
    echo "::warning title=Chrome 没起来::还没跑到任何检查就退出了，重试一次"
    run 2; code=$?; log="$LOG_DIR/smoke-2.log"
fi

if [ "$code" -ne 0 ]; then
    grep -E '^(FAIL|STARTUP)' "$log" | while IFS= read -r line; do
        echo "::error title=冒烟测试失败::$(printf '%s' "$line" | esc)"
    done
    echo "::error title=冒烟测试最后 40 行（退出码 $code）::$(tail -n 40 "$log" | esc)"
fi
exit "$code"

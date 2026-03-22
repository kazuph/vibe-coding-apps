#!/bin/bash
# PostToolUse hook: Remind Claude to include ゴミ出しレベル when committing/deploying
# Reads JSON from stdin, checks if the command is a commit/deploy/push

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ "$TOOL_NAME" = "Bash" ] && echo "$COMMAND" | grep -qE '(git push|git commit|npm run deploy|cp.*docs/)'; then
  cat <<'ENDJSON'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"【品質チェックリマインダー】返答の末尾に必ずゴミ出しレベル(1-5)を付与してください。スクリーンショットでの目視確認は完了していますか？レベル3以下なら自分でやり直してから返答すること。"}}
ENDJSON
fi

#!/usr/bin/env bash
# SessionStart hook. In Claude Code cloud sessions, puts the repo's vendored setup where
# the skills expect it: skills and agents under ~/.claude, the pstack model file under
# ~/.agents, and the orchestrator store at ~/.claude/orchestrate/receipt-splitter.
# Does nothing on a local machine, where ~/Code/agent-skills/install.sh owns those paths.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

repo="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents" "$HOME/.claude/orchestrate" "$HOME/.agents"

for s in "$repo"/.claude/skills/*/; do
	ln -sfn "${s%/}" "$HOME/.claude/skills/$(basename "$s")"
done
for a in "$repo"/.claude/agents/*.md; do
	ln -sfn "$a" "$HOME/.claude/agents/$(basename "$a")"
done
[ -e "$HOME/.agents/pstack-models.md" ] || cp "$repo/.claude/pstack-models.md" "$HOME/.agents/pstack-models.md"
ln -sfn "$repo/.claude/orchestrate" "$HOME/.claude/orchestrate/receipt-splitter"

if [ ! -d "$repo/node_modules" ]; then
	(cd "$repo" && npm ci --no-audit --no-fund >/dev/null 2>&1) || echo "cloud-setup: npm ci failed; run it by hand" >&2
fi
command -v bun >/dev/null || npm install -g bun >/dev/null 2>&1 || echo "cloud-setup: bun not installed (Orchestrate and watch-pr need it)" >&2
exit 0

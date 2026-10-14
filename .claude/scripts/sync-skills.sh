#!/usr/bin/env bash
# Refreshes the vendored skills, agents and pstack model file in .claude/ from their
# local sources, so cloud sessions get the same setup as the Mac. Run on the Mac after
# changing ~/Code/agent-skills or reinstalling emilkowalski/skills, then commit the diff.
# Usage: .claude/scripts/sync-skills.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
agent_skills="${AGENT_SKILLS_DIR:-$HOME/Code/agent-skills}"
emil_skills="${EMIL_SKILLS_DIR:-$HOME/.agents/skills}"
models="${PSTACK_MODELS:-$HOME/.agents/pstack-models.md}"
# emilkowalski/skills installs; find-skills (vercel-labs) is left out on purpose.
emil=(animate animate-expo animation-vocabulary apple-design ask-sonner emil-design-eng
	find-animation-opportunities improve-animations mobile-native pick-ui-library prototype
	review-animations write-swift)
# Skills that belong to this repo and are never overwritten.
own=(verify-receipt-splitter)

dest="$repo/.claude/skills"
for d in "$dest"/*/; do
	name="$(basename "$d")"
	[[ " ${own[*]} " == *" $name "* ]] || rm -rf "$d"
done
for s in "$agent_skills"/skills/*/; do cp -R "${s%/}" "$dest/"; done
for s in "${emil[@]}"; do cp -R "$emil_skills/$s" "$dest/"; done

mkdir -p "$repo/.claude/agents"
cp "$agent_skills"/agents/*.md "$repo/.claude/agents/"

mkdir -p "$repo/.claude/licenses"
cp "$agent_skills"/licenses/* "$repo/.claude/licenses/"
cp "$models" "$repo/.claude/pstack-models.md"
echo "synced $(ls -d "$dest"/*/ | wc -l | tr -d ' ') skills from $agent_skills and $emil_skills"

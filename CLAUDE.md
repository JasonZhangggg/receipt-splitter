## Agent workflow

Follow `docs/agents/dev-flow.md`. Plans in `docs/plans/` are the spec for each PR.
Prove changes with the `verify-receipt-splitter` skill.

## UI work

The site must not look AI-generated. Any PR that touches UI loads `emil-design-eng`, `apple-design` and `mobile-native` before writing it, uses `animate-expo` (native) or `animate` (web) for motion, and runs `review-animations` and `unslop` (for UI text) before the PR. Screenshots from `verify-receipt-splitter` are the proof.

## Shared agent setup

Everything agents need is in `.claude/`, so cloud sessions match the Mac:

- `skills/` and `agents/`: pstack, Matt Pocock's and Emil Kowalski's skills, vendored from `~/Code/agent-skills` and `~/.agents/skills` (MIT, see `licenses/`). Refresh with `.claude/scripts/sync-skills.sh` on the Mac and commit the diff; don't edit the copies by hand.
- `pstack-models.md`: model routing per role.
- `orchestrate/`: the orchestrator's `handoff.md`, `preferences.md` (binding rules) and `notes.md`. Commit changes to them, or they are lost when a cloud session ends.
- `hooks/cloud-setup.sh`: in cloud sessions only, links the above into `~/.claude` and `~/.agents` where the skills look for them, and installs dependencies.

Standing guidance from the operator:

@.claude/memory/model-choice.md
@.claude/memory/orchestrator-store.md
@.claude/memory/clear-kills-agents.md
@.claude/memory/light-verification-small-changes.md
@.claude/memory/design-iteration-mode.md

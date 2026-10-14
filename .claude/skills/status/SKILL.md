---
name: status
description: "Terse status of running work: every agent with its task, elapsed time, tokens, and how close it is to done, then the actions the user must take. Use for /status, 'give a status', 'what's running', or 'what do I need to do'."
---

# Status

Report two sections and nothing else. No preamble, no recap of history, no verdict narratives.

## 1. Gather

1. Run `python3 ~/.claude/skills/status/scripts/agents.py` from the project root. It prints one row per subagent of the latest session: description, model, state, elapsed, tokens (last context size), last activity, and the last tool call for running agents. Running agents always print, plus agents that finished within `--since-hours` (default 1).
2. For each RUNNING agent, estimate how close it is to done from side effects, not from its own claims: commits on its branch, files in its output folder, the last tool call, and which brief steps remain. Give a short phrase, such as "on step 4 of 5, final gates", or a rough time left labeled as a guess.
3. List other in-flight work the user is waiting on, such as CI on open PRs (`gh pr checks <n>`) or background shells. Give one row each.
4. Collect user actions from the conversation and the project's orchestration store (`~/.claude/orchestrate/<project>/handoff.md` and `preferences.md`, when present). Include only actions that need the user's own hands or decision: approvals, reviews, commands they must run, permissions, and secrets. Drop anything Claude can do.

## 2. Report

**Agents**

| Agent | Working on | Elapsed | Tokens | Progress |
|---|---|---|---|---|

- Include one row per running agent and one per in-flight external job such as CI.
- If nothing is running, write "No agents running", then one line naming what is being waited on.
- Leave out finished agents unless they finished in the last hour and their result still needs action.

**Your actions**

1. Write each action as an imperative line, with the exact command or link when there is one. Commands go in their own `bash` block.

If there are no actions, write "None."

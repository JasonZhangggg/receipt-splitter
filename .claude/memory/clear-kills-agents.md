---
name: clear-kills-agents
description: Clearing an orchestrator session kills its running subagents; check for running agents before a handoff+clear
metadata:
  type: feedback
---

Clearing the context of a session kills the subagents it spawned, including background ones. On 2026-10-05 the operator asked for "write a handoff and clear context" at 13:57, and the session ended at 13:58:47. Both running agents (share-breakdown fix round, PP-OCRv6 eval) died 3 s later with nothing committed. The handoff still said they were "resumed to finish". This has happened several times.

**Why:** subagents live inside the parent conversation, so ending it ends them. The handoff then promises results that will never come.

**How to apply:** before a handoff+clear, list running agents. Wait for them to finish, or have each one commit a WIP checkpoint and write its state first. In the handoff, mark them "killed by clear, restart from <state>", not "in flight". Auto-compaction keeps agents alive, so prefer it over clearing when agents are running. Work that has to outlive a clear goes in its own session (spawn_task or a separate Code session), not in a subagent.

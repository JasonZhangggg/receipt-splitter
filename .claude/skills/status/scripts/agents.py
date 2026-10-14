#!/usr/bin/env python3
"""List this project's subagents: state, elapsed, tokens, last activity.

Usage: agents.py [--since-hours N] [--project-dir PATH]
Running agents always print. Finished agents print if they ended within N hours (default 1).
"""
import argparse, json, os, re, time
from datetime import datetime, timezone
from pathlib import Path

def slug(path: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", path)

def ts(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()

def human(seconds: float) -> str:
    m = int(seconds // 60)
    return f"{m // 60}h{m % 60:02d}m" if m >= 60 else f"{m}m"

def summarize(jsonl: Path):
    first = last = None
    usage = None
    stop = None
    last_tool = ""
    with jsonl.open() as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = d.get("timestamp")
            if t:
                first = first or t
                last = t
            m = d.get("message") or {}
            if d.get("type") == "assistant":
                if m.get("usage"):
                    usage = m["usage"]
                stop = m.get("stop_reason")
                for c in m.get("content") or []:
                    if isinstance(c, dict) and c.get("type") == "tool_use":
                        inp = c.get("input") or {}
                        last_tool = c.get("name", "") + ": " + str(inp.get("description") or inp.get("command") or inp.get("file_path") or "")[:70]
    tokens = 0
    if usage:
        tokens = sum(usage.get(k, 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"))
    return first, last, tokens, stop, last_tool

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since-hours", type=float, default=1.0)
    ap.add_argument("--project-dir", default=os.getcwd())
    a = ap.parse_args()
    root = Path.home() / ".claude" / "projects" / slug(a.project_dir)
    sessions = sorted((p for p in root.glob("*/subagents") if p.is_dir()), key=lambda p: p.stat().st_mtime, reverse=True)
    if not sessions:
        print("no subagents found under", root)
        return
    now = time.time()
    rows = []
    for jsonl in sessions[0].glob("agent-*.jsonl"):
        meta_path = jsonl.with_suffix("").with_suffix(".meta.json")
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        first, last, tokens, stop, last_tool = summarize(jsonl)
        if not first:
            continue
        idle = now - jsonl.stat().st_mtime
        running = stop != "end_turn" and idle < 900
        if not running and now - ts(last) > a.since_hours * 3600:
            continue
        end = now if running else ts(last)
        rows.append((not running, ts(first), meta.get("description", jsonl.stem), meta.get("model", "?"),
                     "RUNNING" if running else "done", human(end - ts(first)), f"{tokens // 1000}k",
                     human(idle) + " ago", last_tool if running else ""))
    rows.sort()
    if not rows:
        print("no agents running or finished in the window")
    for r in rows:
        print(" | ".join(r[2:]))

main()

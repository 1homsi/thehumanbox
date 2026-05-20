# Scripts

Operational shell scripts for the simulation: local dev resets, EC2 llama.cpp bootstrap, and world-wipe tooling.

### rebuild-fresh.sh
Wipes the local `world.save` (and `.tmp`/`.bak` siblings) and rebuilds the release binaries from scratch.
**When to run:** Local dev only. Use when iterating on world-gen or spawn logic and you need a known-clean seed — does not touch any deployment.

### setup-llama-cpp.sh
Idempotent bootstrap that installs build deps, clones and CMake-builds `llama.cpp` (llama-cli + llama-server), and downloads the Gemma 3 270m Q4_K_M GGUF, then smoke-tests the server.
**When to run:** Once per machine when provisioning the EC2 box (or any Linux dev host) for local-think; safe to re-run since each step is skipped if already done.

### wipe-world-here.sh
Stops the `thehumanbox` systemd unit on the **current** machine, deletes `world.save` and its siblings, and restarts the unit. Destructive — prompts unless `--yes` is passed.
**When to run:** On the EC2 box itself (via SSH/SSM shell) when you want an in-place fresh-world reset without going through the remote SSM flow.

### wipe-world-prod.sh
Destructive remote reset: sends an AWS SSM `RunShellScript` to the prod EC2 instance that stops the unit, removes `world.save`, and restarts into a fresh world. Requires AWS creds + `INSTANCE_ID`/`AWS_REGION`, and prompts for `WIPE` confirmation — there is no undo.
**When to run:** From your laptop when you need to nuke the live world (e.g. incompatible save format, demo reset). Prefer this over `wipe-world-here.sh` so the action is auditable in SSM history.

# Running the lab on EC2

A short guide to bringing this lab up on a fresh EC2 instance.

## What you get

Once bootstrapped, the EC2 box will:

- have Python 3.11+, a venv at `lab/.venv`, all lab extras (dev, trace, inference) installed
- have `~/.thb-lab.env` sourced from `~/.bashrc` so `python`, `make`, `pytest` all use the venv
- (optionally) run two systemd user units:
  - `thb-lab-trace.service` — restart-always trace collector streaming live world thoughts to `datasets/captured/live.jsonl`
  - `thb-lab-report.timer` — daily `04:00 UTC` report aggregator

## Prerequisites

- EC2 with Ubuntu 22.04+, Debian 12+, or Amazon Linux 2023
- A user account (the bootstrap uses `sudo` for package installs but everything else runs as the regular user)
- The simulation reachable over WebSocket — by default `ws://localhost:8000/ws`. If sim runs on a separate box, pass `--sim-host`

## Step 1 — copy the repo onto the box

```bash
ssh -A ubuntu@your-ec2
git clone git@github.com:1homsi/thehumanbox.git
cd thehumanbox/lab
```

## Step 2 — run the bootstrap

```bash
# default: sim is on the same box at localhost:8000
bash scripts/ec2_bootstrap.sh

# sim on another box?
bash scripts/ec2_bootstrap.sh --sim-host 10.0.1.42:8000

# add the training extras (transformers / peft / accelerate)
bash scripts/ec2_bootstrap.sh --with-train
```

The bootstrap is idempotent. Re-running it upgrades pip packages but otherwise no-ops.

## Step 3 — verify

After bootstrap, open a fresh shell (or `source ~/.thb-lab.env`), then:

```bash
make smoke      # build a sample dataset and inspect it
make eval       # run the dummy-backend thought eval
```

Both should pass without exits. The bootstrap also runs them automatically; `--skip-verify` skips that pass.

## Step 4 — (optional) systemd units

If you want the lab to keep collecting traces continuously and run a daily aggregation:

```bash
bash scripts/install_systemd_units.sh
systemctl --user enable --now thb-lab-trace.service
systemctl --user enable --now thb-lab-report.timer

# follow live logs
journalctl --user -u thb-lab-trace -f
```

The trace collector writes to `datasets/captured/live.jsonl`. New JSONL rows include cosmos (moon phase, year), zodiac, and aspiration per organism.

## Manual commands

If you don't want systemd:

```bash
source ~/.thb-lab.env
python scripts/trace_collector.py --url "$THB_SIM_WS" --output datasets/captured/run.jsonl
python scripts/build_thought_dataset.py --input datasets/captured/run.jsonl --output datasets/generated/thoughts.jsonl
python scripts/run_thought_eval.py --input evals/sample_thought_eval.jsonl --engine baseline
```

## Troubleshooting

- **Python 3.11 not found on Amazon Linux 2023**: `sudo dnf install python3.11 python3.11-devel`
- **Trace collector can't connect**: confirm `curl "$THB_SIM_HTTP"/health` works from the box
- **systemd user units don't persist after logout**: `loginctl enable-linger $USER`

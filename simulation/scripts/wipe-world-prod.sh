#!/usr/bin/env bash
# Wipe the production world.save on EC2 and restart the simulation.
#
# Sends an SSM RunShellScript command that:
#   1. stops the systemd unit (`thehumanbox`)
#   2. removes world.save (+ its .tmp / .bak siblings)
#   3. starts the unit, which boots into the fresh-world branch
#      (load_or_new prints "No save at ... - starting fresh world").
#
# Requires:
#   - AWS CLI configured (or AWS_* env vars set) with permission to
#     send SSM commands to the instance
#   - $INSTANCE_ID env var, or `--instance-id <id>` flag, or the value
#     baked in below
#   - $AWS_REGION env var, or `--region <region>` flag
#
# Confirmation: the script will prompt you to type "WIPE" before
# sending the command. There's no undo.
set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-}"
REGION="${AWS_REGION:-}"

# Possible locations of world.save on the EC2 box. We try them all
# since the working dir depends on the systemd unit config and may
# differ between deploys.
WORKING_DIRS=(
  "/root/thehumanbox"
  "/root/thehumanbox/simulation"
  "/var/lib/thehumanbox"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--instance-id <id>] [--region <region>] [--yes]

Wipes the persisted world on the EC2 box and restarts the simulation.

Environment fallbacks:
  INSTANCE_ID  EC2 instance id (i-...)
  AWS_REGION   e.g. us-east-1

Options:
  --yes        skip the interactive WIPE confirmation
  --help       this message
EOF
}

SKIP_PROMPT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    --region)      REGION="$2";      shift 2 ;;
    --yes)         SKIP_PROMPT=1;    shift   ;;
    --help|-h)     usage; exit 0     ;;
    *)             echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$INSTANCE_ID" ]]; then
  echo "error: INSTANCE_ID is required (env or --instance-id)" >&2
  exit 1
fi
if [[ -z "$REGION" ]]; then
  echo "error: AWS_REGION is required (env or --region)" >&2
  exit 1
fi

echo "About to wipe production world on:"
echo "  instance: $INSTANCE_ID"
echo "  region:   $REGION"
echo "This is destructive. The running world will be terminated and a"
echo "fresh one spawned on the next service start."
if [[ "$SKIP_PROMPT" -ne 1 ]]; then
  read -r -p "Type WIPE to confirm: " confirm
  if [[ "$confirm" != "WIPE" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Build the inline shell command. Each path is unlinked best-effort
# (the -f flag suppresses "no such file" errors so the script doesn't
# fail on the locations where the save doesn't exist).
RM_COMMANDS=""
for dir in "${WORKING_DIRS[@]}"; do
  RM_COMMANDS+="rm -f $dir/world.save $dir/world.save.tmp $dir/world.save.bak; "
done

# Single quoted SSM body. Stop first so the running sim doesn't
# overwrite the file mid-delete.
WIPE_CMD="systemctl stop thehumanbox; ${RM_COMMANDS}systemctl start thehumanbox; systemctl status thehumanbox --no-pager | head -20"

echo
echo "Sending SSM command..."
CMD_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "wipe world + restart" \
  --parameters "commands=[\"$WIPE_CMD\"]" \
  --output text --query 'Command.CommandId')

echo "SSM command dispatched: $CMD_ID"
echo "Track: https://${REGION}.console.aws.amazon.com/systems-manager/run-command/$CMD_ID"
echo
echo "Polling for command output (Ctrl-C to detach; it'll finish anyway)..."
echo

# Brief poll for the result. SSM's eventual consistency means the
# command may not appear immediately; tolerate that.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  STATUS=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --output text --query 'Status' 2>/dev/null || echo Pending)
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut)
      echo "Final status: $STATUS"
      aws ssm get-command-invocation \
        --region "$REGION" \
        --command-id "$CMD_ID" \
        --instance-id "$INSTANCE_ID" \
        --output text --query 'StandardOutputContent' || true
      exit 0
      ;;
    *)
      echo "  status: $STATUS"
      sleep 5
      ;;
  esac
done

echo "Did not see terminal status within polling window."
echo "Check the AWS console link above for the final result."

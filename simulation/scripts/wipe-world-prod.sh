#!/usr/bin/env bash
# Wipe the production live world on EC2 and restart the simulation.
#
# Sends an SSM RunShellScript command that:
#   1. stops the systemd unit (`thehumanbox`)
#   2. removes the live world dir under <workdir>/worlds/<hash>/
#   3. removes the <workdir>/worlds/_live marker
#   4. removes any legacy <workdir>/world.save (pre-refactor)
#   5. starts the unit, which mints a brand-new world on boot
#
# Requires:
#   - AWS CLI configured with permission to send SSM commands
#   - $INSTANCE_ID env var or --instance-id flag
#   - $AWS_REGION env var or --region flag
#
# Confirmation: prompts for "WIPE" before sending unless --yes.

set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-}"
REGION="${AWS_REGION:-}"

WORKING_DIRS=(
  "/root/thehumanbox/simulation"
  "/root/thehumanbox"
  "/var/lib/thehumanbox"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--instance-id <id>] [--region <region>] [--yes]

Wipes the live world on the EC2 box and restarts the simulation —
the next boot mints a brand-new world from a fresh hash.

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
echo "fresh one will be minted on next service start. Historical archived"
echo "worlds in other hash dirs are preserved."
if [[ "$SKIP_PROMPT" -ne 1 ]]; then
  read -r -p "Type WIPE to confirm: " confirm
  if [[ "$confirm" != "WIPE" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Build the inline shell command. For each candidate workdir:
#   - if worlds/_live exists, read it, then rm -rf the named world dir
#     and the marker
#   - rm any legacy CWD world.save siblings
RM_BLOCK=""
for dir in "${WORKING_DIRS[@]}"; do
  RM_BLOCK+="
if [ -f $dir/worlds/_live ]; then
  H=\$(cat $dir/worlds/_live);
  if [ -n \"\$H\" ] && [ -d $dir/worlds/\$H ]; then
    rm -rf $dir/worlds/\$H;
    echo removed $dir/worlds/\$H;
  fi;
  rm -f $dir/worlds/_live;
fi;
rm -f $dir/world.save $dir/world.save.tmp $dir/world.save.bak;
"
done

WIPE_CMD="systemctl stop thehumanbox; ${RM_BLOCK} systemctl start thehumanbox; systemctl status thehumanbox --no-pager | head -20"

echo
echo "Sending SSM command..."
CMD_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "wipe live world + restart (mints fresh hash)" \
  --parameters "commands=[\"$WIPE_CMD\"]" \
  --output text --query 'Command.CommandId')

echo "SSM command dispatched: $CMD_ID"
echo "Track: https://${REGION}.console.aws.amazon.com/systems-manager/run-command/$CMD_ID"
echo
echo "Polling for command output (Ctrl-C to detach; it'll finish anyway)..."
echo

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

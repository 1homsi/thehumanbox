#!/usr/bin/env bash
# Archive the live production world and start a fresh one (via SSM).
#
# Default behaviour (--archive, the default):
#   1) stop thehumanbox
#   2) write a minimal meta.json into the current worlds/<hash>/ so it
#      shows in the archived-worlds list
#   3) clear worlds/_live so the next boot mints a fresh hash
#   4) start thehumanbox
#
# Destructive mode (--destroy):
#   Removes the live world dir entirely (loses world.save +
#   world.sqlite + meta). Use only if you really want it gone.
#
# Requires:
#   - AWS CLI configured with SSM RunCommand permission
#   - $INSTANCE_ID env or --instance-id
#   - $AWS_REGION env or --region

set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-}"
REGION="${AWS_REGION:-}"
MODE="archive"
SKIP_PROMPT=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--instance-id <id>] [--region <region>]
                       [--archive | --destroy] [--yes]

Archive or destroy the live production world. Default is archive.

Options:
  --archive   archive the live world (default; preserves world.save +
              world.sqlite + writes a placeholder meta.json)
  --destroy   rm -rf the live world dir (irreversible)
  --yes       skip the interactive confirmation

Environment fallbacks:
  INSTANCE_ID  EC2 instance id (i-...)
  AWS_REGION   e.g. us-east-1
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    --region)      REGION="$2";      shift 2 ;;
    --archive)     MODE="archive";   shift ;;
    --destroy)     MODE="destroy";   shift ;;
    --yes)         SKIP_PROMPT=1;    shift ;;
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

echo "About to $MODE the live world on:"
echo "  instance: $INSTANCE_ID"
echo "  region:   $REGION"
if [[ "$MODE" == "destroy" ]]; then
  echo "(this is destructive — world.save + world.sqlite removed)"
else
  echo "(world.save + world.sqlite preserved as historical archive)"
fi
if [[ "$SKIP_PROMPT" -ne 1 ]]; then
  if [[ "$MODE" == "destroy" ]]; then
    read -r -p "Type DESTROY to confirm: " confirm
    [[ "$confirm" == "DESTROY" ]] || { echo "aborted."; exit 1; }
  else
    read -r -p "Type RESET to confirm: " confirm
    [[ "$confirm" == "RESET" ]] || { echo "aborted."; exit 1; }
  fi
fi

# Candidate working dirs to handle current + legacy layouts.
WORKING_DIRS=(
  "/root/thehumanbox/simulation"
  "/root/thehumanbox"
  "/var/lib/thehumanbox"
)

ARCHIVE_BLOCK=""
for dir in "${WORKING_DIRS[@]}"; do
  ARCHIVE_BLOCK+="
if [ -f $dir/worlds/_live ]; then
  H=\$(cat $dir/worlds/_live);
  if [ -n \"\$H\" ] && [ -d $dir/worlds/\$H ]; then
    if [ ! -f $dir/worlds/\$H/meta.json ]; then
      NOW=\$(( \$(date +%s) * 1000 ));
      printf '{\"hash\":\"%s\",\"started_at_ms\":%d,\"ended_at_ms\":%d,\"final_tick\":0,\"final_population\":0,\"peak_population\":0,\"top_era\":\"\",\"lineage_count\":0,\"top_lineage\":null,\"top_lineage_pop\":0}' \"\$H\" \$NOW \$NOW > $dir/worlds/\$H/meta.json;
      echo wrote placeholder meta for $dir/worlds/\$H;
    fi;
  fi;
  rm -f $dir/worlds/_live;
fi;
rm -f $dir/world.save $dir/world.save.tmp $dir/world.save.bak;
"
done

DESTROY_BLOCK=""
for dir in "${WORKING_DIRS[@]}"; do
  DESTROY_BLOCK+="
if [ -f $dir/worlds/_live ]; then
  H=\$(cat $dir/worlds/_live);
  if [ -n \"\$H\" ] && [ -d $dir/worlds/\$H ]; then
    rm -rf $dir/worlds/\$H;
    echo destroyed $dir/worlds/\$H;
  fi;
  rm -f $dir/worlds/_live;
fi;
rm -f $dir/world.save $dir/world.save.tmp $dir/world.save.bak;
"
done

if [[ "$MODE" == "destroy" ]]; then
  ACTION_BLOCK="$DESTROY_BLOCK"
else
  ACTION_BLOCK="$ARCHIVE_BLOCK"
fi

WIPE_CMD="systemctl stop thehumanbox; ${ACTION_BLOCK} systemctl start thehumanbox; systemctl status thehumanbox --no-pager | head -20"

echo
echo "Sending SSM command..."
CMD_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "wipe live world ($MODE) + restart" \
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

from __future__ import annotations

import json
import sys

from thehumanbox_lab.training.lora_presets import LORA_PRESETS, lora_preset


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        name = argv[1]
        preset = lora_preset(name)
        print(json.dumps({name: preset}, indent=2, sort_keys=True))
        return 0
    out = {name: lora_preset(name) for name in sorted(LORA_PRESETS)}
    print(json.dumps(out, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

# Addendum for Haiku workers (read after BRIEF.md)

You are one of many parallel workers. Several earlier workers may already have done some of your items,
often in PRs whose titles do not carry the item id.

1. Before each item, check whether it is already done:
   - `gh pr list -R <repo> --state all --limit 200 --search "<keywords from the item>"`
   - `git log origin/main --oneline -50`
   - read the code the item names.
   If it is done, write `<id> RESULT already-done <PR or commit>` and move on.
2. Leftover worktrees and benchmark outputs from earlier workers live in /Users/mhomsi/dev/extra/overnight/wt/ (e.g. web02-dist,
   web03-dist, web13-dist, web21-dist, web28-dist, eng-03-radix-sort). Reuse them if they are sound, but always
   rebuild your branch from fresh origin/main.
3. Keep each PR small and boring. If an item turns out large, risky, or needs a design decision, open the PR, say why
   in the body, and leave it open with `RESULT: open`. Do not merge half-done work.
4. Perf items merge only with a measured A/B win under bench-lock.sh. Correctness items merge only with a
   regression test that fails before the fix. Never merge on "should be faster".
5. Review (BRIEF step 7): delegate_task target {providerInstanceId:"codex", model:"gpt-6-luna",
   options:{reasoningEffort:"high"}}, mode "wait", role "review" (do NOT use Claude models for reviews: the user is saving Claude usage). Fix real findings. If
   that review cannot run, leave the PR open.
6. Work through your whole queue in this one task. Stop early only for a usage limit (say which items remain).
7. Append one line per finished item to /Users/mhomsi/dev/extra/overnight/RESULTS-haiku.md:
   `<time> <queue> <id> <RESULT> <PR url> <numbers>`. Use `>>` so you never overwrite other workers' lines.

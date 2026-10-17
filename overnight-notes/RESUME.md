# Resuming a stranded queue (read after BRIEF.md)
A previous worker on this queue was killed by a provider rate limit mid-task. Before starting new items:
1. Find what is already done: `gh pr list -R 1homsi/thehumanbox --state all --limit 150 --json number,title,state,headRefName`
   (and `-R 1homsi/xip` for engine). Branch names carry the item id (bug-24, fix-bug-04-csrf, mob-25-..., web-25-...).
   Merged = done, skip it. Open = take it over (step 2). Not found = still to do.
2. Take over each open PR of your queue: `gh pr checkout <n>` in your worktree, rebase onto origin/main if behind,
   re-run the checks from BRIEF step 3, make sure the review (BRIEF step 7) happened or do it now, wait for CI, merge.
   Check the PR comments first (`gh pr view <n> --comments`) for review findings left unfixed.
3. Then continue the remaining items in order, one PR each, per BRIEF.md. Backlogs: /Users/mhomsi/dev/extra/overnight/backlog/*.md.
4. Also look for a leftover worktree or local branch for your items (`git worktree list` in both repos,
   /Users/mhomsi/dev/extra/overnight/wt/) and reuse uncommitted work there if it is sound.
Reply format: one line per item: `<id> RESULT merged|open|no-gain|blocked <PR url> <numbers or reason>`, then follow-ups.
If you hit a usage limit, stop and say exactly which items remain.

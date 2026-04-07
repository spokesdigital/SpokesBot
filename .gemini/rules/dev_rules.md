# SpokesBot Developer Rules

These rules are strict guidelines for any AI assistant working on the SpokesBot project. They MUST be followed during every session.

## Git & Deployment
1. **Pull Before Push**: Always run `git pull --rebase` before pushing to avoid merge conflicts.
2. **Sanity Checks**: Before pushing, ensure the code builds and run basic tests (if available) to prevent breaking the build.
3. **No Force Pushes**: Never use `git push --force`. If a conflict occurs, stop and ask for clarification.
4. **Clean Commits**: Ensure commits are meaningful and avoid committing unnecessary bulky files (logs, temp data, CSVs).

## Logic & Content
1. **Brevity**: Keep AI chatbot responses crisp and summarized (max 3-4 sentences total).
2. **No Markdown Bolding**: Do not use `**` (double asterisks) for highlighting text in chatbot responses.
3. **No Bullet Point Dumps**: Avoid exhaustive multi-level lists in conversational outputs.

## Security
1. **Credential Safety**: Never persist private environment variables (.env) or secret keys to GitHub.
2. **Admin Isolation**: Only admins can manage datasets and organizations; clients are restricted to viewing their own organization metrics.

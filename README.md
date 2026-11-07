# clips
DVLP drill videos, served at https://go.dvlp.app/clips/.

## Adding a clip
1. Upload the `.mp4` to this repo.
2. Add one line to `manifest.json`: `"<drill ID>": "https://go.dvlp.app/clips/<file>.mp4"`. The drill ID is from DVLP's training plans, for example `BH1_3`.
3. Open a pull request. The **manifest check** must pass before you merge. It checks that every ID is a drill in the newest published `core/v{N}/plans.json`, that every URL names a file here on go.dvlp.app, and that no red-marked drill (`red-drills.json`, old footage that isn't DVLP's) gets a clip.

After the merge the app and the plan page pick the clip up on their next open. GitHub Pages can take about 10 minutes to serve it.

Check locally: `node scripts/check-manifest.mjs`, or `node scripts/check-manifest.mjs path/to/plans.json`.

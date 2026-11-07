# clips
DVLP drill videos, served at https://go.dvlp.app/clips/.

## Importing your drill videos from Drive
Drive is the master copy. The workbook's Drill Library says which drills are yours: the ones not marked red.
1. Put your own video on the drill's row: the Demo Video name and the Drive link in the next column. Share the Drive file as **Anyone with the link**. A private file comes back as a Google sign-in page and isn't imported.
2. Clear the drill's red fill.
3. Run `npm install` once, then `npm run import`.

The import downloads each newly yours drill, encodes it like the other clips, adds its manifest line, and rewrites `red-drills.json` from the workbook. A Drive file used by several drills is written once. A run with nothing new changes nothing. It stops without changing anything if a drill has turned red since the last run.

## Adding a clip
1. Upload the `.mp4` to this repo.
2. Add one line to `manifest.json`: `"<drill ID>": "https://go.dvlp.app/clips/<file>.mp4"`. The drill ID is from DVLP's training plans, for example `BH1_3`.
3. Open a pull request. The **manifest check** must pass before you merge. It checks that every ID is a drill in the newest published `core/v{N}/plans.json`, that every URL names a file here on go.dvlp.app, and that no red-marked drill (`red-drills.json`, old footage that isn't DVLP's) gets a clip.

After the merge the app and the plan page pick the clip up on their next open. GitHub Pages can take about 10 minutes to serve it.

Check locally: `node scripts/check-manifest.mjs`, or `node scripts/check-manifest.mjs path/to/plans.json`.

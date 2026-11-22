Voice lines for the game (MP3, 1–2 s each). Missing files are skipped silently.
Only ids listed in manifest.json are loaded (`npm run voice:cut` keeps it up to date).

From a reel:
  npm run voice:split -- "C:/path/reel.mp4"   # splits into voice-src/clips/clip-NN.mp3
  (listen, then put an id on the clips you want in voice-src/cues.json)
  npm run voice:cut -- "C:/path/reel.mp4"     # writes <id>.mp3 here + manifest.json

Ids (text shown in-game lives in content/problems.json → voice):
  start        round begins          "Isme grout bhar denge!"   (reel)
  rush         Rush Hour at 50 s     "Kitna gap hai ye?"        (reel)
  fill-1, fill-5  after seals         "Grout bhar denge!"        (reel)
  fill-2..4    after seals           "Ho gaya bhai", "Ekdum smooth", … (Sarvam AI)
  combo5       x5 combo              "Grout King aa gaya!"
  leak         seepage over 60%      "Ye paani nahi bharega?"   (reel)
  over-helper, over-mistri, over-senior, over-thekedaar, over-king   game over, by rank
Add more fill lines by adding entries to voice.fill in content/problems.json.

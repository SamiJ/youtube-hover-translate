# YouTube Subtitle Hover Translate

A Chrome extension for language learners. Hover over any word in YouTube's
subtitles to see:

- the word's translation, plus dictionary meanings grouped by part of speech
- a translation of the whole subtitle line

The video pauses while your mouse is on the subtitles and resumes when you
move away.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `youtube-hover-translate` folder.
4. Open a YouTube video, turn on Spanish subtitles (CC), and hover a word.

After editing any file, click the reload icon on the extension's card in
`chrome://extensions`, then reload the YouTube tab.

## Settings

Click the extension's toolbar icon (pin it from the puzzle-piece menu) to set:

- **Subtitles in**: the subtitle language (default Spanish; "Auto-detect"
  is available, but single words are sometimes misdetected)
- **Translate to**: the target language (default English)
- **Pause while hovering**: on by default
- **Translate whole line**: on by default

## How it works

- `content.js` wraps each word of the caption text in a `<span>` as YouTube
  renders it, and shows the tooltip on hover.
- `background.js` fetches translations from Google Translate's public
  `translate.googleapis.com` endpoint (no API key) and caches them.
- While the mouse is on the subtitles, they're held in place. Otherwise
  YouTube moves them up and down as its controls show and auto-hide.

## Caveats

- The Google endpoint is unofficial. It works well, but Google could change or
  rate-limit it. Hovered words and lines are sent to Google.
- It relies on YouTube's caption markup (`.caption-window`,
  `.ytp-caption-segment`). If YouTube changes it, the selectors at the top of
  `content.js` need updating.
- Works on regular `youtube.com` watch pages, not embedded players on other
  sites.

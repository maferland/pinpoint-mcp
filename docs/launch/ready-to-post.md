# Ready-to-post launch copy

Paste-ready versions reflecting the current product (CLI + `/pinpoint:review` slash
command, before/after comparison, `.pinpoint.zip` export/import, end-to-end encrypted
share links, live browser demo). Written to match the voice of the live Show HN post.

Show HN (live): https://news.ycombinator.com/item?id=48991866
Demo: https://pinpoint.maferland.com/try
Repo: https://github.com/maferland/pinpoint

## Where to post, and when

Sequence off the live HN post:

| When | Channel | What |
|---|---|---|
| ~1hr after HN | X/Twitter | Thread below, link back to HN in the last tweet |
| This afternoon | r/ClaudeAI | Best-fit subreddit (Claude Code audience) |
| Next day | r/ChatGPTPro | Broader "any agent" framing; stagger a day |
| Thu/Fri | LinkedIn + blog | Longer half-life; blog draft in `blog-post.md` |

Skip r/LocalLLaMA unless you want it (strict on self-promo, weaker fit now). Don't drop
two subreddits the same day — Reddit's cross-poster detection shadow-bans the second.

---

## X / Twitter thread

**1/**
I got tired of typing visual feedback to my coding agent. "move the button left, no the other one, the one with too much padding on the right."

So I built Pinpoint. You drop comments right on the screenshot, like Figma, and your agent reads them back as structured feedback.

Live demo, no install: https://pinpoint.maferland.com/try

**2/**
It's a slash command in Claude Code (`/pinpoint:review`) or a CLI any agent can shell out to.

Screenshot → browser opens → you pin a region and comment → the agent gets JSON back and fixes each one. Coordinates are percentages, so they survive any resolution.

**3/**
The part I use most is side-by-side before/after. The agent makes a change, you compare the two screens, and you give sharper feedback because you can actually see the difference.

**4/**
A review exports to a `.pinpoint.zip` you can hand to a designer or PM. Or share a link: it's end-to-end encrypted, the relay only ever sees ciphertext. They add pins on their own machine and send it back. No shared account, no shared project.

**5/**
Open source, built with Bun and React. Same idea as Plannotator, just screenshots and comments instead of a plan.

Would love your feedback.
Repo: https://github.com/maferland/pinpoint
More discussion on HN: https://news.ycombinator.com/item?id=48991866

---

## r/ClaudeAI

**Title:** I built a Figma-style visual feedback tool for Claude Code (open source)

**Body:**
I kept typing out visual feedback to Claude Code. "the button's misaligned, the grid item has too much padding, the modal's off-center." It's slow, and it's a bad way to describe something you can just point at.

So I built Pinpoint. Run `/pinpoint:review <screenshot>`, a browser opens, you drop a pin or draw a box and comment on it, hit Send. Claude gets the comments back as structured JSON (coordinates as percentages) and works through each one.

A few things that made it actually useful day to day:
- Side-by-side before/after comparison, so you can see the change the agent made and react to it
- A review exports to a `.pinpoint.zip` you can hand to a designer or PM who doesn't use Claude at all. They add pins, send it back, you re-import
- Cross-network sharing over an encrypted link if they're not on your machine

No install if you just want to see it: https://pinpoint.maferland.com/try
Repo: https://github.com/maferland/pinpoint

It's the same idea as Plannotator, just screenshots and comments instead of a plan. Would love your feedback, especially on where the loop feels clunky.

---

## r/ChatGPTPro (broader, next day)

**Title:** Pinpoint — click to comment on a screenshot, your coding agent reads the feedback and fixes it

**Body:**
If you've wanted your coding agent to act on visual feedback instead of prose ("the second grid item has 8px too much padding" vs a paragraph describing it), this might be useful.

Pinpoint ships a `pinpoint` CLI any agent can shell out to. `pinpoint review <image>` opens a browser UI, blocks until you hit Send, then prints your annotations as JSON on stdout. The agent reads it and acts on each pin. There's also a `/pinpoint:review` slash command if you're in Claude Code.

What I use most: before/after comparison, and the fact that a review exports to a portable `.pinpoint.zip` (or an end-to-end encrypted share link) so someone who doesn't use your agent can still leave feedback.

Demo, no install: https://pinpoint.maferland.com/try
Repo (MIT, Bun + React): https://github.com/maferland/pinpoint

Tested with Claude Code so far. Any agent that can run a shell command should work the same way. If you wire it up to Cursor, Aider, or your own setup, I'd like to hear how it goes.

---

## LinkedIn (Thu/Fri)

Chat is the default interface for AI coding agents. For visual work, it's the wrong one.

I built Pinpoint so I could give my agent feedback the way I'd review a design in Figma: drop a comment on the screenshot, point at the thing. The agent reads the comments back as structured data and fixes each one. It also does before/after comparison, and a review exports to a file (or an encrypted link) you can hand to a designer or PM who's never touched the agent.

Open source, one curl to install: https://github.com/maferland/pinpoint
Try it in the browser: https://pinpoint.maferland.com/try

## Slack / Discord one-liner

Built a thing: Pinpoint, visual feedback for AI coding agents. Drop comments on a screenshot like Figma, your agent reads them and fixes each one. Before/after comparison, exportable reviews, open source. Browser demo: https://pinpoint.maferland.com/try

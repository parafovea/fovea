# Demo content attribution

The CVPR 2026 Fovea demo includes short video clips extracted from
Creative Commons-licensed sources. This page is the canonical
attribution and license notice for that content. Every clip rendered
inside the demo carries a back-link to this page, per the
**Attribution** requirement of CC-BY-NC-SA 3.0.

## Sources

### KEXP — Nils Frahm, Live at KEXP (2015)

- **Source URL**: https://www.youtube.com/watch?v=DfG6VKnjrVw
- **Uploader / filmmaker**: KEXP (https://www.youtube.com/user/kexp)
- **Performing artist**: Nils Frahm
- **Recorded**: 2015-03-21, KEXP Radio Studio, Seattle WA
- **License**: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 ([CC-BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/))

### KEXP — Nils Frahm, Live at KEXP (All Melody tour, 2018)

- **Source URL**: https://www.youtube.com/watch?v=hL0H3STKzVo
- **Uploader / filmmaker**: KEXP (https://www.youtube.com/user/kexp)
- **Performing artist**: Nils Frahm
- **Recorded**: 2018-04-09, KEXP Radio Studio, Seattle WA
- **License**: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 ([CC-BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/))

## What we do with the source

`annotation-tool/demo/scripts/fetch-demo-clips.sh` downloads each
source video at deploy time and extracts short clips (≤30 s each,
≤5 MB each, downscaled to 720p) named by the clip ids in
`annotation-tool/demo/scripts/clips.json`. The cuts are
**time-windowed extractions only** — no transformations of the
underlying recording other than transcoding for web delivery.

The clip media files are **not committed to the Fovea repository**.
Anyone cloning the repo can re-run `fetch-demo-clips.sh` against the
original CC sources; the repo itself contains only the manifest, the
script, and this attribution doc. That keeps the license trail
attached to the original uploader rather than to a Fovea-rehosted
copy.

## Our derivative use

Per CC-BY-NC-SA 3.0:

- **BY** — Every clip rendered in the demo UI carries a visible
  attribution: *"Source: Nils Frahm, Live at KEXP (CC-BY-NC-SA)"* with
  a link back to this page and to the original KEXP upload URL.
- **NC** — The Fovea CVPR 2026 demo is an academic conference
  presentation, not a commercial product. The demo is hosted at
  `demo.fovea.video` strictly for the conference; sponsorship from any
  commercial entity is acknowledged but the demo itself is free,
  non-paywalled, and not gated by any commercial transaction. If
  Fovea is subsequently commercialized in a way that incorporates
  this demo content, the clips must be re-sourced under terms that
  permit commercial use — KEXP's CC-BY-NC-SA license is **not**
  carried forward into a commercial product.
- **SA** — Any annotations, transcripts, claim extractions, or other
  derivative content produced by the demo over these clips is itself
  licensed under CC-BY-NC-SA 3.0 to match the input license. The
  annotation data exported from the demo carries an `attribution`
  field naming the source and license; downstream consumers inherit
  the ShareAlike obligation.

## Takedown contact

If you are KEXP, Nils Frahm, Warp Records, or anyone with a rights
interest in the source recordings and you'd like us to remove a clip
from the demo, contact **aaronstevenwhite@gmail.com**. We will pull
the affected clip from the deployment within 24 hours and revise
this manifest. The fetch script + manifest pattern means a single PR
removes the clip from every future build.

## Note on the CC-BY-NC-SA license boundary

KEXP releases their "Live at KEXP" sessions under CC-BY-NC-SA 3.0 as
a deliberate choice; this is stated on the [KEXP CC FAQ](https://www.kexp.org/youtube/) (mirrored on
their YouTube channel about page). The license covers KEXP's
contribution — the filming, editing, and presentation of the
performance. The underlying musical compositions remain Nils Frahm's
property; the sound recording rights remain with his label (Erased
Tapes / Manners McDade). KEXP secures the necessary clearances from
the artists who appear in the sessions to permit the CC license over
the combined video work.

We're relying on that license for the demo's use of the video clips.
We are **not** using the source audio recordings independently of
the video (no remixes, no audio-only extracts, no use of the music
as background for unrelated content). If you have a question about
whether a specific use is in-scope, contact the address above.

# GOAL

## What we're building
A web app, launched from the phone's home-screen icon, that watches a bystander perform CPR through the front camera and coaches them out loud in real time. Pose detection runs on-device; a calm dispatcher-register voice counts every compression and corrects form the moment it slips.

## Win condition (the only one that matters)
Ship a demo that, in 90 seconds on stage, shows:
1. A phone on the floor, no setup, launched from an icon.
2. A live quality percentage that visibly climbs as the presenter fixes their form.
3. A calm voice counting 1→30 on a steady 110 BPM metronome.
4. One spoken form correction that lands within one compression of the mistake.
5. A breath-phase interruption at 30 that proves this is a coach, not a rep counter.

If those five things work reliably, we're competitive for 1st. If any of them jitters, we're not.

## Event
8x × Bella&Bona Mobile Hack, Berlin, 1 Aug 2026. Solo/duo. ~4 hours of build, 3-minute pitch.

## Hard non-goals (do not build)
- Native app, App Store, Capacitor wrap (decide at 4pm if at all)
- Database, auth, user accounts
- Absolute depth in cm (not measurable from monocular camera; would be actively harmful if wrong)
- Tier 2 scenarios during the build window
- Agent intake integration during the first 4 hours (add only if ahead at 3:00)
- Recoil, fatigue, five-subscore card, demo mode — cut before they cut the metronome

## Never cut
Count, metronome, live score, one form correction, live overlay, breath phase.

## Success metrics on stage
- Zero network calls in the hot loop
- Metronome drift < 20ms across 30 compressions
- Score updates every compression, no lag
- Voice never stacks two cues
- Presenter can fix their form and see the number respond within 1–2 compressions

See [PRODUCT.md](PRODUCT.md) for full product/pitch/spec detail.

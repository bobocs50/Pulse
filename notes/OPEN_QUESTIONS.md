# Open Questions — resolve before / during build

## Verify on stage morning (numbers you cite publicly)

- **grc-org.de** — confirm 6.19 min EMS, 55.4% bystander CPR, 68.4% at home are still the
  headline numbers from the latest Reanimationsregister. They publish annually.
- **"50% better odds"** from dispatcher-assisted CPR — attributed to Circulation journal in
  PRODUCT.md. Could not verify the exact figure. Safe fallback on stage: "roughly doubles
  survival odds" (AHA's phrasing for bystander CPR generally) rather than the specific 50%.
- **AHA 2025 feedback device line** — "expand recommendation to all CPR training equipment
  including lay-rescuer training." Confirm exact wording before putting on a slide.

## One decision needed before build starts

**Hands-only vs 30:2 for the demo?**

The architecture supports 30:2 (breath phase at 30 is already in the state machine).
- 30:2 is more impressive — proves it's a real coach, not a rep counter
- Hands-only is simpler and guideline-compliant for untrained rescuers
- Guidelines say either is acceptable; trained rescuers should do 30:2

Recommendation: keep 30:2 for the demo. The breath phase at 30 is your best moment.
If the state machine isn't working at hour 3, cut to hands-only (just skip BREATH_PROMPT).

## Score weights — consider adjusting for demo impact

Current: `score = 0.4 × pace + 0.3 × arms + 0.3 × recoil`

Concern: arms is only 0.3 weight. On stage you fix your arms deliberately — that should
be the most dramatic single change. If pace is already ok (0.4 satisfied), fixing arms
only moves the score ~30 points max.

Consider for demo: `score = 0.35 × pace + 0.40 × arms + 0.25 × recoil`
Arms becomes the biggest lever → fixing them on stage moves the number more visibly.
Change is in `lib/coach/score.ts` constants, one line.

## Side-view orientation detection

`camera-feedback.ts` uses `isSideView()` which checks shoulder-width/torso-height ratio.
From a true side view with phone on the floor, both shoulders stack nearly on top of each
other — ratio should be low (<0.3). But MediaPipe may report low visibility on the far
shoulder rather than low x-distance.

Test this on the phone in the first 30 minutes. If `isSideView()` fires false positives
("turn sideways" when already sideways), disable the check and just trust the user
followed the setup instructions.

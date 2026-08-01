// All pre-rendered ElevenLabs v3 audio cues.
// Files go in public/audio/. Render tonight before the hackathon.
// Slot duration at 110 BPM: 60000/110 ≈ 545ms — clip numbers tight to fit.

export const CUE: Record<string, string> = {
  // Count 1–30
  one:    "/audio/one.mp3",
  two:    "/audio/two.mp3",
  three:  "/audio/three.mp3",
  four:   "/audio/four.mp3",
  five:   "/audio/five.mp3",
  six:    "/audio/six.mp3",
  seven:  "/audio/seven.mp3",
  eight:  "/audio/eight.mp3",
  nine:   "/audio/nine.mp3",
  ten:    "/audio/ten.mp3",
  eleven: "/audio/eleven.mp3",
  twelve: "/audio/twelve.mp3",
  thirteen: "/audio/thirteen.mp3",
  fourteen: "/audio/fourteen.mp3",
  fifteen:  "/audio/fifteen.mp3",
  sixteen:  "/audio/sixteen.mp3",
  seventeen:"/audio/seventeen.mp3",
  eighteen: "/audio/eighteen.mp3",
  nineteen: "/audio/nineteen.mp3",
  twenty:   "/audio/twenty.mp3",
  "twenty-one": "/audio/twenty-one.mp3",
  "twenty-two": "/audio/twenty-two.mp3",
  "twenty-three":"/audio/twenty-three.mp3",
  "twenty-four": "/audio/twenty-four.mp3",
  "twenty-five": "/audio/twenty-five.mp3",
  "twenty-six":  "/audio/twenty-six.mp3",
  "twenty-seven":"/audio/twenty-seven.mp3",
  "twenty-eight":"/audio/twenty-eight.mp3",
  "twenty-nine": "/audio/twenty-nine.mp3",
  thirty:        "/audio/thirty.mp3",

  // Metronome
  click: "/audio/click.mp3",

  // Phase
  stopCompressions:  "/audio/stop-compressions.mp3",
  tiltAndPinch:      "/audio/tilt-and-pinch.mp3",
  twoBreaths:        "/audio/two-breaths.mp3",
  watchForRise:      "/audio/watch-for-rise.mp3",
  resumeCompressions:"/audio/resume-compressions.mp3",
  swapIfYouCan:      "/audio/swap-if-you-can.mp3",

  // Corrections (imperative, 2–5 words, name corrective action only)
  straightenArms:    "/audio/straighten-arms.mp3",
  shouldersOver:     "/audio/shoulders-over.mp3",
  pushHarder:        "/audio/push-harder.mp3",
  letItRise:         "/audio/let-it-rise.mp3",
  slowDown:          "/audio/slow-down.mp3",
  aLittleFaster:     "/audio/a-little-faster.mp3",
  moveHandsCentre:   "/audio/move-hands-centre.mp3",

  // State
  keepGoing:         "/audio/keep-going.mp3",
  goodKeepThatPace:  "/audio/good-keep-that-pace.mp3",

  // Camera / out-of-frame
  cantSeeYou:        "/audio/cant-see-you.mp3",
};

export const COUNT_CUES = [
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen","twenty","twenty-one","twenty-two","twenty-three",
  "twenty-four","twenty-five","twenty-six","twenty-seven","twenty-eight",
  "twenty-nine","thirty",
] as const;

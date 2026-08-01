// Pre-rendered voice cues. Files live in public/audio/.
// Slot at 110 BPM: 60000/110 ≈ 545ms — clip counts tight to fit.

export const CUE: Record<string, string> = {
  // Count 1–30 (played on detected peak)
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
  "twenty-one":  "/audio/twenty-one.mp3",
  "twenty-two":  "/audio/twenty-two.mp3",
  "twenty-three":"/audio/twenty-three.mp3",
  "twenty-four": "/audio/twenty-four.mp3",
  "twenty-five": "/audio/twenty-five.mp3",
  "twenty-six":  "/audio/twenty-six.mp3",
  "twenty-seven":"/audio/twenty-seven.mp3",
  "twenty-eight":"/audio/twenty-eight.mp3",
  "twenty-nine": "/audio/twenty-nine.mp3",
  thirty:        "/audio/thirty.mp3",

  // Metronome tick
  click: "/audio/click.mp3",

  // Setup sequence (fires once when camera becomes ready)
  moveHandsCentre: "/audio/move-hands-centre.mp3",
  shouldersOver:   "/audio/shoulders-over.mp3",

  // Form corrections (imperative, 2–5 words)
  straightenArms:    "/audio/straighten-arms.mp3",
  straightenLeftArm: "/audio/straighten-left-arm.mp3",
  straightenRightArm:"/audio/straighten-right-arm.mp3",
};

export const COUNT_CUES = [
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen","twenty","twenty-one","twenty-two","twenty-three",
  "twenty-four","twenty-five","twenty-six","twenty-seven","twenty-eight",
  "twenty-nine","thirty",
] as const;

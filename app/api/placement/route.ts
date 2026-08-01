// Stub — returns "unclear" until the VLM call is wired up
// Real implementation: capture frame at compression 3, POST to OpenAI vision
// Returns: { placement: "correct" | "too_high" | "too_low" | "unclear" }
// Treat "unclear" as silence — a wrong confident answer is worse than none

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ placement: "unclear" });
}

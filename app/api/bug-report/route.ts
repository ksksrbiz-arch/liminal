import { NextResponse } from "next/server";

interface BugReport {
  timestamp: string;
  gameTimeElapsed: number;
  reportDetails: string;
  sanityLevel: number;
  playerState: any;
  userEmail: string;
}

// In-Memory store for preview session tracking
const bugReports: BugReport[] = [];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { details, gameTimeElapsed, sanityLevel, playerState, userEmail } = body;

    const newReport: BugReport = {
      timestamp: new Date().toISOString(),
      gameTimeElapsed: gameTimeElapsed || 0,
      reportDetails: details || "No details provided",
      sanityLevel: sanityLevel !== undefined ? sanityLevel : 100,
      playerState: playerState || {},
      userEmail: userEmail || "skagglegotu@gmail.com",
    };

    bugReports.push(newReport);

    console.log("=== SERVER RECEIVED SECURE SYSTEM DIAGNOSTICS/BUG REPORT ===");
    console.log(JSON.stringify(newReport, null, 2));

    return NextResponse.json({
      success: true,
      message: "Diagnostics and security logs securely saved to terminal repository.",
      reportCount: bugReports.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit diagnostics" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Allow retrieve in sandbox environment to verify saving works
  return NextResponse.json({
    success: true,
    reports: bugReports,
  });
}

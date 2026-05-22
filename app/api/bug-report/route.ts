import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Log to server stdout with detailed formatting for developer inspection
    console.info("============== GAME DIAGNOSTIC REPORT ==============");
    console.info(`Timestamp:    ${data.timestamp || new Date().toISOString()}`);
    console.info(`User Email:   ${data.email || 'anonymous'}`);
    console.info(`Applet ID:    d9ecc9bf-7720-4492-ac2e-2eaba2709bd5`);
    console.info(`Summary:      ${data.summary || 'Unspecified user report'}`);
    console.info(`Browser UserAgent: ${data.userAgent || 'Unknown'}`);
    console.info(`Device Details:    W: ${data.screenSize?.width || '?'}, H: ${data.screenSize?.height || '?'}, Ratio: ${data.screenSize?.pixelRatio || '?'}`);
    console.info(`WebGL Specs:       ${JSON.stringify(data.webglCapabilities || {})}`);
    console.info(`Game State:        Started: ${data.gameState?.isStarted}, Controls Locked: ${data.gameState?.isLocked}, Battery: ${data.gameState?.battery}%`);
    console.info(`Error Context:     ${data.errorDetails || 'None explicitly provided'}`);
    console.info(`Collected Logs Count: ${data.logs?.length || 0}`);
    if (data.logs && data.logs.length > 0) {
      console.info("--- Captured Client Logs Stack ---");
      data.logs.slice(-15).forEach((log: any, idx: number) => {
        console.info(`[${log.severity}] [${log.timestamp}] [${log.module || 'GENERIC'}] ${log.message}`);
      });
    }
    console.info("====================================================");

    // In a real staging environment, this could also write to a local log store or database
    
    return NextResponse.json({
      success: true,
      diagnosticId: `ERR-SYS-${Math.floor(Math.random() * 899999 + 100000)}`,
      timestamp: new Date().toISOString(),
      message: "Diagnostic log compiled and dispatched to virtual engineering headquarters successfully."
    });
  } catch (error: any) {
    console.error("[BUG REPORT CRITICAL ERROR] Failed to store incoming client report:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Internal server-side error during log parsing and serialization"
    }, { status: 500 });
  }
}

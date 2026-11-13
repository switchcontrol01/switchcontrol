import { useState } from "react";
import { DriverBoardInspector } from "./_DriverBoardInspector";
import { sampleComponents, sampleScore } from "./_data";
import "./_group.css";

export function Current() {
  const [message, setMessage] = useState("");
  const note = (what: string) => setMessage(`${what} uses your real Windows device only in the installed SwitchControl app.`);
  return (
    <main className="di-preview" style={{ background: "#0d1420", minHeight: "100vh" }}>
      <div className="driver-intel-page" data-reduced-motion="false">
        <div style={{ padding: "10px 0", color: "#e9b47d", fontSize: 11, fontFamily: "'DM Mono', monospace" }} role="status">
          PREVIEW ONLY · Sample device data · Not connected to a Windows scan
        </div>
        {message && <div className="di-notice" role="status">{message}</div>}
        <DriverBoardInspector
          components={sampleComponents}
          score={sampleScore}
          scanning={false}
          ready
          scannedLabel="Sample snapshot"
          stepLabel="Sample scan"
          progress={0}
          error={null}
          onScan={() => note("Scanning")}
          onBack={() => note("Dashboard navigation")}
          onDetails={() => note("Driver details and vendor actions")}
        />
        <section style={{ margin: "22px 0 36px", borderTop: "1px solid rgba(175,200,225,.16)", paddingTop: 18 }}>
          <span className="di-label">SAMPLE DATA NOTICE</span>
          <p style={{ color: "#a3b1c4", fontSize: 12, lineHeight: 1.7 }}>
            This canvas preview copies the production layout. Device names and the 83 score above are illustrative sample values, not results from your PC. The app performs the real scan when running in the Windows desktop app.
          </p>
        </section>
      </div>
    </main>
  );
}

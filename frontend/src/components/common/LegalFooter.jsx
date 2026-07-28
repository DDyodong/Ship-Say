import React, { useState } from "react";
import TermsModal from "../auth/TermsModal";

function LegalFooter({ compact = false }) {
  const [openSection, setOpenSection] = useState(null);

  return <>
    <footer className={compact ? "legal-footer compact" : "legal-footer"}>
      <div className="legal-footer-inner">
        <nav aria-label="법적 고지">
          <button type="button" className="privacy-link" onClick={() => setOpenSection("privacy")}>개인정보 처리방침</button>
          <button type="button" onClick={() => setOpenSection("terms")}>이용약관</button>
        </nav>
        <p>Smart Shipyard AI Safety Management System · AIVLE Team 25</p>
        <small>© 2026 Smart Shipyard AI Safety. All rights reserved.</small>
      </div>
    </footer>
    <TermsModal open={Boolean(openSection)} section={openSection} onClose={() => setOpenSection(null)}/>
  </>;
}

export default LegalFooter;

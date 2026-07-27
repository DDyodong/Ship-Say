import React, { useEffect } from "react";
import { X } from "lucide-react";

function TermsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return <div className="terms-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <div><span>SMART SHIPYARD</span><h3 id="terms-modal-title">이용약관 및 개인정보 수집·이용</h3></div>
        <button type="button" onClick={onClose} aria-label="약관 닫기"><X/></button>
      </header>
      <div className="terms-modal-content">
        <h4>서비스 이용약관</h4>
        <p>본 서비스는 조선소 안전관리 업무와 현장 정보 확인을 지원하기 위해 제공됩니다. 사용자는 본인에게 발급된 계정만 사용해야 하며, 권한 없는 정보 조회·데이터 훼손·계정 공유 등 서비스 운영과 보안을 침해하는 행위를 해서는 안 됩니다.</p>
        <h4>개인정보 수집·이용</h4>
        <dl>
          <div><dt>수집 항목</dt><dd>이름, 사번, 아이디, 암호화된 비밀번호</dd></div>
          <div><dt>이용 목적</dt><dd>임직원 확인, 회원가입, 로그인 및 권한 관리</dd></div>
          <div><dt>보유 기간</dt><dd>계정 삭제 시까지 또는 관련 법령과 내부 정책에서 정한 기간</dd></div>
        </dl>
        <p className="terms-notice">필수 항목에 동의하지 않으면 회원가입과 서비스 이용이 제한됩니다.</p>
      </div>
      <button type="button" className="terms-modal-confirm" onClick={onClose}>확인</button>
    </section>
  </div>;
}

export default TermsModal;

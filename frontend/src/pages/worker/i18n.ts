export type UiText = {
  worker: string;
  demo: string;
  demoWorker: string;
  pages: [string, string, string, string, string];
  nav: [string, string, string, string, string];
  approved: string;
  workTitle: string;
  block: string;
  workTime: string;
  workType: string;
  siteRisk: string;
  highRisk: string;
  piping: string;
  requiredConditions: string;
  conditions: string;
  beforeWork: string;
  completeInOrder: string;
  tbmListen: string;
  confirmed: string;
  listenAndConfirm: string;
  ppeCheck: string;
  analysisComplete: string;
  photoPpeCheck: string;
  reportHazard: string;
  tbmInstruction: string;
  listen: string;
  stop: string;
  speechUnsupported: string;
  tbmDone: string;
  reviewed: string;
  tbmToast: string;
  ppeDone: string;
  aiTitle: string;
  aiGuide: string;
  ppePhoto: string;
  camera: string;
  gallery: string;
  manualItems: string;
  unsupported: string;
  manualChecks: [string, string, string];
  submitPpe: string;
  photoRequired: string;
  manualRequired: string;
  analyzing: string;
  ppeToast: string;
  aiPass: string;
  helmet: string;
  harness: string;
  weldingMask: string;
  model: string;
  worn: string;
  reportTitle: string;
  reportGuide: string;
  riskType: string;
  risks: [string, string, string, string, string, string, string];
  hazardPhoto: string;
  reportHint: string;
  submitReport: string;
  myReports: string;
  count: (value: number) => string;
  noReports: string;
  reportPhotoRequired: string;
  reportDetailRequired: string;
  reportToast: string;
  received: string;
  justNow: string;
  reportRecord: string;
  permissions: string;
  permissionsValue: string;
  appLanguage: string;
  appLanguageGuide: string;
  logout: string;
  serverCaption: string;
  languageToast: string;
  logoutToast: string;
};

export const ui: Record<string, UiText> = {
  ko: {
    worker: "현장 작업자", demo: "데모", demoWorker: "김작업자",
    pages: ["오늘 작업", "TBM 청취", "개인 체크", "위험 신고", "내 정보"],
    nav: ["작업", "TBM", "체크", "신고", "내 정보"],
    approved: "● 작업 승인 완료", workTitle: "B-07 블록 상부 배관 조립 작업", block: "B-07 블록",
    workTime: "작업 시간", workType: "작업 유형", siteRisk: "현장 위험도", highRisk: "고위험 작업", piping: "배관 조립",
    requiredConditions: "필수 승인 조건", conditions: "안전모와 안전화를 반드시 착용합니다.\n• 고소 작업 전 추락 방지시설을 확인합니다.\n• 작업 반경 하부의 출입을 통제합니다.",
    beforeWork: "작업 전 진행", completeInOrder: "순서대로 완료해 주세요", tbmListen: "TBM 안전 안내 청취", confirmed: "확인 완료",
    listenAndConfirm: "내용을 듣고 확인합니다.", ppeCheck: "개인 보호구 체크", analysisComplete: "판정 완료",
    photoPpeCheck: "사진으로 안전 장비 착용 상태를 확인합니다.", reportHazard: "현장 위험 신고하기",
    tbmInstruction: "작업 전 내용을 끝까지 듣고 확인해 주세요.", listen: "▶ 음성으로 듣기", stop: "■ 정지", speechUnsupported: "이 브라우저에서는 음성 재생을 지원하지 않습니다.",
    tbmDone: "✓ TBM 확인 완료", reviewed: "내용을 확인했습니다", tbmToast: "데모 TBM 확인이 완료되었습니다.",
    ppeDone: "✓ 오늘 개인 보호구 확인이 완료되었습니다.", aiTitle: "AI 안전 장비 확인",
    aiGuide: "작업자의 상체와 안전모·안전벨트·용접면 등 안전 장비가 한 화면에 선명하게 보이도록 촬영해 주세요. 사진은 YOLO 보호구 모델로 판정됩니다.",
    ppePhoto: "안전 장비 착용 사진", camera: "카메라 촬영", gallery: "갤러리 선택", manualItems: "직접 확인 항목",
    unsupported: "모델 미지원 장비", manualChecks: ["안전화 착용 상태를 확인했습니다.", "작업에 맞는 보호장갑을 착용했습니다.", "작업복과 신체 노출 상태를 확인했습니다."],
    submitPpe: "AI 판정 후 개인 체크 제출", photoRequired: "안전 장비 착용 사진을 촬영해 주세요.",
    manualRequired: "직접 확인 항목을 모두 완료해 주세요.", analyzing: "YOLO 보호구 판정 중…",
    ppeToast: "데모 보호구 판정이 완료되었습니다. 실제 AI 결과가 아닙니다.", aiPass: "AI 판정 통과",
    helmet: "안전모", harness: "안전벨트", weldingMask: "용접면", model: "판정 모델", worn: "착용 확인",
    reportTitle: "현장 위험 신고", reportGuide: "위험 유형과 현장 사진, 상세 내용을 함께 제출합니다.", riskType: "위험 유형",
    risks: ["추락·고소작업 위험", "보호구 미착용", "화재·폭발 위험", "장비·설비 이상", "충돌·협착 위험", "낙하물·중량물 위험", "기타"],
    hazardPhoto: "위험 현장 사진", reportHint: "위험 상황과 위치를 구체적으로 입력해 주세요.", submitReport: "위험 신고 접수",
    myReports: "내 신고 내역", count: (v) => `${v}건`, noReports: "접수한 위험 신고가 없습니다.",
    reportPhotoRequired: "현장 사진을 첨부해 주세요.", reportDetailRequired: "위험 상황의 상세 내용을 입력해 주세요.",
    reportToast: "데모 위험 신고가 접수되었습니다.", received: "접수 완료", justNow: "방금 전", reportRecord: "추락·고소작업 위험 신고",
    permissions: "사용 권한", permissionsValue: "작업 확인 · TBM · 개인 체크 · 위험 신고", appLanguage: "앱 표시 언어",
    appLanguageGuide: "선택한 언어를 앱의 모든 화면과 음성 안내에 적용합니다.", logout: "로그아웃",
    serverCaption: "연결 서버: 더미 데이터 · 클라우드 미연결", languageToast: "앱 표시 언어가 변경되었습니다.",
    logoutToast: "데모 모드에서는 로그아웃하지 않습니다.",
  },
  en: {
    worker: "Site worker", demo: "Demo", demoWorker: "Demo Worker",
    pages: ["Today’s work", "TBM briefing", "Personal check", "Hazard report", "My profile"],
    nav: ["Work", "TBM", "Check", "Report", "Profile"],
    approved: "● Work approved", workTitle: "B-07 upper-block piping assembly", block: "Block B-07",
    workTime: "Work time", workType: "Work type", siteRisk: "Site risk", highRisk: "High-risk work", piping: "Piping assembly",
    requiredConditions: "Required approval conditions", conditions: "Always wear a safety helmet and safety shoes.\n• Check fall protection before working at height.\n• Restrict access below the work area.",
    beforeWork: "Before work", completeInOrder: "Complete in order", tbmListen: "Listen to TBM safety briefing", confirmed: "Confirmed",
    listenAndConfirm: "Listen and confirm the details.", ppeCheck: "Personal PPE check", analysisComplete: "Analysis complete",
    photoPpeCheck: "Check safety equipment with a photo.", reportHazard: "Report a site hazard",
    tbmInstruction: "Listen to the full briefing and confirm it before work.", listen: "▶ Listen", stop: "■ Stop", speechUnsupported: "Voice playback is not supported in this browser.",
    tbmDone: "✓ TBM confirmed", reviewed: "I have reviewed this", tbmToast: "Demo TBM confirmation is complete.",
    ppeDone: "✓ Today’s personal PPE check is complete.", aiTitle: "AI safety equipment check",
    aiGuide: "Take a clear photo showing the worker’s upper body and safety equipment such as helmet, harness, and welding mask in one frame. The YOLO PPE model will analyze it.",
    ppePhoto: "Safety equipment photo", camera: "Take photo", gallery: "Choose from gallery", manualItems: "Manual check items",
    unsupported: "Equipment not covered by the model", manualChecks: ["I checked that safety shoes are worn.", "I am wearing protective gloves suitable for the work.", "I checked workwear and exposed body areas."],
    submitPpe: "Analyze with AI and submit check", photoRequired: "Take a photo showing the safety equipment.",
    manualRequired: "Complete all manual check items.", analyzing: "Analyzing PPE with YOLO…",
    ppeToast: "Demo PPE analysis is complete. This is not a real AI result.", aiPass: "AI check passed",
    helmet: "Safety helmet", harness: "Safety harness", weldingMask: "Welding mask", model: "Analysis model", worn: "Worn",
    reportTitle: "Site hazard report", reportGuide: "Submit the hazard type, a site photo, and details together.", riskType: "Hazard type",
    risks: ["Fall / work-at-height hazard", "Missing PPE", "Fire / explosion hazard", "Equipment / facility fault", "Collision / caught-between hazard", "Falling / heavy object hazard", "Other"],
    hazardPhoto: "Hazard site photo", reportHint: "Describe the hazard and location in detail.", submitReport: "Submit hazard report",
    myReports: "My reports", count: (v) => `${v} reports`, noReports: "No hazard reports submitted.",
    reportPhotoRequired: "Attach a site photo.", reportDetailRequired: "Enter the hazard details.", reportToast: "Demo hazard report submitted.",
    received: "Received", justNow: "Just now", reportRecord: "Fall / work-at-height hazard report",
    permissions: "Permissions", permissionsValue: "Work review · TBM · Personal check · Hazard report", appLanguage: "App language",
    appLanguageGuide: "Applies the selected language to every app screen and voice briefing.", logout: "Log out",
    serverCaption: "Server: demo data · Cloud disconnected", languageToast: "App language changed.",
    logoutToast: "Logout is disabled in demo mode.",
  },
  vi: {
    worker: "Công nhân hiện trường", demo: "Bản mẫu", demoWorker: "Công nhân mẫu",
    pages: ["Công việc hôm nay", "Nghe TBM", "Kiểm tra cá nhân", "Báo cáo nguy hiểm", "Thông tin của tôi"],
    nav: ["Công việc", "TBM", "Kiểm tra", "Báo cáo", "Cá nhân"],
    approved: "● Công việc đã được duyệt", workTitle: "Lắp ráp đường ống phía trên khối B-07", block: "Khối B-07",
    workTime: "Thời gian làm việc", workType: "Loại công việc", siteRisk: "Mức nguy hiểm", highRisk: "Công việc nguy hiểm cao", piping: "Lắp ráp đường ống",
    requiredConditions: "Điều kiện phê duyệt bắt buộc", conditions: "Luôn đội mũ và mang giày bảo hộ.\n• Kiểm tra chống rơi trước khi làm việc trên cao.\n• Hạn chế ra vào phía dưới khu vực làm việc.",
    beforeWork: "Trước khi làm việc", completeInOrder: "Hoàn thành theo thứ tự", tbmListen: "Nghe hướng dẫn an toàn TBM", confirmed: "Đã xác nhận",
    listenAndConfirm: "Nghe và xác nhận nội dung.", ppeCheck: "Kiểm tra PPE cá nhân", analysisComplete: "Đã phân tích",
    photoPpeCheck: "Kiểm tra thiết bị an toàn bằng ảnh.", reportHazard: "Báo cáo nguy hiểm tại hiện trường",
    tbmInstruction: "Nghe hết nội dung và xác nhận trước khi làm việc.", listen: "▶ Nghe bằng giọng nói", stop: "■ Dừng", speechUnsupported: "Trình duyệt này không hỗ trợ phát giọng nói.",
    tbmDone: "✓ Đã xác nhận TBM", reviewed: "Tôi đã xác nhận nội dung", tbmToast: "Đã xác nhận TBM mẫu.",
    ppeDone: "✓ Đã hoàn tất kiểm tra PPE cá nhân hôm nay.", aiTitle: "AI kiểm tra thiết bị an toàn",
    aiGuide: "Chụp rõ phần thân trên và các thiết bị như mũ, dây đai an toàn, mặt nạ hàn trong cùng một khung hình. Mô hình YOLO PPE sẽ phân tích ảnh.",
    ppePhoto: "Ảnh thiết bị an toàn", camera: "Chụp ảnh", gallery: "Chọn từ thư viện", manualItems: "Mục kiểm tra thủ công",
    unsupported: "Thiết bị mô hình chưa hỗ trợ", manualChecks: ["Tôi đã kiểm tra giày bảo hộ.", "Tôi đang đeo găng bảo hộ phù hợp.", "Tôi đã kiểm tra quần áo và phần cơ thể hở."],
    submitPpe: "Phân tích AI và gửi kiểm tra", photoRequired: "Vui lòng chụp ảnh thiết bị an toàn.",
    manualRequired: "Hoàn thành tất cả mục kiểm tra thủ công.", analyzing: "YOLO đang phân tích PPE…",
    ppeToast: "Đã phân tích PPE mẫu. Đây không phải kết quả AI thật.", aiPass: "AI xác nhận đạt",
    helmet: "Mũ bảo hộ", harness: "Dây đai an toàn", weldingMask: "Mặt nạ hàn", model: "Mô hình phân tích", worn: "Đã trang bị",
    reportTitle: "Báo cáo nguy hiểm hiện trường", reportGuide: "Gửi loại nguy hiểm, ảnh hiện trường và nội dung chi tiết.", riskType: "Loại nguy hiểm",
    risks: ["Nguy cơ ngã / làm việc trên cao", "Thiếu PPE", "Nguy cơ cháy / nổ", "Lỗi thiết bị", "Nguy cơ va chạm / kẹp", "Vật rơi / vật nặng", "Khác"],
    hazardPhoto: "Ảnh hiện trường nguy hiểm", reportHint: "Mô tả cụ thể tình huống và vị trí nguy hiểm.", submitReport: "Gửi báo cáo nguy hiểm",
    myReports: "Báo cáo của tôi", count: (v) => `${v} báo cáo`, noReports: "Chưa có báo cáo nguy hiểm.",
    reportPhotoRequired: "Vui lòng đính kèm ảnh hiện trường.", reportDetailRequired: "Vui lòng nhập chi tiết nguy hiểm.",
    reportToast: "Đã gửi báo cáo nguy hiểm mẫu.", received: "Đã tiếp nhận", justNow: "Vừa xong", reportRecord: "Báo cáo nguy cơ làm việc trên cao",
    permissions: "Quyền sử dụng", permissionsValue: "Xem việc · TBM · Kiểm tra cá nhân · Báo nguy hiểm", appLanguage: "Ngôn ngữ ứng dụng",
    appLanguageGuide: "Áp dụng ngôn ngữ đã chọn cho mọi màn hình và hướng dẫn bằng giọng nói.", logout: "Đăng xuất",
    serverCaption: "Máy chủ: dữ liệu mẫu · Chưa kết nối đám mây", languageToast: "Đã đổi ngôn ngữ ứng dụng.",
    logoutToast: "Không thể đăng xuất ở chế độ mẫu.",
  },
  zh: {
    worker: "现场作业人员", demo: "演示", demoWorker: "演示作业人员",
    pages: ["今日作业", "TBM 听讲", "个人检查", "危险报告", "我的信息"],
    nav: ["作业", "TBM", "检查", "报告", "我的"],
    approved: "● 作业批准完成", workTitle: "B-07 分段上部管道组装作业", block: "B-07 分段",
    workTime: "作业时间", workType: "作业类型", siteRisk: "现场风险", highRisk: "高风险作业", piping: "管道组装",
    requiredConditions: "必要批准条件", conditions: "必须佩戴安全帽和安全鞋。\n• 高处作业前检查防坠设施。\n• 限制作业区域下方人员进入。",
    beforeWork: "作业前事项", completeInOrder: "请按顺序完成", tbmListen: "听取 TBM 安全说明", confirmed: "已确认",
    listenAndConfirm: "请听取并确认内容。", ppeCheck: "个人防护装备检查", analysisComplete: "判定完成",
    photoPpeCheck: "通过照片确认安全装备佩戴状态。", reportHazard: "报告现场危险",
    tbmInstruction: "作业前请完整听取并确认内容。", listen: "▶ 语音播放", stop: "■ 停止", speechUnsupported: "此浏览器不支持语音播放。",
    tbmDone: "✓ TBM 已确认", reviewed: "我已确认内容", tbmToast: "演示 TBM 确认完成。",
    ppeDone: "✓ 今日个人防护装备检查已完成。", aiTitle: "AI 安全装备检查",
    aiGuide: "请在同一画面清晰拍摄作业人员上半身以及安全帽、安全带、焊接面罩等安全装备。照片将由 YOLO 防护装备模型分析。",
    ppePhoto: "安全装备佩戴照片", camera: "拍照", gallery: "从相册选择", manualItems: "手动确认项目",
    unsupported: "模型不支持的装备", manualChecks: ["已确认穿着安全鞋。", "已佩戴适合作业的防护手套。", "已确认工作服和身体暴露情况。"],
    submitPpe: "AI 判定后提交个人检查", photoRequired: "请拍摄安全装备佩戴照片。",
    manualRequired: "请完成所有手动确认项目。", analyzing: "YOLO 正在分析防护装备…",
    ppeToast: "演示防护装备判定完成。这不是真实 AI 结果。", aiPass: "AI 判定通过",
    helmet: "安全帽", harness: "安全带", weldingMask: "焊接面罩", model: "判定模型", worn: "已佩戴",
    reportTitle: "现场危险报告", reportGuide: "请一并提交危险类型、现场照片和详细内容。", riskType: "危险类型",
    risks: ["坠落／高处作业危险", "未佩戴防护装备", "火灾／爆炸危险", "设备／设施异常", "碰撞／夹伤危险", "坠落物／重物危险", "其他"],
    hazardPhoto: "危险现场照片", reportHint: "请具体填写危险情况和位置。", submitReport: "提交危险报告",
    myReports: "我的报告记录", count: (v) => `${v} 条`, noReports: "没有已提交的危险报告。",
    reportPhotoRequired: "请附上现场照片。", reportDetailRequired: "请输入危险情况的详细内容。",
    reportToast: "演示危险报告已提交。", received: "已接收", justNow: "刚刚", reportRecord: "坠落／高处作业危险报告",
    permissions: "使用权限", permissionsValue: "作业确认 · TBM · 个人检查 · 危险报告", appLanguage: "应用显示语言",
    appLanguageGuide: "将所选语言应用于所有应用页面和语音说明。", logout: "退出登录",
    serverCaption: "服务器：演示数据 · 云端未连接", languageToast: "应用显示语言已更改。",
    logoutToast: "演示模式下无法退出登录。",
  },
  id: {
    worker: "Pekerja lapangan", demo: "Demo", demoWorker: "Pekerja Demo",
    pages: ["Pekerjaan hari ini", "Dengar TBM", "Pemeriksaan pribadi", "Laporan bahaya", "Profil saya"],
    nav: ["Kerja", "TBM", "Periksa", "Lapor", "Profil"],
    approved: "● Pekerjaan disetujui", workTitle: "Perakitan pipa atas blok B-07", block: "Blok B-07",
    workTime: "Waktu kerja", workType: "Jenis pekerjaan", siteRisk: "Risiko lokasi", highRisk: "Pekerjaan berisiko tinggi", piping: "Perakitan pipa",
    requiredConditions: "Syarat persetujuan wajib", conditions: "Selalu pakai helm dan sepatu keselamatan.\n• Periksa pelindung jatuh sebelum bekerja di ketinggian.\n• Batasi akses di bawah area kerja.",
    beforeWork: "Sebelum bekerja", completeInOrder: "Selesaikan secara berurutan", tbmListen: "Dengarkan panduan keselamatan TBM", confirmed: "Dikonfirmasi",
    listenAndConfirm: "Dengarkan dan konfirmasi isinya.", ppeCheck: "Pemeriksaan APD pribadi", analysisComplete: "Analisis selesai",
    photoPpeCheck: "Periksa perlengkapan keselamatan lewat foto.", reportHazard: "Laporkan bahaya di lokasi",
    tbmInstruction: "Dengarkan sampai selesai dan konfirmasi sebelum bekerja.", listen: "▶ Dengarkan", stop: "■ Berhenti", speechUnsupported: "Browser ini tidak mendukung pemutaran suara.",
    tbmDone: "✓ TBM dikonfirmasi", reviewed: "Saya sudah memeriksa isinya", tbmToast: "Konfirmasi TBM demo selesai.",
    ppeDone: "✓ Pemeriksaan APD pribadi hari ini selesai.", aiTitle: "Pemeriksaan perlengkapan keselamatan AI",
    aiGuide: "Ambil foto jelas yang menampilkan tubuh bagian atas serta helm, sabuk keselamatan, dan masker las dalam satu bingkai. Model APD YOLO akan menganalisisnya.",
    ppePhoto: "Foto perlengkapan keselamatan", camera: "Ambil foto", gallery: "Pilih dari galeri", manualItems: "Pemeriksaan manual",
    unsupported: "Peralatan yang belum didukung model", manualChecks: ["Saya memastikan sepatu keselamatan dipakai.", "Saya memakai sarung tangan pelindung yang sesuai.", "Saya memeriksa pakaian kerja dan bagian tubuh terbuka."],
    submitPpe: "Analisis AI dan kirim pemeriksaan", photoRequired: "Ambil foto perlengkapan keselamatan.",
    manualRequired: "Selesaikan semua pemeriksaan manual.", analyzing: "YOLO sedang menganalisis APD…",
    ppeToast: "Analisis APD demo selesai. Ini bukan hasil AI nyata.", aiPass: "Lulus pemeriksaan AI",
    helmet: "Helm keselamatan", harness: "Sabuk keselamatan", weldingMask: "Masker las", model: "Model analisis", worn: "Dipakai",
    reportTitle: "Laporan bahaya lokasi", reportGuide: "Kirim jenis bahaya, foto lokasi, dan detailnya.", riskType: "Jenis bahaya",
    risks: ["Bahaya jatuh / kerja di ketinggian", "APD tidak lengkap", "Bahaya kebakaran / ledakan", "Gangguan peralatan", "Bahaya tabrakan / terjepit", "Benda jatuh / berat", "Lainnya"],
    hazardPhoto: "Foto lokasi bahaya", reportHint: "Jelaskan bahaya dan lokasinya secara rinci.", submitReport: "Kirim laporan bahaya",
    myReports: "Laporan saya", count: (v) => `${v} laporan`, noReports: "Belum ada laporan bahaya.",
    reportPhotoRequired: "Lampirkan foto lokasi.", reportDetailRequired: "Masukkan detail bahaya.", reportToast: "Laporan bahaya demo dikirim.",
    received: "Diterima", justNow: "Baru saja", reportRecord: "Laporan bahaya kerja di ketinggian",
    permissions: "Hak akses", permissionsValue: "Tinjau kerja · TBM · Pemeriksaan pribadi · Lapor bahaya", appLanguage: "Bahasa aplikasi",
    appLanguageGuide: "Terapkan bahasa pilihan ke semua layar dan panduan suara.", logout: "Keluar",
    serverCaption: "Server: data demo · Cloud terputus", languageToast: "Bahasa aplikasi diubah.",
    logoutToast: "Keluar dinonaktifkan dalam mode demo.",
  },
  fil: {
    worker: "Manggagawa sa site", demo: "Demo", demoWorker: "Demo Worker",
    pages: ["Trabaho ngayon", "Makinig sa TBM", "Personal na check", "Ulat ng panganib", "Aking profile"],
    nav: ["Trabaho", "TBM", "Check", "Iulat", "Profile"],
    approved: "● Aprubado ang trabaho", workTitle: "Pagbuo ng upper piping ng B-07 block", block: "B-07 block",
    workTime: "Oras ng trabaho", workType: "Uri ng trabaho", siteRisk: "Panganib sa site", highRisk: "Mataas na panganib", piping: "Pagbuo ng piping",
    requiredConditions: "Mga kailangang kondisyon", conditions: "Laging magsuot ng safety helmet at safety shoes.\n• Suriin ang fall protection bago magtrabaho sa taas.\n• Limitahan ang pagpasok sa ibaba ng work area.",
    beforeWork: "Bago magtrabaho", completeInOrder: "Kumpletuhin ayon sa pagkakasunod", tbmListen: "Makinig sa gabay sa kaligtasan ng TBM", confirmed: "Nakumpirma",
    listenAndConfirm: "Makinig at kumpirmahin ang detalye.", ppeCheck: "Personal na PPE check", analysisComplete: "Tapos ang pagsusuri",
    photoPpeCheck: "Suriin ang safety equipment sa larawan.", reportHazard: "Mag-ulat ng panganib sa site",
    tbmInstruction: "Pakinggan nang buo at kumpirmahin bago magtrabaho.", listen: "▶ Pakinggan", stop: "■ Ihinto", speechUnsupported: "Hindi suportado ng browser na ito ang voice playback.",
    tbmDone: "✓ Nakumpirma ang TBM", reviewed: "Nasuri ko na ito", tbmToast: "Tapos ang demo TBM confirmation.",
    ppeDone: "✓ Tapos ang personal PPE check ngayon.", aiTitle: "AI safety equipment check",
    aiGuide: "Kumuha ng malinaw na larawan ng itaas na katawan at safety helmet, harness, at welding mask sa isang frame. Susuriin ito ng YOLO PPE model.",
    ppePhoto: "Larawan ng safety equipment", camera: "Kumuha ng larawan", gallery: "Pumili sa gallery", manualItems: "Manwal na mga check",
    unsupported: "Hindi suportadong kagamitan", manualChecks: ["Tiniyak kong suot ang safety shoes.", "Suot ko ang angkop na protective gloves.", "Sinuri ko ang workwear at nakalantad na bahagi ng katawan."],
    submitPpe: "I-AI analyze at isumite", photoRequired: "Kumuha ng larawan ng safety equipment.",
    manualRequired: "Kumpletuhin ang lahat ng manwal na check.", analyzing: "Sinusuri ng YOLO ang PPE…",
    ppeToast: "Tapos ang demo PPE analysis. Hindi ito totoong AI result.", aiPass: "Pumasa sa AI check",
    helmet: "Safety helmet", harness: "Safety harness", weldingMask: "Welding mask", model: "Analysis model", worn: "Suot",
    reportTitle: "Ulat ng panganib sa site", reportGuide: "Isumite ang uri, larawan, at detalye ng panganib.", riskType: "Uri ng panganib",
    risks: ["Panganib ng pagkahulog / trabaho sa taas", "Kulang na PPE", "Panganib ng sunog / pagsabog", "Sira sa kagamitan", "Banggaan / pagkakaipit", "Nahuhulog / mabigat na bagay", "Iba pa"],
    hazardPhoto: "Larawan ng panganib", reportHint: "Ilarawan nang detalyado ang panganib at lokasyon.", submitReport: "Isumite ang ulat",
    myReports: "Mga ulat ko", count: (v) => `${v} ulat`, noReports: "Wala pang ulat ng panganib.",
    reportPhotoRequired: "Mag-attach ng larawan sa site.", reportDetailRequired: "Ilagay ang detalye ng panganib.", reportToast: "Naisumite ang demo hazard report.",
    received: "Natanggap", justNow: "Katatapos lang", reportRecord: "Ulat sa panganib ng trabaho sa taas",
    permissions: "Mga pahintulot", permissionsValue: "Work review · TBM · Personal check · Hazard report", appLanguage: "Wika ng app",
    appLanguageGuide: "Ilalapat ang napiling wika sa lahat ng screen at voice guide.", logout: "Mag-logout",
    serverCaption: "Server: demo data · Hindi konektado ang cloud", languageToast: "Nabago ang wika ng app.",
    logoutToast: "Hindi available ang logout sa demo mode.",
  },
  ne: {
    worker: "स्थल कामदार", demo: "डेमो", demoWorker: "नमुना कामदार",
    pages: ["आजको काम", "TBM सुन्नुहोस्", "व्यक्तिगत जाँच", "जोखिम रिपोर्ट", "मेरो प्रोफाइल"],
    nav: ["काम", "TBM", "जाँच", "रिपोर्ट", "प्रोफाइल"],
    approved: "● काम स्वीकृत भयो", workTitle: "B-07 ब्लकको माथिल्लो पाइप जडान", block: "B-07 ब्लक",
    workTime: "कामको समय", workType: "कामको प्रकार", siteRisk: "स्थल जोखिम", highRisk: "उच्च जोखिमको काम", piping: "पाइप जडान",
    requiredConditions: "अनिवार्य स्वीकृति सर्त", conditions: "सधैं सुरक्षा हेल्मेट र सुरक्षा जुत्ता लगाउनुहोस्।\n• उचाइमा काम गर्नुअघि खस्नबाट बचाउने उपकरण जाँच्नुहोस्।\n• कार्यक्षेत्र मुनिको प्रवेश रोक्नुहोस्।",
    beforeWork: "कामअघि", completeInOrder: "क्रममा पूरा गर्नुहोस्", tbmListen: "TBM सुरक्षा निर्देशन सुन्नुहोस्", confirmed: "पुष्टि भयो",
    listenAndConfirm: "सुनेर विवरण पुष्टि गर्नुहोस्।", ppeCheck: "व्यक्तिगत PPE जाँच", analysisComplete: "विश्लेषण पूरा",
    photoPpeCheck: "फोटोबाट सुरक्षा उपकरण जाँच्नुहोस्।", reportHazard: "स्थल जोखिम रिपोर्ट गर्नुहोस्",
    tbmInstruction: "कामअघि पूरा सुनेर पुष्टि गर्नुहोस्।", listen: "▶ सुन्नुहोस्", stop: "■ रोक्नुहोस्", speechUnsupported: "यो ब्राउजरले आवाज बजाउन समर्थन गर्दैन।",
    tbmDone: "✓ TBM पुष्टि भयो", reviewed: "मैले सामग्री जाँचें", tbmToast: "डेमो TBM पुष्टि पूरा भयो।",
    ppeDone: "✓ आजको व्यक्तिगत PPE जाँच पूरा भयो।", aiTitle: "AI सुरक्षा उपकरण जाँच",
    aiGuide: "कामदारको माथिल्लो शरीर, हेल्मेट, सुरक्षा बेल्ट र वेल्डिङ मास्क एउटै फ्रेममा स्पष्ट देखिने फोटो लिनुहोस्। YOLO PPE मोडेलले यसको विश्लेषण गर्छ।",
    ppePhoto: "सुरक्षा उपकरणको फोटो", camera: "फोटो लिनुहोस्", gallery: "ग्यालरीबाट छान्नुहोस्", manualItems: "म्यानुअल जाँच",
    unsupported: "मोडेलले नसमेटेका उपकरण", manualChecks: ["सुरक्षा जुत्ता लगाएको जाँचें।", "कामअनुसारको सुरक्षा पञ्जा लगाएको छु।", "कामको पोसाक र खुला शरीर भाग जाँचें।"],
    submitPpe: "AI विश्लेषण गरी जाँच पठाउनुहोस्", photoRequired: "सुरक्षा उपकरणको फोटो लिनुहोस्।",
    manualRequired: "सबै म्यानुअल जाँच पूरा गर्नुहोस्।", analyzing: "YOLO ले PPE विश्लेषण गर्दैछ…",
    ppeToast: "डेमो PPE विश्लेषण पूरा भयो। यो वास्तविक AI नतिजा होइन।", aiPass: "AI जाँच सफल",
    helmet: "सुरक्षा हेल्मेट", harness: "सुरक्षा बेल्ट", weldingMask: "वेल्डिङ मास्क", model: "विश्लेषण मोडेल", worn: "लगाइएको",
    reportTitle: "स्थल जोखिम रिपोर्ट", reportGuide: "जोखिमको प्रकार, स्थलको फोटो र विवरण सँगै पठाउनुहोस्।", riskType: "जोखिमको प्रकार",
    risks: ["खस्ने / उचाइको जोखिम", "PPE नलगाएको", "आगलागी / विस्फोट जोखिम", "उपकरण खराबी", "ठक्कर / च्यापिने जोखिम", "खस्ने / भारी वस्तु", "अन्य"],
    hazardPhoto: "जोखिम स्थलको फोटो", reportHint: "जोखिम र स्थान विस्तृत रूपमा लेख्नुहोस्।", submitReport: "जोखिम रिपोर्ट पठाउनुहोस्",
    myReports: "मेरा रिपोर्टहरू", count: (v) => `${v} रिपोर्ट`, noReports: "कुनै जोखिम रिपोर्ट छैन।",
    reportPhotoRequired: "स्थलको फोटो संलग्न गर्नुहोस्।", reportDetailRequired: "जोखिमको विवरण लेख्नुहोस्।", reportToast: "डेमो जोखिम रिपोर्ट पठाइयो।",
    received: "प्राप्त भयो", justNow: "भर्खरै", reportRecord: "उचाइको जोखिम रिपोर्ट",
    permissions: "अनुमतिहरू", permissionsValue: "काम समीक्षा · TBM · व्यक्तिगत जाँच · जोखिम रिपोर्ट", appLanguage: "एपको भाषा",
    appLanguageGuide: "चयन गरिएको भाषा सबै स्क्रिन र आवाज निर्देशनमा लागू हुन्छ।", logout: "लगआउट",
    serverCaption: "सर्भर: नमुना डाटा · क्लाउड जडान छैन", languageToast: "एपको भाषा परिवर्तन भयो।",
    logoutToast: "डेमो मोडमा लगआउट उपलब्ध छैन।",
  },
  uz: {
    worker: "Maydon ishchisi", demo: "Demo", demoWorker: "Demo ishchi",
    pages: ["Bugungi ish", "TBM tinglash", "Shaxsiy tekshiruv", "Xavf haqida xabar", "Mening profilim"],
    nav: ["Ish", "TBM", "Tekshiruv", "Xabar", "Profil"],
    approved: "● Ish tasdiqlandi", workTitle: "B-07 blok yuqori quvur yig‘ish ishi", block: "B-07 blok",
    workTime: "Ish vaqti", workType: "Ish turi", siteRisk: "Maydon xavfi", highRisk: "Yuqori xavfli ish", piping: "Quvur yig‘ish",
    requiredConditions: "Majburiy tasdiq shartlari", conditions: "Har doim himoya kaskasi va xavfsizlik poyabzalini kiying.\n• Balandlikda ishlashdan oldin yiqilishdan himoyani tekshiring.\n• Ish hududi ostiga kirishni cheklang.",
    beforeWork: "Ishdan oldin", completeInOrder: "Tartib bilan bajaring", tbmListen: "TBM xavfsizlik yo‘riqnomasini tinglash", confirmed: "Tasdiqlandi",
    listenAndConfirm: "Tinglang va tasdiqlang.", ppeCheck: "Shaxsiy PPE tekshiruvi", analysisComplete: "Tahlil tugadi",
    photoPpeCheck: "Xavfsizlik jihozlarini surat bilan tekshiring.", reportHazard: "Maydon xavfini xabar qilish",
    tbmInstruction: "Ishdan oldin to‘liq tinglab tasdiqlang.", listen: "▶ Tinglash", stop: "■ To‘xtatish", speechUnsupported: "Bu brauzer ovoz ijrosini qo‘llamaydi.",
    tbmDone: "✓ TBM tasdiqlandi", reviewed: "Mazmunni ko‘rib chiqdim", tbmToast: "Demo TBM tasdiqlandi.",
    ppeDone: "✓ Bugungi shaxsiy PPE tekshiruvi tugadi.", aiTitle: "AI xavfsizlik jihozlari tekshiruvi",
    aiGuide: "Ishchining yuqori tanasi, kaska, xavfsizlik kamari va payvandlash niqobi bitta kadrda aniq ko‘rinadigan surat oling. YOLO PPE modeli uni tahlil qiladi.",
    ppePhoto: "Xavfsizlik jihozlari surati", camera: "Suratga olish", gallery: "Galereyadan tanlash", manualItems: "Qo‘lda tekshirish",
    unsupported: "Model qo‘llamaydigan jihozlar", manualChecks: ["Xavfsizlik poyabzali kiyilganini tekshirdim.", "Ishga mos himoya qo‘lqopini kiydim.", "Ish kiyimi va ochiq tana qismlarini tekshirdim."],
    submitPpe: "AI tahlil va tekshiruvni yuborish", photoRequired: "Xavfsizlik jihozlari suratini oling.",
    manualRequired: "Barcha qo‘lda tekshiruvlarni bajaring.", analyzing: "YOLO PPE ni tahlil qilmoqda…",
    ppeToast: "Demo PPE tahlili tugadi. Bu haqiqiy AI natijasi emas.", aiPass: "AI tekshiruvidan o‘tdi",
    helmet: "Himoya kaskasi", harness: "Xavfsizlik kamari", weldingMask: "Payvandlash niqobi", model: "Tahlil modeli", worn: "Kiyilgan",
    reportTitle: "Maydon xavfi hisoboti", reportGuide: "Xavf turi, maydon surati va tafsilotlarni birga yuboring.", riskType: "Xavf turi",
    risks: ["Yiqilish / balandlik xavfi", "PPE yo‘q", "Yong‘in / portlash xavfi", "Uskuna nosozligi", "To‘qnashuv / qisilib qolish", "Tushuvchi / og‘ir buyum", "Boshqa"],
    hazardPhoto: "Xavfli joy surati", reportHint: "Xavf va joyni batafsil yozing.", submitReport: "Xavf hisobotini yuborish",
    myReports: "Mening hisobotlarim", count: (v) => `${v} ta hisobot`, noReports: "Xavf hisobotlari yo‘q.",
    reportPhotoRequired: "Maydon suratini biriktiring.", reportDetailRequired: "Xavf tafsilotlarini kiriting.", reportToast: "Demo xavf hisoboti yuborildi.",
    received: "Qabul qilindi", justNow: "Hozirgina", reportRecord: "Balandlik xavfi hisoboti",
    permissions: "Ruxsatlar", permissionsValue: "Ishni ko‘rish · TBM · Shaxsiy tekshiruv · Xavf hisoboti", appLanguage: "Ilova tili",
    appLanguageGuide: "Tanlangan til barcha ekranlar va ovozli yo‘riqnomaga qo‘llanadi.", logout: "Chiqish",
    serverCaption: "Server: demo ma’lumot · Bulut ulanmagan", languageToast: "Ilova tili o‘zgartirildi.",
    logoutToast: "Demo rejimida chiqib bo‘lmaydi.",
  },
  si: {
    worker: "ක්ෂේත්‍ර සේවකයා", demo: "නිරූපණය", demoWorker: "නිරූපණ සේවකයා",
    pages: ["අද වැඩ", "TBM අසන්න", "පුද්ගලික පරීක්ෂාව", "අවදානම් වාර්තාව", "මගේ පැතිකඩ"],
    nav: ["වැඩ", "TBM", "පරීක්ෂා", "වාර්තා", "පැතිකඩ"],
    approved: "● වැඩ අනුමතයි", workTitle: "B-07 කොටසේ ඉහළ නළ එකලස් කිරීම", block: "B-07 කොටස",
    workTime: "වැඩ වේලාව", workType: "වැඩ වර්ගය", siteRisk: "ක්ෂේත්‍ර අවදානම", highRisk: "ඉහළ අවදානම් වැඩ", piping: "නළ එකලස් කිරීම",
    requiredConditions: "අනිවාර්ය අනුමැති කොන්දේසි", conditions: "සෑම විටම ආරක්ෂක හිස්වැස්ම සහ පාවහන් පළඳින්න.\n• උස වැඩට පෙර වැටීම් ආරක්ෂාව පරීක්ෂා කරන්න.\n• වැඩ ප්‍රදේශය යටතේ ප්‍රවේශය සීමා කරන්න.",
    beforeWork: "වැඩට පෙර", completeInOrder: "පිළිවෙළට සම්පූර්ණ කරන්න", tbmListen: "TBM ආරක්ෂක උපදෙස් අසන්න", confirmed: "තහවුරුයි",
    listenAndConfirm: "අසා විස්තර තහවුරු කරන්න.", ppeCheck: "පුද්ගලික PPE පරීක්ෂාව", analysisComplete: "විශ්ලේෂණය සම්පූර්ණයි",
    photoPpeCheck: "ඡායාරූපයෙන් ආරක්ෂක උපකරණ පරීක්ෂා කරන්න.", reportHazard: "ක්ෂේත්‍ර අවදානම වාර්තා කරන්න",
    tbmInstruction: "වැඩට පෙර සම්පූර්ණයෙන් අසා තහවුරු කරන්න.", listen: "▶ අසන්න", stop: "■ නවත්වන්න", speechUnsupported: "මෙම බ්‍රවුසරය හඬ වාදනයට සහාය නොදක්වයි.",
    tbmDone: "✓ TBM තහවුරුයි", reviewed: "මම අන්තර්ගතය පරීක්ෂා කළෙමි", tbmToast: "නිරූපණ TBM තහවුරු කිරීම සම්පූර්ණයි.",
    ppeDone: "✓ අද පුද්ගලික PPE පරීක්ෂාව සම්පූර්ණයි.", aiTitle: "AI ආරක්ෂක උපකරණ පරීක්ෂාව",
    aiGuide: "සේවකයාගේ ඉහළ ශරීරය, හිස්වැස්ම, ආරක්ෂක පටිය සහ වෙල්ඩින් මුහුණු ආවරණය එකම රාමුවක පැහැදිලිව ඡායාරූපගත කරන්න. YOLO PPE ආකෘතිය එය විශ්ලේෂණය කරයි.",
    ppePhoto: "ආරක්ෂක උපකරණ ඡායාරූපය", camera: "ඡායාරූප ගන්න", gallery: "ගැලරියෙන් තෝරන්න", manualItems: "අතින් පරීක්ෂා කිරීම",
    unsupported: "ආකෘතිය සහාය නොදක්වන උපකරණ", manualChecks: ["ආරක්ෂක පාවහන් පැළඳ ඇති බව පරීක්ෂා කළෙමි.", "සුදුසු ආරක්ෂක අත්වැසුම් පැළඳ සිටිමි.", "වැඩ ඇඳුම සහ නිරාවරණය වූ කොටස් පරීක්ෂා කළෙමි."],
    submitPpe: "AI විශ්ලේෂණය කර පරීක්ෂාව යවන්න", photoRequired: "ආරක්ෂක උපකරණ ඡායාරූපයක් ගන්න.",
    manualRequired: "සියලු අතින් පරීක්ෂා කිරීම් සම්පූර්ණ කරන්න.", analyzing: "YOLO PPE විශ්ලේෂණය කරයි…",
    ppeToast: "නිරූපණ PPE විශ්ලේෂණය සම්පූර්ණයි. මෙය සැබෑ AI ප්‍රතිඵලයක් නොවේ.", aiPass: "AI පරීක්ෂාව සමත්",
    helmet: "ආරක්ෂක හිස්වැස්ම", harness: "ආරක්ෂක පටිය", weldingMask: "වෙල්ඩින් මුහුණු ආවරණය", model: "විශ්ලේෂණ ආකෘතිය", worn: "පැළඳ ඇත",
    reportTitle: "ක්ෂේත්‍ර අවදානම් වාර්තාව", reportGuide: "අවදානම් වර්ගය, ඡායාරූපය සහ විස්තර එක්ව යවන්න.", riskType: "අවදානම් වර්ගය",
    risks: ["වැටීම / උස වැඩ", "PPE නොමැතිවීම", "ගිනි / පිපිරුම්", "උපකරණ දෝෂ", "ගැටීම / සිරවීම", "වැටෙන / බර වස්තු", "වෙනත්"],
    hazardPhoto: "අවදානම් ස්ථානයේ ඡායාරූපය", reportHint: "අවදානම සහ ස්ථානය විස්තරාත්මකව ලියන්න.", submitReport: "අවදානම් වාර්තාව යවන්න",
    myReports: "මගේ වාර්තා", count: (v) => `වාර්තා ${v}`, noReports: "අවදානම් වාර්තා නැත.",
    reportPhotoRequired: "ක්ෂේත්‍ර ඡායාරූපයක් අමුණන්න.", reportDetailRequired: "අවදානම් විස්තර ඇතුළත් කරන්න.", reportToast: "නිරූපණ අවදානම් වාර්තාව යවන ලදී.",
    received: "ලැබුණි", justNow: "දැන්", reportRecord: "උස වැඩ අවදානම් වාර්තාව",
    permissions: "අවසර", permissionsValue: "වැඩ පරීක්ෂාව · TBM · පුද්ගලික පරීක්ෂාව · අවදානම් වාර්තාව", appLanguage: "යෙදුම් භාෂාව",
    appLanguageGuide: "තෝරාගත් භාෂාව සියලු තිර සහ හඬ උපදෙස් සඳහා යොදවයි.", logout: "පිටවන්න",
    serverCaption: "සේවාදායකය: නිරූපණ දත්ත · වලාකුළ සම්බන්ධ නැත", languageToast: "යෙදුම් භාෂාව වෙනස් විය.",
    logoutToast: "නිරූපණ මාදිලියේ පිටවීම නොමැත.",
  },
  ta: {
    worker: "தளத் தொழிலாளர்", demo: "மாதிரி", demoWorker: "மாதிரி தொழிலாளர்",
    pages: ["இன்றைய வேலை", "TBM கேட்க", "தனிப்பட்ட சோதனை", "அபாய அறிக்கை", "என் சுயவிவரம்"],
    nav: ["வேலை", "TBM", "சோதனை", "அறிக்கை", "சுயவிவரம்"],
    approved: "● வேலை அங்கீகரிக்கப்பட்டது", workTitle: "B-07 தொகுதி மேல் குழாய் பொருத்தும் பணி", block: "B-07 தொகுதி",
    workTime: "வேலை நேரம்", workType: "வேலை வகை", siteRisk: "தள அபாயம்", highRisk: "அதிக அபாய வேலை", piping: "குழாய் பொருத்துதல்",
    requiredConditions: "கட்டாய அங்கீகார நிபந்தனைகள்", conditions: "பாதுகாப்புத் தலைக்கவசம் மற்றும் காலணிகளை எப்போதும் அணியுங்கள்.\n• உயரப் பணிக்கு முன் வீழ்ச்சி பாதுகாப்பைச் சரிபாருங்கள்.\n• வேலைப்பகுதியின் கீழ் நுழைவைக் கட்டுப்படுத்துங்கள்.",
    beforeWork: "வேலைக்கு முன்", completeInOrder: "வரிசையாக முடிக்கவும்", tbmListen: "TBM பாதுகாப்பு வழிகாட்டியைக் கேட்கவும்", confirmed: "உறுதிசெய்யப்பட்டது",
    listenAndConfirm: "கேட்டு விவரங்களை உறுதிசெய்யவும்.", ppeCheck: "தனிப்பட்ட PPE சோதனை", analysisComplete: "பகுப்பாய்வு முடிந்தது",
    photoPpeCheck: "படம் மூலம் பாதுகாப்பு உபகரணங்களைச் சரிபார்க்கவும்.", reportHazard: "தள அபாயத்தைப் புகாரளிக்கவும்",
    tbmInstruction: "வேலைக்கு முன் முழுவதும் கேட்டு உறுதிசெய்யவும்.", listen: "▶ கேட்கவும்", stop: "■ நிறுத்தவும்", speechUnsupported: "இந்த உலாவி குரல் இயக்கத்தை ஆதரிக்கவில்லை.",
    tbmDone: "✓ TBM உறுதிசெய்யப்பட்டது", reviewed: "உள்ளடக்கத்தைச் சரிபார்த்தேன்", tbmToast: "மாதிரி TBM உறுதிப்படுத்தல் முடிந்தது.",
    ppeDone: "✓ இன்றைய தனிப்பட்ட PPE சோதனை முடிந்தது.", aiTitle: "AI பாதுகாப்பு உபகரணச் சோதனை",
    aiGuide: "தொழிலாளரின் மேல் உடல், தலைக்கவசம், பாதுகாப்புப் பட்டை மற்றும் வெல்டிங் முகமூடி ஒரே படத்தில் தெளிவாகத் தெரியுமாறு படம் எடுக்கவும். YOLO PPE மாதிரி அதை பகுப்பாய்வு செய்யும்.",
    ppePhoto: "பாதுகாப்பு உபகரணப் படம்", camera: "படம் எடுக்கவும்", gallery: "கேலரியில் தேர்வு", manualItems: "கைமுறை சோதனைகள்",
    unsupported: "மாதிரி ஆதரிக்காத உபகரணங்கள்", manualChecks: ["பாதுகாப்புக் காலணிகள் அணிந்ததைச் சரிபார்த்தேன்.", "பொருத்தமான பாதுகாப்புக் கையுறைகள் அணிந்துள்ளேன்.", "வேலை உடை மற்றும் வெளிப்பட்ட உடல் பகுதிகளைச் சரிபார்த்தேன்."],
    submitPpe: "AI பகுப்பாய்வு செய்து சோதனையை அனுப்பவும்", photoRequired: "பாதுகாப்பு உபகரணப் படம் எடுக்கவும்.",
    manualRequired: "அனைத்து கைமுறை சோதனைகளையும் முடிக்கவும்.", analyzing: "YOLO PPE பகுப்பாய்வு செய்கிறது…",
    ppeToast: "மாதிரி PPE பகுப்பாய்வு முடிந்தது. இது உண்மையான AI முடிவு அல்ல.", aiPass: "AI சோதனை வெற்றி",
    helmet: "பாதுகாப்புத் தலைக்கவசம்", harness: "பாதுகாப்புப் பட்டை", weldingMask: "வெல்டிங் முகமூடி", model: "பகுப்பாய்வு மாதிரி", worn: "அணிந்துள்ளார்",
    reportTitle: "தள அபாய அறிக்கை", reportGuide: "அபாய வகை, தளப் படம் மற்றும் விவரங்களை ஒன்றாக அனுப்பவும்.", riskType: "அபாய வகை",
    risks: ["வீழ்ச்சி / உயரப் பணி", "PPE அணியவில்லை", "தீ / வெடிப்பு", "உபகரணக் கோளாறு", "மோதல் / சிக்குதல்", "விழும் / கனமான பொருள்", "மற்றவை"],
    hazardPhoto: "அபாயத் தளப் படம்", reportHint: "அபாயத்தையும் இடத்தையும் விரிவாக எழுதவும்.", submitReport: "அபாய அறிக்கையை அனுப்பவும்",
    myReports: "என் அறிக்கைகள்", count: (v) => `${v} அறிக்கைகள்`, noReports: "அபாய அறிக்கைகள் இல்லை.",
    reportPhotoRequired: "தளப் படத்தை இணைக்கவும்.", reportDetailRequired: "அபாய விவரங்களை உள்ளிடவும்.", reportToast: "மாதிரி அபாய அறிக்கை அனுப்பப்பட்டது.",
    received: "பெறப்பட்டது", justNow: "இப்போது", reportRecord: "உயரப் பணி அபாய அறிக்கை",
    permissions: "அனுமதிகள்", permissionsValue: "வேலை பார்வை · TBM · தனிப்பட்ட சோதனை · அபாய அறிக்கை", appLanguage: "செயலி மொழி",
    appLanguageGuide: "தேர்ந்த மொழி அனைத்து திரைகள் மற்றும் குரல் வழிகாட்டியில் பயன்படுத்தப்படும்.", logout: "வெளியேறு",
    serverCaption: "சேவையகம்: மாதிரி தரவு · மேகம் இணைக்கப்படவில்லை", languageToast: "செயலி மொழி மாற்றப்பட்டது.",
    logoutToast: "மாதிரி முறையில் வெளியேற முடியாது.",
  },
  th: {
    worker: "คนงานภาคสนาม", demo: "สาธิต", demoWorker: "คนงานสาธิต",
    pages: ["งานวันนี้", "ฟัง TBM", "ตรวจส่วนบุคคล", "รายงานอันตราย", "โปรไฟล์ของฉัน"],
    nav: ["งาน", "TBM", "ตรวจ", "รายงาน", "โปรไฟล์"],
    approved: "● อนุมัติงานแล้ว", workTitle: "งานประกอบท่อส่วนบนบล็อก B-07", block: "บล็อก B-07",
    workTime: "เวลาทำงาน", workType: "ประเภทงาน", siteRisk: "ความเสี่ยงหน้างาน", highRisk: "งานความเสี่ยงสูง", piping: "งานประกอบท่อ",
    requiredConditions: "เงื่อนไขอนุมัติที่จำเป็น", conditions: "สวมหมวกและรองเท้านิรภัยเสมอ\n• ตรวจสอบระบบป้องกันการตกก่อนทำงานบนที่สูง\n• จำกัดการเข้าใต้พื้นที่ทำงาน",
    beforeWork: "ก่อนเริ่มงาน", completeInOrder: "ทำตามลำดับ", tbmListen: "ฟังคำแนะนำความปลอดภัย TBM", confirmed: "ยืนยันแล้ว",
    listenAndConfirm: "ฟังและยืนยันรายละเอียด", ppeCheck: "ตรวจ PPE ส่วนบุคคล", analysisComplete: "วิเคราะห์เสร็จแล้ว",
    photoPpeCheck: "ตรวจอุปกรณ์นิรภัยด้วยภาพถ่าย", reportHazard: "รายงานอันตรายในพื้นที่",
    tbmInstruction: "ฟังให้ครบและยืนยันก่อนเริ่มงาน", listen: "▶ ฟัง", stop: "■ หยุด", speechUnsupported: "เบราว์เซอร์นี้ไม่รองรับการเล่นเสียง",
    tbmDone: "✓ ยืนยัน TBM แล้ว", reviewed: "ฉันตรวจสอบเนื้อหาแล้ว", tbmToast: "ยืนยัน TBM สาธิตเรียบร้อยแล้ว",
    ppeDone: "✓ ตรวจ PPE ส่วนบุคคลวันนี้เสร็จแล้ว", aiTitle: "AI ตรวจอุปกรณ์นิรภัย",
    aiGuide: "ถ่ายภาพให้เห็นช่วงบน หมวกนิรภัย สายรัด และหน้ากากเชื่อมในภาพเดียวอย่างชัดเจน โมเดล YOLO PPE จะวิเคราะห์ภาพ",
    ppePhoto: "ภาพอุปกรณ์นิรภัย", camera: "ถ่ายภาพ", gallery: "เลือกจากแกลเลอรี", manualItems: "รายการตรวจด้วยตนเอง",
    unsupported: "อุปกรณ์ที่โมเดลยังไม่รองรับ", manualChecks: ["ตรวจแล้วว่าสวมรองเท้านิรภัย", "สวมถุงมือที่เหมาะกับงาน", "ตรวจชุดทำงานและส่วนร่างกายที่เปิดเผยแล้ว"],
    submitPpe: "วิเคราะห์ AI และส่งผลตรวจ", photoRequired: "โปรดถ่ายภาพอุปกรณ์นิรภัย",
    manualRequired: "ทำรายการตรวจด้วยตนเองให้ครบ", analyzing: "YOLO กำลังวิเคราะห์ PPE…",
    ppeToast: "การวิเคราะห์ PPE สาธิตเสร็จแล้ว นี่ไม่ใช่ผล AI จริง", aiPass: "ผ่านการตรวจ AI",
    helmet: "หมวกนิรภัย", harness: "สายรัดนิรภัย", weldingMask: "หน้ากากเชื่อม", model: "โมเดลวิเคราะห์", worn: "สวมแล้ว",
    reportTitle: "รายงานอันตรายในพื้นที่", reportGuide: "ส่งประเภทอันตราย ภาพหน้างาน และรายละเอียดพร้อมกัน", riskType: "ประเภทอันตราย",
    risks: ["เสี่ยงตก / งานบนที่สูง", "ไม่สวม PPE", "เสี่ยงไฟไหม้ / ระเบิด", "อุปกรณ์ขัดข้อง", "ชน / หนีบ", "วัตถุตก / วัตถุหนัก", "อื่น ๆ"],
    hazardPhoto: "ภาพจุดอันตราย", reportHint: "อธิบายอันตรายและตำแหน่งโดยละเอียด", submitReport: "ส่งรายงานอันตราย",
    myReports: "รายงานของฉัน", count: (v) => `${v} รายงาน`, noReports: "ยังไม่มีรายงานอันตราย",
    reportPhotoRequired: "แนบภาพหน้างาน", reportDetailRequired: "กรอกรายละเอียดอันตราย", reportToast: "ส่งรายงานอันตรายสาธิตแล้ว",
    received: "รับแล้ว", justNow: "เมื่อสักครู่", reportRecord: "รายงานอันตรายงานบนที่สูง",
    permissions: "สิทธิ์ใช้งาน", permissionsValue: "ดูงาน · TBM · ตรวจส่วนบุคคล · รายงานอันตราย", appLanguage: "ภาษาแอป",
    appLanguageGuide: "ใช้ภาษาที่เลือกกับทุกหน้าจอและคำแนะนำเสียง", logout: "ออกจากระบบ",
    serverCaption: "เซิร์ฟเวอร์: ข้อมูลสาธิต · ไม่ได้เชื่อมต่อคลาวด์", languageToast: "เปลี่ยนภาษาแอปแล้ว",
    logoutToast: "โหมดสาธิตไม่สามารถออกจากระบบได้",
  },
  my: {
    worker: "လုပ်ငန်းခွင် အလုပ်သမား", demo: "သရုပ်ပြ", demoWorker: "သရုပ်ပြ အလုပ်သမား",
    pages: ["ယနေ့အလုပ်", "TBM နားထောင်ရန်", "ကိုယ်ပိုင်စစ်ဆေးမှု", "အန္တရာယ်တိုင်ကြားမှု", "ကျွန်ုပ်၏ပရိုဖိုင်"],
    nav: ["အလုပ်", "TBM", "စစ်ဆေး", "တိုင်ကြား", "ပရိုဖိုင်"],
    approved: "● အလုပ်အတည်ပြုပြီး", workTitle: "B-07 ဘလောက် အပေါ်ပိုင်းပိုက် တပ်ဆင်ခြင်း", block: "B-07 ဘလောက်",
    workTime: "အလုပ်ချိန်", workType: "အလုပ်အမျိုးအစား", siteRisk: "လုပ်ငန်းခွင်အန္တရာယ်", highRisk: "အန္တရာယ်မြင့်အလုပ်", piping: "ပိုက်တပ်ဆင်ခြင်း",
    requiredConditions: "လိုအပ်သော ခွင့်ပြုချက်စည်းကမ်း", conditions: "ဘေးကင်းရေးဦးထုပ်နှင့် ဖိနပ်ကို အမြဲဝတ်ပါ။\n• အမြင့်တွင် အလုပ်မလုပ်မီ ပြုတ်ကျမှုကာကွယ်ရေးကို စစ်ဆေးပါ။\n• အလုပ်ဧရိယာအောက်သို့ ဝင်ရောက်မှုကို ကန့်သတ်ပါ။",
    beforeWork: "အလုပ်မစမီ", completeInOrder: "အစဉ်လိုက် ပြီးစီးပါ", tbmListen: "TBM ဘေးကင်းရေးညွှန်ကြားချက် နားထောင်ရန်", confirmed: "အတည်ပြုပြီး",
    listenAndConfirm: "နားထောင်ပြီး အတည်ပြုပါ။", ppeCheck: "ကိုယ်ပိုင် PPE စစ်ဆေးမှု", analysisComplete: "ခွဲခြမ်းစိတ်ဖြာပြီး",
    photoPpeCheck: "ဓာတ်ပုံဖြင့် ဘေးကင်းရေးပစ္စည်း စစ်ဆေးပါ။", reportHazard: "လုပ်ငန်းခွင်အန္တရာယ် တိုင်ကြားရန်",
    tbmInstruction: "အလုပ်မစမီ အပြည့်အစုံ နားထောင်ပြီး အတည်ပြုပါ။", listen: "▶ နားထောင်ရန်", stop: "■ ရပ်ရန်", speechUnsupported: "ဤဘရောက်ဇာတွင် အသံဖွင့်ခြင်းကို မထောက်ပံ့ပါ။",
    tbmDone: "✓ TBM အတည်ပြုပြီး", reviewed: "အကြောင်းအရာကို စစ်ဆေးပြီး", tbmToast: "သရုပ်ပြ TBM အတည်ပြုမှု ပြီးစီးပါပြီ။",
    ppeDone: "✓ ယနေ့ ကိုယ်ပိုင် PPE စစ်ဆေးမှု ပြီးစီးပါပြီ။", aiTitle: "AI ဘေးကင်းရေးပစ္စည်း စစ်ဆေးမှု",
    aiGuide: "အလုပ်သမား၏ အပေါ်ပိုင်း၊ ဦးထုပ်၊ ခါးပတ်နှင့် ဂဟေဆော်မျက်နှာဖုံးကို ပုံတစ်ပုံတည်းတွင် ရှင်းလင်းစွာ ရိုက်ပါ။ YOLO PPE မော်ဒယ်က ခွဲခြမ်းစိတ်ဖြာမည်။",
    ppePhoto: "ဘေးကင်းရေးပစ္စည်း ဓာတ်ပုံ", camera: "ဓာတ်ပုံရိုက်ရန်", gallery: "ပြခန်းမှရွေးရန်", manualItems: "ကိုယ်တိုင်စစ်ဆေးရန်",
    unsupported: "မော်ဒယ် မထောက်ပံ့သောပစ္စည်း", manualChecks: ["ဘေးကင်းရေးဖိနပ် ဝတ်ထားကြောင်း စစ်ဆေးပြီး။", "သင့်တော်သော ကာကွယ်ရေးလက်အိတ် ဝတ်ထားသည်။", "အလုပ်ဝတ်စုံနှင့် ဖော်ထုတ်နေသော အစိတ်အပိုင်းများ စစ်ဆေးပြီး။"],
    submitPpe: "AI ခွဲခြမ်းပြီး စစ်ဆေးမှုတင်ရန်", photoRequired: "ဘေးကင်းရေးပစ္စည်း ဓာတ်ပုံရိုက်ပါ။",
    manualRequired: "ကိုယ်တိုင်စစ်ဆေးမှုအားလုံး ပြီးစီးပါ။", analyzing: "YOLO က PPE ကို ခွဲခြမ်းနေသည်…",
    ppeToast: "သရုပ်ပြ PPE ခွဲခြမ်းမှု ပြီးစီးပါပြီ။ ဤသည်မှာ AI အစစ်ရလဒ် မဟုတ်ပါ။", aiPass: "AI စစ်ဆေးမှု အောင်မြင်",
    helmet: "ဘေးကင်းရေးဦးထုပ်", harness: "ဘေးကင်းရေးခါးပတ်", weldingMask: "ဂဟေဆော်မျက်နှာဖုံး", model: "ခွဲခြမ်းမော်ဒယ်", worn: "ဝတ်ထားသည်",
    reportTitle: "လုပ်ငန်းခွင်အန္တရာယ် အစီရင်ခံစာ", reportGuide: "အန္တရာယ်အမျိုးအစား၊ ဓာတ်ပုံနှင့် အသေးစိတ်ကို အတူတင်ပါ။", riskType: "အန္တရာယ်အမျိုးအစား",
    risks: ["ပြုတ်ကျ / အမြင့်အလုပ်", "PPE မဝတ်ခြင်း", "မီး / ပေါက်ကွဲအန္တရာယ်", "စက်ပစ္စည်းချို့ယွင်း", "တိုက်မိ / ညပ်မိ", "ကျလာ / လေးလံပစ္စည်း", "အခြား"],
    hazardPhoto: "အန္တရာယ်နေရာ ဓာတ်ပုံ", reportHint: "အန္တရာယ်နှင့် နေရာကို အသေးစိတ်ရေးပါ။", submitReport: "အန္တရာယ်အစီရင်ခံစာ တင်ရန်",
    myReports: "ကျွန်ုပ်၏ အစီရင်ခံစာများ", count: (v) => `${v} ခု`, noReports: "အန္တရာယ်အစီရင်ခံစာ မရှိသေးပါ။",
    reportPhotoRequired: "လုပ်ငန်းခွင်ဓာတ်ပုံ ပူးတွဲပါ။", reportDetailRequired: "အန္တရာယ်အသေးစိတ် ထည့်ပါ။", reportToast: "သရုပ်ပြ အန္တရာယ်အစီရင်ခံစာ တင်ပြီး။",
    received: "လက်ခံပြီး", justNow: "ယခုလေးတင်", reportRecord: "အမြင့်အလုပ် အန္တရာယ်အစီရင်ခံစာ",
    permissions: "အသုံးပြုခွင့်", permissionsValue: "အလုပ်ကြည့်ရန် · TBM · ကိုယ်ပိုင်စစ်ဆေးမှု · အန္တရာယ်တိုင်ကြားမှု", appLanguage: "အက်ပ်ဘာသာစကား",
    appLanguageGuide: "ရွေးချယ်ထားသော ဘာသာစကားကို မျက်နှာပြင်အားလုံးနှင့် အသံညွှန်ကြားချက်တွင် သုံးပါမည်။", logout: "အကောင့်ထွက်ရန်",
    serverCaption: "ဆာဗာ: သရုပ်ပြဒေတာ · ကလောက်ဒ်မချိတ်ဆက်ထား", languageToast: "အက်ပ်ဘာသာစကား ပြောင်းပြီး။",
    logoutToast: "သရုပ်ပြမုဒ်တွင် အကောင့်ထွက်မရပါ။",
  },
};

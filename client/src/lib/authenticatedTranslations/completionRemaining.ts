import type { Locale } from "@/stores/userPreferencesStore";

// High-frequency authenticated states shared by cleanup, history, telemetry,
// and settings. The feature catalogs remain the source of truth for longer
// feature-specific copy.
const rows: Record<string, string[]> = {
  "Scan complete": ["スキャン完了", "스캔 완료", "اسکین مکمل ہو گیا", "स्कैन पूरा हुआ", "স্ক্যান সম্পন্ন", "ਸਕੈਨ ਪੂਰਾ ਹੋਇਆ", "Pemindaian selesai", "Tarama tamamlandı", "Đã quét xong"],
  "Scan failed": ["スキャン失敗", "스캔 실패", "اسکین ناکام ہو گیا", "स्कैन विफल हुआ", "স্ক্যান ব্যর্থ", "ਸਕੈਨ ਅਸਫਲ ਹੋਇਆ", "Pemindaian gagal", "Tarama başarısız", "Quét thất bại"],
  "Scanning…": ["スキャン中…", "스캔 중…", "اسکین جاری ہے…", "स्कैन हो रहा है…", "স্ক্যান করা হচ্ছে…", "ਸਕੈਨ ਹੋ ਰਿਹਾ ਹੈ…", "Memindai…", "Taranıyor…", "Đang quét…"],
  "Select all": ["すべて選択", "모두 선택", "سب منتخب کریں", "सभी चुनें", "সব নির্বাচন করুন", "ਸਭ ਚੁਣੋ", "Pilih semua", "Tümünü seç", "Chọn tất cả"],
  Selected: ["選択済み", "선택됨", "منتخب", "चयनित", "নির্বাচিত", "ਚੁਣਿਆ ਗਿਆ", "Dipilih", "Seçildi", "Đã chọn"],
  "Unable to verify": ["確認できません", "확인할 수 없음", "تصدیق نہیں ہو سکی", "सत्यापित नहीं कर सकते", "যাচাই করা যায়নি", "ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋ ਸਕੀ", "Tidak dapat diverifikasi", "Doğrulanamıyor", "Không thể xác minh"],
  "Unknown error": ["不明なエラー", "알 수 없는 오류", "نامعلوم خرابی", "अज्ञात त्रुटि", "অজানা ত্রুটি", "ਅਣਜਾਣ ਗਲਤੀ", "Kesalahan tidak dikenal", "Bilinmeyen hata", "Lỗi không xác định"],
  "Nothing selected": ["何も選択されていません", "선택된 항목 없음", "کچھ منتخب نہیں کیا گیا", "कुछ भी चयनित नहीं", "কিছু নির্বাচন করা হয়নি", "ਕੁਝ ਨਹੀਂ ਚੁਣਿਆ", "Tidak ada yang dipilih", "Hiçbir şey seçilmedi", "Chưa chọn mục nào"],
  "Nothing to restore": ["復元するものはありません", "복원할 항목 없음", "بحال کرنے کے لیے کچھ نہیں", "पुनर्स्थापित करने के लिए कुछ नहीं", "পুনরুদ্ধার করার কিছু নেই", "ਬਹਾਲ ਕਰਨ ਲਈ ਕੁਝ ਨਹੀਂ", "Tidak ada yang dipulihkan", "Geri yüklenecek bir şey yok", "Không có gì để khôi phục"],
  "Open the desktop app to apply changes": ["変更を適用するにはデスクトップアプリを開いてください", "변경 사항을 적용하려면 데스크톱 앱을 여세요", "تبدیلیاں لاگو کرنے کے لیے ڈیسک ٹاپ ایپ کھولیں", "परिवर्तन लागू करने के लिए डेस्कटॉप ऐप खोलें", "পরিবর্তন প্রয়োগ করতে ডেস্কটপ অ্যাপ খুলুন", "ਤਬਦੀਲੀਆਂ ਲਾਗੂ ਕਰਨ ਲਈ ਡੈਸਕਟਾਪ ਐਪ ਖੋਲ੍ਹੋ", "Buka aplikasi desktop untuk menerapkan perubahan", "Değişiklikleri uygulamak için masaüstü uygulamasını açın", "Mở ứng dụng máy tính để áp dụng thay đổi"],
  "Open the desktop app to restore changes": ["変更を復元するにはデスクトップアプリを開いてください", "변경 사항을 복원하려면 데스크톱 앱을 여세요", "تبدیلیاں بحال کرنے کے لیے ڈیسک ٹاپ ایپ کھولیں", "परिवर्तन पुनर्स्थापित करने के लिए डेस्कटॉप ऐप खोलें", "পরিবর্তন পুনরুদ্ধার করতে ডেস্কটপ অ্যাপ খুলুন", "ਤਬਦੀਲੀਆਂ ਬਹਾਲ ਕਰਨ ਲਈ ਡੈਸਕਟਾਪ ਐਪ ਖੋਲ੍ਹੋ", "Buka aplikasi desktop untuk memulihkan perubahan", "Değişiklikleri geri yüklemek için masaüstü uygulamasını açın", "Mở ứng dụng máy tính để khôi phục thay đổi"],
  "Please wait…": ["お待ちください…", "잠시 기다려 주세요…", "براہ کرم انتظار کریں…", "कृपया प्रतीक्षा करें…", "অনুগ্রহ করে অপেক্ষা করুন…", "ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ…", "Harap tunggu…", "Lütfen bekleyin…", "Vui lòng chờ…"],
  "No data": ["データなし", "데이터 없음", "کوئی ڈیٹا نہیں", "कोई डेटा नहीं", "কোনও ডেটা নেই", "ਕੋਈ ਡਾਟਾ ਨਹੀਂ", "Tidak ada data", "Veri yok", "Không có dữ liệu"],
  "System cleaned": ["システムをクリーンアップしました", "시스템 정리 완료", "سسٹم صاف ہو گیا", "सिस्टम साफ़ किया गया", "সিস্টেম পরিষ্কার করা হয়েছে", "ਸਿਸਟਮ ਸਾਫ਼ ਕੀਤਾ ਗਿਆ", "Sistem dibersihkan", "Sistem temizlendi", "Đã dọn dẹp hệ thống"],
  "Restore point created": ["復元ポイントを作成しました", "복원 지점 생성됨", "بحالی پوائنٹ بنا دیا گیا", "पुनर्स्थापना बिंदु बनाया गया", "পুনরুদ্ধার পয়েন্ট তৈরি হয়েছে", "ਬਹਾਲੀ ਪੁਆਇੰਟ ਬਣਾਇਆ ਗਿਆ", "Titik pemulihan dibuat", "Geri yükleme noktası oluşturuldu", "Đã tạo điểm khôi phục"],
  Recommendations: ["おすすめ", "권장 사항", "سفارشات", "सुझाव", "সুপারিশ", "ਸਿਫ਼ਾਰਸ਼ਾਂ", "Rekomendasi", "Öneriler", "Đề xuất"],
  "Activity Monitor": ["アクティビティモニター", "활동 모니터", "سرگرمی مانیٹر", "गतिविधि मॉनिटर", "অ্যাক্টিভিটি মনিটর", "ਗਤੀਵਿਧੀ ਮਾਨੀਟਰ", "Monitor Aktivitas", "Etkinlik izleyicisi", "Trình giám sát hoạt động"],
  "Telemetry unavailable": ["テレメトリを利用できません", "텔레메트리 사용 불가", "ٹیلی میٹری دستیاب نہیں", "टेलीमेट्री उपलब्ध नहीं", "টেলিমেট্রি উপলব্ধ নয়", "ਟੈਲੀਮੈਟਰੀ ਉਪਲਬਧ ਨਹੀਂ", "Telemetri tidak tersedia", "Telemetri kullanılamıyor", "Không có dữ liệu đo từ xa"],
  "Optimize Now": ["今すぐ最適化", "지금 최적화", "ابھی بہتر بنائیں", "अभी अनुकूलित करें", "এখন অপ্টিমাইজ করুন", "ਹੁਣ ਅਨੁਕੂਲ ਬਣਾਓ", "Optimalkan sekarang", "Şimdi optimize et", "Tối ưu hóa ngay"],
  "View Logs": ["ログを表示", "로그 보기", "لاگز دیکھیں", "लॉग देखें", "লগ দেখুন", "ਲੌਗ ਵੇਖੋ", "Lihat log", "Günlükleri görüntüle", "Xem nhật ký"],
  "Detecting…": ["検出中…", "감지 중…", "تلاش جاری ہے…", "पता लगाया जा रहा है…", "শনাক্ত করা হচ্ছে…", "ਪਤਾ ਲਗਾਇਆ ਜਾ ਰਿਹਾ ਹੈ…", "Mendeteksi…", "Algılanıyor…", "Đang phát hiện…"],
  "Clear RAM": ["RAMをクリア", "RAM 지우기", "RAM صاف کریں", "RAM साफ़ करें", "RAM পরিষ্কার করুন", "RAM ਸਾਫ਼ ਕਰੋ", "Bersihkan RAM", "RAM'i temizle", "Xóa RAM"],
  "Update History": ["更新履歴", "업데이트 기록", "اپ ڈیٹ کی سرگزشت", "अपडेट इतिहास", "আপডেটের ইতিহাস", "ਅੱਪਡੇਟ ਇਤਿਹਾਸ", "Riwayat pembaruan", "Güncelleme geçmişi", "Lịch sử cập nhật"],
  "Hardware dependent": ["ハードウェア依存", "하드웨어 의존", "ہارڈ ویئر پر منحصر", "हार्डवेयर पर निर्भर", "হার্ডওয়্যার নির্ভর", "ਹਾਰਡਵੇਅਰ ਉੱਤੇ ਨਿਰਭਰ", "Bergantung pada perangkat keras", "Donanıma bağlı", "Phụ thuộc phần cứng"],
  "Not Scanned": ["未スキャン", "스캔되지 않음", "اسکین نہیں کیا گیا", "स्कैन नहीं किया गया", "স্ক্যান করা হয়নি", "ਸਕੈਨ ਨਹੀਂ ਕੀਤਾ ਗਿਆ", "Belum dipindai", "Taranmadı", "Chưa quét"],
  Cached: ["キャッシュ済み", "캐시됨", "کیش شدہ", "कैश किया गया", "ক্যাশ করা", "ਕੈਸ਼ ਕੀਤਾ ਗਿਆ", "Di-cache", "Önbelleğe alındı", "Đã lưu trong bộ nhớ đệm"],
  "Source:": ["ソース:", "출처:", "ماخذ:", "स्रोत:", "উৎস:", "ਸਰੋਤ:", "Sumber:", "Kaynak:", "Nguồn:"],
  Temperature: ["温度", "온도", "درجہ حرارت", "तापमान", "তাপমাত্রা", "ਤਾਪਮਾਨ", "Suhu", "Sıcaklık", "Nhiệt độ"],
  "Settings updated": ["設定を更新しました", "설정 업데이트됨", "ترتیبات اپ ڈیٹ ہو گئیں", "सेटिंग्स अपडेट की गईं", "সেটিংস আপডেট হয়েছে", "ਸੈਟਿੰਗਾਂ ਅੱਪਡੇਟ ਹੋਈਆਂ", "Pengaturan diperbarui", "Ayarlar güncellendi", "Đã cập nhật cài đặt"],
  "Something went wrong. Please try again.": ["問題が発生しました。もう一度お試しください。", "문제가 발생했습니다. 다시 시도해 주세요.", "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔", "कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।", "কিছু ভুল হয়েছে। আবার চেষ্টা করুন।", "ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।", "Terjadi kesalahan. Silakan coba lagi.", "Bir şeyler yanlış gitti. Lütfen tekrar deneyin.", "Đã xảy ra lỗi. Vui lòng thử lại."],
  "Waiting for enough reliable capability signals.": ["十分に信頼できる能力情報を待機中です。", "신뢰할 수 있는 성능 신호를 기다리는 중입니다.", "قابل اعتماد صلاحیت کے کافی سگنلز کا انتظار ہے۔", "पर्याप्त विश्वसनीय क्षमता संकेतों की प्रतीक्षा है।", "পর্যাপ্ত নির্ভরযোগ্য সক্ষমতার সংকেতের জন্য অপেক্ষা করা হচ্ছে।", "ਕਾਫ਼ੀ ਭਰੋਸੇਯੋਗ ਸਮਰੱਥਾ ਸੰਕੇਤਾਂ ਦੀ ਉਡੀਕ ਹੈ।", "Menunggu sinyal kemampuan yang cukup andal.", "Yeterli güvenilir yetenek sinyali bekleniyor.", "Đang chờ đủ tín hiệu về khả năng đáng tin cậy."],
};

const build = (index: number): Record<string, string> =>
  Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]]));

export const AUTH_COMPLETION_REMAINING: Partial<Record<Locale, Record<string, string>>> = {
  ja: build(0),
  ko: build(1),
  ur: build(2),
  hi: build(3),
  bn: build(4),
  pa: build(5),
  id: build(6),
  tr: build(7),
  vi: build(8),
};
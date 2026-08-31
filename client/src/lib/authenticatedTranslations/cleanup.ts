import type { Locale } from "@/stores/userPreferencesStore";

/**
 * Cleanup copy that is shared by authenticated maintenance screens.  The
 * source key is deliberately stable; each supported locale supplies its own
 * native-language value.
 */
export const CLEANUP_AUTH_TRANSLATIONS: Partial<Record<Locale, Record<string, string>>> = {
  en: { "Cleanup complete": "Cleanup complete", Safe: "Safe", Balanced: "Balanced", Aggressive: "Aggressive", Extreme: "Extreme", "Consumer Apps": "Consumer Apps", "System Services": "System Services", "Shell & UI": "Shell & UI" },
  "zh-CN": { "Cleanup complete": "清理完成", Safe: "安全", Balanced: "均衡", Aggressive: "激进", Extreme: "极限", "Consumer Apps": "消费级应用", "System Services": "系统服务", "Shell & UI": "Shell 和界面" },
  es: { "Cleanup complete": "Limpieza completada", Safe: "Seguro", Balanced: "Equilibrado", Aggressive: "Agresivo", Extreme: "Extremo", "Consumer Apps": "Aplicaciones de consumo", "System Services": "Servicios del sistema", "Shell & UI": "Shell e interfaz" },
  hi: { "Cleanup complete": "सफाई पूरी हुई", Safe: "सुरक्षित", Balanced: "संतुलित", Aggressive: "आक्रामक", Extreme: "अत्यधिक", "Consumer Apps": "उपभोक्ता ऐप", "System Services": "सिस्टम सेवाएँ", "Shell & UI": "शेल और UI" },
  ar: { "Cleanup complete": "اكتمل التنظيف", Safe: "آمن", Balanced: "متوازن", Aggressive: "مكثف", Extreme: "متطرف", "Consumer Apps": "تطبيقات المستهلك", "System Services": "خدمات النظام", "Shell & UI": "الصدفة وواجهة المستخدم" },
  "pt-BR": { "Cleanup complete": "Limpeza concluída", Safe: "Seguro", Balanced: "Equilibrado", Aggressive: "Agressivo", Extreme: "Extremo", "Consumer Apps": "Aplicativos do consumidor", "System Services": "Serviços do sistema", "Shell & UI": "Shell e interface" },
  bn: { "Cleanup complete": "পরিষ্কার সম্পন্ন হয়েছে", Safe: "নিরাপদ", Balanced: "ভারসাম্যপূর্ণ", Aggressive: "আক্রমণাত্মক", Extreme: "চরম", "Consumer Apps": "ভোক্তা অ্যাপ", "System Services": "সিস্টেম পরিষেবা", "Shell & UI": "শেল ও UI" },
  ru: { "Cleanup complete": "Очистка завершена", Safe: "Безопасный", Balanced: "Сбалансированный", Aggressive: "Агрессивный", Extreme: "Экстремальный", "Consumer Apps": "Потребительские приложения", "System Services": "Системные службы", "Shell & UI": "Оболочка и интерфейс" },
  ja: { "Cleanup complete": "クリーンアップが完了しました", Safe: "安全", Balanced: "バランス", Aggressive: "積極的", Extreme: "極限", "Consumer Apps": "コンシューマー アプリ", "System Services": "システム サービス", "Shell & UI": "シェルと UI" },
  pa: { "Cleanup complete": "ਸਫਾਈ ਪੂਰੀ ਹੋ ਗਈ", Safe: "ਸੁਰੱਖਿਅਤ", Balanced: "ਸੰਤੁਲਿਤ", Aggressive: "ਹਮਲਾਵਰ", Extreme: "ਅਤਿਅਧਿਕ", "Consumer Apps": "ਖਪਤਕਾਰ ਐਪਾਂ", "System Services": "ਸਿਸਟਮ ਸੇਵਾਵਾਂ", "Shell & UI": "ਸ਼ੈੱਲ ਅਤੇ UI" },
  de: { "Cleanup complete": "Bereinigung abgeschlossen", Safe: "Sicher", Balanced: "Ausgewogen", Aggressive: "Aggressiv", Extreme: "Extrem", "Consumer Apps": "Verbraucher-Apps", "System Services": "Systemdienste", "Shell & UI": "Shell und UI" },
  id: { "Cleanup complete": "Pembersihan selesai", Safe: "Aman", Balanced: "Seimbang", Aggressive: "Agresif", Extreme: "Ekstrem", "Consumer Apps": "Aplikasi konsumen", "System Services": "Layanan sistem", "Shell & UI": "Shell dan UI" },
  ko: { "Cleanup complete": "정리가 완료되었습니다", Safe: "안전", Balanced: "균형", Aggressive: "공격적", Extreme: "극한", "Consumer Apps": "소비자 앱", "System Services": "시스템 서비스", "Shell & UI": "셸 및 UI" },
  fr: { "Cleanup complete": "Nettoyage terminé", Safe: "Sûr", Balanced: "Équilibré", Aggressive: "Agressif", Extreme: "Extrême", "Consumer Apps": "Applications grand public", "System Services": "Services système", "Shell & UI": "Shell et interface" },
  te: { "Cleanup complete": "శుభ్రపరచడం పూర్తయింది", Safe: "సురక్షితం", Balanced: "సమతుల్యం", Aggressive: "దూకుడు", Extreme: "అత్యంత", "Consumer Apps": "వినియోగదారు యాప్‌లు", "System Services": "సిస్టమ్ సేవలు", "Shell & UI": "షెల్ మరియు UI" },
  tr: { "Cleanup complete": "Temizleme tamamlandı", Safe: "Güvenli", Balanced: "Dengeli", Aggressive: "Agresif", Extreme: "Aşırı", "Consumer Apps": "Tüketici uygulamaları", "System Services": "Sistem hizmetleri", "Shell & UI": "Kabuk ve arayüz" },
  mr: { "Cleanup complete": "स्वच्छता पूर्ण झाली", Safe: "सुरक्षित", Balanced: "संतुलित", Aggressive: "आक्रमक", Extreme: "अत्यंत", "Consumer Apps": "ग्राहक अॅप्स", "System Services": "सिस्टम सेवा", "Shell & UI": "शेल आणि UI" },
  ta: { "Cleanup complete": "சுத்தம் முடிந்தது", Safe: "பாதுகாப்பான", Balanced: "சமநிலையான", Aggressive: "தீவிரமான", Extreme: "அதிகபட்ச", "Consumer Apps": "நுகர்வோர் செயலிகள்", "System Services": "கணினி சேவைகள்", "Shell & UI": "ஷெல் மற்றும் UI" },
  vi: { "Cleanup complete": "Đã dọn dẹp xong", Safe: "An toàn", Balanced: "Cân bằng", Aggressive: "Mạnh", Extreme: "Cực độ", "Consumer Apps": "Ứng dụng người dùng", "System Services": "Dịch vụ hệ thống", "Shell & UI": "Shell và giao diện" },
  ur: { "Cleanup complete": "صفائی مکمل ہو گئی", Safe: "محفوظ", Balanced: "متوازن", Aggressive: "جارحانہ", Extreme: "انتہائی", "Consumer Apps": "صارف ایپس", "System Services": "سسٹم سروسز", "Shell & UI": "شیل اور UI" },
};
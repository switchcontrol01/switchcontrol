/**
 * Public-page catalogs for Arabic, Indonesian, Vietnamese, and Urdu.
 *
 * The public-page source inventory is shared with the CJK pack. Keeping the
 * key projection here makes this pack cycle-free and guarantees that newly
 * audited page copy cannot disappear from a supported locale.
 */
import { PAGE_LOCALES_CJK } from "./pageLocalesCjk";

const KEYS = Object.keys(PAGE_LOCALES_CJK["zh-CN"]);

const LABELS: Record<"ar" | "id" | "vi" | "ur", Record<string, string>> = {
  ar: {
    Features: "الميزات",
    Pricing: "الأسعار",
    FAQ: "الأسئلة الشائعة",
    Download: "التنزيل",
    Login: "تسجيل الدخول",
    "Try Free": "جرّب مجانًا",
    "View Pricing": "عرض الأسعار",
    Free: "مجاني",
    Premium: "بريميوم",
    Cancel: "إلغاء",
    Retry: "إعادة المحاولة",
    Yes: "نعم",
    No: "لا",
    Included: "مضمّن",
    "Not included": "غير مضمّن",
    "Learn more": "معرفة المزيد",
    "Billing": "الفوترة",
    "Privacy Policy": "سياسة الخصوصية",
    Terms: "الشروط",
    "Join Discord": "انضم إلى Discord",
    "Email us": "راسلنا بالبريد",
    Available: "متاح",
  },
  id: {
    Features: "Fitur",
    Pricing: "Harga",
    FAQ: "Pertanyaan Umum",
    Download: "Unduh",
    Login: "Masuk",
    "Try Free": "Coba Gratis",
    "View Pricing": "Lihat Harga",
    Free: "Gratis",
    Premium: "Premium",
    Cancel: "Batal",
    Retry: "Coba lagi",
    Yes: "Ya",
    No: "Tidak",
    Included: "Termasuk",
    "Not included": "Tidak termasuk",
    "Learn more": "Pelajari selengkapnya",
    "Billing": "Penagihan",
    "Privacy Policy": "Kebijakan Privasi",
    Terms: "Ketentuan",
    "Join Discord": "Gabung Discord",
    "Email us": "Email kami",
    Available: "Tersedia",
  },
  vi: {
    Features: "Tính năng",
    Pricing: "Định giá",
    FAQ: "Câu hỏi thường gặp",
    Download: "Tải xuống",
    Login: "Đăng nhập",
    "Try Free": "Dùng thử miễn phí",
    "View Pricing": "Xem giá",
    Free: "Miễn phí",
    Premium: "Premium",
    Cancel: "Hủy",
    Retry: "Thử lại",
    Yes: "Có",
    No: "Không",
    Included: "Bao gồm",
    "Not included": "Không bao gồm",
    "Learn more": "Tìm hiểu thêm",
    "Billing": "Thanh toán",
    "Privacy Policy": "Chính sách bảo mật",
    Terms: "Điều khoản",
    "Join Discord": "Tham gia Discord",
    "Email us": "Gửi email cho chúng tôi",
    Available: "Sẵn sàng",
  },
  ur: {
    Features: "خصوصیات",
    Pricing: "قیمتیں",
    FAQ: "اکثر پوچھے گئے سوالات",
    Download: "ڈاؤن لوڈ",
    Login: "لاگ اِن",
    "Try Free": "مفت آزمائیں",
    "View Pricing": "قیمتیں دیکھیں",
    Free: "مفت",
    Premium: "پریمیم",
    Cancel: "منسوخ کریں",
    Retry: "دوبارہ کوشش کریں",
    Yes: "ہاں",
    No: "نہیں",
    Included: "شامل",
    "Not included": "شامل نہیں",
    "Learn more": "مزید جانیں",
    Billing: "بلنگ",
    "Privacy Policy": "رازداری کی پالیسی",
    Terms: "شرائط",
    "Join Discord": "Discord میں شامل ہوں",
    "Email us": "ہمیں ای میل کریں",
    Available: "دستیاب",
  },
};

function catalog(locale: keyof typeof LABELS): Record<string, string> {
  const source = PAGE_LOCALES_CJK["zh-CN"];
  return Object.fromEntries(KEYS.map((key) => [key, LABELS[locale][key] ?? source[key] ?? key]));
}

export const PAGE_LOCALES_OTHER: Record<"ar" | "id" | "vi" | "ur", Record<string, string>> = {
  ar: catalog("ar"),
  id: catalog("id"),
  vi: catalog("vi"),
  ur: catalog("ur"),
};
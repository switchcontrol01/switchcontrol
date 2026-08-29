import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUserPreferencesStore, type Locale } from "@/stores/userPreferencesStore";

export type { Locale };

export const LOCALES: Array<{ code: Locale; nativeName: string; englishName: string; dir: "ltr" | "rtl" }> = [
  { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  { code: "zh-CN", nativeName: "简体中文", englishName: "Simplified Chinese", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", dir: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", dir: "ltr" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", dir: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", dir: "ltr" },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", dir: "ltr" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", dir: "ltr" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", dir: "ltr" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", dir: "ltr" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", dir: "ltr" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", dir: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", dir: "ltr" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu", dir: "rtl" },
];

type MessageCatalog = Record<string, string>;

const EN: MessageCatalog = {
  Dashboard: "Dashboard", Tweaks: "Tweaks", "Network Tweaks": "Network Tweaks", "NIC Tuning": "NIC Tuning",
  "Power Plan": "Power Plan", Cleaner: "Cleaner", Debloat: "Debloat", Startup: "Startup",
  "Process Manager": "Process Manager", "AI Advisor": "AI Advisor", "BIOS Advisor": "BIOS Advisor",
  Security: "Security", History: "History", "Driver Intel": "Driver Intel", "Latency Analyzer": "Latency Analyzer",
  Settings: "Settings", Free: "Free", Premium: "Premium", "Sign out": "Sign out", General: "General",
  "Language": "Language", "Choose your language": "Choose the language used throughout SwitchControl.",
  Appearance: "Appearance", Accessibility: "Accessibility", Layout: "Layout", "Tweak behavior": "Tweak behavior",
  "Notifications & startup": "Notifications & startup", "Privacy & diagnostics": "Privacy & diagnostics",
  "Real-time Metrics": "Real-time Metrics", "Updates while visible and pauses automatically in the background.": "Updates while visible and pauses automatically in the background.",
  Enabled: "Enabled", Disabled: "Disabled", Active: "Active", Off: "Off", Unknown: "Unknown",
  Save: "Save", Cancel: "Cancel", Close: "Close", Retry: "Retry", Reset: "Reset", Upgrade: "Upgrade",
  "Export settings": "Export settings", "Clear local history": "Clear local history", "Factory Reset": "Factory Reset",
  Account: "Account", Manage: "Manage", Theme: "Theme", "Accent color": "Accent color", "Reduced motion": "Reduced motion",
  "Larger text": "Larger text", "Sidebar items": "Sidebar items", "Dashboard cards": "Dashboard cards",
  "Large sidebar": "Large sidebar", "Confirmation prompts": "Confirmation prompts",
  "Recommended tweaks first": "Recommended tweaks first", "Applied tweaks first": "Applied tweaks first",
  "Hide unsupported tweaks": "Hide unsupported tweaks", "Show experimental tweaks": "Show experimental tweaks",
  "Create restore point": "Create restore point", "Save registry backup": "Save registry backup",
  "Show verification results": "Show verification results", "Metrics refresh": "Metrics refresh",
  "Tweak notifications": "Tweak notifications", "Verification warnings": "Verification warnings",
  "Health alerts": "Health alerts", "Start with Windows": "Start with Windows", "Launch minimized": "Launch minimized",
  "Open Dashboard on startup": "Open Dashboard on startup", "Check for updates automatically": "Check for updates automatically",
  "Anonymous crash reports": "Anonymous crash reports", "Share performance diagnostics": "Share performance diagnostics",
  "Share hardware context with AI Advisor": "Share hardware context with AI Advisor",
  "Settings Saved": "Settings Saved", "Your preferences have been updated.": "Your preferences have been updated.",
  "Loading…": "Loading…", Error: "Error", "Not available": "Not available", "What's New": "What's New", New: "New",
  Dismiss: "Dismiss", "Starting backend…": "Starting backend…", "Backend failed to start. Please restart the app.": "Backend failed to start. Please restart the app.",
  "Backend did not start in time. Please restart the app.": "Backend did not start in time. Please restart the app.",
  "Trial ending soon —": "Trial ending soon —", "Free trial active —": "Free trial active —",
  "Dark": "Dark", "Light": "Light", System: "System", Midnight: "Midnight", "OLED Black": "OLED Black", "High Contrast": "High Contrast",
  "Normal Mode": "Normal Mode", "Light Mode": "Light Mode", "Every change": "Every change",
  "Risky changes only": "Risky changes only", "Never for safe changes": "Never for safe changes",
  Paused: "Paused", "Every 2 seconds": "Every 2 seconds", "Every 5 seconds": "Every 5 seconds", "Every 10 seconds": "Every 10 seconds",
};

// Core UI terms are intentionally kept in one compact catalog so all locales
// are available immediately, without a network translation service.
const CATALOGS: Record<Locale, MessageCatalog> = {
  en: EN,
  "zh-CN": {
    Dashboard: "仪表板", Tweaks: "调整", "Network Tweaks": "网络调整", "NIC Tuning": "网卡调优", "Power Plan": "电源计划",
    Cleaner: "清理器", Debloat: "系统精简", Startup: "启动项", "Process Manager": "进程管理器", "AI Advisor": "AI 顾问",
    "BIOS Advisor": "BIOS 顾问", Security: "安全", History: "历史记录", "Driver Intel": "驱动智能", "Latency Analyzer": "延迟分析器",
    Settings: "设置", Free: "免费", Premium: "高级版", "Sign out": "退出登录", General: "常规", Language: "语言",
    "Choose your language": "选择 SwitchControl 使用的语言。", Appearance: "外观", Accessibility: "无障碍", Layout: "布局",
    "Tweak behavior": "调整行为", "Notifications & startup": "通知与启动", "Privacy & diagnostics": "隐私与诊断",
    "Real-time Metrics": "实时指标", "Updates while visible and pauses automatically in the background.": "可见时更新，在后台自动暂停。",
    Enabled: "已启用", Disabled: "已禁用", Active: "活动", Off: "关闭", Unknown: "未知", Save: "保存", Cancel: "取消",
    Close: "关闭", Retry: "重试", Reset: "重置", Upgrade: "升级", "Export settings": "导出设置", "Clear local history": "清除本地历史",
    Account: "账户", Manage: "管理", Theme: "主题", "Accent color": "强调色", "Reduced motion": "减少动画", "Larger text": "更大文字",
    "Sidebar items": "侧边栏项目", "Dashboard cards": "仪表板卡片", "Large sidebar": "大侧边栏", "Confirmation prompts": "确认提示",
    "Recommended tweaks first": "优先显示推荐调整", "Applied tweaks first": "优先显示已应用调整", "Hide unsupported tweaks": "隐藏不支持的调整",
    "Show experimental tweaks": "显示实验性调整", "Create restore point": "创建还原点", "Save registry backup": "保存注册表备份",
    "Show verification results": "显示验证结果", "Metrics refresh": "指标刷新", "Tweak notifications": "调整通知",
    "Verification warnings": "验证警告", "Health alerts": "健康提醒", "Start with Windows": "随 Windows 启动", "Launch minimized": "最小化启动",
    "Open Dashboard on startup": "启动时打开仪表板", "Check for updates automatically": "自动检查更新", "Anonymous crash reports": "匿名崩溃报告",
    "Share performance diagnostics": "分享性能诊断", "Share hardware context with AI Advisor": "向 AI 顾问分享硬件信息",
    "Settings Saved": "设置已保存", "Your preferences have been updated.": "你的偏好设置已更新。", "Loading…": "加载中…", Error: "错误",
    "Not available": "不可用", "What's New": "最新内容", New: "新", Dark: "深色", Light: "浅色", System: "系统",
    "OLED Black": "OLED 黑色", "High Contrast": "高对比度", "Normal Mode": "普通模式", "Light Mode": "轻量模式",
    "Every change": "每次更改", "Risky changes only": "仅高风险更改", "Never for safe changes": "安全更改不提示",
    Paused: "已暂停", "Every 2 seconds": "每 2 秒", "Every 5 seconds": "每 5 秒", "Every 10 seconds": "每 10 秒",
  },
  es: {
    Dashboard: "Panel", Tweaks: "Ajustes", "Network Tweaks": "Ajustes de red", "NIC Tuning": "Ajuste de NIC", "Power Plan": "Plan de energía",
    Cleaner: "Limpiador", Debloat: "Optimización", Startup: "Inicio", "Process Manager": "Administrador de procesos", "AI Advisor": "Asesor de IA",
    "BIOS Advisor": "Asesor de BIOS", Security: "Seguridad", History: "Historial", "Driver Intel": "Inteligencia de controladores", "Latency Analyzer": "Analizador de latencia",
    Settings: "Configuración", Free: "Gratis", Premium: "Premium", "Sign out": "Cerrar sesión", General: "General", Language: "Idioma",
    "Choose your language": "Elige el idioma usado en SwitchControl.", Appearance: "Apariencia", Accessibility: "Accesibilidad", Layout: "Diseño",
    "Tweak behavior": "Comportamiento de ajustes", "Notifications & startup": "Notificaciones e inicio", "Privacy & diagnostics": "Privacidad y diagnósticos",
    "Real-time Metrics": "Métricas en tiempo real", "Updates while visible and pauses automatically in the background.": "Se actualiza visible y se pausa automáticamente en segundo plano.",
    Enabled: "Activado", Disabled: "Desactivado", Active: "Activo", Off: "Apagado", Unknown: "Desconocido", Save: "Guardar", Cancel: "Cancelar",
    Close: "Cerrar", Retry: "Reintentar", Reset: "Restablecer", Upgrade: "Mejorar", "Export settings": "Exportar configuración", "Clear local history": "Borrar historial local",
    Account: "Cuenta", Manage: "Administrar", Theme: "Tema", "Accent color": "Color de acento", "Reduced motion": "Reducir movimiento", "Larger text": "Texto más grande",
    "Sidebar items": "Elementos de la barra lateral", "Dashboard cards": "Tarjetas del panel", "Large sidebar": "Barra lateral grande", "Confirmation prompts": "Confirmaciones",
    "Recommended tweaks first": "Ajustes recomendados primero", "Applied tweaks first": "Ajustes aplicados primero", "Hide unsupported tweaks": "Ocultar ajustes no compatibles",
    "Show experimental tweaks": "Mostrar ajustes experimentales", "Create restore point": "Crear punto de restauración", "Save registry backup": "Guardar copia del registro",
    "Show verification results": "Mostrar resultados de verificación", "Metrics refresh": "Frecuencia de métricas", "Tweak notifications": "Notificaciones de ajustes",
    "Verification warnings": "Avisos de verificación", "Health alerts": "Alertas de salud", "Start with Windows": "Iniciar con Windows", "Launch minimized": "Iniciar minimizado",
    "Open Dashboard on startup": "Abrir el panel al iniciar", "Check for updates automatically": "Buscar actualizaciones automáticamente", "Anonymous crash reports": "Informes de errores anónimos",
    "Share performance diagnostics": "Compartir diagnósticos de rendimiento", "Share hardware context with AI Advisor": "Compartir hardware con el asesor de IA",
    "Settings Saved": "Configuración guardada", "Your preferences have been updated.": "Tus preferencias se han actualizado.", "Loading…": "Cargando…", Error: "Error",
    "Not available": "No disponible", "What's New": "Novedades", New: "Nuevo", Dark: "Oscuro", Light: "Claro", System: "Sistema",
    "OLED Black": "Negro OLED", "High Contrast": "Alto contraste", "Normal Mode": "Modo normal", "Light Mode": "Modo ligero",
    "Every change": "Cada cambio", "Risky changes only": "Solo cambios de riesgo", "Never for safe changes": "Nunca para cambios seguros",
    Paused: "En pausa", "Every 2 seconds": "Cada 2 segundos", "Every 5 seconds": "Cada 5 segundos", "Every 10 seconds": "Cada 10 segundos",
  },
  de: {
    Dashboard: "Dashboard", Tweaks: "Optimierungen", "Network Tweaks": "Netzwerkoptimierungen", "NIC Tuning": "NIC-Tuning", "Power Plan": "Energieplan",
    Cleaner: "Bereinigung", Debloat: "Systembereinigung", Startup: "Autostart", "Process Manager": "Prozessmanager", "AI Advisor": "KI-Berater",
    "BIOS Advisor": "BIOS-Berater", Security: "Sicherheit", History: "Verlauf", "Driver Intel": "Treiber-Intelligenz", "Latency Analyzer": "Latenzanalyse",
    Settings: "Einstellungen", Free: "Kostenlos", Premium: "Premium", "Sign out": "Abmelden", General: "Allgemein", Language: "Sprache",
    "Choose your language": "Wähle die Sprache für SwitchControl.", Appearance: "Darstellung", Accessibility: "Barrierefreiheit", Layout: "Layout",
    "Tweak behavior": "Optimierungsverhalten", "Notifications & startup": "Benachrichtigungen & Autostart", "Privacy & diagnostics": "Datenschutz & Diagnose",
    "Real-time Metrics": "Echtzeitmetriken", "Updates while visible and pauses automatically in the background.": "Wird bei Sichtbarkeit aktualisiert und pausiert automatisch im Hintergrund.",
    Enabled: "Aktiviert", Disabled: "Deaktiviert", Active: "Aktiv", Off: "Aus", Unknown: "Unbekannt", Save: "Speichern", Cancel: "Abbrechen",
    Close: "Schließen", Retry: "Erneut versuchen", Reset: "Zurücksetzen", Upgrade: "Upgrade", "Export settings": "Einstellungen exportieren", "Clear local history": "Lokalen Verlauf löschen",
    Account: "Konto", Manage: "Verwalten", Theme: "Design", "Accent color": "Akzentfarbe", "Reduced motion": "Weniger Bewegung", "Larger text": "Größerer Text",
    "Sidebar items": "Seitenleistenelemente", "Dashboard cards": "Dashboard-Karten", "Large sidebar": "Große Seitenleiste", "Confirmation prompts": "Bestätigungsabfragen",
    "Recommended tweaks first": "Empfohlene Optimierungen zuerst", "Applied tweaks first": "Angewendete Optimierungen zuerst", "Hide unsupported tweaks": "Nicht unterstützte Optimierungen ausblenden",
    "Show experimental tweaks": "Experimentelle Optimierungen anzeigen", "Create restore point": "Wiederherstellungspunkt erstellen", "Save registry backup": "Registry-Sicherung speichern",
    "Show verification results": "Prüfergebnisse anzeigen", "Metrics refresh": "Metrik-Aktualisierung", "Tweak notifications": "Optimierungsbenachrichtigungen",
    "Verification warnings": "Prüfwarnungen", "Health alerts": "Gesundheitswarnungen", "Start with Windows": "Mit Windows starten", "Launch minimized": "Minimiert starten",
    "Open Dashboard on startup": "Dashboard beim Start öffnen", "Check for updates automatically": "Automatisch nach Updates suchen", "Anonymous crash reports": "Anonyme Absturzberichte",
    "Share performance diagnostics": "Leistungsdiagnosen teilen", "Share hardware context with AI Advisor": "Hardwareinformationen mit dem KI-Berater teilen",
    "Settings Saved": "Einstellungen gespeichert", "Your preferences have been updated.": "Deine Einstellungen wurden aktualisiert.", "Loading…": "Wird geladen…", Error: "Fehler",
    "Not available": "Nicht verfügbar", "What's New": "Neuigkeiten", New: "Neu", Dark: "Dunkel", Light: "Hell", System: "System",
    "OLED Black": "OLED-Schwarz", "High Contrast": "Hoher Kontrast", "Normal Mode": "Normalmodus", "Light Mode": "Leichtmodus",
    "Every change": "Jede Änderung", "Risky changes only": "Nur riskante Änderungen", "Never for safe changes": "Nie bei sicheren Änderungen",
    Paused: "Pausiert", "Every 2 seconds": "Alle 2 Sekunden", "Every 5 seconds": "Alle 5 Sekunden", "Every 10 seconds": "Alle 10 Sekunden",
  },
  fr: {
    Dashboard: "Tableau de bord", Tweaks: "Optimisations", "Network Tweaks": "Optimisations réseau", "NIC Tuning": "Réglage NIC", "Power Plan": "Mode d’alimentation",
    Cleaner: "Nettoyeur", Debloat: "Allègement", Startup: "Démarrage", "Process Manager": "Gestionnaire des processus", "AI Advisor": "Conseiller IA",
    "BIOS Advisor": "Conseiller BIOS", Security: "Sécurité", History: "Historique", "Driver Intel": "Intelligence des pilotes", "Latency Analyzer": "Analyseur de latence",
    Settings: "Paramètres", Free: "Gratuit", Premium: "Premium", "Sign out": "Se déconnecter", General: "Général", Language: "Langue",
    "Choose your language": "Choisissez la langue utilisée dans SwitchControl.", Appearance: "Apparence", Accessibility: "Accessibilité", Layout: "Mise en page",
    "Tweak behavior": "Comportement des optimisations", "Notifications & startup": "Notifications et démarrage", "Privacy & diagnostics": "Confidentialité et diagnostics",
    "Real-time Metrics": "Métriques en temps réel", "Updates while visible and pauses automatically in the background.": "Se met à jour quand la fenêtre est visible et se met en pause en arrière-plan.",
    Enabled: "Activé", Disabled: "Désactivé", Active: "Actif", Off: "Désactivé", Unknown: "Inconnu", Save: "Enregistrer", Cancel: "Annuler",
    Close: "Fermer", Retry: "Réessayer", Reset: "Réinitialiser", Upgrade: "Mettre à niveau", "Export settings": "Exporter les paramètres", "Clear local history": "Effacer l’historique local",
    Account: "Compte", Manage: "Gérer", Theme: "Thème", "Accent color": "Couleur d’accent", "Reduced motion": "Réduire les animations", "Larger text": "Texte plus grand",
    "Sidebar items": "Éléments de la barre latérale", "Dashboard cards": "Cartes du tableau de bord", "Large sidebar": "Grande barre latérale", "Confirmation prompts": "Demandes de confirmation",
    "Recommended tweaks first": "Optimisations recommandées en premier", "Applied tweaks first": "Optimisations appliquées en premier", "Hide unsupported tweaks": "Masquer les optimisations incompatibles",
    "Show experimental tweaks": "Afficher les optimisations expérimentales", "Create restore point": "Créer un point de restauration", "Save registry backup": "Enregistrer une sauvegarde du registre",
    "Show verification results": "Afficher les résultats de vérification", "Metrics refresh": "Actualisation des métriques", "Tweak notifications": "Notifications d’optimisation",
    "Verification warnings": "Avertissements de vérification", "Health alerts": "Alertes de santé", "Start with Windows": "Démarrer avec Windows", "Launch minimized": "Démarrer réduit",
    "Open Dashboard on startup": "Ouvrir le tableau de bord au démarrage", "Check for updates automatically": "Rechercher automatiquement les mises à jour", "Anonymous crash reports": "Rapports de plantage anonymes",
    "Share performance diagnostics": "Partager les diagnostics de performance", "Share hardware context with AI Advisor": "Partager le matériel avec le conseiller IA",
    "Settings Saved": "Paramètres enregistrés", "Your preferences have been updated.": "Vos préférences ont été mises à jour.", "Loading…": "Chargement…", Error: "Erreur",
    "Not available": "Indisponible", "What's New": "Nouveautés", New: "Nouveau", Dark: "Sombre", Light: "Clair", System: "Système",
    "OLED Black": "Noir OLED", "High Contrast": "Contraste élevé", "Normal Mode": "Mode normal", "Light Mode": "Mode léger",
    "Every change": "Chaque modification", "Risky changes only": "Modifications risquées uniquement", "Never for safe changes": "Jamais pour les modifications sûres",
    Paused: "En pause", "Every 2 seconds": "Toutes les 2 secondes", "Every 5 seconds": "Toutes les 5 secondes", "Every 10 seconds": "Toutes les 10 secondes",
  },
  // The remaining locales include the complete navigation and settings vocabulary.
  // Unlisted long-form copy safely falls back to English and is reported in dev.
  hi: { Dashboard: "डैशबोर्ड", Tweaks: "ट्वीक", "Network Tweaks": "नेटवर्क ट्वीक", "Power Plan": "पावर प्लान", Cleaner: "क्लीनर", Security: "सुरक्षा", Settings: "सेटिंग्स", General: "सामान्य", Language: "भाषा", Appearance: "दिखावट", Accessibility: "सुलभता", Layout: "लेआउट", Enabled: "सक्षम", Disabled: "अक्षम", Active: "सक्रिय", Unknown: "अज्ञात", Save: "सहेजें", Cancel: "रद्द करें", Close: "बंद करें", Retry: "पुनः प्रयास", Reset: "रीसेट", Account: "खाता", Manage: "प्रबंधित करें", "Dark": "गहरा", "Light": "हल्का", System: "सिस्टम", Premium: "प्रीमियम", Free: "मुफ़्त", "Sign out": "साइन आउट", "Real-time Metrics": "रीयल-टाइम मेट्रिक्स", "What's New": "नया क्या है", New: "नया" },
  ar: { Dashboard: "لوحة التحكم", Tweaks: "التعديلات", "Network Tweaks": "تعديلات الشبكة", "Power Plan": "خطة الطاقة", Cleaner: "التنظيف", Security: "الأمان", Settings: "الإعدادات", General: "عام", Language: "اللغة", Appearance: "المظهر", Accessibility: "إمكانية الوصول", Layout: "التخطيط", Enabled: "مفعّل", Disabled: "معطّل", Active: "نشط", Unknown: "غير معروف", Save: "حفظ", Cancel: "إلغاء", Close: "إغلاق", Retry: "إعادة المحاولة", Reset: "إعادة ضبط", Account: "الحساب", Manage: "إدارة", Dark: "داكن", Light: "فاتح", System: "النظام", Premium: "مميز", Free: "مجاني", "Sign out": "تسجيل الخروج", "Real-time Metrics": "المقاييس الفورية", "What's New": "ما الجديد", New: "جديد" },
  "pt-BR": { Dashboard: "Painel", Tweaks: "Ajustes", "Network Tweaks": "Ajustes de rede", "Power Plan": "Plano de energia", Cleaner: "Limpador", Security: "Segurança", Settings: "Configurações", General: "Geral", Language: "Idioma", Appearance: "Aparência", Accessibility: "Acessibilidade", Layout: "Layout", Enabled: "Ativado", Disabled: "Desativado", Active: "Ativo", Unknown: "Desconhecido", Save: "Salvar", Cancel: "Cancelar", Close: "Fechar", Retry: "Tentar novamente", Reset: "Redefinir", Account: "Conta", Manage: "Gerenciar", Dark: "Escuro", Light: "Claro", System: "Sistema", Premium: "Premium", Free: "Grátis", "Sign out": "Sair", "Real-time Metrics": "Métricas em tempo real", "What's New": "Novidades", New: "Novo" },
  bn: { Dashboard: "ড্যাশবোর্ড", Tweaks: "টুইক", "Network Tweaks": "নেটওয়ার্ক টুইক", "Power Plan": "পাওয়ার প্ল্যান", Cleaner: "ক্লিনার", Security: "নিরাপত্তা", Settings: "সেটিংস", General: "সাধারণ", Language: "ভাষা", Appearance: "চেহারা", Accessibility: "অ্যাক্সেসিবিলিটি", Layout: "লেআউট", Enabled: "সক্রিয়", Disabled: "নিষ্ক্রিয়", Active: "সক্রিয়", Unknown: "অজানা", Save: "সংরক্ষণ", Cancel: "বাতিল", Close: "বন্ধ", Retry: "আবার চেষ্টা", Reset: "রিসেট", Account: "অ্যাকাউন্ট", Manage: "পরিচালনা", Dark: "গাঢ়", Light: "হালকা", System: "সিস্টেম", Premium: "প্রিমিয়াম", Free: "ফ্রি", "Sign out": "সাইন আউট", "Real-time Metrics": "রিয়েল-টাইম মেট্রিক্স", "What's New": "নতুন কী", New: "নতুন" },
  ru: { Dashboard: "Панель", Tweaks: "Настройки", "Network Tweaks": "Сетевые настройки", "Power Plan": "План питания", Cleaner: "Очистка", Security: "Безопасность", Settings: "Настройки", General: "Общие", Language: "Язык", Appearance: "Внешний вид", Accessibility: "Доступность", Layout: "Макет", Enabled: "Включено", Disabled: "Отключено", Active: "Активно", Unknown: "Неизвестно", Save: "Сохранить", Cancel: "Отмена", Close: "Закрыть", Retry: "Повторить", Reset: "Сбросить", Account: "Аккаунт", Manage: "Управление", Dark: "Тёмная", Light: "Светлая", System: "Система", Premium: "Премиум", Free: "Бесплатно", "Sign out": "Выйти", "Real-time Metrics": "Метрики в реальном времени", "What's New": "Что нового", New: "Новое" },
  ja: { Dashboard: "ダッシュボード", Tweaks: "調整", "Network Tweaks": "ネットワーク調整", "Power Plan": "電源プラン", Cleaner: "クリーナー", Security: "セキュリティ", Settings: "設定", General: "一般", Language: "言語", Appearance: "外観", Accessibility: "アクセシビリティ", Layout: "レイアウト", Enabled: "有効", Disabled: "無効", Active: "アクティブ", Unknown: "不明", Save: "保存", Cancel: "キャンセル", Close: "閉じる", Retry: "再試行", Reset: "リセット", Account: "アカウント", Manage: "管理", Dark: "ダーク", Light: "ライト", System: "システム", Premium: "プレミアム", Free: "無料", "Sign out": "サインアウト", "Real-time Metrics": "リアルタイム指標", "What's New": "新機能", New: "新規" },
  pa: { Dashboard: "ਡੈਸ਼ਬੋਰਡ", Tweaks: "ਟਵੀਕ", "Network Tweaks": "ਨੈੱਟਵਰਕ ਟਵੀਕ", "Power Plan": "ਪਾਵਰ ਪਲਾਨ", Cleaner: "ਕਲੀਨਰ", Security: "ਸੁਰੱਖਿਆ", Settings: "ਸੈਟਿੰਗਾਂ", General: "ਆਮ", Language: "ਭਾਸ਼ਾ", Appearance: "ਦਿੱਖ", Accessibility: "ਪਹੁੰਚਯੋਗਤਾ", Layout: "ਲੇਆਉਟ", Enabled: "ਚਾਲੂ", Disabled: "ਬੰਦ", Active: "ਸਰਗਰਮ", Unknown: "ਅਣਜਾਣ", Save: "ਸੁਰੱਖਿਅਤ ਕਰੋ", Cancel: "ਰੱਦ", Close: "ਬੰਦ", Retry: "ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼", Reset: "ਰੀਸੈੱਟ", Account: "ਖਾਤਾ", Manage: "ਪ੍ਰਬੰਧਿਤ", Dark: "ਗੂੜ੍ਹਾ", Light: "ਹਲਕਾ", System: "ਸਿਸਟਮ", Premium: "ਪ੍ਰੀਮੀਅਮ", Free: "ਮੁਫ਼ਤ", "Sign out": "ਸਾਈਨ ਆਊਟ", "Real-time Metrics": "ਰੀਅਲ-ਟਾਈਮ ਮੈਟ੍ਰਿਕਸ", "What's New": "ਨਵਾਂ ਕੀ ਹੈ", New: "ਨਵਾਂ" },
  id: { Dashboard: "Dasbor", Tweaks: "Penyesuaian", "Network Tweaks": "Penyesuaian jaringan", "Power Plan": "Rencana daya", Cleaner: "Pembersih", Security: "Keamanan", Settings: "Pengaturan", General: "Umum", Language: "Bahasa", Appearance: "Tampilan", Accessibility: "Aksesibilitas", Layout: "Tata letak", Enabled: "Aktif", Disabled: "Nonaktif", Active: "Aktif", Unknown: "Tidak diketahui", Save: "Simpan", Cancel: "Batal", Close: "Tutup", Retry: "Coba lagi", Reset: "Atur ulang", Account: "Akun", Manage: "Kelola", Dark: "Gelap", Light: "Terang", System: "Sistem", Premium: "Premium", Free: "Gratis", "Sign out": "Keluar", "Real-time Metrics": "Metrik waktu nyata", "What's New": "Yang baru", New: "Baru" },
  ko: { Dashboard: "대시보드", Tweaks: "트윅", "Network Tweaks": "네트워크 트윅", "Power Plan": "전원 계획", Cleaner: "클리너", Security: "보안", Settings: "설정", General: "일반", Language: "언어", Appearance: "모양", Accessibility: "접근성", Layout: "레이아웃", Enabled: "사용", Disabled: "사용 안 함", Active: "활성", Unknown: "알 수 없음", Save: "저장", Cancel: "취소", Close: "닫기", Retry: "다시 시도", Reset: "재설정", Account: "계정", Manage: "관리", Dark: "어둡게", Light: "밝게", System: "시스템", Premium: "프리미엄", Free: "무료", "Sign out": "로그아웃", "Real-time Metrics": "실시간 지표", "What's New": "새로운 기능", New: "새로움" },
  te: { Dashboard: "డాష్‌బోర్డ్", Tweaks: "ట్వీక్స్", "Network Tweaks": "నెట్‌వర్క్ ట్వీక్స్", "Power Plan": "పవర్ ప్లాన్", Cleaner: "క్లీనర్", Security: "భద్రత", Settings: "సెట్టింగ్‌లు", General: "సాధారణ", Language: "భాష", Appearance: "రూపం", Accessibility: "ప్రాప్యత", Layout: "లేఅవుట్", Enabled: "ప్రారంభించబడింది", Disabled: "నిలిపివేయబడింది", Active: "క్రియాశీలం", Unknown: "తెలియదు", Save: "సేవ్", Cancel: "రద్దు", Close: "మూసివేయి", Retry: "మళ్లీ ప్రయత్నించండి", Reset: "రీసెట్", Account: "ఖాతా", Manage: "నిర్వహించు", Dark: "ముదురు", Light: "లేత", System: "సిస్టమ్", Premium: "ప్రీమియం", Free: "ఉచితం", "Sign out": "సైన్ అవుట్", "Real-time Metrics": "రియల్-టైమ్ మెట్రిక్స్", "What's New": "కొత్తవి", New: "కొత్త" },
  tr: { Dashboard: "Gösterge paneli", Tweaks: "İnce ayarlar", "Network Tweaks": "Ağ ayarları", "Power Plan": "Güç planı", Cleaner: "Temizleyici", Security: "Güvenlik", Settings: "Ayarlar", General: "Genel", Language: "Dil", Appearance: "Görünüm", Accessibility: "Erişilebilirlik", Layout: "Düzen", Enabled: "Etkin", Disabled: "Devre dışı", Active: "Aktif", Unknown: "Bilinmiyor", Save: "Kaydet", Cancel: "İptal", Close: "Kapat", Retry: "Yeniden dene", Reset: "Sıfırla", Account: "Hesap", Manage: "Yönet", Dark: "Koyu", Light: "Açık", System: "Sistem", Premium: "Premium", Free: "Ücretsiz", "Sign out": "Çıkış yap", "Real-time Metrics": "Gerçek zamanlı ölçümler", "What's New": "Yenilikler", New: "Yeni" },
  mr: { Dashboard: "डॅशबोर्ड", Tweaks: "ट्वीक", "Network Tweaks": "नेटवर्क ट्वीक", "Power Plan": "पॉवर प्लॅन", Cleaner: "क्लीनर", Security: "सुरक्षा", Settings: "सेटिंग्ज", General: "सामान्य", Language: "भाषा", Appearance: "दिसणे", Accessibility: "प्रवेशयोग्यता", Layout: "मांडणी", Enabled: "सक्षम", Disabled: "अक्षम", Active: "सक्रिय", Unknown: "अज्ञात", Save: "जतन करा", Cancel: "रद्द करा", Close: "बंद करा", Retry: "पुन्हा प्रयत्न", Reset: "रीसेट", Account: "खाते", Manage: "व्यवस्थापित करा", Dark: "गडद", Light: "फिकट", System: "सिस्टम", Premium: "प्रीमियम", Free: "मोफत", "Sign out": "साइन आउट", "Real-time Metrics": "रिअल-टाइम मेट्रिक्स", "What's New": "नवीन काय", New: "नवीन" },
  ta: { Dashboard: "டாஷ்போர்டு", Tweaks: "மாற்றங்கள்", "Network Tweaks": "நெட்வொர்க் மாற்றங்கள்", "Power Plan": "மின் திட்டம்", Cleaner: "க்ளீனர்", Security: "பாதுகாப்பு", Settings: "அமைப்புகள்", General: "பொது", Language: "மொழி", Appearance: "தோற்றம்", Accessibility: "அணுகல்தன்மை", Layout: "தளவமைப்பு", Enabled: "இயக்கப்பட்டது", Disabled: "முடக்கப்பட்டது", Active: "செயலில்", Unknown: "தெரியவில்லை", Save: "சேமி", Cancel: "ரத்து", Close: "மூடு", Retry: "மீண்டும் முயற்சி", Reset: "மீட்டமை", Account: "கணக்கு", Manage: "நிர்வகி", Dark: "இருண்ட", Light: "ஒளி", System: "கணினி", Premium: "பிரீமியம்", Free: "இலவசம்", "Sign out": "வெளியேறு", "Real-time Metrics": "நிகழ்நேர அளவீடுகள்", "What's New": "புதியவை", New: "புதிய" },
  vi: { Dashboard: "Bảng điều khiển", Tweaks: "Tinh chỉnh", "Network Tweaks": "Tinh chỉnh mạng", "Power Plan": "Gói nguồn", Cleaner: "Trình dọn dẹp", Security: "Bảo mật", Settings: "Cài đặt", General: "Chung", Language: "Ngôn ngữ", Appearance: "Giao diện", Accessibility: "Trợ năng", Layout: "Bố cục", Enabled: "Đã bật", Disabled: "Đã tắt", Active: "Hoạt động", Unknown: "Không rõ", Save: "Lưu", Cancel: "Hủy", Close: "Đóng", Retry: "Thử lại", Reset: "Đặt lại", Account: "Tài khoản", Manage: "Quản lý", Dark: "Tối", Light: "Sáng", System: "Hệ thống", Premium: "Cao cấp", Free: "Miễn phí", "Sign out": "Đăng xuất", "Real-time Metrics": "Số liệu thời gian thực", "What's New": "Có gì mới", New: "Mới" },
  ur: { Dashboard: "ڈیش بورڈ", Tweaks: "ترمیمات", "Network Tweaks": "نیٹ ورک ترمیمات", "Power Plan": "پاور پلان", Cleaner: "کلینر", Security: "سکیورٹی", Settings: "ترتیبات", General: "عمومی", Language: "زبان", Appearance: "ظاہری شکل", Accessibility: "رسائی", Layout: "لے آؤٹ", Enabled: "فعال", Disabled: "غیر فعال", Active: "فعال", Unknown: "نامعلوم", Save: "محفوظ کریں", Cancel: "منسوخ", Close: "بند کریں", Retry: "دوبارہ کوشش", Reset: "ری سیٹ", Account: "اکاؤنٹ", Manage: "انتظام", Dark: "گہرا", Light: "روشن", System: "سسٹم", Premium: "پریمیم", Free: "مفت", "Sign out": "سائن آؤٹ", "Real-time Metrics": "حقیقی وقت کے اعدادوشمار", "What's New": "نیا کیا ہے", New: "نیا" },
};

const NAV_KEYS = [
  "Dashboard", "Tweaks", "Network Tweaks", "NIC Tuning", "Power Plan", "Cleaner", "Debloat", "Startup",
  "Process Manager", "AI Advisor", "BIOS Advisor", "Security", "History", "Driver Intel", "Latency Analyzer", "Settings",
] as const;

const NAV_LABELS: Partial<Record<Locale, string[]>> = {
  hi: ["डैशबोर्ड", "ट्वीक", "नेटवर्क ट्वीक", "NIC ट्यूनिंग", "पावर प्लान", "क्लीनर", "डिब्लोट", "स्टार्टअप", "प्रोसेस मैनेजर", "AI सलाहकार", "BIOS सलाहकार", "सुरक्षा", "इतिहास", "ड्राइवर इंटेल", "लेटेंसी विश्लेषक", "सेटिंग्स"],
  ar: ["لوحة التحكم", "التعديلات", "تعديلات الشبكة", "ضبط NIC", "خطة الطاقة", "التنظيف", "تبسيط النظام", "بدء التشغيل", "مدير العمليات", "مستشار الذكاء الاصطناعي", "مستشار BIOS", "الأمان", "السجل", "ذكاء برامج التشغيل", "محلل زمن الاستجابة", "الإعدادات"],
  "pt-BR": ["Painel", "Ajustes", "Ajustes de rede", "Ajuste de NIC", "Plano de energia", "Limpador", "Otimização", "Inicialização", "Gerenciador de processos", "Consultor de IA", "Consultor de BIOS", "Segurança", "Histórico", "Inteligência de drivers", "Analisador de latência", "Configurações"],
  bn: ["ড্যাশবোর্ড", "টুইক", "নেটওয়ার্ক টুইক", "NIC টিউনিং", "পাওয়ার প্ল্যান", "ক্লিনার", "ডিব্লোট", "স্টার্টআপ", "প্রসেস ম্যানেজার", "AI উপদেষ্টা", "BIOS উপদেষ্টা", "নিরাপত্তা", "ইতিহাস", "ড্রাইভার ইন্টেল", "লেটেন্সি বিশ্লেষক", "সেটিংস"],
  ru: ["Панель", "Твики", "Сетевые твики", "Настройка NIC", "План питания", "Очистка", "Оптимизация", "Автозагрузка", "Диспетчер процессов", "ИИ-советник", "Советник BIOS", "Безопасность", "История", "Интеллект драйверов", "Анализатор задержки", "Настройки"],
  ja: ["ダッシュボード", "調整", "ネットワーク調整", "NIC チューニング", "電源プラン", "クリーナー", "デブロート", "スタートアップ", "プロセスマネージャー", "AI アドバイザー", "BIOS アドバイザー", "セキュリティ", "履歴", "ドライバーインテル", "レイテンシーアナライザー", "設定"],
  pa: ["ਡੈਸ਼ਬੋਰਡ", "ਟਵੀਕ", "ਨੈੱਟਵਰਕ ਟਵੀਕ", "NIC ਟਿਊਨਿੰਗ", "ਪਾਵਰ ਪਲਾਨ", "ਕਲੀਨਰ", "ਡਿਬਲੋਟ", "ਸਟਾਰਟਅੱਪ", "ਪ੍ਰੋਸੈਸ ਮੈਨੇਜਰ", "AI ਸਲਾਹਕਾਰ", "BIOS ਸਲਾਹਕਾਰ", "ਸੁਰੱਖਿਆ", "ਇਤਿਹਾਸ", "ਡਰਾਈਵਰ ਇੰਟੈਲ", "ਲੇਟੈਂਸੀ ਵਿਸ਼ਲੇਸ਼ਕ", "ਸੈਟਿੰਗਾਂ"],
  id: ["Dasbor", "Penyesuaian", "Penyesuaian jaringan", "Penyetelan NIC", "Rencana daya", "Pembersih", "Debloat", "Startup", "Pengelola proses", "Penasihat AI", "Penasihat BIOS", "Keamanan", "Riwayat", "Intel driver", "Penganalisis latensi", "Pengaturan"],
  ko: ["대시보드", "트윅", "네트워크 트윅", "NIC 튜닝", "전원 계획", "클리너", "디블로트", "시작 프로그램", "프로세스 관리자", "AI 어드바이저", "BIOS 어드바이저", "보안", "기록", "드라이버 인텔", "지연 시간 분석기", "설정"],
  te: ["డాష్‌బోర్డ్", "ట్వీక్స్", "నెట్‌వర్క్ ట్వీక్స్", "NIC ట్యూనింగ్", "పవర్ ప్లాన్", "క్లీనర్", "డీబ్లోట్", "స్టార్టప్", "ప్రాసెస్ మేనేజర్", "AI సలహాదారు", "BIOS సలహాదారు", "భద్రత", "చరిత్ర", "డ్రైవర్ ఇంటెల్", "లేటెన్సీ విశ్లేషకం", "సెట్టింగ్‌లు"],
  tr: ["Gösterge paneli", "İnce ayarlar", "Ağ ayarları", "NIC ayarı", "Güç planı", "Temizleyici", "Debloat", "Başlangıç", "İşlem yöneticisi", "Yapay zekâ danışmanı", "BIOS danışmanı", "Güvenlik", "Geçmiş", "Sürücü zekâsı", "Gecikme analizcisi", "Ayarlar"],
  mr: ["डॅशबोर्ड", "ट्वीक", "नेटवर्क ट्वीक", "NIC ट्युनिंग", "पॉवर प्लॅन", "क्लीनर", "डीब्लोट", "स्टार्टअप", "प्रोसेस मॅनेजर", "AI सल्लागार", "BIOS सल्लागार", "सुरक्षा", "इतिहास", "ड्रायव्हर इंटेल", "लेटन्सी विश्लेषक", "सेटिंग्ज"],
  ta: ["டாஷ்போர்டு", "மாற்றங்கள்", "நெட்வொர்க் மாற்றங்கள்", "NIC டியூனிங்", "மின் திட்டம்", "க்ளீனர்", "டிப்ளோட்", "தொடக்கம்", "செயல்முறை மேலாளர்", "AI ஆலோசகர்", "BIOS ஆலோசகர்", "பாதுகாப்பு", "வரலாறு", "இயக்கி நுண்ணறிவு", "தாமத பகுப்பாய்வி", "அமைப்புகள்"],
  vi: ["Bảng điều khiển", "Tinh chỉnh", "Tinh chỉnh mạng", "Tinh chỉnh NIC", "Gói nguồn", "Trình dọn dẹp", "Tinh giản", "Khởi động", "Trình quản lý tiến trình", "Cố vấn AI", "Cố vấn BIOS", "Bảo mật", "Lịch sử", "Thông tin trình điều khiển", "Trình phân tích độ trễ", "Cài đặt"],
  ur: ["ڈیش بورڈ", "ترمیمات", "نیٹ ورک ترمیمات", "NIC ٹیوننگ", "پاور پلان", "کلینر", "ڈیبلاٹ", "اسٹارٹ اپ", "پروسیس مینیجر", "AI مشیر", "BIOS مشیر", "سکیورٹی", "تاریخ", "ڈرائیور انٹیل", "لیٹنسی اینالائزر", "ترتیبات"],
};

for (const [locale, labels] of Object.entries(NAV_LABELS) as Array<[Locale, string[]]>) {
  labels.forEach((label, index) => {
    CATALOGS[locale][NAV_KEYS[index]] = label;
  });
}

const SHELL_LABELS: Partial<Record<Locale, Record<string, string>>> = {
  "zh-CN": { Dismiss: "忽略", "Starting backend…": "正在启动后端…", "Trial ending soon —": "试用即将结束 —", "Free trial active —": "免费试用进行中 —" },
  es: { Dismiss: "Descartar", "Starting backend…": "Iniciando backend…", "Trial ending soon —": "La prueba termina pronto —", "Free trial active —": "Prueba gratuita activa —" },
  hi: { Dismiss: "खारिज करें", "Starting backend…": "बैकएंड शुरू हो रहा है…", "Trial ending soon —": "ट्रायल जल्द समाप्त होगा —", "Free trial active —": "निःशुल्क ट्रायल सक्रिय —" },
  ar: { Dismiss: "تجاهل", "Starting backend…": "جارٍ تشغيل الخادم…", "Trial ending soon —": "تنتهي التجربة قريبًا —", "Free trial active —": "التجربة المجانية مفعّلة —" },
  "pt-BR": { Dismiss: "Dispensar", "Starting backend…": "Iniciando backend…", "Trial ending soon —": "O teste termina em breve —", "Free trial active —": "Teste grátis ativo —" },
  bn: { Dismiss: "বাতিল করুন", "Starting backend…": "ব্যাকএন্ড শুরু হচ্ছে…", "Trial ending soon —": "ট্রায়াল শীঘ্রই শেষ হবে —", "Free trial active —": "বিনামূল্যের ট্রায়াল সক্রিয় —" },
  ru: { Dismiss: "Закрыть", "Starting backend…": "Запуск сервера…", "Trial ending soon —": "Пробный период скоро закончится —", "Free trial active —": "Пробный период активен —" },
  ja: { Dismiss: "閉じる", "Starting backend…": "バックエンドを起動中…", "Trial ending soon —": "トライアル終了間近 —", "Free trial active —": "無料トライアル中 —" },
  pa: { Dismiss: "ਖਾਰਜ ਕਰੋ", "Starting backend…": "ਬੈਕਐਂਡ ਸ਼ੁਰੂ ਹੋ ਰਿਹਾ ਹੈ…", "Trial ending soon —": "ਟਰਾਇਲ ਜਲਦੀ ਖਤਮ ਹੋਵੇਗਾ —", "Free trial active —": "ਮੁਫ਼ਤ ਟਰਾਇਲ ਸਰਗਰਮ —" },
  de: { Dismiss: "Schließen", "Starting backend…": "Backend wird gestartet…", "Trial ending soon —": "Testversion endet bald —", "Free trial active —": "Kostenlose Testversion aktiv —" },
  id: { Dismiss: "Tutup", "Starting backend…": "Memulai backend…", "Trial ending soon —": "Masa uji coba segera berakhir —", "Free trial active —": "Uji coba gratis aktif —" },
  ko: { Dismiss: "닫기", "Starting backend…": "백엔드를 시작하는 중…", "Trial ending soon —": "체험판이 곧 종료됩니다 —", "Free trial active —": "무료 체험판 활성 —" },
  fr: { Dismiss: "Ignorer", "Starting backend…": "Démarrage du serveur…", "Trial ending soon —": "L’essai se termine bientôt —", "Free trial active —": "Essai gratuit actif —" },
  te: { Dismiss: "తీసివేయి", "Starting backend…": "బ్యాకెండ్ ప్రారంభమవుతోంది…", "Trial ending soon —": "ట్రయల్ త్వరలో ముగుస్తుంది —", "Free trial active —": "ఉచిత ట్రయల్ సక్రియంగా ఉంది —" },
  tr: { Dismiss: "Kapat", "Starting backend…": "Arka uç başlatılıyor…", "Trial ending soon —": "Deneme yakında bitiyor —", "Free trial active —": "Ücretsiz deneme etkin —" },
  mr: { Dismiss: "काढून टाका", "Starting backend…": "बॅकएंड सुरू होत आहे…", "Trial ending soon —": "ट्रायल लवकरच संपेल —", "Free trial active —": "मोफत ट्रायल सक्रिय —" },
  ta: { Dismiss: "நிராகரி", "Starting backend…": "பின்தளம் தொடங்கப்படுகிறது…", "Trial ending soon —": "சோதனை விரைவில் முடியும் —", "Free trial active —": "இலவச சோதனை செயலில் —" },
  vi: { Dismiss: "Bỏ qua", "Starting backend…": "Đang khởi động máy chủ…", "Trial ending soon —": "Bản dùng thử sắp kết thúc —", "Free trial active —": "Bản dùng thử miễn phí đang hoạt động —" },
  ur: { Dismiss: "برخاستہ کریں", "Starting backend…": "بیک اینڈ شروع ہو رہا ہے…", "Trial ending soon —": "ٹرائل جلد ختم ہو گا —", "Free trial active —": "مفت ٹرائل فعال ہے —" },
};

for (const [locale, labels] of Object.entries(SHELL_LABELS) as Array<[Locale, Record<string, string>]>) {
  Object.assign(CATALOGS[locale], labels);
}

const I18nContext = createContext<{
  language: Locale;
  setLanguage: (language: Locale) => void;
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string;
  locales: typeof LOCALES;
}>({
  language: "en",
  setLanguage: () => undefined,
  t: (key, fallback) => fallback ?? EN[key] ?? key,
  locales: LOCALES,
});

function interpolate(value: string, values?: Record<string, string | number>) {
  if (!values) return value;
  return value.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated.trim()}${trailing}`;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const storedLanguage = useUserPreferencesStore((s) => s.language);
  const setPreference = useUserPreferencesStore((s) => s.setPreference);
  const language = CATALOGS[storedLanguage] ? storedLanguage : "en";
  const [renderVersion, setRenderVersion] = useState(0);
  const originals = useRef(new WeakMap<Text, string>());
  const attributeOriginals = useRef(new WeakMap<Element, Record<string, string>>());
  const scanTimer = useRef<number | null>(null);
  const missingKeys = useRef(new Set<string>());

  const t = useMemo(() => (key: string, fallback?: string, values?: Record<string, string | number>) => {
    const source = fallback ?? EN[key] ?? key;
    if (import.meta.env?.DEV && language !== "en" && !CATALOGS[language]?.[key] && !missingKeys.current.has(key)) {
      missingKeys.current.add(key);
      console.info(`[i18n] English fallback for missing ${language} key: ${key}`);
    }
    const translated = CATALOGS[language]?.[key] ?? EN[key] ?? source;
    return interpolate(translated, values);
  }, [language]);

  useEffect(() => {
    const meta = LOCALES.find((item) => item.code === language) ?? LOCALES[0];
    document.documentElement.lang = language;
    document.documentElement.dir = meta.dir;
    document.documentElement.dataset.locale = language;
    setRenderVersion((value) => value + 1);
  }, [language]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let syncing = false;
    const translateNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || parent.closest("[data-i18n-skip],script,style,textarea,input")) return;
      const current = node.nodeValue ?? "";
      const knownTranslation = Object.entries(CATALOGS[language] ?? {}).find(([, value]) => value === current.trim())?.[0];
      const source = originals.current.get(node) ?? knownTranslation ?? current;
      if (!originals.current.has(node)) originals.current.set(node, source);
      const trimmed = source.trim();
      if (!trimmed) return;
      const translated = t(trimmed);
      if (translated !== trimmed && current !== preserveWhitespace(source, translated)) {
        node.nodeValue = preserveWhitespace(source, translated);
      }
    };
    const translateAttributes = (element: Element) => {
      if (element.closest("[data-i18n-skip]")) return;
      const names = ["aria-label", "title", "placeholder", "alt"];
      const previous = attributeOriginals.current.get(element) ?? {};
      for (const name of names) {
        const value = element.getAttribute(name);
        if (value === null) continue;
        const source = previous[name] ?? value;
        previous[name] = source;
        const translated = t(source);
        if (translated !== source && value !== translated) element.setAttribute(name, translated);
      }
      attributeOriginals.current.set(element, previous);
    };
    const scan = () => {
      scanTimer.current = null;
      syncing = true;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) textNodes.push(node as Text);
      textNodes.forEach(translateNode);
      document.body.querySelectorAll<HTMLElement>("*").forEach(translateAttributes);
      syncing = false;
    };
    const scheduleScan = () => {
      if (scanTimer.current !== null) return;
      scanTimer.current = window.setTimeout(scan, 0);
    };
    const observer = new MutationObserver(() => {
      if (!syncing) scheduleScan();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "placeholder", "alt"] });
    scheduleScan();
    return () => {
      observer.disconnect();
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    };
  }, [language, t]);

  const context = useMemo(() => ({
    language,
    setLanguage: (next: Locale) => setPreference("language", next),
    t,
    locales: LOCALES,
  }), [language, setPreference, t]);

  // Reading renderVersion keeps the provider subscribed to language changes
  // even when a page only uses the DOM compatibility bridge.
  void renderVersion;
  return <I18nContext.Provider value={context}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export function getLocaleDirection(locale: Locale) {
  return LOCALES.find((item) => item.code === locale)?.dir ?? "ltr";
}

export const translationCatalogs = CATALOGS;
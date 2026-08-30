import type { Locale } from "@/stores/userPreferencesStore";
import type { LegalSection } from "./legalContent";

export type LocalizedLegalSections = { terms: LegalSection[]; privacy: LegalSection[] };

export const FIRST_RUN_UI_TRANSLATIONS: Partial<Record<Locale, Record<string, string>>> = {
  "zh-CN": {
    "Signed in": "已登录",
    "Review before you optimize": "优化前请先审阅",
    "Terms": "条款",
    "Privacy": "隐私",
    "Terms of Service": "服务条款",
    "Privacy Policy": "隐私政策",
    "Terms of Service and Privacy Policy": "服务条款与隐私政策",
    "Last updated:": "最后更新于：",
    "Required first step": "第一步（必需）",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "请阅读服务条款与隐私政策，然后滚动至底部以继续使用 SwitchControl。",
    "Ready to agree": "准备同意",
    "Scroll to continue": "滚动以继续",
    "We could not save your consent. Check browser storage access and try again.": "我们无法保存您的许可。请检查浏览器存储访问权限并重试。",
    "Decline & quit": "拒绝并退出",
    "Agree & continue": "同意并继续",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "点击“同意”即代表您确认已审阅上述两份文件，并同意服务条款与隐私政策。",
    "Important Notice": "重要提示",
    "Keep SwitchControl closed while gaming": "游戏时请保持 SwitchControl 关闭",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl 旨在游戏前配置和优化您的系统，而非在游戏运行时后台运行。游戏时保持应用开启可能会消耗额外的 CPU 和内存，这反而会降低而非提升性能。",
    "Apply tweaks, then close": "应用调整后请关闭",
    "Launch your game after closing": "关闭后启动您的游戏",
    "Don't keep it open mid-game": "请勿在游戏过程中保持开启",
    "It's not a game overlay tool": "它不是游戏覆盖工具",
    "I Understand — Continue": "我了解 — 继续",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "继续即代表您同意服务条款与隐私政策。SwitchControl 是一个硬件优化套件，不包含任何隐含担保。",
    "Confirm & Continue": "确认并继续",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "为了确认一下 —— 您明白 SwitchControl 应该在开始游戏前关闭，而不是在后台运行吗？",
    "Yes, I'm ready to continue": "是的，我准备好继续了",
    "← Go back and re-read": "← 返回重新阅读",
    "Welcome": "欢迎",
    "Premium Member": "Premium 会员",
    "Let's optimize your gaming experience": "让我们优化您的游戏体验",
    "Loading…": "加载中…",
    "You're all set.": "设置完成。",
    "Full premium access unlocked. Every optimization is now yours.": "完整的 Premium 访问权限已解锁。所有优化现在均归您所有。",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl 已配置完毕，随时准备提升您的系统性能。",
    "Step": "步骤",
    "of": "/",
    "Next": "下一步",
    "Finish": "完成",
    "Premium": "Premium",
    "Dashboard Overview": "仪表板概览",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "实时监控您的系统 — CPU、RAM、GPU 和磁盘一目了然。",
    "System Tweaks": "系统调整",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "应用经过验证的 Windows 优化以降低延迟，并榨取硬件的更多 FPS。",
    "Network Optimization": "网络优化",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "微调您的网络堆栈以实现更低的 ping 值、零丢包和稳定的在线会话。",
    "BIOS Advisor": "BIOS 顾问",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "获取针对您确切的 CPU 和主板量身定制的个性化 BIOS 优化建议。",
    "AI Advisor": "AI 顾问",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "与您的个人优化 AI 聊天 — 它会扫描您的系统并准确建议应更改的内容。",
    "Security Center": "安全中心",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "在不牺牲游戏性能的情况下保持系统安全和完整性检查。",
    "Join the Community": "加入社区",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "在我们的 Discord 上与成千上万的玩家交流，获取更新并赢取 Premium 赠品。",
    "Join Discord": "加入 Discord",
    "By continuing you agree to the": "继续操作即表示您同意",
    "and": "以及",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": "。SwitchControl 是一套硬件优化套件——不包含任何暗示的保证。",
    "4 active": "4 个已激活",
    "4 recommendations": "4 条建议",
    "AI Chat": "AI 聊天",
    "AI System Advisor": "AI 系统顾问",
    "After removing interference → more stable": "消除干扰后 → 更稳定",
    "Analysis confidence": "分析置信度",
    "Analyzing…": "分析中...",
    "Applied Tweaks": "已应用优化",
    "BIOS Intelligence": "BIOS 智能",
    "Background processes creating noise": "后台进程产生干扰",
    "CPU": "CPU",
    "Demo": "演示",
    "Disk": "磁盘",
    "Does not increase FPS. Removes hidden delays.": "不会提高 FPS。而是消除隐藏的延迟。",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "一切均已解锁。优先支持、高级遥测和完全优化控制现在归您所有。尽享您的 Premium 体验。",
    "Example": "示例",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "针对您特定的主板和 CPU 量身定制的专家级 BIOS 配置指南。为您确切的配置获取安全且经过性能测试的建议。",
    "FPS stability": "FPS 稳定性",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "微调您的 Windows 电源设置以实现最佳游戏性能。从优化配置文件中选择或创建针对您硬件量身定制的自定义覆盖。",
    "Full System Visibility": "全系统可见性",
    "GPU": "GPU",
    "Health": "健康状况",
    "Illustration only": "仅供示意",
    "Join the Discord for updates, announcements, and premium giveaways.": "加入 Discord 以获取更新、公告和 Premium 赠品。",
    "Latency trace": "延迟跟踪",
    "Live Performance": "实时性能",
    "Loss": "丢包",
    "No fake boosts. Just removing what slows your system down.": "没有虚假的加速。只是移除拖慢系统速度的因素。",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "电源计划控制",
    "Premium Activated": "Premium 已激活",
    "Premium Upgrade": "Premium 升级",
    "Premium only": "仅限 Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "通过先进的 TCP/IP、UDP、DNS 和 SMB 优化减少延迟和丢包。针对竞技游戏的 Premium 专属网络堆栈调优。",
    "Score": "评分",
    "Score trajectory": "评分轨迹",
    "Security health trend": "安全健康趋势",
    "System Interference — Demo": "系统干扰 — 演示",
    "Temp": "温度",
    "Thinking...": "思考中...",
    "Throughput": "吞吐量",
    "Welcome to Premium": "欢迎使用 Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "您现在可以访问完整的 SwitchControl 套件。让我们向您展示刚刚解锁的所有功能。",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "您的个人 AI 驱动优化助手。它会扫描您的系统并为您的硬件推荐最佳优化方案 — 仅供 Premium 用户使用。",
    "live": "实时"
  },
  "hi": {
    "Signed in": "साइन इन किया गया",
    "Review before you optimize": "ऑप्टिमाइज़ करने से पहले समीक्षा करें",
    "Terms": "शर्तें",
    "Privacy": "गोपनीयता",
    "Terms of Service": "सेवा की शर्तें",
    "Privacy Policy": "गोपनीयता नीति",
    "Terms of Service and Privacy Policy": "सेवा की शर्तें और गोपनीयता नीति",
    "Last updated:": "अंतिम अपडेट:",
    "Required first step": "आवश्यक पहला कदम",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "सेवा की शर्तें और गोपनीयता नीति पढ़ें, फिर SwitchControl के साथ जारी रखने के लिए अंत तक स्क्रॉल करें।",
    "Ready to agree": "सहमति के लिए तैयार",
    "Scroll to continue": "जारी रखने के लिए स्क्रॉल करें",
    "We could not save your consent. Check browser storage access and try again.": "हम आपकी सहमति सहेज नहीं सके। ब्राउज़र स्टोरेज एक्सेस की जाँच करें और पुन: प्रयास करें।",
    "Decline & quit": "अस्वीकार करें और छोड़ें",
    "Agree & continue": "सहमत हों और जारी रखें",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "सहमत हों चुनकर, आप पुष्टि करते हैं कि आपने दोनों दस्तावेज़ों की समीक्षा कर ली है और सेवा की शर्तों और गोपनीयता नीति से सहमत हैं।",
    "Important Notice": "महत्वपूर्ण सूचना",
    "Keep SwitchControl closed while gaming": "गेमिंग के दौरान SwitchControl को बंद रखें",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl को गेमिंग से पहले आपके सिस्टम को कॉन्फ़िगर और ऑप्टिमाइज़ करने के लिए डिज़ाइन किया गया है — न कि आपके गेम्स के साथ चलाने के लिए। गेमिंग के दौरान ऐप को खुला रखने से अतिरिक्त CPU और मेमोरी की खपत हो सकती है, जो इसे बेहतर बनाने के बजाय प्रदर्शन को कम कर सकती है।",
    "Apply tweaks, then close": "ट्वीक्स लागू करें, फिर बंद करें",
    "Launch your game after closing": "बंद करने के बाद अपना गेम लॉन्च करें",
    "Don't keep it open mid-game": "इसे गेम के बीच में खुला न रखें",
    "It's not a game overlay tool": "यह गेम ओवरले टूल नहीं है",
    "I Understand — Continue": "मैं समझता हूँ — जारी रखें",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "जारी रखकर आप सेवा की शर्तों और गोपनीयता नीति से सहमत होते हैं। SwitchControl एक हार्डवेयर ऑप्टिमाइज़ेशन सुइट है — कोई वारंटी निहित नहीं है।",
    "Confirm & Continue": "पुष्टि करें और जारी रखें",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "बस यह सुनिश्चित करने के लिए — क्या आप समझते हैं कि गेमिंग शुरू करने से पहले SwitchControl को बंद कर देना चाहिए, न कि बैकग्राउंड में चलाना चाहिए?",
    "Yes, I'm ready to continue": "हाँ, मैं जारी रखने के लिए तैयार हूँ",
    "← Go back and re-read": "← वापस जाएँ और दोबारा पढ़ें",
    "Welcome": "स्वागत है",
    "Premium Member": "Premium सदस्य",
    "Let's optimize your gaming experience": "आइए आपके गेमिंग अनुभव को ऑप्टिमाइज़ करें",
    "Loading…": "लोड हो रहा है...",
    "You're all set.": "आप पूरी तरह तैयार हैं।",
    "Full premium access unlocked. Every optimization is now yours.": "पूर्ण Premium एक्सेस अनलॉक हो गया है। हर ऑप्टिमाइज़ेशन अब आपका है।",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl कॉन्फ़िगर हो गया है और आपके सिस्टम को बूस्ट करने के लिए तैयार है।",
    "Step": "चरण",
    "of": "का",
    "Next": "अगला",
    "Finish": "समाप्त",
    "Premium": "Premium",
    "Dashboard Overview": "डैशबोर्ड का अवलोकन",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "अपने सिस्टम को रियल-टाइम में मॉनिटर करें — CPU, RAM, GPU और disk सभी एक नज़र में।",
    "System Tweaks": "सिस्टम ट्वीक्स",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "लेटेंसी कम करने और अपने हार्डवेयर से अधिक FPS निकालने के लिए प्रमाणित Windows ऑप्टिमाइज़ेशन लागू करें।",
    "Network Optimization": "नेटवर्क ऑप्टिमाइज़ेशन",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "कम पिंग, शून्य पैकेट लॉस और स्थिर ऑनलाइन सत्रों के लिए अपने नेटवर्क स्टैक को ठीक करें।",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "अपने सटीक CPU और मदरबोर्ड के लिए तैयार वैयक्तिकृत BIOS ऑप्टिमाइज़ेशन सुझाव प्राप्त करें।",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "अपने व्यक्तिगत ऑप्टिमाइज़ेशन AI के साथ चैट करें — यह आपके सिस्टम को स्कैन करता है और ठीक वही सुझाव देता है जिसे बदलने की आवश्यकता है।",
    "Security Center": "सुरक्षा केंद्र",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "गेमिंग प्रदर्शन से समझौता किए बिना अपने सिस्टम को सुरक्षित और अखंडता-जांच युक्त रखें।",
    "Join the Community": "समुदाय से जुड़ें",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "हजारों गेमर्स के साथ जुड़ें, अपडेट प्राप्त करें, और हमारे Discord पर प्रीमियम गिवअवे जीतें।",
    "Join Discord": "Discord से जुड़ें",
    "By continuing you agree to the": "जारी रखकर आप सहमत होते हैं",
    "and": "और",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl एक हार्डवेयर अनुकूलन सुइट है - किसी वारंटी का निहितार्थ नहीं है।",
    "4 active": "4 सक्रिय",
    "4 recommendations": "4 सुझाव",
    "AI Chat": "AI चैट",
    "AI System Advisor": "AI सिस्टम सलाहकार",
    "After removing interference → more stable": "हस्तक्षेप हटाने के बाद → अधिक स्थिर",
    "Analysis confidence": "विश्लेषण का भरोसा",
    "Analyzing…": "विश्लेषण किया जा रहा है…",
    "Applied Tweaks": "लागू किए गए ट्वीक्स",
    "BIOS Intelligence": "BIOS इंटेलिजेंस",
    "Background processes creating noise": "बैकग्राउंड प्रोसेस शोर पैदा कर रहे हैं",
    "CPU": "CPU",
    "Demo": "डेमो",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPS नहीं बढ़ाता। छुपी हुई देरी को हटाता है।",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "सब कुछ अनलॉक है। प्राथमिकता सहायता, उन्नत टेलीमेट्री और पूर्ण ऑप्टिमाइज़ेशन नियंत्रण अब आपके पास है। अपने Premium अनुभव का आनंद लें।",
    "Example": "उदाहरण",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "आपके विशिष्ट मदरबोर्ड और CPU के लिए तैयार विशेषज्ञ BIOS कॉन्फ़िगरेशन मार्गदर्शन। अपने सटीक सेटअप के लिए सुरक्षित, प्रदर्शन-परीक्षण किए गए सुझाव प्राप्त करें।",
    "FPS stability": "FPS स्थिरता",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "अधिकतम गेमिंग प्रदर्शन के लिए अपनी Windows पावर सेटिंग्स को ठीक करें। ऑप्टिमाइज़ किए गए प्रोफाइल में से चुनें या अपने हार्डवेयर के अनुसार कस्टम ओवरराइड बनाएं।",
    "Full System Visibility": "पूर्ण सिस्टम दृश्यता",
    "GPU": "GPU",
    "Health": "स्वास्थ्य",
    "Illustration only": "केवल चित्रण",
    "Join the Discord for updates, announcements, and premium giveaways.": "अपडेट, घोषणाओं और प्रीमियम गिवअवे के लिए Discord से जुड़ें।",
    "Latency trace": "लेटेंसी ट्रेस",
    "Live Performance": "लाइव प्रदर्शन",
    "Loss": "लॉस",
    "No fake boosts. Just removing what slows your system down.": "कोई नकली बूस्ट नहीं। बस उन चीजों को हटाना जो आपके सिस्टम को धीमा करती हैं।",
    "PREMIUM": "PREMIUM",
    "Ping": "पिंग",
    "Power Plan Control": "पावर प्लान कंट्रोल",
    "Premium Activated": "Premium सक्रिय",
    "Premium Upgrade": "Premium अपग्रेड",
    "Premium only": "केवल Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "उन्नत TCP/IP, UDP, DNS और SMB ऑप्टिमाइज़ेशन के साथ लेटेंसी और पैकेट लॉस को कम करें। प्रतिस्पर्धी गेमिंग के लिए केवल Premium नेटवर्क स्टैक ट्यूनिंग।",
    "Score": "स्कोर",
    "Score trajectory": "स्कोर प्रक्षेपवक्र",
    "Security health trend": "सुरक्षा स्वास्थ्य रुझान",
    "System Interference — Demo": "सिस्टम हस्तक्षेप — डेमो",
    "Temp": "तापमान",
    "Thinking...": "सोच रहा है...",
    "Throughput": "थ्रूपुट",
    "Welcome to Premium": "Premium में आपका स्वागत है",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "अब आपके पास पूर्ण SwitchControl सुइट का एक्सेस है। आइए हम आपको वह सब कुछ दिखाएं जो अभी अनलॉक हुआ है।",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "आपका व्यक्तिगत AI-संचालित ऑप्टिमाइज़ेशन सहायक। यह आपके सिस्टम को स्कैन करता है और आपके हार्डवेयर के लिए सर्वोत्तम ट्वीक्स का सुझाव देता है — विशेष रूप से Premium उपयोगकर्ताओं के लिए उपलब्ध।",
    "live": "लाइव"
  },
  "ar": {
    "Signed in": "تم تسجيل الدخول",
    "Review before you optimize": "راجع قبل التحسين",
    "Terms": "الشروط",
    "Privacy": "الخصوصية",
    "Terms of Service": "شروط الخدمة",
    "Privacy Policy": "سياسة الخصوصية",
    "Terms of Service and Privacy Policy": "شروط الخدمة وسياسة الخصوصية",
    "Last updated:": "آخر تحديث:",
    "Required first step": "الخطوة الأولى المطلوبة",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "اقرأ شروط الخدمة وسياسة الخصوصية، ثم انتقل إلى النهاية للمتابعة باستخدام SwitchControl.",
    "Ready to agree": "جاهز للموافقة",
    "Scroll to continue": "مرر للأسفل للمتابعة",
    "We could not save your consent. Check browser storage access and try again.": "تعذر علينا حفظ موافقتك. تحقق من الوصول إلى تخزين المتصفح وحاول مرة أخرى.",
    "Decline & quit": "رفض وإنهاء",
    "Agree & continue": "موافقة ومتابعة",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "من خلال تحديد موافقة، فإنك تؤكد أنك راجعت كلا المستندين وتوافق على شروط الخدمة وسياسة الخصوصية.",
    "Important Notice": "ملاحظة هامة",
    "Keep SwitchControl closed while gaming": "أبقِ SwitchControl مغلقاً أثناء اللعب",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "تم تصميم SwitchControl لتهيئة وتحسين نظامك قبل اللعب - وليس للتشغيل بجانب ألعابك. قد يؤدي إبقاء التطبيق مفتوحاً أثناء اللعب إلى استهلاك إضافي لـ CPU والذاكرة، مما قد يقلل الأداء بدلاً من تحسينه.",
    "Apply tweaks, then close": "طبق التعديلات، ثم أغلق",
    "Launch your game after closing": "شغّل لعبتك بعد الإغلاق",
    "Don't keep it open mid-game": "لا تبقِه مفتوحاً أثناء اللعب",
    "It's not a game overlay tool": "إنها ليست أداة تراكب للألعاب",
    "I Understand — Continue": "أتفهم - متابعة",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "من خلال المتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية. SwitchControl عبارة عن حزمة تحسين للأجهزة - لا يوجد ضمان ضمني.",
    "Confirm & Continue": "تأكيد ومتابعة",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "للتأكد فقط - هل تفهم أنه يجب إغلاق SwitchControl قبل بدء اللعب، وعدم تشغيله في الخلفية؟",
    "Yes, I'm ready to continue": "نعم، أنا مستعد للمتابعة",
    "← Go back and re-read": "← عد للخلف وأعد القراءة",
    "Welcome": "مرحباً",
    "Premium Member": "عضو Premium",
    "Let's optimize your gaming experience": "لنقم بتحسين تجربتك في اللعب",
    "Loading…": "جاري التحميل...",
    "You're all set.": "أنت جاهز تماماً.",
    "Full premium access unlocked. Every optimization is now yours.": "تم فتح الوصول الكامل لـ Premium. كل التحسينات أصبحت الآن لك.",
    "SwitchControl is configured and ready to boost your system.": "تم تكوين SwitchControl وهو جاهز لتعزيز نظامك.",
    "Step": "خطوة",
    "of": "من",
    "Next": "التالي",
    "Finish": "إنهاء",
    "Premium": "Premium",
    "Dashboard Overview": "نظرة عامة على لوحة التحكم",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "راقب نظامك في الوقت الفعلي — CPU و RAM و GPU والقرص، كل ذلك في لمحة واحدة.",
    "System Tweaks": "تعديلات النظام",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "طبّق تحسينات Windows المثبتة لتقليل زمن الاستجابة والحصول على أكبر قدر من FPS من جهازك.",
    "Network Optimization": "تحسين الشبكة",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "اضبط حزمة الشبكة الخاصة بك لتقليل الـ ping، وانعدام فقدان الحزم، وجلسات عبر الإنترنت مستقرة.",
    "BIOS Advisor": "مستشار BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "احصل على توصيات تحسين BIOS مخصصة تتناسب مع الـ CPU واللوحة الأم لديك بدقة.",
    "AI Advisor": "مستشار AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "تحدث مع مساعد التحسين AI الشخصي الخاص بك — يقوم بمسح نظامك ويوصي بدقة بما يجب تغييره.",
    "Security Center": "مركز الأمان",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "حافظ على نظامك آمناً ومتحققاً من سلامته دون التضحية بأداء الألعاب.",
    "Join the Community": "انضم إلى المجتمع",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "تواصل مع آلاف اللاعبين، واحصل على التحديثات، واربح هدايا Premium على Discord الخاص بنا.",
    "Join Discord": "انضم إلى Discord",
    "By continuing you agree to the": "بمتابعتك فإنك توافق على",
    "and": "و",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl عبارة عن مجموعة تحسين الأجهزة - ولا يوجد ضمان ضمني.",
    "4 active": "4 نشط",
    "4 recommendations": "4 توصيات",
    "AI Chat": "AI دردشة",
    "AI System Advisor": "AI مستشار النظام",
    "After removing interference → more stable": "بعد إزالة التداخل ← أكثر استقراراً",
    "Analysis confidence": "ثقة التحليل",
    "Analyzing…": "جاري التحليل...",
    "Applied Tweaks": "التعديلات المطبقة",
    "BIOS Intelligence": "BIOS ذكاء",
    "Background processes creating noise": "عمليات الخلفية تسبب ضوضاء",
    "CPU": "CPU",
    "Demo": "تجريبي",
    "Disk": "القرص",
    "Does not increase FPS. Removes hidden delays.": "لا يزيد من FPS. يزيل التأخيرات المخفية.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "كل شيء مفتوح. دعم الأولوية، القياس عن بُعد المتقدم، والتحكم الكامل في التحسين أصبح الآن بين يديك. استمتع بتجربة Premium الخاصة بك.",
    "Example": "مثال",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "توجيه خبير لإعداد BIOS مخصص للوحة الأم و CPU الخاصين بك. احصل على توصيات آمنة ومختبرة الأداء لجهازك بدقة.",
    "FPS stability": "استقرار FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "اضبط إعدادات الطاقة في Windows للحصول على أقصى أداء للألعاب. اختر من بين الملفات الشخصية المحسنة أو أنشئ تعديلات مخصصة تناسب جهازك.",
    "Full System Visibility": "رؤية كاملة للنظام",
    "GPU": "GPU",
    "Health": "الصحة",
    "Illustration only": "للتوضيح فقط",
    "Join the Discord for updates, announcements, and premium giveaways.": "انضم إلى Discord للحصول على التحديثات والإعلانات وهدايا Premium.",
    "Latency trace": "تتبع زمن الاستجابة",
    "Live Performance": "الأداء المباشر",
    "Loss": "فقدان",
    "No fake boosts. Just removing what slows your system down.": "لا توجد تعزيزات وهمية. فقط إزالة ما يبطئ نظامك.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "التحكم في خطة الطاقة",
    "Premium Activated": "تم تفعيل Premium",
    "Premium Upgrade": "ترقية Premium",
    "Premium only": "لـ Premium فقط",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "قلل زمن الاستجابة وفقدان الحزم مع تحسينات TCP/IP و UDP و DNS و SMB المتقدمة. ضبط حزمة الشبكة حصرياً لـ Premium للألعاب التنافسية.",
    "Score": "النتيجة",
    "Score trajectory": "مسار النتيجة",
    "Security health trend": "اتجاه صحة الأمان",
    "System Interference — Demo": "تداخل النظام — تجريبي",
    "Temp": "درجة الحرارة",
    "Thinking...": "يفكر...",
    "Throughput": "الإنتاجية",
    "Welcome to Premium": "مرحباً بك في Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "لديك الآن حق الوصول إلى حزمة SwitchControl الكاملة. دعنا نريك كل ما تم فتحه للتو.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "مساعد التحسين الشخصي المدعوم بـ AI. يقوم بمسح نظامك ويوصي بأفضل التعديلات لجهازك — متاح حصرياً لمستخدمي Premium.",
    "live": "مباشر"
  },
  "pt-BR": {
    "Signed in": "Conectado",
    "Review before you optimize": "Revise antes de otimizar",
    "Terms": "Termos",
    "Privacy": "Privacidade",
    "Terms of Service": "Termos de Serviço",
    "Privacy Policy": "Política de Privacidade",
    "Terms of Service and Privacy Policy": "Termos de Serviço e Política de Privacidade",
    "Last updated:": "Última atualização:",
    "Required first step": "Primeiro passo obrigatório",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Leia os Termos de Serviço e a Política de Privacidade, em seguida, role até o final para continuar com o SwitchControl.",
    "Ready to agree": "Pronto para concordar",
    "Scroll to continue": "Role para continuar",
    "We could not save your consent. Check browser storage access and try again.": "Não foi possível salvar seu consentimento. Verifique o acesso ao armazenamento do navegador e tente novamente.",
    "Decline & quit": "Recusar e sair",
    "Agree & continue": "Concordar e continuar",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Ao selecionar Concordar, você confirma que revisou ambos os documentos e concorda com os Termos de Serviço e a Política de Privacidade.",
    "Important Notice": "Aviso importante",
    "Keep SwitchControl closed while gaming": "Mantenha o SwitchControl fechado enquanto joga",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "O SwitchControl foi projetado para configurar e otimizar seu sistema antes de jogar — não para rodar junto com seus jogos. Manter o aplicativo aberto enquanto joga pode consumir CPU e memória extras, o que pode reduzir o desempenho em vez de melhorá-lo.",
    "Apply tweaks, then close": "Aplique ajustes e depois feche",
    "Launch your game after closing": "Inicie seu jogo após fechar",
    "Don't keep it open mid-game": "Não mantenha aberto durante o jogo",
    "It's not a game overlay tool": "Não é uma ferramenta de overlay de jogo",
    "I Understand — Continue": "Eu entendo — Continuar",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Ao continuar, você concorda com os Termos de Serviço e a Política de Privacidade. O SwitchControl é um conjunto de otimização de hardware — nenhuma garantia está implícita.",
    "Confirm & Continue": "Confirmar e continuar",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Só para ter certeza — você entende que o SwitchControl deve ser fechado antes de começar a jogar, e não rodar em segundo plano?",
    "Yes, I'm ready to continue": "Sim, estou pronto para continuar",
    "← Go back and re-read": "← Voltar e ler novamente",
    "Welcome": "Bem-vindo",
    "Premium Member": "Membro Premium",
    "Let's optimize your gaming experience": "Vamos otimizar sua experiência de jogo",
    "Loading…": "Carregando...",
    "You're all set.": "Está tudo pronto.",
    "Full premium access unlocked. Every optimization is now yours.": "Acesso Premium completo desbloqueado. Cada otimização agora é sua.",
    "SwitchControl is configured and ready to boost your system.": "O SwitchControl está configurado e pronto para impulsionar seu sistema.",
    "Step": "Etapa",
    "of": "de",
    "Next": "Próximo",
    "Finish": "Concluir",
    "Premium": "Premium",
    "Dashboard Overview": "Visão geral do Painel",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Monitore seu sistema em tempo real — CPU, RAM, GPU e disco, tudo de relance.",
    "System Tweaks": "Ajustes do sistema",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Aplique otimizações comprovadas do Windows para reduzir a latência e extrair mais FPS do seu hardware.",
    "Network Optimization": "Otimização de Rede",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Ajuste sua pilha de rede para um ping mais baixo, zero perda de pacotes e sessões online estáveis.",
    "BIOS Advisor": "Consultor de BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Obtenha recomendações personalizadas de otimização de BIOS adaptadas à sua CPU e placa-mãe exatas.",
    "AI Advisor": "Consultor de AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Converse com sua AI de otimização pessoal — ela escaneia seu sistema e recomenda exatamente o que alterar.",
    "Security Center": "Centro de Segurança",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Mantenha seu sistema seguro e com integridade verificada sem sacrificar o desempenho em jogos.",
    "Join the Community": "Junte-se à Comunidade",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Conecte-se com milhares de jogadores, receba atualizações e ganhe sorteios Premium em nosso Discord.",
    "Join Discord": "Entrar no Discord",
    "By continuing you agree to the": "Ao continuar, você concorda com os",
    "and": "e",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl é um conjunto de otimização de hardware — nenhuma garantia é implícita.",
    "4 active": "4 ativos",
    "4 recommendations": "4 recomendações",
    "AI Chat": "Chat com AI",
    "AI System Advisor": "Consultor de Sistema AI",
    "After removing interference → more stable": "Após remover interferências → mais estável",
    "Analysis confidence": "Confiança da análise",
    "Analyzing…": "Analisando...",
    "Applied Tweaks": "Ajustes aplicados",
    "BIOS Intelligence": "Inteligência de BIOS",
    "Background processes creating noise": "Processos em segundo plano criando ruído",
    "CPU": "CPU",
    "Demo": "Demonstração",
    "Disk": "Disco",
    "Does not increase FPS. Removes hidden delays.": "Não aumenta o FPS. Remove atrasos ocultos.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Tudo está desbloqueado. Suporte prioritário, telemetria avançada e controle total de otimização agora são seus. Aproveite sua experiência Premium.",
    "Example": "Exemplo",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Orientação especializada de configuração de BIOS personalizada para sua placa-mãe e CPU específicas. Obtenha recomendações seguras e testadas em desempenho para sua configuração exata.",
    "FPS stability": "Estabilidade de FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Ajuste as configurações de energia do Windows para desempenho máximo em jogos. Escolha perfis otimizados ou crie substituições personalizadas para o seu hardware.",
    "Full System Visibility": "Visibilidade total do sistema",
    "GPU": "GPU",
    "Health": "Saúde",
    "Illustration only": "Apenas ilustração",
    "Join the Discord for updates, announcements, and premium giveaways.": "Junte-se ao Discord para atualizações, anúncios e sorteios Premium.",
    "Latency trace": "Rastreamento de latência",
    "Live Performance": "Desempenho em tempo real",
    "Loss": "Perda",
    "No fake boosts. Just removing what slows your system down.": "Nada de impulsos falsos. Apenas removendo o que torna seu sistema lento.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Controle de Plano de Energia",
    "Premium Activated": "Premium Ativado",
    "Premium Upgrade": "Upgrade Premium",
    "Premium only": "Apenas Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Reduza a latência e a perda de pacotes com otimizações avançadas de TCP/IP, UDP, DNS e SMB. Ajuste da pilha de rede exclusivo para Premium para jogos competitivos.",
    "Score": "Pontuação",
    "Score trajectory": "Trajetória da pontuação",
    "Security health trend": "Tendência de saúde de segurança",
    "System Interference — Demo": "Interferência do Sistema — Demonstração",
    "Temp": "Temperatura",
    "Thinking...": "Pensando...",
    "Throughput": "Taxa de transferência",
    "Welcome to Premium": "Bem-vindo ao Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Você agora tem acesso ao pacote completo do SwitchControl. Deixe-nos mostrar tudo o que acaba de ser desbloqueado.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Seu assistente de otimização pessoal baseado em AI. Ele escaneia seu sistema e recomenda os melhores ajustes para seu hardware — disponível exclusivamente para usuários Premium.",
    "live": "ao vivo"
  },
  "bn": {
    "Signed in": "সাইন ইন করা হয়েছে",
    "Review before you optimize": "অপ্টিমাইজ করার আগে পর্যালোচনা করুন",
    "Terms": "শর্তাবলী",
    "Privacy": "গোপনীয়তা",
    "Terms of Service": "পরিষেবার শর্তাবলী",
    "Privacy Policy": "গোপনীয়তা নীতি",
    "Terms of Service and Privacy Policy": "পরিষেবার শর্তাবলী এবং গোপনীয়তা নীতি",
    "Last updated:": "সর্বশেষ আপডেট:",
    "Required first step": "প্রয়োজনীয় প্রথম ধাপ",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "পরিষেবার শর্তাবলী এবং গোপনীয়তা নীতি পড়ুন, তারপর SwitchControl-এর সাথে চালিয়ে যেতে শেষ পর্যন্ত স্ক্রোল করুন।",
    "Ready to agree": "সম্মত হওয়ার জন্য প্রস্তুত",
    "Scroll to continue": "চালিয়ে যেতে স্ক্রোল করুন",
    "We could not save your consent. Check browser storage access and try again.": "আমরা আপনার সম্মতি সংরক্ষণ করতে পারিনি। ব্রাউজার স্টোরেজ অ্যাক্সেস চেক করুন এবং আবার চেষ্টা করুন।",
    "Decline & quit": "প্রত্যাখ্যান করুন ও বন্ধ করুন",
    "Agree & continue": "সম্মত হন ও চালিয়ে যান",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "সম্মত হন নির্বাচন করে, আপনি নিশ্চিত করছেন যে আপনি উভয় নথি পর্যালোচনা করেছেন এবং পরিষেবা শর্তাবলী এবং গোপনীয়তা নীতিতে সম্মত হয়েছেন।",
    "Important Notice": "গুরুত্বপূর্ণ বিজ্ঞপ্তি",
    "Keep SwitchControl closed while gaming": "গেম খেলার সময় SwitchControl বন্ধ রাখুন",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl আপনার গেমের আগে আপনার সিস্টেম কনফিগার এবং অপ্টিমাইজ করার জন্য ডিজাইন করা হয়েছে — আপনার গেমের সাথে চালানোর জন্য নয়। গেম খেলার সময় অ্যাপটি খোলা রাখলে অতিরিক্ত CPU এবং মেমরি খরচ হতে পারে, যা কর্মক্ষমতা উন্নত করার পরিবর্তে হ্রাস করতে পারে।",
    "Apply tweaks, then close": "টুইক প্রয়োগ করুন, তারপর বন্ধ করুন",
    "Launch your game after closing": "বন্ধ করার পর আপনার গেম চালু করুন",
    "Don't keep it open mid-game": "গেমের মাঝখানে এটি খোলা রাখবেন না",
    "It's not a game overlay tool": "এটি কোনো গেম ওভারলে টুল নয়",
    "I Understand — Continue": "আমি বুঝতে পেরেছি — চালিয়ে যান",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "চালিয়ে যাওয়ার মাধ্যমে আপনি পরিষেবা শর্তাবলী এবং গোপনীয়তা নীতিতে সম্মত হচ্ছেন। SwitchControl একটি হার্ডওয়্যার অপ্টিমাইজেশান স্যুট — কোনো ওয়ারেন্টি নেই।",
    "Confirm & Continue": "নিশ্চিত করুন ও চালিয়ে যান",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "শুধু নিশ্চিত হতে — আপনি কি বুঝতে পেরেছেন যে গেম খেলা শুরু করার আগে SwitchControl বন্ধ থাকা উচিত, ব্যাকগ্রাউন্ডে চলা উচিত নয়?",
    "Yes, I'm ready to continue": "হ্যাঁ, আমি চালিয়ে যেতে প্রস্তুত",
    "← Go back and re-read": "← ফিরে যান এবং পুনরায় পড়ুন",
    "Welcome": "স্বাগতম",
    "Premium Member": "Premium সদস্য",
    "Let's optimize your gaming experience": "আসুন আপনার গেমিং অভিজ্ঞতা অপ্টিমাইজ করি",
    "Loading…": "লোড হচ্ছে...",
    "You're all set.": "সব প্রস্তুত।",
    "Full premium access unlocked. Every optimization is now yours.": "সম্পূর্ণ Premium অ্যাক্সেস আনলক করা হয়েছে। প্রতিটি অপ্টিমাইজেশান এখন আপনার।",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl কনফিগার করা হয়েছে এবং আপনার সিস্টেম বুস্ট করার জন্য প্রস্তুত।",
    "Step": "ধাপ",
    "of": "এর",
    "Next": "পরবর্তী",
    "Finish": "শেষ",
    "Premium": "Premium",
    "Dashboard Overview": "ড্যাশবোর্ড ওভারভিউ",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "রিয়েল-টাইমে আপনার সিস্টেম মনিটর করুন — CPU, RAM, GPU এবং Disk সবকিছু এক নজরে।",
    "System Tweaks": "সিস্টেম টুইক",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "ল্যাটেন্সি কমাতে এবং আপনার হার্ডওয়্যার থেকে আরও বেশি FPS পেতে পরীক্ষিত Windows অপ্টিমাইজেশান প্রয়োগ করুন।",
    "Network Optimization": "নেটওয়ার্ক অপ্টিমাইজেশান",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "কম পিং, জিরো প্যাকেট লস এবং স্থিতিশীল অনলাইন সেশনের জন্য আপনার নেটওয়ার্ক স্ট্যাক ফাইন-টিউন করুন।",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "আপনার নির্দিষ্ট CPU এবং মাদারবোর্ড অনুযায়ী পার্সোনালাইজড BIOS অপ্টিমাইজেশান সুপারিশ পান।",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "আপনার ব্যক্তিগত অপ্টিমাইজেশান AI-এর সাথে চ্যাট করুন — এটি আপনার সিস্টেম স্ক্যান করে এবং ঠিক কী পরিবর্তন করতে হবে তা সুপারিশ করে।",
    "Security Center": "সিকিউরিটি সেন্টার",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "গেমিং পারফরম্যান্সের সাথে আপস না করেই আপনার সিস্টেম সুরক্ষিত এবং ইন্টিগ্রিটি-চেক করা রাখুন।",
    "Join the Community": "কমিউনিটিতে যোগ দিন",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "হাজার হাজার গেমারের সাথে সংযুক্ত হন, আপডেট পান এবং আমাদের Discord-এ Premium গিভঅ্যাওয়ে জিতুন।",
    "Join Discord": "Discord-এ যোগ দিন",
    "By continuing you agree to the": "চালিয়ে যাওয়ার মাধ্যমে আপনি সম্মত হচ্ছেন",
    "and": "এবং",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": "। SwitchControl হলো একটি হার্ডওয়্যার অপ্টিমাইজেশন স্যুট — কোনো ওয়ারেন্টি দেওয়া হয় না।",
    "4 active": "৪টি সক্রিয়",
    "4 recommendations": "৪টি সুপারিশ",
    "AI Chat": "AI চ্যাট",
    "AI System Advisor": "AI সিস্টেম অ্যাডভাইজার",
    "After removing interference → more stable": "ইন্টারফারেন্স সরানোর পর → আরও স্থিতিশীল",
    "Analysis confidence": "বিশ্লেষণের নির্ভরযোগ্যতা",
    "Analyzing…": "বিশ্লেষণ করা হচ্ছে...",
    "Applied Tweaks": "প্রয়োগকৃত টুইকস",
    "BIOS Intelligence": "BIOS ইন্টেলিজেন্স",
    "Background processes creating noise": "ব্যাকগ্রাউন্ড প্রসেস যা নয়েজ তৈরি করছে",
    "CPU": "CPU",
    "Demo": "ডেমো",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPS বাড়ায় না। লুকানো বিলম্ব দূর করে।",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "সবকিছু আনলক করা হয়েছে। প্রায়োরিটি সাপোর্ট, অ্যাডভান্সড টেলিমেট্রি এবং সম্পূর্ণ অপ্টিমাইজেশান কন্ট্রোল এখন আপনার হাতে। আপনার Premium অভিজ্ঞতা উপভোগ করুন।",
    "Example": "উদাহরণ",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "আপনার নির্দিষ্ট মাদারবোর্ড এবং CPU-এর জন্য বিশেষজ্ঞ BIOS কনফিগারেশন গাইডেন্স। আপনার সেটআপের জন্য নিরাপদ, পারফরম্যান্স-পরীক্ষিত সুপারিশ পান।",
    "FPS stability": "FPS স্থিতিশীলতা",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "সর্বোচ্চ গেমিং পারফরম্যান্সের জন্য আপনার Windows পাওয়ার সেটিংস ফাইন-টিউন করুন। অপ্টিমাইজ করা প্রোফাইলগুলি থেকে বেছে নিন বা আপনার হার্ডওয়্যার অনুযায়ী কাস্টম ওভাররাইড তৈরি করুন।",
    "Full System Visibility": "সম্পূর্ণ সিস্টেম দৃশ্যমানতা",
    "GPU": "GPU",
    "Health": "হেলথ",
    "Illustration only": "শুধুমাত্র ইলাস্ট্রেশন",
    "Join the Discord for updates, announcements, and premium giveaways.": "আপডেট, ঘোষণা এবং Premium গিভঅ্যাওয়ের জন্য Discord-এ যোগ দিন।",
    "Latency trace": "ল্যাটেন্সি ট্রেস",
    "Live Performance": "লাইভ পারফরম্যান্স",
    "Loss": "লস",
    "No fake boosts. Just removing what slows your system down.": "কোনো ফেক বুস্ট নয়। শুধু সিস্টেমকে ধীর করে এমন বিষয়গুলো দূর করা।",
    "PREMIUM": "PREMIUM",
    "Ping": "পিং",
    "Power Plan Control": "পাওয়ার প্ল্যান কন্ট্রোল",
    "Premium Activated": "Premium সক্রিয় করা হয়েছে",
    "Premium Upgrade": "Premium আপগ্রেড",
    "Premium only": "শুধুমাত্র Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "অ্যাডভান্সড TCP/IP, UDP, DNS এবং SMB অপ্টিমাইজেশান দিয়ে ল্যাটেন্সি এবং প্যাকেট লস কমান। প্রতিযোগিতামূলক গেমিংয়ের জন্য শুধুমাত্র Premium নেটওয়ার্ক স্ট্যাক টিউনিং।",
    "Score": "স্কোর",
    "Score trajectory": "স্কোর ট্র্যাজেক্টরি",
    "Security health trend": "সিকিউরিটি হেলথ ট্রেন্ড",
    "System Interference — Demo": "সিস্টেম ইন্টারফারেন্স — ডেমো",
    "Temp": "Temp",
    "Thinking...": "চিন্তা করা হচ্ছে...",
    "Throughput": "থ্রুপুট",
    "Welcome to Premium": "Premium-এ স্বাগতম",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "আপনি এখন সম্পূর্ণ SwitchControl সুইট অ্যাক্সেস করতে পারবেন। যা কিছু আনলক হয়েছে তা আপনাকে দেখাই।",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "আপনার ব্যক্তিগত AI-চালিত অপ্টিমাইজেশান অ্যাসিস্ট্যান্ট। এটি আপনার সিস্টেম স্ক্যান করে এবং আপনার হার্ডওয়্যারের জন্য সেরা টুইকস সুপারিশ করে — যা শুধুমাত্র Premium ব্যবহারকারীদের জন্য উপলব্ধ।",
    "live": "লাইভ"
  },
  "ru": {
    "Signed in": "Вы вошли в систему",
    "Review before you optimize": "Проверьте перед оптимизацией",
    "Terms": "Условия",
    "Privacy": "Конфиденциальность",
    "Terms of Service": "Условия предоставления услуг",
    "Privacy Policy": "Политика конфиденциальности",
    "Terms of Service and Privacy Policy": "Условия предоставления услуг и Политика конфиденциальности",
    "Last updated:": "Последнее обновление:",
    "Required first step": "Обязательный первый шаг",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Прочитайте Условия предоставления услуг и Политику конфиденциальности, затем прокрутите до конца, чтобы продолжить работу с SwitchControl.",
    "Ready to agree": "Готовы принять условия",
    "Scroll to continue": "Прокрутите для продолжения",
    "We could not save your consent. Check browser storage access and try again.": "Не удалось сохранить ваше согласие. Проверьте доступ к хранилищу браузера и попробуйте снова.",
    "Decline & quit": "Отклонить и выйти",
    "Agree & continue": "Принять и продолжить",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Нажимая «Принять», вы подтверждаете, что ознакомились с обоими документами и согласны с Условиями предоставления услуг и Политикой конфиденциальности.",
    "Important Notice": "Важное уведомление",
    "Keep SwitchControl closed while gaming": "Держите SwitchControl закрытым во время игры",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl предназначен для настройки и оптимизации вашей системы перед игрой, а не для работы одновременно с играми. Оставление приложения открытым во время игры может потреблять дополнительные CPU и память, что может снизить производительность вместо её улучшения.",
    "Apply tweaks, then close": "Примените настройки, затем закройте",
    "Launch your game after closing": "Запустите игру после закрытия",
    "Don't keep it open mid-game": "Не оставляйте его открытым во время игры",
    "It's not a game overlay tool": "Это не инструмент игрового оверлея",
    "I Understand — Continue": "Я понимаю — Продолжить",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Продолжая, вы соглашаетесь с Условиями предоставления услуг и Политикой конфиденциальности. SwitchControl — это пакет для аппаратной оптимизации, никаких гарантий не подразумевается.",
    "Confirm & Continue": "Подтвердить и продолжить",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Просто чтобы убедиться — вы понимаете, что SwitchControl должен быть закрыт перед началом игры, а не работать в фоновом режиме?",
    "Yes, I'm ready to continue": "Да, я готов продолжить",
    "← Go back and re-read": "← Вернуться назад и перечитать",
    "Welcome": "Добро пожаловать",
    "Premium Member": "Premium-участник",
    "Let's optimize your gaming experience": "Давайте оптимизируем ваш игровой опыт",
    "Loading…": "Загрузка…",
    "You're all set.": "Все готово.",
    "Full premium access unlocked. Every optimization is now yours.": "Полный Premium доступ разблокирован. Каждая оптимизация теперь ваша.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl настроен и готов к ускорению вашей системы.",
    "Step": "Шаг",
    "of": "из",
    "Next": "Далее",
    "Finish": "Завершить",
    "Premium": "Premium",
    "Dashboard Overview": "Обзор панели управления",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Следите за своей системой в реальном времени — CPU, RAM, GPU и диск в одном окне.",
    "System Tweaks": "Системные настройки",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Применяйте проверенные оптимизации Windows, чтобы уменьшить задержку и выжать больше FPS из вашего оборудования.",
    "Network Optimization": "Оптимизация сети",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Настройте ваш сетевой стек для снижения пинга, нулевой потери пакетов и стабильных онлайн-сессий.",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Получите персонализированные рекомендации по оптимизации BIOS, адаптированные под ваш конкретный CPU и материнскую плату.",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Общайтесь с вашим личным AI для оптимизации — он сканирует вашу систему и рекомендует, что именно нужно изменить.",
    "Security Center": "Центр безопасности",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Сохраняйте систему безопасной и проверяйте ее целостность без ущерба для игровой производительности.",
    "Join the Community": "Присоединиться к сообществу",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Общайтесь с тысячами геймеров, получайте обновления и выигрывайте премиум-призы в нашем Discord.",
    "Join Discord": "Присоединиться к Discord",
    "By continuing you agree to the": "Продолжая, вы соглашаетесь с",
    "and": "и",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl — это набор инструментов для оптимизации оборудования; гарантия не предоставляется.",
    "4 active": "4 активно",
    "4 recommendations": "4 рекомендации",
    "AI Chat": "AI Чат",
    "AI System Advisor": "AI Системный советник",
    "After removing interference → more stable": "После устранения помех → более стабильно",
    "Analysis confidence": "Достоверность анализа",
    "Analyzing…": "Анализ...",
    "Applied Tweaks": "Примененные настройки",
    "BIOS Intelligence": "BIOS Интеллект",
    "Background processes creating noise": "Фоновые процессы создают шум",
    "CPU": "CPU",
    "Demo": "Демо",
    "Disk": "Диск",
    "Does not increase FPS. Removes hidden delays.": "Не увеличивает FPS. Устраняет скрытые задержки.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Все разблокировано. Приоритетная поддержка, расширенная телеметрия и полный контроль оптимизации теперь ваши. Наслаждайтесь вашим Premium опытом.",
    "Example": "Пример",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Экспертное руководство по настройке BIOS, адаптированное под вашу материнскую плату и CPU. Получите безопасные, протестированные на производительность рекомендации для вашей сборки.",
    "FPS stability": "Стабильность FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Настройте параметры электропитания Windows для максимальной игровой производительности. Выбирайте из оптимизированных профилей или создавайте собственные настройки, адаптированные под ваше оборудование.",
    "Full System Visibility": "Полная видимость системы",
    "GPU": "GPU",
    "Health": "Здоровье",
    "Illustration only": "Только для иллюстрации",
    "Join the Discord for updates, announcements, and premium giveaways.": "Присоединяйтесь к Discord для получения обновлений, анонсов и премиум-призов.",
    "Latency trace": "Отслеживание задержки",
    "Live Performance": "Производительность в реальном времени",
    "Loss": "Потери",
    "No fake boosts. Just removing what slows your system down.": "Никаких фейковых ускорений. Только устранение того, что замедляет вашу систему.",
    "PREMIUM": "PREMIUM",
    "Ping": "Пинг",
    "Power Plan Control": "Управление планом электропитания",
    "Premium Activated": "Premium активирован",
    "Premium Upgrade": "Обновление до Premium",
    "Premium only": "Только для Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Уменьшите задержку и потерю пакетов с помощью расширенных оптимизаций TCP/IP, UDP, DNS и SMB. Настройка сетевого стека только для Premium для соревновательного гейминга.",
    "Score": "Оценка",
    "Score trajectory": "Траектория оценки",
    "Security health trend": "Тренд состояния безопасности",
    "System Interference — Demo": "Системные помехи — Демо",
    "Temp": "Температура",
    "Thinking...": "Думаю...",
    "Throughput": "Пропускная способность",
    "Welcome to Premium": "Добро пожаловать в Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Теперь у вас есть доступ к полному пакету SwitchControl. Позвольте показать вам все, что только что разблокировалось.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Ваш персональный помощник по оптимизации на базе AI. Он сканирует вашу систему и рекомендует лучшие настройки для вашего оборудования — доступно эксклюзивно для пользователей Premium.",
    "live": "в прямом эфире"
  },
  "ja": {
    "Signed in": "サインイン済み",
    "Review before you optimize": "最適化の前に確認してください",
    "Terms": "利用規約",
    "Privacy": "プライバシー",
    "Terms of Service": "利用規約",
    "Privacy Policy": "プライバシーポリシー",
    "Terms of Service and Privacy Policy": "利用規約およびプライバシーポリシー",
    "Last updated:": "最終更新日:",
    "Required first step": "最初の手順",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "利用規約とプライバシーポリシーを確認し、最後までスクロールしてSwitchControlの使用を続けてください。",
    "Ready to agree": "同意する準備ができました",
    "Scroll to continue": "スクロールして次に進む",
    "We could not save your consent. Check browser storage access and try again.": "同意を保存できませんでした。ブラウザのストレージアクセス権を確認してから再試行してください。",
    "Decline & quit": "拒否して終了",
    "Agree & continue": "同意して次へ",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "「同意」を選択することで、両方の文書を確認し、利用規約およびプライバシーポリシーに同意したものとみなされます。",
    "Important Notice": "重要なお知らせ",
    "Keep SwitchControl closed while gaming": "ゲーム中はSwitchControlを閉じておいてください",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControlは、ゲーム開始前にシステムを設定・最適化するためのツールであり、ゲームと同時に実行するようには設計されていません。ゲーム中にアプリを開いたままにすると、CPUやメモリを追加で消費し、パフォーマンスが向上するどころか低下する可能性があります。",
    "Apply tweaks, then close": "調整を適用し、閉じる",
    "Launch your game after closing": "閉じた後にゲームを起動してください",
    "Don't keep it open mid-game": "プレイ中は開いたままにしないでください",
    "It's not a game overlay tool": "ゲームオーバーレイツールではありません",
    "I Understand — Continue": "理解しました — 次へ",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "次へ進むと、利用規約およびプライバシーポリシーに同意したことになります。SwitchControlはハードウェア最適化スイートであり、保証は一切含まれません。",
    "Confirm & Continue": "確認して次へ",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "念のための確認ですが、SwitchControlはバックグラウンドで実行せず、ゲーム開始前に閉じる必要があることを理解していますか？",
    "Yes, I'm ready to continue": "はい、次に進む準備ができています",
    "← Go back and re-read": "← 戻って読み直す",
    "Welcome": "ようこそ",
    "Premium Member": "Premiumメンバー",
    "Let's optimize your gaming experience": "ゲーム体験を最適化しましょう",
    "Loading…": "読み込み中…",
    "You're all set.": "準備完了です。",
    "Full premium access unlocked. Every optimization is now yours.": "Premiumへのフルアクセスがアンロックされました。すべての最適化機能が利用可能です。",
    "SwitchControl is configured and ready to boost your system.": "SwitchControlの設定が完了し、システムのブースト準備が整いました。",
    "Step": "ステップ",
    "of": "/",
    "Next": "次へ",
    "Finish": "完了",
    "Premium": "Premium",
    "Dashboard Overview": "ダッシュボードの概要",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "システムをリアルタイムで監視。CPU、RAM、GPU、ディスクの状態を一目で確認できます。",
    "System Tweaks": "システム調整",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "実績のあるWindowsの最適化を適用して、遅延を減らし、ハードウェアからより多くのFPSを引き出します。",
    "Network Optimization": "ネットワーク最適化",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "ネットワークスタックを微調整して、低Ping、パケットロスゼロ、安定したオンラインセッションを実現します。",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "お使いのCPUとマザーボードに合わせてカスタマイズされたBIOS最適化の推奨事項を取得します。",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "パーソナル最適化AIとチャットしましょう。システムをスキャンし、何を変更すべきかを正確に推奨します。",
    "Security Center": "セキュリティセンター",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "ゲームパフォーマンスを犠牲にすることなく、システムのセキュリティと整合性を保ちます。",
    "Join the Community": "コミュニティに参加",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Discordで何千人ものゲーマーとつながり、最新情報を受け取り、Premiumのプレゼントキャンペーンに応募しましょう。",
    "Join Discord": "Discordに参加",
    "By continuing you agree to the": "続行することで、お客様は以下に同意したものとみなされます：",
    "and": "および",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": "。SwitchControlはハードウェア最適化スイートであり、保証は一切含まれません。",
    "4 active": "4件がアクティブ",
    "4 recommendations": "4件の推奨事項",
    "AI Chat": "AIチャット",
    "AI System Advisor": "AIシステムアドバイザー",
    "After removing interference → more stable": "干渉を除去した後 → より安定",
    "Analysis confidence": "分析の信頼性",
    "Analyzing…": "分析中…",
    "Applied Tweaks": "適用済みの微調整",
    "BIOS Intelligence": "BIOSインテリジェンス",
    "Background processes creating noise": "ノイズを発生させているバックグラウンドプロセス",
    "CPU": "CPU",
    "Demo": "デモ",
    "Disk": "ディスク",
    "Does not increase FPS. Removes hidden delays.": "FPSは向上しません。隠れた遅延を除去します。",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "すべてがアンロックされました。優先サポート、高度なテレメトリ、完全な最適化制御が利用可能になりました。Premium体験をお楽しみください。",
    "Example": "例",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "特定のマザーボードとCPUに合わせた専門的なBIOS構成ガイダンス。お使いの環境に最適な、安全でパフォーマンスがテストされた推奨事項を入手してください。",
    "FPS stability": "FPSの安定性",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "ゲームパフォーマンスを最大化するためにWindowsの電源設定を微調整します。最適化されたプロファイルから選択するか、ハードウェアに合わせてカスタム設定を作成します。",
    "Full System Visibility": "システム全体の可視化",
    "GPU": "GPU",
    "Health": "健全性",
    "Illustration only": "画像はイメージです",
    "Join the Discord for updates, announcements, and premium giveaways.": "Discordに参加して、アップデート情報、告知、Premiumのプレゼントキャンペーンを受け取りましょう。",
    "Latency trace": "遅延トレース",
    "Live Performance": "ライブパフォーマンス",
    "Loss": "ロス",
    "No fake boosts. Just removing what slows your system down.": "偽のブースト機能はありません。システムの速度低下の原因を取り除くだけです。",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "電源プラン制御",
    "Premium Activated": "Premiumが有効化されました",
    "Premium Upgrade": "Premiumアップグレード",
    "Premium only": "Premium限定",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "高度なTCP/IP、UDP、DNS、SMBの最適化により、遅延とパケットロスを削減します。競技ゲーミング向けのPremium限定ネットワークスタックチューニングです。",
    "Score": "スコア",
    "Score trajectory": "スコアの軌跡",
    "Security health trend": "セキュリティ健全性の推移",
    "System Interference — Demo": "システム干渉 — デモ",
    "Temp": "温度",
    "Thinking...": "思考中...",
    "Throughput": "スループット",
    "Welcome to Premium": "Premiumへようこそ",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "SwitchControlスイートのすべてにアクセスできるようになりました。アンロックされた機能をご紹介します。",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "あなた専用のAI搭載最適化アシスタント。システムをスキャンし、お使いのハードウェアに最適な微調整を推奨します（Premiumユーザー限定）。",
    "live": "ライブ"
  },
  "pa": {
    "Signed in": "ਸਾਈਨ ਇਨ ਕੀਤਾ",
    "Review before you optimize": "ਅਨੁਕੂਲਿਤ (optimize) ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਸਮੀਖਿਆ ਕਰੋ",
    "Terms": "ਸ਼ਰਤਾਂ",
    "Privacy": "ਗੋਪਨੀਯਤਾ",
    "Terms of Service": "ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ",
    "Privacy Policy": "ਗੋਪਨੀਯਤਾ ਨੀਤੀ",
    "Terms of Service and Privacy Policy": "ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ",
    "Last updated:": "ਆਖਰੀ ਵਾਰ ਅੱਪਡੇਟ ਕੀਤਾ:",
    "Required first step": "ਪਹਿਲਾ ਲੋੜੀਂਦਾ ਕਦਮ",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਪੜ੍ਹੋ, ਫਿਰ SwitchControl ਦੇ ਨਾਲ ਜਾਰੀ ਰੱਖਣ ਲਈ ਅੰਤ ਤੱਕ ਸਕ੍ਰੋਲ ਕਰੋ।",
    "Ready to agree": "ਸਹਿਮਤ ਹੋਣ ਲਈ ਤਿਆਰ",
    "Scroll to continue": "ਜਾਰੀ ਰੱਖਣ ਲਈ ਸਕ੍ਰੋਲ ਕਰੋ",
    "We could not save your consent. Check browser storage access and try again.": "ਅਸੀਂ ਤੁਹਾਡੀ ਸਹਿਮਤੀ ਨੂੰ ਸੁਰੱਖਿਅਤ ਨਹੀਂ ਕਰ ਸਕੇ। ਬ੍ਰਾਊਜ਼ਰ ਸਟੋਰੇਜ ਪਹੁੰਚ ਦੀ ਜਾਂਚ ਕਰੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    "Decline & quit": "ਅਸਵੀਕਾਰ ਕਰੋ ਅਤੇ ਛੱਡੋ",
    "Agree & continue": "ਸਹਿਮਤ ਹੋਵੋ ਅਤੇ ਜਾਰੀ ਰੱਖੋ",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "ਸਹਿਮਤ ਚੁਣ ਕੇ, ਤੁਸੀਂ ਪੁਸ਼ਟੀ ਕਰਦੇ ਹੋ ਕਿ ਤੁਸੀਂ ਦੋਵਾਂ ਦਸਤਾਵੇਜ਼ਾਂ ਦੀ ਸਮੀਖਿਆ ਕੀਤੀ ਹੈ ਅਤੇ ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਨਾਲ ਸਹਿਮਤ ਹੋ।",
    "Important Notice": "ਮਹੱਤਵਪੂਰਨ ਸੂਚਨਾ",
    "Keep SwitchControl closed while gaming": "ਗੇਮਿੰਗ ਦੌਰਾਨ SwitchControl ਨੂੰ ਬੰਦ ਰੱਖੋ",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl ਤੁਹਾਡੇ ਗੇਮਿੰਗ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਤੁਹਾਡੇ ਸਿਸਟਮ ਨੂੰ ਕੌਂਫਿਗਰ ਅਤੇ ਅਨੁਕੂਲਿਤ ਕਰਨ ਲਈ ਤਿਆਰ ਕੀਤਾ ਗਿਆ ਹੈ - ਤੁਹਾਡੀਆਂ ਗੇਮਾਂ ਦੇ ਨਾਲ ਚਲਾਉਣ ਲਈ ਨਹੀਂ। ਗੇਮਿੰਗ ਦੌਰਾਨ ਐਪ ਨੂੰ ਖੁੱਲ੍ਹਾ ਰੱਖਣ ਨਾਲ ਵਾਧੂ CPU ਅਤੇ ਮੈਮੋਰੀ ਦੀ ਖਪਤ ਹੋ ਸਕਦੀ ਹੈ, ਜੋ ਪ੍ਰਦਰਸ਼ਨ ਨੂੰ ਸੁਧਾਰਨ ਦੀ ਬਜਾਏ ਘਟਾ ਸਕਦੀ ਹੈ।",
    "Apply tweaks, then close": "ਟਵੀਕਸ ਲਾਗੂ ਕਰੋ, ਫਿਰ ਬੰਦ ਕਰੋ",
    "Launch your game after closing": "ਬੰਦ ਕਰਨ ਤੋਂ ਬਾਅਦ ਆਪਣੀ ਗੇਮ ਲਾਂਚ ਕਰੋ",
    "Don't keep it open mid-game": "ਇਸਨੂੰ ਗੇਮ ਦੇ ਦੌਰਾਨ ਖੁੱਲ੍ਹਾ ਨਾ ਰੱਖੋ",
    "It's not a game overlay tool": "ਇਹ ਇੱਕ ਗੇਮ ਓਵਰਲੇ ਟੂਲ ਨਹੀਂ ਹੈ",
    "I Understand — Continue": "ਮੈਂ ਸਮਝਦਾ/ਸਮਝਦੀ ਹਾਂ — ਜਾਰੀ ਰੱਖੋ",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "ਜਾਰੀ ਰੱਖ ਕੇ ਤੁਸੀਂ ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਨਾਲ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ। SwitchControl ਇੱਕ ਹਾਰਡਵੇਅਰ ਅਨੁਕੂਲਨ ਸੂਟ ਹੈ — ਕੋਈ ਵਾਰੰਟੀ ਨਹੀਂ ਦਿੱਤੀ ਗਈ ਹੈ।",
    "Confirm & Continue": "ਪੁਸ਼ਟੀ ਕਰੋ ਅਤੇ ਜਾਰੀ ਰੱਖੋ",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "ਸਿਰਫ਼ ਯਕੀਨੀ ਬਣਾਉਣ ਲਈ — ਕੀ ਤੁਸੀਂ ਸਮਝਦੇ ਹੋ ਕਿ ਗੇਮਿੰਗ ਸ਼ੁਰੂ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ SwitchControl ਨੂੰ ਬੰਦ ਕਰ ਦੇਣਾ ਚਾਹੀਦਾ ਹੈ, ਨਾ ਕਿ ਬੈਕਗ੍ਰਾਊਂਡ ਵਿੱਚ ਚਲਾਉਣਾ ਚਾਹੀਦਾ ਹੈ?",
    "Yes, I'm ready to continue": "ਹਾਂ, ਮੈਂ ਜਾਰੀ ਰੱਖਣ ਲਈ ਤਿਆਰ ਹਾਂ",
    "← Go back and re-read": "← ਵਾਪਸ ਜਾਓ ਅਤੇ ਦੁਬਾਰਾ ਪੜ੍ਹੋ",
    "Welcome": "ਜੀ ਆਇਆਂ ਨੂੰ",
    "Premium Member": "Premium ਮੈਂਬਰ",
    "Let's optimize your gaming experience": "ਆਓ ਤੁਹਾਡੇ ਗੇਮਿੰਗ ਅਨੁਭਵ ਨੂੰ ਅਨੁਕੂਲਿਤ ਕਰੀਏ",
    "Loading…": "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...",
    "You're all set.": "ਤੁਸੀਂ ਬਿਲਕੁਲ ਤਿਆਰ ਹੋ।",
    "Full premium access unlocked. Every optimization is now yours.": "ਪੂਰੀ ਪ੍ਰੀਮੀਅਮ ਪਹੁੰਚ ਅਨਲੌਕ ਕੀਤੀ ਗਈ। ਹਰ ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਹੁਣ ਤੁਹਾਡੀ ਹੈ।",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl ਕੌਂਫਿਗਰ ਹੋ ਗਿਆ ਹੈ ਅਤੇ ਤੁਹਾਡੇ ਸਿਸਟਮ ਨੂੰ ਬੂਸਟ ਕਰਨ ਲਈ ਤਿਆਰ ਹੈ।",
    "Step": "ਕਦਮ",
    "of": "ਦਾ",
    "Next": "ਅੱਗੇ",
    "Finish": "ਸਮਾਪਤ",
    "Premium": "Premium",
    "Dashboard Overview": "ਡੈਸ਼ਬੋਰਡ ਸੰਖੇਪ ਜਾਣਕਾਰੀ",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "ਆਪਣੇ ਸਿਸਟਮ ਨੂੰ ਰੀਅਲ-ਟਾਈਮ ਵਿੱਚ ਮਾਨੀਟਰ ਕਰੋ — CPU, RAM, GPU, ਅਤੇ ਡਿਸਕ ਸਭ ਇੱਕ ਨਜ਼ਰ ਵਿੱਚ।",
    "System Tweaks": "ਸਿਸਟਮ ਟਵੀਕਸ",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "ਲੇਟੈਂਸੀ ਨੂੰ ਘਟਾਉਣ ਅਤੇ ਤੁਹਾਡੇ ਹਾਰਡਵੇਅਰ ਤੋਂ ਵੱਧ FPS ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ਪ੍ਰਮਾਣਿਤ Windows ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਲਾਗੂ ਕਰੋ।",
    "Network Optimization": "ਨੈੱਟਵਰਕ ਓਪਟੀਮਾਈਜੇਸ਼ਨ",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "ਘੱਟ ਪਿੰਗ, ਜ਼ੀਰੋ ਪੈਕੇਟ ਲੋਸ, ਅਤੇ ਸਥਿਰ ਔਨਲਾਈਨ ਸੈਸ਼ਨਾਂ ਲਈ ਆਪਣੇ ਨੈੱਟਵਰਕ ਸਟੈਕ ਨੂੰ ਫਾਈਨ-ਟਿਊਨ ਕਰੋ।",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "ਆਪਣੇ ਸਹੀ CPU ਅਤੇ ਮਦਰਬੋਰਡ ਲਈ ਤਿਆਰ ਕੀਤੀਆਂ ਨਿੱਜੀ BIOS ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਸਿਫ਼ਾਰਸ਼ਾਂ ਪ੍ਰਾਪਤ ਕਰੋ।",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "ਆਪਣੇ ਨਿੱਜੀ ਓਪਟੀਮਾਈਜੇਸ਼ਨ AI ਨਾਲ ਗੱਲਬਾਤ ਕਰੋ — ਇਹ ਤੁਹਾਡੇ ਸਿਸਟਮ ਨੂੰ ਸਕੈਨ ਕਰਦਾ ਹੈ ਅਤੇ ਸਿਫ਼ਾਰਸ਼ ਕਰਦਾ ਹੈ ਕਿ ਬਿਲਕੁਲ ਕੀ ਬਦਲਣਾ ਹੈ।",
    "Security Center": "ਸੁਰੱਖਿਆ ਕੇਂਦਰ",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "ਗੇਮਿੰਗ ਪ੍ਰਦਰਸ਼ਨ ਦੀ ਕੁਰਬਾਨੀ ਦਿੱਤੇ ਬਿਨਾਂ ਆਪਣੇ ਸਿਸਟਮ ਨੂੰ ਸੁਰੱਖਿਅਤ ਅਤੇ ਇੰਟੈਗਰਿਟੀ-ਚੈੱਕ ਰੱਖੋ।",
    "Join the Community": "ਕਮਿਊਨਿਟੀ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "ਹਜ਼ਾਰਾਂ ਗੇਮਰਾਂ ਨਾਲ ਜੁੜੋ, ਅੱਪਡੇਟ ਪ੍ਰਾਪਤ ਕਰੋ, ਅਤੇ ਸਾਡੇ Discord 'ਤੇ ਪ੍ਰੀਮੀਅਮ ਗਿਵਅਵੇ ਜਿੱਤੋ।",
    "Join Discord": "Discord ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ",
    "By continuing you agree to the": "ਅੱਗੇ ਵਧ ਕੇ ਤੁਸੀਂ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ",
    "and": "ਅਤੇ",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": "। SwitchControl ਇੱਕ ਹਾਰਡਵੇਅਰ ਅਨੁਕੂਲਨ ਸੂਟ ਹੈ — ਕੋਈ ਵਾਰੰਟੀ ਨਹੀਂ ਦਿੱਤੀ ਗਈ ਹੈ।",
    "4 active": "4 ਸਰਗਰਮ",
    "4 recommendations": "4 ਸਿਫ਼ਾਰਸ਼ਾਂ",
    "AI Chat": "AI ਚੈਟ",
    "AI System Advisor": "AI ਸਿਸਟਮ ਐਡਵਾਈਜ਼ਰ",
    "After removing interference → more stable": "ਦਖਲਅੰਦਾਜ਼ੀ ਨੂੰ ਹਟਾਉਣ ਤੋਂ ਬਾਅਦ → ਵਧੇਰੇ ਸਥਿਰ",
    "Analysis confidence": "ਵਿਸ਼ਲੇਸ਼ਣ ਭਰੋਸਾ",
    "Analyzing…": "ਵਿਸ਼ਲੇਸ਼ਣ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...",
    "Applied Tweaks": "ਲਾਗੂ ਕੀਤੇ ਗਏ ਟਵੀਕਸ",
    "BIOS Intelligence": "BIOS ਇੰਟੈਲੀਜੈਂਸ",
    "Background processes creating noise": "ਬੈਕਗ੍ਰਾਊਂਡ ਪ੍ਰਕਿਰਿਆਵਾਂ ਜੋ ਰੌਲਾ ਪਾ ਰਹੀਆਂ ਹਨ",
    "CPU": "CPU",
    "Demo": "ਡੈਮੋ",
    "Disk": "ਡਿਸਕ",
    "Does not increase FPS. Removes hidden delays.": "FPS ਨਹੀਂ ਵਧਾਉਂਦਾ। ਲੁਕਵੀਂ ਦੇਰੀ ਨੂੰ ਹਟਾਉਂਦਾ ਹੈ।",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "ਸਭ ਕੁਝ ਅਨਲੌਕ ਹੈ। ਪ੍ਰਾਇਓਰਿਟੀ ਸਪੋਰਟ, ਐਡਵਾਂਸਡ ਟੈਲੀਮੈਟਰੀ, ਅਤੇ ਪੂਰਾ ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਕੰਟਰੋਲ ਹੁਣ ਤੁਹਾਡਾ ਹੈ। ਆਪਣੇ Premium ਅਨੁਭਵ ਦਾ ਆਨੰਦ ਲਓ।",
    "Example": "ਉਦਾਹਰਨ",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "ਤੁਹਾਡੇ ਖਾਸ ਮਦਰਬੋਰਡ ਅਤੇ CPU ਲਈ ਤਿਆਰ ਕੀਤੀ ਗਈ ਮਾਹਰ BIOS ਕੌਂਫਿਗਰੇਸ਼ਨ ਮਾਰਗਦਰਸ਼ਨ। ਆਪਣੀ ਸਹੀ ਸੈੱਟਅੱਪ ਲਈ ਸੁਰੱਖਿਅਤ, ਪ੍ਰਦਰਸ਼ਨ-ਟੈਸਟ ਕੀਤੀਆਂ ਸਿਫ਼ਾਰਸ਼ਾਂ ਪ੍ਰਾਪਤ ਕਰੋ।",
    "FPS stability": "FPS ਸਥਿਰਤਾ",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "ਵੱਧ ਤੋਂ ਵੱਧ ਗੇਮਿੰਗ ਪ੍ਰਦਰਸ਼ਨ ਲਈ ਆਪਣੀਆਂ Windows ਪਾਵਰ ਸੈਟਿੰਗਾਂ ਨੂੰ ਫਾਈਨ-ਟਿਊਨ ਕਰੋ। ਓਪਟੀਮਾਈਜ਼ਡ ਪ੍ਰੋਫਾਈਲਾਂ ਵਿੱਚੋਂ ਚੁਣੋ ਜਾਂ ਆਪਣੇ ਹਾਰਡਵੇਅਰ ਲਈ ਕਸਟਮ ਓਵਰਰਾਈਡ ਬਣਾਓ।",
    "Full System Visibility": "ਪੂਰੀ ਸਿਸਟਮ ਦਿੱਖ",
    "GPU": "GPU",
    "Health": "ਸਿਹਤ",
    "Illustration only": "ਸਿਰਫ਼ ਚਿੱਤਰਣ",
    "Join the Discord for updates, announcements, and premium giveaways.": "ਅੱਪਡੇਟ, ਘੋਸ਼ਣਾਵਾਂ, ਅਤੇ ਪ੍ਰੀਮੀਅਮ ਗਿਵਅਵੇ ਲਈ Discord ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ।",
    "Latency trace": "ਲੇਟੈਂਸੀ ਟਰੇਸ",
    "Live Performance": "ਲਾਈਵ ਪ੍ਰਦਰਸ਼ਨ",
    "Loss": "ਨੁਕਸਾਨ",
    "No fake boosts. Just removing what slows your system down.": "ਕੋਈ ਫਰਜ਼ੀ ਬੂਸਟ ਨਹੀਂ। ਸਿਰਫ਼ ਉਹ ਚੀਜ਼ਾਂ ਹਟਾ ਰਿਹਾ ਹਾਂ ਜੋ ਤੁਹਾਡੇ ਸਿਸਟਮ ਨੂੰ ਹੌਲੀ ਕਰਦੀਆਂ ਹਨ।",
    "PREMIUM": "PREMIUM",
    "Ping": "ਪਿੰਗ",
    "Power Plan Control": "ਪਾਵਰ ਪਲਾਨ ਕੰਟਰੋਲ",
    "Premium Activated": "ਪ੍ਰੀਮੀਅਮ ਐਕਟੀਵੇਟ ਹੋ ਗਿਆ",
    "Premium Upgrade": "ਪ੍ਰੀਮੀਅਮ ਅੱਪਗ੍ਰੇਡ",
    "Premium only": "ਸਿਰਫ਼ ਪ੍ਰੀਮੀਅਮ",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "ਐਡਵਾਂਸਡ TCP/IP, UDP, DNS, ਅਤੇ SMB ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਦੇ ਨਾਲ ਲੇਟੈਂਸੀ ਅਤੇ ਪੈਕੇਟ ਲੋਸ ਨੂੰ ਘਟਾਓ। ਪ੍ਰਤੀਯੋਗੀ ਗੇਮਿੰਗ ਲਈ ਸਿਰਫ਼ ਪ੍ਰੀਮੀਅਮ ਨੈੱਟਵਰਕ ਸਟੈਕ ਟਿਊਨਿੰਗ।",
    "Score": "ਸਕੋਰ",
    "Score trajectory": "ਸਕੋਰ ਟ੍ਰੈਜੈਕਟਰੀ",
    "Security health trend": "ਸੁਰੱਖਿਆ ਸਿਹਤ ਰੁਝਾਨ",
    "System Interference — Demo": "ਸਿਸਟਮ ਦਖਲਅੰਦਾਜ਼ੀ — ਡੈਮੋ",
    "Temp": "ਤਾਪਮਾਨ",
    "Thinking...": "ਸੋਚ ਰਿਹਾ ਹੈ...",
    "Throughput": "ਥਰੂਪੁੱਟ",
    "Welcome to Premium": "ਪ੍ਰੀਮੀਅਮ ਵਿੱਚ ਸੁਆਗਤ ਹੈ",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "ਹੁਣ ਤੁਹਾਡੇ ਕੋਲ ਪੂਰੇ SwitchControl ਸੂਟ ਤੱਕ ਪਹੁੰਚ ਹੈ। ਆਓ ਅਸੀਂ ਤੁਹਾਨੂੰ ਉਹ ਸਭ ਕੁਝ ਦਿਖਾਈਏ ਜੋ ਹੁਣੇ ਅਨਲੌਕ ਹੋਇਆ ਹੈ।",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "ਤੁਹਾਡਾ ਨਿੱਜੀ AI-ਸੰਚਾਲਿਤ ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਸਹਾਇਕ। ਇਹ ਤੁਹਾਡੇ ਸਿਸਟਮ ਨੂੰ ਸਕੈਨ ਕਰਦਾ ਹੈ ਅਤੇ ਤੁਹਾਡੇ ਹਾਰਡਵੇਅਰ ਲਈ ਸਭ ਤੋਂ ਵਧੀਆ ਟਵੀਕਸ ਦੀ ਸਿਫ਼ਾਰਸ਼ ਕਰਦਾ ਹੈ — ਸਿਰਫ਼ Premium ਉਪਭੋਗਤਾਵਾਂ ਲਈ ਉਪਲਬਧ।",
    "live": "ਲਾਈਵ"
  },
  "de": {
    "Signed in": "Angemeldet",
    "Review before you optimize": "Überprüfen, bevor Sie optimieren",
    "Terms": "Bedingungen",
    "Privacy": "Datenschutz",
    "Terms of Service": "Nutzungsbedingungen",
    "Privacy Policy": "Datenschutzrichtlinie",
    "Terms of Service and Privacy Policy": "Nutzungsbedingungen und Datenschutzrichtlinie",
    "Last updated:": "Zuletzt aktualisiert:",
    "Required first step": "Erforderlicher erster Schritt",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Lesen Sie die Nutzungsbedingungen und die Datenschutzrichtlinie und scrollen Sie dann bis zum Ende, um mit SwitchControl fortzufahren.",
    "Ready to agree": "Bereit zuzustimmen",
    "Scroll to continue": "Scrollen, um fortzufahren",
    "We could not save your consent. Check browser storage access and try again.": "Wir konnten Ihre Zustimmung nicht speichern. Überprüfen Sie den Speicherzugriff des Browsers und versuchen Sie es erneut.",
    "Decline & quit": "Ablehnen & beenden",
    "Agree & continue": "Zustimmen & fortfahren",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Durch Auswahl von Zustimmen bestätigen Sie, dass Sie beide Dokumente überprüft haben und den Nutzungsbedingungen und der Datenschutzrichtlinie zustimmen.",
    "Important Notice": "Wichtiger Hinweis",
    "Keep SwitchControl closed while gaming": "Lassen Sie SwitchControl während des Spielens geschlossen",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl wurde entwickelt, um Ihr System vor dem Spielen zu konfigurieren und zu optimieren – nicht um es neben Ihren Spielen auszuführen. Die App während des Spielens geöffnet zu lassen, kann zusätzliche CPU und Arbeitsspeicher verbrauchen, was die Leistung eher verringern als verbessern kann.",
    "Apply tweaks, then close": "Optimierungen anwenden, dann schließen",
    "Launch your game after closing": "Starten Sie Ihr Spiel nach dem Schließen",
    "Don't keep it open mid-game": "Lassen Sie es nicht während des Spiels offen",
    "It's not a game overlay tool": "Es ist kein Spiel-Overlay-Tool",
    "I Understand — Continue": "Ich verstehe – Fortfahren",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Durch das Fortfahren stimmen Sie den Nutzungsbedingungen und der Datenschutzrichtlinie zu. SwitchControl ist eine Hardware-Optimierungssuite – es wird keine Garantie übernommen.",
    "Confirm & Continue": "Bestätigen & Fortfahren",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Nur um sicherzugehen – Sie verstehen, dass SwitchControl vor dem Starten eines Spiels geschlossen sein sollte und nicht im Hintergrund laufen darf?",
    "Yes, I'm ready to continue": "Ja, ich bin bereit fortzufahren",
    "← Go back and re-read": "← Zurückgehen und erneut lesen",
    "Welcome": "Willkommen",
    "Premium Member": "Premium Mitglied",
    "Let's optimize your gaming experience": "Lassen Sie uns Ihr Spielerlebnis optimieren",
    "Loading…": "Wird geladen…",
    "You're all set.": "Du bist startklar.",
    "Full premium access unlocked. Every optimization is now yours.": "Voller Premium-Zugang freigeschaltet. Jede Optimierung gehört jetzt dir.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl ist konfiguriert und bereit, dein System zu beschleunigen.",
    "Step": "Schritt",
    "of": "von",
    "Next": "Weiter",
    "Finish": "Fertig",
    "Premium": "Premium",
    "Dashboard Overview": "Dashboard-Übersicht",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Überwache dein System in Echtzeit – CPU, RAM, GPU und Festplatte auf einen Blick.",
    "System Tweaks": "System-Optimierungen",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Wende bewährte Windows-Optimierungen an, um die Latenz zu reduzieren und mehr FPS aus deiner Hardware herauszuholen.",
    "Network Optimization": "Netzwerkoptimierung",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Optimiere deinen Netzwerk-Stack für einen niedrigeren Ping, null Paketverlust und stabile Online-Sitzungen.",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Erhalte personalisierte BIOS-Optimierungsempfehlungen, die genau auf deine CPU und dein Mainboard zugeschnitten sind.",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Chatte mit deiner persönlichen Optimierungs-AI – sie scannt dein System und empfiehlt genau das, was geändert werden muss.",
    "Security Center": "Sicherheitscenter",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Halte dein System sicher und integritätsgeprüft, ohne die Gaming-Leistung zu beeinträchtigen.",
    "Join the Community": "Der Community beitreten",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Vernetze dich mit Tausenden von Gamern, erhalte Updates und gewinne Premium-Giveaways auf unserem Discord.",
    "Join Discord": "Discord beitreten",
    "By continuing you agree to the": "Mit dem Fortfahren stimmen Sie den zu",
    "and": "und",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl ist eine Hardware-Optimierungssuite – es wird keine Garantie gewährt.",
    "4 active": "4 aktiv",
    "4 recommendations": "4 Empfehlungen",
    "AI Chat": "AI Chat",
    "AI System Advisor": "AI System Advisor",
    "After removing interference → more stable": "Nach Entfernen der Interferenzen → stabiler",
    "Analysis confidence": "Analyse-Konfidenz",
    "Analyzing…": "Analysiere…",
    "Applied Tweaks": "Angewandte Optimierungen",
    "BIOS Intelligence": "BIOS Intelligence",
    "Background processes creating noise": "Hintergrundprozesse erzeugen Rauschen",
    "CPU": "CPU",
    "Demo": "Demo",
    "Disk": "Festplatte",
    "Does not increase FPS. Removes hidden delays.": "Erhöht keine FPS. Entfernt versteckte Verzögerungen.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Alles ist freigeschaltet. Priorisierter Support, erweiterte Telemetrie und volle Optimierungskontrolle gehören jetzt dir. Genieße dein Premium-Erlebnis.",
    "Example": "Beispiel",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Experten-Anleitung zur BIOS-Konfiguration, zugeschnitten auf dein spezifisches Mainboard und deine CPU. Erhalte sichere, leistungserprobte Empfehlungen für dein genaues Setup.",
    "FPS stability": "FPS-Stabilität",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Optimiere deine Windows-Energieeinstellungen für maximale Gaming-Leistung. Wähle aus optimierten Profilen oder erstelle benutzerdefinierte Anpassungen, die auf deine Hardware zugeschnitten sind.",
    "Full System Visibility": "Volle Systemtransparenz",
    "GPU": "GPU",
    "Health": "Gesundheit",
    "Illustration only": "Nur Illustration",
    "Join the Discord for updates, announcements, and premium giveaways.": "Tritt dem Discord bei für Updates, Ankündigungen und Premium-Giveaways.",
    "Latency trace": "Latenzverlauf",
    "Live Performance": "Live-Leistung",
    "Loss": "Verlust",
    "No fake boosts. Just removing what slows your system down.": "Keine Fake-Boosts. Nur das Entfernen dessen, was dein System verlangsamt.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Energieplan-Steuerung",
    "Premium Activated": "Premium aktiviert",
    "Premium Upgrade": "Premium-Upgrade",
    "Premium only": "Nur Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Reduziere Latenz und Paketverlust mit fortschrittlichen TCP/IP-, UDP-, DNS- und SMB-Optimierungen. Netzwerk-Stack-Tuning nur für Premium-Nutzer für kompetitives Gaming.",
    "Score": "Punktzahl",
    "Score trajectory": "Punkteverlauf",
    "Security health trend": "Sicherheitsstatus-Trend",
    "System Interference — Demo": "Systeminterferenzen — Demo",
    "Temp": "Temperatur",
    "Thinking...": "Denke nach...",
    "Throughput": "Durchsatz",
    "Welcome to Premium": "Willkommen bei Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Du hast jetzt Zugriff auf die vollständige SwitchControl-Suite. Lass uns dir alles zeigen, was gerade freigeschaltet wurde.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Dein persönlicher AI-gestützter Optimierungsassistent. Er scannt dein System und empfiehlt die besten Anpassungen für deine Hardware — exklusiv für Premium-Nutzer verfügbar.",
    "live": "live"
  },
  "id": {
    "Signed in": "Sudah masuk",
    "Review before you optimize": "Tinjau sebelum Anda melakukan optimalisasi",
    "Terms": "Ketentuan",
    "Privacy": "Privasi",
    "Terms of Service": "Ketentuan Layanan",
    "Privacy Policy": "Kebijakan Privasi",
    "Terms of Service and Privacy Policy": "Ketentuan Layanan dan Kebijakan Privasi",
    "Last updated:": "Terakhir diperbarui:",
    "Required first step": "Langkah awal yang wajib",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Baca Ketentuan Layanan dan Kebijakan Privasi, lalu gulir ke bagian akhir untuk melanjutkan dengan SwitchControl.",
    "Ready to agree": "Siap untuk menyetujui",
    "Scroll to continue": "Gulir untuk melanjutkan",
    "We could not save your consent. Check browser storage access and try again.": "Kami tidak dapat menyimpan persetujuan Anda. Periksa akses penyimpanan browser dan coba lagi.",
    "Decline & quit": "Tolak & keluar",
    "Agree & continue": "Setuju & lanjutkan",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Dengan memilih Setuju, Anda mengonfirmasi bahwa Anda telah meninjau kedua dokumen dan menyetujui Ketentuan Layanan serta Kebijakan Privasi.",
    "Important Notice": "Pemberitahuan Penting",
    "Keep SwitchControl closed while gaming": "Tetap tutup SwitchControl saat bermain game",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl dirancang untuk mengonfigurasi dan mengoptimalkan sistem Anda sebelum Anda bermain game — bukan untuk berjalan bersamaan dengan game Anda. Membiarkan aplikasi terbuka saat bermain game dapat menghabiskan CPU dan memori ekstra, yang justru dapat menurunkan performa alih-alih meningkatkannya.",
    "Apply tweaks, then close": "Terapkan penyesuaian, lalu tutup",
    "Launch your game after closing": "Luncurkan game Anda setelah ditutup",
    "Don't keep it open mid-game": "Jangan membiarkannya terbuka saat bermain game",
    "It's not a game overlay tool": "Ini bukan alat overlay game",
    "I Understand — Continue": "Saya Mengerti — Lanjutkan",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Dengan melanjutkan, Anda menyetujui Ketentuan Layanan dan Kebijakan Privasi. SwitchControl adalah rangkaian optimalisasi perangkat keras — tidak ada garansi yang tersirat.",
    "Confirm & Continue": "Konfirmasi & Lanjutkan",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Hanya untuk memastikan — Anda mengerti bahwa SwitchControl harus ditutup sebelum Anda mulai bermain game, bukan berjalan di latar belakang?",
    "Yes, I'm ready to continue": "Ya, saya siap untuk melanjutkan",
    "← Go back and re-read": "← Kembali dan baca ulang",
    "Welcome": "Selamat Datang",
    "Premium Member": "Anggota Premium",
    "Let's optimize your gaming experience": "Mari optimalkan pengalaman bermain game Anda",
    "Loading…": "Memuat…",
    "You're all set.": "Anda sudah siap.",
    "Full premium access unlocked. Every optimization is now yours.": "Akses premium penuh tidak terkunci. Setiap optimasi sekarang menjadi milik Anda.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl telah dikonfigurasi dan siap untuk meningkatkan sistem Anda.",
    "Step": "Langkah",
    "of": "dari",
    "Next": "Selanjutnya",
    "Finish": "Selesai",
    "Premium": "Premium",
    "Dashboard Overview": "Ringkasan Dasbor",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Pantau sistem Anda secara real-time — CPU, RAM, GPU, dan disk semuanya dalam sekejap.",
    "System Tweaks": "Penyesuaian Sistem",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Terapkan optimasi Windows yang terbukti untuk mengurangi latensi dan mendapatkan lebih banyak FPS dari perangkat keras Anda.",
    "Network Optimization": "Optimasi Jaringan",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Sesuaikan network stack Anda untuk ping lebih rendah, tanpa packet loss, dan sesi online yang stabil.",
    "BIOS Advisor": "Penasihat BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Dapatkan rekomendasi optimasi BIOS yang dipersonalisasi dan disesuaikan dengan CPU dan motherboard Anda.",
    "AI Advisor": "Penasihat AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Ngobrol dengan AI optimasi pribadi Anda — AI memindai sistem Anda dan merekomendasikan apa yang perlu diubah dengan tepat.",
    "Security Center": "Pusat Keamanan",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Jaga sistem Anda tetap aman dan terverifikasi integritasnya tanpa mengorbankan performa gaming.",
    "Join the Community": "Gabung Komunitas",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Terhubung dengan ribuan gamer, dapatkan pembaruan, dan menangkan giveaway premium di Discord kami.",
    "Join Discord": "Gabung Discord",
    "By continuing you agree to the": "Dengan melanjutkan, Anda menyetujui",
    "and": "dan",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl adalah rangkaian optimasi perangkat keras — tidak ada jaminan yang tersirat.",
    "4 active": "4 aktif",
    "4 recommendations": "4 rekomendasi",
    "AI Chat": "AI Chat",
    "AI System Advisor": "AI System Advisor",
    "After removing interference → more stable": "Setelah menghilangkan interferensi → lebih stabil",
    "Analysis confidence": "Keyakinan analisis",
    "Analyzing…": "Menganalisis...",
    "Applied Tweaks": "Tweak yang diterapkan",
    "BIOS Intelligence": "BIOS Intelligence",
    "Background processes creating noise": "Proses latar belakang yang menimbulkan gangguan",
    "CPU": "CPU",
    "Demo": "Demo",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "Tidak meningkatkan FPS. Menghilangkan jeda tersembunyi.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Semuanya sudah tidak terkunci. Dukungan prioritas, telemetri tingkat lanjut, dan kontrol optimasi penuh sekarang menjadi milik Anda. Nikmati pengalaman Premium Anda.",
    "Example": "Contoh",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Panduan konfigurasi BIOS ahli yang disesuaikan dengan motherboard dan CPU spesifik Anda. Dapatkan rekomendasi yang aman dan teruji performanya untuk pengaturan Anda.",
    "FPS stability": "Stabilitas FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Sesuaikan pengaturan daya Windows Anda untuk performa gaming maksimal. Pilih dari profil yang dioptimalkan atau buat pengaturan khusus yang disesuaikan dengan perangkat keras Anda.",
    "Full System Visibility": "Visibilitas Sistem Penuh",
    "GPU": "GPU",
    "Health": "Kesehatan",
    "Illustration only": "Hanya ilustrasi",
    "Join the Discord for updates, announcements, and premium giveaways.": "Bergabunglah dengan Discord untuk pembaruan, pengumuman, dan giveaway premium.",
    "Latency trace": "Jejak latensi",
    "Live Performance": "Performa Langsung",
    "Loss": "Loss",
    "No fake boosts. Just removing what slows your system down.": "Tanpa peningkatan palsu. Hanya menghilangkan apa yang memperlambat sistem Anda.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Kontrol Rencana Daya",
    "Premium Activated": "Premium Diaktifkan",
    "Premium Upgrade": "Tingkatkan ke Premium",
    "Premium only": "Hanya Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Kurangi latensi dan packet loss dengan optimasi TCP/IP, UDP, DNS, dan SMB tingkat lanjut. Penyetelan network stack khusus Premium untuk game kompetitif.",
    "Score": "Skor",
    "Score trajectory": "Lintasan skor",
    "Security health trend": "Tren kesehatan keamanan",
    "System Interference — Demo": "Interferensi Sistem — Demo",
    "Temp": "Suhu",
    "Thinking...": "Sedang berpikir...",
    "Throughput": "Throughput",
    "Welcome to Premium": "Selamat datang di Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Anda sekarang memiliki akses ke suite lengkap SwitchControl. Izinkan kami menunjukkan semua yang baru saja terbuka.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Asisten optimasi bertenaga AI pribadi Anda. Ia memindai sistem Anda dan merekomendasikan tweak terbaik untuk perangkat keras Anda — tersedia eksklusif bagi pengguna Premium.",
    "live": "langsung"
  },
  "ko": {
    "Signed in": "로그인됨",
    "Review before you optimize": "최적화 전 검토",
    "Terms": "약관",
    "Privacy": "개인정보처리방침",
    "Terms of Service": "서비스 약관",
    "Privacy Policy": "개인정보처리방침",
    "Terms of Service and Privacy Policy": "서비스 약관 및 개인정보처리방침",
    "Last updated:": "최종 업데이트:",
    "Required first step": "필수 첫 단계",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "서비스 약관과 개인정보처리방침을 읽고, 끝까지 스크롤하여 SwitchControl을 계속 이용하세요.",
    "Ready to agree": "동의할 준비 완료",
    "Scroll to continue": "스크롤하여 계속",
    "We could not save your consent. Check browser storage access and try again.": "동의 사항을 저장할 수 없습니다. 브라우저 저장소 액세스 권한을 확인하고 다시 시도하세요.",
    "Decline & quit": "거부 및 종료",
    "Agree & continue": "동의 및 계속",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "동의를 선택하면 두 문서를 모두 검토했으며 서비스 약관 및 개인정보처리방침에 동의함을 확인하는 것입니다.",
    "Important Notice": "중요 공지",
    "Keep SwitchControl closed while gaming": "게임 중에는 SwitchControl을 닫아두세요",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl은 게임 실행 전 시스템을 구성하고 최적화하기 위해 설계되었으며, 게임과 동시에 실행되도록 설계되지 않았습니다. 게임 중에 앱을 열어두면 추가적인 CPU와 메모리를 소비하여 성능 향상이 아닌 성능 저하를 초래할 수 있습니다.",
    "Apply tweaks, then close": "조정 사항 적용 후 종료하세요",
    "Launch your game after closing": "종료 후 게임을 실행하세요",
    "Don't keep it open mid-game": "게임 도중에 열어두지 마세요",
    "It's not a game overlay tool": "게임 오버레이 도구가 아닙니다",
    "I Understand — Continue": "이해했습니다 — 계속하기",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "계속 진행하면 서비스 약관 및 개인정보처리방침에 동의하게 됩니다. SwitchControl은 하드웨어 최적화 제품군이며, 어떠한 보증도 암시되지 않습니다.",
    "Confirm & Continue": "확인 및 계속",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "확실히 하기 위해 — SwitchControl을 백그라운드에서 실행하지 말고 게임 시작 전에 닫아야 함을 이해하셨나요?",
    "Yes, I'm ready to continue": "네, 계속 진행할 준비가 되었습니다",
    "← Go back and re-read": "← 돌아가서 다시 읽기",
    "Welcome": "환영합니다",
    "Premium Member": "Premium 멤버",
    "Let's optimize your gaming experience": "게이밍 경험을 최적화해 보겠습니다",
    "Loading…": "로딩 중…",
    "You're all set.": "모두 준비되었습니다.",
    "Full premium access unlocked. Every optimization is now yours.": "전체 프리미엄 액세스가 잠금 해제되었습니다. 모든 최적화 기능을 이제 이용할 수 있습니다.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl이 구성되었으며 시스템을 향상시킬 준비가 되었습니다.",
    "Step": "단계",
    "of": "/",
    "Next": "다음",
    "Finish": "마침",
    "Premium": "Premium",
    "Dashboard Overview": "대시보드 개요",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "시스템을 실시간으로 모니터링하세요. CPU, RAM, GPU, 디스크를 한눈에 확인할 수 있습니다.",
    "System Tweaks": "시스템 조정",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "검증된 Windows 최적화를 적용하여 지연 시간을 줄이고 하드웨어에서 더 많은 FPS를 확보하세요.",
    "Network Optimization": "네트워크 최적화",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "더 낮은 핑, 제로 패킷 손실, 안정적인 온라인 세션을 위해 네트워크 스택을 미세 조정하세요.",
    "BIOS Advisor": "BIOS 조언자",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "사용자의 CPU와 메인보드에 맞춘 개인화된 BIOS 최적화 권장 사항을 확인하세요.",
    "AI Advisor": "AI 조언자",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "개인 최적화 AI와 채팅하세요. 시스템을 스캔하여 변경해야 할 사항을 정확히 추천합니다.",
    "Security Center": "보안 센터",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "게임 성능 저하 없이 시스템을 안전하게 유지하고 무결성을 검사하세요.",
    "Join the Community": "커뮤니티 참여",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "수천 명의 게이머와 소통하고 업데이트를 받으며 Discord에서 프리미엄 경품을 획득하세요.",
    "Join Discord": "Discord 참여",
    "By continuing you agree to the": "계속 진행하면 다음 사항에 동의하게 됩니다.",
    "and": "및",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl은 하드웨어 최적화 제품군이며, 어떠한 보증도 제공되지 않습니다.",
    "4 active": "4개 활성화됨",
    "4 recommendations": "4개 권장 사항",
    "AI Chat": "AI 채팅",
    "AI System Advisor": "AI 시스템 어드바이저",
    "After removing interference → more stable": "간섭 제거 후 → 더 안정적임",
    "Analysis confidence": "분석 신뢰도",
    "Analyzing…": "분석 중...",
    "Applied Tweaks": "적용된 조정",
    "BIOS Intelligence": "BIOS 인텔리전스",
    "Background processes creating noise": "노이즈를 생성하는 백그라운드 프로세스",
    "CPU": "CPU",
    "Demo": "데모",
    "Disk": "디스크",
    "Does not increase FPS. Removes hidden delays.": "FPS를 증가시키지는 않습니다. 숨겨진 지연을 제거합니다.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "모든 기능이 잠금 해제되었습니다. 우선 지원, 고급 텔레메트리, 전체 최적화 제어 권한을 이제 이용할 수 있습니다. 프리미엄 경험을 즐겨보세요.",
    "Example": "예시",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "특정 메인보드와 CPU에 맞춘 전문가 BIOS 구성 지침입니다. 사용자 설정에 맞는 안전하고 성능이 검증된 권장 사항을 확인하세요.",
    "FPS stability": "FPS 안정성",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "최대 게임 성능을 위해 Windows 전원 설정을 미세 조정하세요. 최적화된 프로필 중에서 선택하거나 하드웨어에 맞춘 사용자 지정 설정을 만드세요.",
    "Full System Visibility": "전체 시스템 가시성",
    "GPU": "GPU",
    "Health": "상태",
    "Illustration only": "일러스트레이션 전용",
    "Join the Discord for updates, announcements, and premium giveaways.": "업데이트, 공지 사항 및 프리미엄 경품을 위해 Discord에 참여하세요.",
    "Latency trace": "지연 시간 추적",
    "Live Performance": "실시간 성능",
    "Loss": "손실",
    "No fake boosts. Just removing what slows your system down.": "가짜 부스트는 없습니다. 시스템 속도를 저하시키는 요소를 제거할 뿐입니다.",
    "PREMIUM": "PREMIUM",
    "Ping": "핑",
    "Power Plan Control": "전원 관리 계획 제어",
    "Premium Activated": "프리미엄 활성화됨",
    "Premium Upgrade": "프리미엄 업그레이드",
    "Premium only": "프리미엄 전용",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "고급 TCP/IP, UDP, DNS 및 SMB 최적화로 지연 시간과 패킷 손실을 줄이세요. 경쟁 게임을 위한 프리미엄 전용 네트워크 스택 튜닝입니다.",
    "Score": "점수",
    "Score trajectory": "점수 추이",
    "Security health trend": "보안 상태 추세",
    "System Interference — Demo": "시스템 간섭 — 데모",
    "Temp": "온도",
    "Thinking...": "생각 중...",
    "Throughput": "처리량",
    "Welcome to Premium": "프리미엄에 오신 것을 환영합니다",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "이제 전체 SwitchControl 제품군에 액세스할 수 있습니다. 잠금 해제된 모든 기능을 소개해 드리겠습니다.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "개인 AI 기반 최적화 어시스턴트입니다. 시스템을 스캔하고 하드웨어에 가장 적합한 조정을 권장합니다. 프리미엄 사용자 전용입니다.",
    "live": "실시간"
  },
  "fr": {
    "Signed in": "Connecté",
    "Review before you optimize": "Examinez avant d'optimiser",
    "Terms": "Conditions",
    "Privacy": "Confidentialité",
    "Terms of Service": "Conditions d'utilisation",
    "Privacy Policy": "Politique de confidentialité",
    "Terms of Service and Privacy Policy": "Conditions d'utilisation et politique de confidentialité",
    "Last updated:": "Dernière mise à jour :",
    "Required first step": "Première étape requise",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Lisez les Conditions d'utilisation et la Politique de confidentialité, puis faites défiler jusqu'à la fin pour continuer avec SwitchControl.",
    "Ready to agree": "Prêt à accepter",
    "Scroll to continue": "Faites défiler pour continuer",
    "We could not save your consent. Check browser storage access and try again.": "Nous n'avons pas pu enregistrer votre consentement. Vérifiez l'accès au stockage de votre navigateur et réessayez.",
    "Decline & quit": "Refuser et quitter",
    "Agree & continue": "Accepter et continuer",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "En sélectionnant Accepter, vous confirmez avoir examiné les deux documents et accepter les Conditions d'utilisation et la Politique de confidentialité.",
    "Important Notice": "Avis important",
    "Keep SwitchControl closed while gaming": "Gardez SwitchControl fermé pendant que vous jouez",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl est conçu pour configurer et optimiser votre système avant que vous ne jouiez — et non pour fonctionner en parallèle de vos jeux. Garder l'application ouverte pendant que vous jouez peut consommer du CPU et de la mémoire supplémentaires, ce qui peut réduire les performances plutôt que de les améliorer.",
    "Apply tweaks, then close": "Appliquez les réglages, puis fermez",
    "Launch your game after closing": "Lancez votre jeu après la fermeture",
    "Don't keep it open mid-game": "Ne le gardez pas ouvert pendant le jeu",
    "It's not a game overlay tool": "Ce n'est pas un outil d'overlay de jeu",
    "I Understand — Continue": "Je comprends — Continuer",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "En continuant, vous acceptez les Conditions d'utilisation et la Politique de confidentialité. SwitchControl est une suite d'optimisation matérielle — aucune garantie n'est implicite.",
    "Confirm & Continue": "Confirmer et continuer",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Juste pour être sûr — comprenez-vous que SwitchControl doit être fermé avant de commencer à jouer, et ne pas fonctionner en arrière-plan ?",
    "Yes, I'm ready to continue": "Oui, je suis prêt à continuer",
    "← Go back and re-read": "← Retourner et relire",
    "Welcome": "Bienvenue",
    "Premium Member": "Membre Premium",
    "Let's optimize your gaming experience": "Optimisons votre expérience de jeu",
    "Loading…": "Chargement…",
    "You're all set.": "Vous êtes prêt.",
    "Full premium access unlocked. Every optimization is now yours.": "Accès Premium complet déverrouillé. Chaque optimisation est désormais à vous.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl est configuré et prêt à booster votre système.",
    "Step": "Étape",
    "of": "de",
    "Next": "Suivant",
    "Finish": "Terminer",
    "Premium": "Premium",
    "Dashboard Overview": "Aperçu du tableau de bord",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Surveillez votre système en temps réel — CPU, RAM, GPU et disque en un coup d'œil.",
    "System Tweaks": "Réglages système",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Appliquez des optimisations Windows éprouvées pour réduire la latence et tirer plus de FPS de votre matériel.",
    "Network Optimization": "Optimisation réseau",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Ajustez votre pile réseau pour un ping plus bas, aucune perte de paquets et des sessions en ligne stables.",
    "BIOS Advisor": "Conseiller BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Obtenez des recommandations d'optimisation BIOS personnalisées adaptées à votre CPU et carte mère exacts.",
    "AI Advisor": "Conseiller AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Discutez avec votre AI d'optimisation personnelle — elle scanne votre système et recommande exactement ce qu'il faut changer.",
    "Security Center": "Centre de sécurité",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Gardez votre système sécurisé et intègre sans sacrifier les performances de jeu.",
    "Join the Community": "Rejoindre la communauté",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Connectez-vous avec des milliers de joueurs, recevez des mises à jour et gagnez des cadeaux Premium sur notre Discord.",
    "Join Discord": "Rejoindre Discord",
    "By continuing you agree to the": "En continuant, vous acceptez les",
    "and": "et",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl est une suite d'optimisation matérielle ; aucune garantie n'est implicite.",
    "4 active": "4 actifs",
    "4 recommendations": "4 recommandations",
    "AI Chat": "Chat AI",
    "AI System Advisor": "Conseiller système AI",
    "After removing interference → more stable": "Après suppression des interférences → plus stable",
    "Analysis confidence": "Confiance de l'analyse",
    "Analyzing…": "Analyse en cours...",
    "Applied Tweaks": "Optimisations appliquées",
    "BIOS Intelligence": "Intelligence BIOS",
    "Background processes creating noise": "Processus d'arrière-plan créant du bruit",
    "CPU": "CPU",
    "Demo": "Démo",
    "Disk": "Disque",
    "Does not increase FPS. Removes hidden delays.": "N'augmente pas les FPS. Supprime les délais cachés.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Tout est déverrouillé. Le support prioritaire, la télémétrie avancée et le contrôle total de l'optimisation sont désormais à vous. Profitez de votre expérience Premium.",
    "Example": "Exemple",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Conseils d'experts en configuration BIOS adaptés à votre carte mère et CPU spécifiques. Obtenez des recommandations sûres et testées pour votre configuration exacte.",
    "FPS stability": "Stabilité des FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Ajustez vos paramètres d'alimentation Windows pour une performance de jeu maximale. Choisissez parmi des profils optimisés ou créez des réglages personnalisés adaptés à votre matériel.",
    "Full System Visibility": "Visibilité complète du système",
    "GPU": "GPU",
    "Health": "Santé",
    "Illustration only": "Illustration uniquement",
    "Join the Discord for updates, announcements, and premium giveaways.": "Rejoignez Discord pour des mises à jour, des annonces et des cadeaux Premium.",
    "Latency trace": "Suivi de latence",
    "Live Performance": "Performance en direct",
    "Loss": "Perte",
    "No fake boosts. Just removing what slows your system down.": "Pas de faux boosts. Juste la suppression de ce qui ralentit votre système.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Contrôle du plan d'alimentation",
    "Premium Activated": "Premium activé",
    "Premium Upgrade": "Mise à niveau Premium",
    "Premium only": "Premium uniquement",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Réduisez la latence et la perte de paquets avec des optimisations avancées TCP/IP, UDP, DNS et SMB. Ajustement de pile réseau Premium pour le jeu compétitif.",
    "Score": "Score",
    "Score trajectory": "Trajectoire du score",
    "Security health trend": "Tendance de la santé de sécurité",
    "System Interference — Demo": "Interférence système — Démo",
    "Temp": "Temp",
    "Thinking...": "Réflexion...",
    "Throughput": "Débit",
    "Welcome to Premium": "Bienvenue sur Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Vous avez désormais accès à la suite SwitchControl complète. Laissez-nous vous montrer tout ce qui vient d'être déverrouillé.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Votre assistant d'optimisation personnel propulsé par AI. Il scanne votre système et recommande les meilleurs réglages pour votre matériel — disponible exclusivement pour les utilisateurs Premium.",
    "live": "en direct"
  },
  "te": {
    "Signed in": "సైన్ ఇన్ చేసారు",
    "Review before you optimize": "మీరు ఆప్టిమైజ్ చేసే ముందు సమీక్షించండి",
    "Terms": "నిబంధనలు",
    "Privacy": "గోప్యత",
    "Terms of Service": "సేవా నిబంధనలు",
    "Privacy Policy": "గోప్యతా విధానం",
    "Terms of Service and Privacy Policy": "సేవా నిబంధనలు మరియు గోప్యతా విధానం",
    "Last updated:": "చివరిగా నవీకరించబడింది:",
    "Required first step": "అవసరమైన మొదటి అడుగు",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "సేవా నిబంధనలు మరియు గోప్యతా విధానాన్ని చదవండి, ఆపై SwitchControl తో కొనసాగడానికి చివరకు స్క్రోల్ చేయండి.",
    "Ready to agree": "అంగీకరించడానికి సిద్ధంగా ఉన్నారు",
    "Scroll to continue": "కొనసాగడానికి స్క్రోల్ చేయండి",
    "We could not save your consent. Check browser storage access and try again.": "మేము మీ సమ్మతిని సేవ్ చేయలేకపోయాము. బ్రౌజర్ స్టోరేజ్ యాక్సెస్‌ని తనిఖీ చేసి, మళ్లీ ప్రయత్నించండి.",
    "Decline & quit": "తిరస్కరించండి & నిష్క్రమించండి",
    "Agree & continue": "అంగీకరించండి & కొనసాగించండి",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "అంగీకరించు ఎంచుకోవడం ద్వారా, మీరు రెండు పత్రాలను సమీక్షించారని మరియు సేవా నిబంధనలు మరియు గోప్యతా విధానానికి అంగీకరిస్తున్నారని మీరు నిర్ధారిస్తారు.",
    "Important Notice": "ముఖ్య గమనిక",
    "Keep SwitchControl closed while gaming": "గేమింగ్ చేస్తున్నప్పుడు SwitchControl మూసి ఉంచండి",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl మీ సిస్టమ్‌ను మీరు గేమింగ్ చేసే ముందు కాన్ఫిగర్ చేయడానికి మరియు ఆప్టిమైజ్ చేయడానికి రూపొందించబడింది — మీ గేమ్‌లతో పాటు రన్ అవ్వడానికి కాదు. గేమింగ్ చేస్తున్నప్పుడు యాప్‌ను తెరిచి ఉంచడం వల్ల అదనపు CPU మరియు మెమరీ వినియోగం జరగవచ్చు, ఇది పనితీరును మెరుగుపరచడానికి బదులుగా తగ్గించవచ్చు.",
    "Apply tweaks, then close": "ట్వీక్స్‌ని వర్తించండి, ఆపై మూసివేయండి",
    "Launch your game after closing": "మూసివేసిన తర్వాత మీ గేమ్‌ని ప్రారంభించండి",
    "Don't keep it open mid-game": "గేమ్ మధ్యలో దీనిని తెరిచి ఉంచవద్దు",
    "It's not a game overlay tool": "ఇది గేమ్ ఓవర్లే సాధనం కాదు",
    "I Understand — Continue": "నాకు అర్థమైంది — కొనసాగించు",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "కొనసాగించడం ద్వారా మీరు సేవా నిబంధనలు మరియు గోప్యతా విధానానికి అంగీకరిస్తున్నారు. SwitchControl అనేది హార్డ్‌వేర్ ఆప్టిమైజేషన్ సూట్ — ఎటువంటి వారంటీ సూచించబడలేదు.",
    "Confirm & Continue": "నిర్ధారించండి & కొనసాగించండి",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "కేవలం నిర్ధారించుకోవడానికి — మీరు గేమింగ్ ప్రారంభించే ముందు SwitchControl మూసివేయబడాలని, బ్యాక్‌గ్రౌండ్‌లో రన్ అవ్వకూడదని మీకు అర్థమైందా?",
    "Yes, I'm ready to continue": "అవును, నేను కొనసాగడానికి సిద్ధంగా ఉన్నాను",
    "← Go back and re-read": "← వెనక్కి వెళ్లి మళ్లీ చదవండి",
    "Welcome": "స్వాగతం",
    "Premium Member": "Premium సభ్యుడు",
    "Let's optimize your gaming experience": "మీ గేమింగ్ అనుభవాన్ని ఆప్టిమైజ్ చేద్దాం",
    "Loading…": "లోడ్ అవుతోంది…",
    "You're all set.": "మీరు సిద్ధంగా ఉన్నారు.",
    "Full premium access unlocked. Every optimization is now yours.": "పూర్తి Premium యాక్సెస్ అన్‌లాక్ చేయబడింది. ప్రతి ఆప్టిమైజేషన్ ఇప్పుడు మీ సొంతం.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl కాన్ఫిగర్ చేయబడింది మరియు మీ సిస్టమ్‌ను బూస్ట్ చేయడానికి సిద్ధంగా ఉంది.",
    "Step": "దశ",
    "of": "యొక్క",
    "Next": "తర్వాత",
    "Finish": "ముగించు",
    "Premium": "Premium",
    "Dashboard Overview": "డాష్‌బోర్డ్ అవలోకనం",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "మీ సిస్టమ్‌ను రియల్-టైమ్‌లో పర్యవేక్షించండి — CPU, RAM, GPU మరియు disk అన్నీ ఒకే చూపులో.",
    "System Tweaks": "సిస్టమ్ ట్వీక్స్",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "లేటెన్సీని తగ్గించడానికి మరియు మీ హార్డ్‌వేర్ నుండి ఎక్కువ FPSని పొందడానికి నిరూపితమైన Windows ఆప్టిమైజేషన్‌లను వర్తింపజేయండి.",
    "Network Optimization": "నెట్‌వర్క్ ఆప్టిమైజేషన్",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "తక్కువ పింగ్, జీరో ప్యాకెట్ లాస్ మరియు స్థిరమైన ఆన్‌లైన్ సెషన్‌ల కోసం మీ నెట్‌వర్క్ స్టాక్‌ను ఫైన్-ట్యూన్ చేయండి.",
    "BIOS Advisor": "BIOS అడ్వైజర్",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "మీ ఖచ్చితమైన CPU మరియు మదర్‌బోర్డ్‌కు అనుగుణంగా వ్యక్తిగతీకరించిన BIOS ఆప్టిమైజేషన్ సిఫార్సులను పొందండి.",
    "AI Advisor": "AI అడ్వైజర్",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "మీ వ్యక్తిగత ఆప్టిమైజేషన్ AIతో చాట్ చేయండి — ఇది మీ సిస్టమ్‌ను స్కాన్ చేస్తుంది మరియు దేనిని మార్చాలో ఖచ్చితంగా సిఫార్సు చేస్తుంది.",
    "Security Center": "సెక్యూరిటీ సెంటర్",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "గేమింగ్ పనితీరును దెబ్బతీయకుండా మీ సిస్టమ్‌ను సురక్షితంగా మరియు సమగ్రంగా ఉంచండి.",
    "Join the Community": "కమ్యూనిటీలో చేరండి",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "మా Discordలో వేలమంది గేమర్‌లతో కనెక్ట్ అవ్వండి, అప్‌డేట్‌లను పొందండి మరియు Premium గివ్-అవేలను గెలవండి.",
    "Join Discord": "Discordలో చేరండి",
    "By continuing you agree to the": "కొనసాగించడం ద్వారా మీరు వీటిని అంగీకరిస్తున్నారు",
    "and": "మరియు",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl అనేది హార్డ్‌వేర్ ఆప్టిమైజేషన్ సూట్ — ఎటువంటి వారంటీ సూచించబడలేదు.",
    "4 active": "4 సక్రియంగా ఉన్నాయి",
    "4 recommendations": "4 సిఫార్సులు",
    "AI Chat": "AI చాట్",
    "AI System Advisor": "AI సిస్టమ్ అడ్వైజర్",
    "After removing interference → more stable": "అంతరాయాలను తొలగించిన తర్వాత → మరింత స్థిరంగా",
    "Analysis confidence": "విశ్లేషణ విశ్వసనీయత",
    "Analyzing…": "విశ్లేషిస్తోంది...",
    "Applied Tweaks": "వర్తింపజేయబడిన ట్వీక్స్",
    "BIOS Intelligence": "BIOS ఇంటెలిజెన్స్",
    "Background processes creating noise": "నేపథ్య ప్రక్రియలు నాయిస్‌ని సృష్టిస్తున్నాయి",
    "CPU": "CPU",
    "Demo": "డెమో",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPSని పెంచదు. దాగి ఉన్న జాప్యాలను (delays) తొలగిస్తుంది.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "అన్నీ అన్‌లాక్ చేయబడ్డాయి. ప్రయారిటీ సపోర్ట్, అడ్వాన్స్‌డ్ టెలిమెట్రీ మరియు పూర్తి ఆప్టిమైజేషన్ నియంత్రణ ఇప్పుడు మీ సొంతం. మీ Premium అనుభవాన్ని ఆస్వాదించండి.",
    "Example": "ఉదాహరణ",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "మీ నిర్దిష్ట మదర్‌బోర్డ్ మరియు CPU కోసం రూపొందించిన నిపుణుల BIOS కాన్ఫిగరేషన్ మార్గదర్శకత్వం. మీ ఖచ్చితమైన సెటప్ కోసం సురక్షితమైన, పనితీరు-పరీక్షించబడిన సిఫార్సులను పొందండి.",
    "FPS stability": "FPS స్థిరత్వం",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "గరిష్ట గేమింగ్ పనితీరు కోసం మీ Windows పవర్ సెట్టింగ్‌లను ఫైన్-ట్యూన్ చేయండి. ఆప్టిమైజ్ చేసిన ప్రొఫైల్‌ల నుండి ఎంచుకోండి లేదా మీ హార్డ్‌వేర్‌కు అనుగుణంగా కస్టమ్ ఓవర్రైడ్‌లను సృష్టించండి.",
    "Full System Visibility": "పూర్తి సిస్టమ్ విజిబిలిటీ",
    "GPU": "GPU",
    "Health": "ఆరోగ్యం",
    "Illustration only": "చిత్రీకరణ మాత్రమే",
    "Join the Discord for updates, announcements, and premium giveaways.": "అప్‌డేట్‌లు, ప్రకటనలు మరియు Premium గివ్-అవేల కోసం Discordలో చేరండి.",
    "Latency trace": "లేటెన్సీ ట్రేస్",
    "Live Performance": "లైవ్ పనితీరు",
    "Loss": "నష్టం",
    "No fake boosts. Just removing what slows your system down.": "నకిలీ బూస్ట్‌లు లేవు. మీ సిస్టమ్‌ను మందగించే వాటిని మాత్రమే తొలగిస్తున్నాము.",
    "PREMIUM": "PREMIUM",
    "Ping": "పింగ్",
    "Power Plan Control": "పవర్ ప్లాన్ కంట్రోల్",
    "Premium Activated": "Premium యాక్టివేట్ చేయబడింది",
    "Premium Upgrade": "Premium అప్‌గ్రేడ్",
    "Premium only": "Premium మాత్రమే",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "అధునాతన TCP/IP, UDP, DNS మరియు SMB ఆప్టిమైజేషన్‌లతో లేటెన్సీ మరియు ప్యాకెట్ లాస్‌ను తగ్గించండి. పోటీ గేమింగ్ కోసం Premium-మాత్రమే నెట్‌వర్క్ స్టాక్ ట్యూనింగ్.",
    "Score": "స్కోరు",
    "Score trajectory": "స్కోరు పథం",
    "Security health trend": "సెక్యూరిటీ హెల్త్ ట్రెండ్",
    "System Interference — Demo": "సిస్టమ్ అంతరాయం — డెమో",
    "Temp": "ఉష్ణోగ్రత",
    "Thinking...": "ఆలోచిస్తోంది...",
    "Throughput": "త్రూపుట్",
    "Welcome to Premium": "Premiumకు స్వాగతం",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "మీకు ఇప్పుడు పూర్తి SwitchControl సూట్‌కు యాక్సెస్ ఉంది. ఇప్పుడే అన్‌లాక్ అయిన ప్రతి విషయాన్ని మీకు చూపిస్తాము.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "మీ వ్యక్తిగత AI-ఆధారిత ఆప్టిమైజేషన్ అసిస్టెంట్. ఇది మీ సిస్టమ్‌ను స్కాన్ చేస్తుంది మరియు మీ హార్డ్‌వేర్ కోసం ఉత్తమమైన ట్వీక్‌లను సిఫార్సు చేస్తుంది — ఇది Premium వినియోగదారుల కోసం మాత్రమే అందుబాటులో ఉంటుంది.",
    "live": "లైవ్"
  },
  "tr": {
    "Signed in": "Oturum açıldı",
    "Review before you optimize": "Optimize etmeden önce gözden geçirin",
    "Terms": "Şartlar",
    "Privacy": "Gizlilik",
    "Terms of Service": "Hizmet Şartları",
    "Privacy Policy": "Gizlilik Politikası",
    "Terms of Service and Privacy Policy": "Hizmet Şartları ve Gizlilik Politikası",
    "Last updated:": "Son güncelleme:",
    "Required first step": "Gerekli ilk adım",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Hizmet Şartları ve Gizlilik Politikasını okuyun, ardından SwitchControl ile devam etmek için sona kadar kaydırın.",
    "Ready to agree": "Kabul etmeye hazır",
    "Scroll to continue": "Devam etmek için kaydırın",
    "We could not save your consent. Check browser storage access and try again.": "Onayınızı kaydedemedik. Tarayıcı depolama erişimini kontrol edin ve tekrar deneyin.",
    "Decline & quit": "Reddet & çık",
    "Agree & continue": "Kabul et & devam et",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Kabul Et seçeneğini belirleyerek, her iki belgeyi de incelediğinizi ve Hizmet Şartları ve Gizlilik Politikasını kabul ettiğinizi onaylamış olursunuz.",
    "Important Notice": "Önemli Uyarı",
    "Keep SwitchControl closed while gaming": "Oyun oynarken SwitchControl'ü kapalı tutun",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl, oyun oynarken arka planda çalışmak için değil, oyun öncesinde sisteminizi yapılandırmak ve optimize etmek için tasarlanmıştır. Uygulamayı oyun sırasında açık tutmak fazladan CPU ve bellek tüketebilir, bu da performansı artırmak yerine düşürebilir.",
    "Apply tweaks, then close": "Ayarları uygulayın, ardından kapatın",
    "Launch your game after closing": "Kapattıktan sonra oyununuzu başlatın",
    "Don't keep it open mid-game": "Oyun ortasında açık bırakmayın",
    "It's not a game overlay tool": "Bu bir oyun katmanı aracı değildir",
    "I Understand — Continue": "Anlıyorum — Devam et",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Devam ederek Hizmet Şartları ve Gizlilik Politikasını kabul etmiş olursunuz. SwitchControl bir donanım optimizasyon paketidir — hiçbir garanti ima edilmez.",
    "Confirm & Continue": "Onayla & Devam Et",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Emin olmak için — SwitchControl'ün oyun oynamaya başlamadan önce kapatılması gerektiğini, arka planda çalışmaması gerektiğini anlıyor musunuz?",
    "Yes, I'm ready to continue": "Evet, devam etmeye hazırım",
    "← Go back and re-read": "← Geri dön ve tekrar oku",
    "Welcome": "Hoş geldiniz",
    "Premium Member": "Premium Üye",
    "Let's optimize your gaming experience": "Oyun deneyiminizi optimize edelim",
    "Loading…": "Yükleniyor…",
    "You're all set.": "Hazırsınız.",
    "Full premium access unlocked. Every optimization is now yours.": "Tam premium erişimin kilidi açıldı. Artık tüm optimizasyonlar sizin.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl yapılandırıldı ve sisteminizi hızlandırmaya hazır.",
    "Step": "Adım",
    "of": "/",
    "Next": "İleri",
    "Finish": "Bitir",
    "Premium": "Premium",
    "Dashboard Overview": "Kontrol Paneli Genel Bakışı",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Sisteminizi gerçek zamanlı izleyin — CPU, RAM, GPU ve disk tek bir bakışta.",
    "System Tweaks": "Sistem Ayarları",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Gecikmeyi azaltmak ve donanımınızdan daha fazla FPS elde etmek için kanıtlanmış Windows optimizasyonlarını uygulayın.",
    "Network Optimization": "Ağ Optimizasyonu",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Daha düşük ping, sıfır paket kaybı ve kararlı çevrimiçi oturumlar için ağ yığınınızı ince ayarlayın.",
    "BIOS Advisor": "BIOS Danışmanı",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Tam CPU ve anakartınıza göre uyarlanmış kişiselleştirilmiş BIOS optimizasyon önerileri alın.",
    "AI Advisor": "AI Danışmanı",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Kişisel optimizasyon AI'nızla sohbet edin — sisteminizi tarar ve tam olarak nelerin değiştirilmesi gerektiğini önerir.",
    "Security Center": "Güvenlik Merkezi",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Oyun performansından ödün vermeden sisteminizi güvenli ve bütünlüğü kontrol edilmiş halde tutun.",
    "Join the Community": "Topluluğa Katıl",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Binlerce oyuncuyla bağlantı kurun, güncellemeleri alın ve Discord'umuzda premium hediyeler kazanın.",
    "Join Discord": "Discord'a Katıl",
    "By continuing you agree to the": "Devam ederek şunları kabul etmiş olursunuz:",
    "and": "ve",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl bir donanım optimizasyon paketidir; hiçbir garanti ima edilmez.",
    "4 active": "4 aktif",
    "4 recommendations": "4 öneri",
    "AI Chat": "AI Sohbet",
    "AI System Advisor": "AI Sistem Danışmanı",
    "After removing interference → more stable": "Parazit giderildikten sonra → daha kararlı",
    "Analysis confidence": "Analiz güveni",
    "Analyzing…": "Analiz ediliyor…",
    "Applied Tweaks": "Uygulanan İyileştirmeler",
    "BIOS Intelligence": "BIOS Zekası",
    "Background processes creating noise": "Gürültü yaratan arka plan işlemleri",
    "CPU": "CPU",
    "Demo": "Demo",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPS artırmaz. Gizli gecikmeleri kaldırır.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Her şeyin kilidi açıldı. Öncelikli destek, gelişmiş telemetri ve tam optimizasyon kontrolü artık sizin. Premium deneyiminizin keyfini çıkarın.",
    "Example": "Örnek",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Belirli anakartınıza ve CPU'nuza göre uyarlanmış uzman BIOS yapılandırma rehberliği. Tam kurulumunuz için güvenli, performans testinden geçmiş öneriler alın.",
    "FPS stability": "FPS kararlılığı",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Maksimum oyun performansı için Windows güç ayarlarınızı ince ayarlayın. Optimize edilmiş profiller arasından seçim yapın veya donanımınıza özel ayarlar oluşturun.",
    "Full System Visibility": "Tam Sistem Görünürlüğü",
    "GPU": "GPU",
    "Health": "Sağlık",
    "Illustration only": "Sadece çizim",
    "Join the Discord for updates, announcements, and premium giveaways.": "Güncellemeler, duyurular ve premium hediyeler için Discord'a katılın.",
    "Latency trace": "Gecikme izleme",
    "Live Performance": "Canlı Performans",
    "Loss": "Kayıp",
    "No fake boosts. Just removing what slows your system down.": "Sahte hızlandırmalar yok. Sadece sisteminizi yavaşlatan şeyleri kaldırma var.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Güç Planı Kontrolü",
    "Premium Activated": "Premium Etkinleştirildi",
    "Premium Upgrade": "Premium Yükseltme",
    "Premium only": "Sadece Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Gelişmiş TCP/IP, UDP, DNS ve SMB optimizasyonları ile gecikmeyi ve paket kaybını azaltın. Rekabetçi oyunlar için sadece Premium'a özel ağ yığını ince ayarı.",
    "Score": "Skor",
    "Score trajectory": "Skor seyri",
    "Security health trend": "Güvenlik sağlığı trendi",
    "System Interference — Demo": "Sistem Paraziti — Demo",
    "Temp": "Sıcaklık",
    "Thinking...": "Düşünüyor...",
    "Throughput": "Verim",
    "Welcome to Premium": "Premium'a Hoş Geldiniz",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Artık tam SwitchControl paketine erişiminiz var. Kilidi açılan her şeyi size gösterelim.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Kişisel AI destekli optimizasyon asistanınız. Sisteminizi tarar ve donanımınız için en iyi iyileştirmeleri önerir — sadece Premium kullanıcılarına özeldir.",
    "live": "canlı"
  },
  "mr": {
    "Signed in": "साइन इन केले आहे",
    "Review before you optimize": "ऑप्टिमाइझ करण्यापूर्वी पुनरावलोकन करा",
    "Terms": "अटी",
    "Privacy": "गोपनीयता",
    "Terms of Service": "सेवा अटी",
    "Privacy Policy": "गोपनीयता धोरण",
    "Terms of Service and Privacy Policy": "सेवा अटी आणि गोपनीयता धोरण",
    "Last updated:": "शेवटचे अपडेट:",
    "Required first step": "पहिली आवश्यक पायरी",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "सेवा अटी आणि गोपनीयता धोरण वाचा, त्यानंतर SwitchControl सह सुरू ठेवण्यासाठी शेवटी स्क्रोल करा.",
    "Ready to agree": "सहमत होण्यासाठी तयार",
    "Scroll to continue": "सुरू ठेवण्यासाठी स्क्रोल करा",
    "We could not save your consent. Check browser storage access and try again.": "आम्ही तुमची संमती जतन करू शकलो नाही. ब्राउझर स्टोरेज ॲक्सेस तपासा आणि पुन्हा प्रयत्न करा.",
    "Decline & quit": "नकार द्या आणि बाहेर पडा",
    "Agree & continue": "सहमत व्हा आणि सुरू ठेवा",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "सहमत निवडून, तुम्ही पुष्टी करता की तुम्ही दोन्ही दस्तऐवजांचे पुनरावलोकन केले आहे आणि सेवा अटी आणि गोपनीयता धोरणाशी सहमत आहात.",
    "Important Notice": "महत्त्वाची सूचना",
    "Keep SwitchControl closed while gaming": "गेमिंग करताना SwitchControl बंद ठेवा",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl हे तुमच्या गेमिंगपूर्वी तुमची सिस्टम कॉन्फिगर आणि ऑप्टिमाइझ करण्यासाठी डिझाइन केलेले आहे — तुमच्या गेमसोबत चालण्यासाठी नाही. गेमिंग करताना ॲप उघडे ठेवल्यास अतिरिक्त CPU आणि मेमरी वापरली जाऊ शकते, ज्यामुळे कामगिरी सुधारण्याऐवजी कमी होऊ शकते.",
    "Apply tweaks, then close": "ट्विक्स लागू करा, त्यानंतर बंद करा",
    "Launch your game after closing": "बंद केल्यानंतर तुमचा गेम लाँच करा",
    "Don't keep it open mid-game": "गेम दरम्यान ते उघडे ठेवू नका",
    "It's not a game overlay tool": "हे गेम ओव्हरले टूल नाही",
    "I Understand — Continue": "मी समजतो — सुरू ठेवा",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "सुरू ठेवून तुम्ही सेवा अटी आणि गोपनीयता धोरणाशी सहमत आहात. SwitchControl हे हार्डवेअर ऑप्टिमायझेशन सुट आहे — कोणतीही वॉरंटी सूचित केलेली नाही.",
    "Confirm & Continue": "पुष्टी करा आणि सुरू ठेवा",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "फक्त खात्री करण्यासाठी — तुम्हाला समजले आहे का की गेमिंग सुरू करण्यापूर्वी SwitchControl बंद केले पाहिजे, बॅकग्राउंडमध्ये चालू ठेवू नये?",
    "Yes, I'm ready to continue": "हो, मी सुरू ठेवण्यासाठी तयार आहे",
    "← Go back and re-read": "← मागे जा आणि पुन्हा वाचा",
    "Welcome": "स्वागत आहे",
    "Premium Member": "Premium सदस्य",
    "Let's optimize your gaming experience": "चला तुमचा गेमिंग अनुभव ऑप्टिमाइझ करूया",
    "Loading…": "लोड होत आहे…",
    "You're all set.": "तुम्ही सर्व सेट आहात.",
    "Full premium access unlocked. Every optimization is now yours.": "पूर्ण प्रीमियम ॲक्सेस अनलॉक झाला आहे. प्रत्येक ऑप्टिमायझेशन आता तुमचे आहे.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl कॉन्फिगर केले आहे आणि तुमची सिस्टीम बूस्ट करण्यासाठी तयार आहे.",
    "Step": "पायरी",
    "of": "पैकी",
    "Next": "पुढील",
    "Finish": "पूर्ण करा",
    "Premium": "Premium",
    "Dashboard Overview": "डॅशबोर्ड विहंगावलोकन",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "तुमची सिस्टीम रिअल-टाइममध्ये मॉनिटर करा — CPU, RAM, GPU आणि डिस्क सर्व एका दृष्टीक्षेपात.",
    "System Tweaks": "सिस्टम ट्विक्स",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "लॅटन्सी कमी करण्यासाठी आणि तुमच्या हार्डवेअरमधून अधिक FPS मिळवण्यासाठी सिद्ध Windows ऑप्टिमायझेशन लागू करा.",
    "Network Optimization": "नेटवर्क ऑप्टिमायझेशन",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "कमी पिंग, शून्य पॅकेट लॉस आणि स्थिर ऑनलाइन सत्रांसाठी तुमचा नेटवर्क स्टॅक फाइन-ट्यून करा.",
    "BIOS Advisor": "BIOS ॲडव्हायझर",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "तुमच्या अचूक CPU आणि मदरबोर्डसाठी तयार केलेल्या वैयक्तिकृत BIOS ऑप्टिमायझेशन शिफारसी मिळवा.",
    "AI Advisor": "AI ॲडव्हायझर",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "तुमच्या वैयक्तिक ऑप्टिमायझेशन AI शी चॅट करा — ते तुमची सिस्टीम स्कॅन करते आणि नेमके काय बदलावे याची शिफारस करते.",
    "Security Center": "सुरक्षा केंद्र",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "गेमिंग कामगिरीचा बळी न देता तुमची सिस्टीम सुरक्षित आणि अखंडता-तपासलेली ठेवा.",
    "Join the Community": "समुदायात सामील व्हा",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "हजारो गेमर्सशी कनेक्ट व्हा, अपडेट्स मिळवा आणि आमच्या Discord वर प्रीमियम गिव्हअवेज जिंका.",
    "Join Discord": "Discord जॉइन करा",
    "By continuing you agree to the": "सुरू ठेवून तुम्ही या अटींशी सहमत आहात",
    "and": "आणि",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl हा एक हार्डवेअर ऑप्टिमायझेशन संच आहे — कोणतीही वॉरंटी दिली जात नाही.",
    "4 active": "४ सक्रिय",
    "4 recommendations": "४ शिफारसी",
    "AI Chat": "AI चॅट",
    "AI System Advisor": "AI सिस्टीम ॲडव्हायझर",
    "After removing interference → more stable": "हस्तक्षेप काढून टाकल्यानंतर → अधिक स्थिर",
    "Analysis confidence": "विश्लेषण विश्वासार्हता",
    "Analyzing…": "विश्लेषण करत आहे...",
    "Applied Tweaks": "लागू केलेले ट्वीक्स",
    "BIOS Intelligence": "BIOS इंटेलिजन्स",
    "Background processes creating noise": "बॅकग्राउंड प्रक्रिया जो आवाज निर्माण करत आहेत",
    "CPU": "CPU",
    "Demo": "डेमो",
    "Disk": "डिस्क",
    "Does not increase FPS. Removes hidden delays.": "FPS वाढत नाही. छुपे विलंब काढून टाकते.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "सर्व काही अनलॉक केले आहे. प्रायोरिटी सपोर्ट, प्रगत टेलिमेट्री आणि पूर्ण ऑप्टिमायझेशन कंट्रोल आता तुमच्याकडे आहेत. तुमच्या प्रीमियम अनुभवाचा आनंद घ्या.",
    "Example": "उदाहरण",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "तुमच्या विशिष्ट मदरबोर्ड आणि CPU साठी तयार केलेले तज्ञ BIOS कॉन्फिगरेशन मार्गदर्शन. तुमच्या सेटअपसाठी सुरक्षित, कामगिरी-चाचणी केलेल्या शिफारसी मिळवा.",
    "FPS stability": "FPS स्थिरता",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "जास्तीत जास्त गेमिंग कामगिरीसाठी तुमची Windows पॉवर सेटिंग्ज फाइन-ट्यून करा. ऑप्टिमाइझ केलेल्या प्रोफाइल्समधून निवडा किंवा तुमच्या हार्डवेअरनुसार कस्टम ओव्हरराइड्स तयार करा.",
    "Full System Visibility": "पूर्ण सिस्टीम दृश्यमानता",
    "GPU": "GPU",
    "Health": "आरोग्य",
    "Illustration only": "केवळ स्पष्टीकरणासाठी",
    "Join the Discord for updates, announcements, and premium giveaways.": "अपडेट्स, घोषणा आणि प्रीमियम गिव्हअवेजसाठी Discord जॉइन करा.",
    "Latency trace": "लॅटन्सी ट्रेस",
    "Live Performance": "लाइव्ह कामगिरी",
    "Loss": "लॉस",
    "No fake boosts. Just removing what slows your system down.": "कोणतेही खोटे बूस्ट नाहीत. फक्त तुमची सिस्टीम मंद करणाऱ्या गोष्टी काढून टाकणे.",
    "PREMIUM": "PREMIUM",
    "Ping": "पिंग",
    "Power Plan Control": "पॉवर प्लॅन कंट्रोल",
    "Premium Activated": "प्रीमियम सक्रिय झाले",
    "Premium Upgrade": "प्रीमियम अपग्रेड",
    "Premium only": "केवळ प्रीमियम",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "प्रगत TCP/IP, UDP, DNS आणि SMB ऑप्टिमायझेशनसह लॅटन्सी आणि पॅकेट लॉस कमी करा. स्पर्धात्मक गेमिंगसाठी केवळ प्रीमियम नेटवर्क स्टॅक ट्यूनिंग.",
    "Score": "स्कोअर",
    "Score trajectory": "स्कोअर प्रक्षेपपथ",
    "Security health trend": "सुरक्षा आरोग्य कल",
    "System Interference — Demo": "सिस्टीम हस्तक्षेप — डेमो",
    "Temp": "तापमान",
    "Thinking...": "विचार करत आहे...",
    "Throughput": "थ्रूपुट",
    "Welcome to Premium": "प्रीमियम मध्ये स्वागत आहे",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "तुम्हाला आता पूर्ण SwitchControl सुटचा ॲक्सेस मिळाला आहे. नुकतेच काय काय अनलॉक झाले आहे ते आम्ही तुम्हाला दाखवतो.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "तुमचा वैयक्तिक AI-शक्तीवर चालणारा ऑप्टिमायझेशन सहाय्यक. हे तुमची सिस्टीम स्कॅन करते आणि तुमच्या हार्डवेअरसाठी सर्वोत्तम ट्वीक्सची शिफारस करते — केवळ प्रीमियम वापरकर्त्यांसाठी उपलब्ध.",
    "live": "लाइव्ह"
  },
  "ta": {
    "Signed in": "உள்நுழைந்துள்ளீர்கள்",
    "Review before you optimize": "மேம்படுத்துவதற்கு முன் சரிபார்க்கவும்",
    "Terms": "விதிமுறைகள்",
    "Privacy": "தனியுரிமை",
    "Terms of Service": "சேவை விதிமுறைகள்",
    "Privacy Policy": "தனியுரிமைக் கொள்கை",
    "Terms of Service and Privacy Policy": "சேவை விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கை",
    "Last updated:": "கடைசியாக புதுப்பிக்கப்பட்டது:",
    "Required first step": "தேவையான முதல் படி",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "சேவை விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கையைப் படியுங்கள், பின்னர் SwitchControl உடன் தொடர இறுதிவரை கீழே உருட்டவும்.",
    "Ready to agree": "ஒப்புக்கொள்ளத் தயார்",
    "Scroll to continue": "தொடர கீழே உருட்டவும்",
    "We could not save your consent. Check browser storage access and try again.": "உங்கள் ஒப்புதலை எங்களால் சேமிக்க முடியவில்லை. உலாவி சேமிப்பக அணுகலைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    "Decline & quit": "நிராகரித்து வெளியேறு",
    "Agree & continue": "ஒப்புக்கொண்டு தொடரவும்",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "ஒப்புக்கொள் என்பதைத் தேர்ந்தெடுப்பதன் மூலம், நீங்கள் இரு ஆவணங்களையும் சரிபார்த்துள்ளீர்கள் என்பதையும் சேவை விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கைக்கு ஒப்புக்கொள்கிறீர்கள் என்பதையும் உறுதிப்படுத்துகிறீர்கள்.",
    "Important Notice": "முக்கிய அறிவிப்பு",
    "Keep SwitchControl closed while gaming": "விளையாடும்போது SwitchControl-ஐ மூடி வைக்கவும்",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl உங்கள் விளையாட்டுகளுக்கு முன் கணினியை உள்ளமைக்கவும் மேம்படுத்தவும் வடிவமைக்கப்பட்டுள்ளது — விளையாட்டுகளுடன் இயங்குவதற்கு அல்ல. விளையாடும்போது செயலியைத் திறந்து வைத்திருப்பது கூடுதல் CPU மற்றும் நினைவகத்தை உட்கொள்ளலாம், இது செயல்திறனை மேம்படுத்துவதற்குப் பதிலாக குறைக்கலாம்.",
    "Apply tweaks, then close": "மாற்றங்களைப் பயன்படுத்துங்கள், பிறகு மூடுங்கள்",
    "Launch your game after closing": "மூடிய பிறகு உங்கள் விளையாட்டைத் தொடங்கவும்",
    "Don't keep it open mid-game": "விளையாட்டின் நடுவில் இதைத் திறந்து வைக்காதீர்கள்",
    "It's not a game overlay tool": "இது ஒரு கேம் ஓவர்லே கருவி அல்ல",
    "I Understand — Continue": "எனக்குப் புரிகிறது — தொடரவும்",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "தொடர்வதன் மூலம் நீங்கள் சேவை விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கைக்கு ஒப்புக்கொள்கிறீர்கள். SwitchControl ஒரு வன்பொருள் மேம்படுத்தல் தொகுப்பு — எந்த உத்தரவாதமும் இல்லை.",
    "Confirm & Continue": "உறுதிப்படுத்தி தொடரவும்",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "நிச்சயப்படுத்திக் கொள்ள — நீங்கள் விளையாட்டைத் தொடங்கும் முன் SwitchControl மூடப்பட வேண்டும், பின்னணியில் இயங்கக்கூடாது என்பதை நீங்கள் புரிந்துகொள்கிறீர்களா?",
    "Yes, I'm ready to continue": "ஆம், நான் தொடரத் தயாராக இருக்கிறேன்",
    "← Go back and re-read": "← பின் சென்று மீண்டும் படிக்கவும்",
    "Welcome": "வரவேற்கிறோம்",
    "Premium Member": "Premium உறுப்பினர்",
    "Let's optimize your gaming experience": "உங்கள் கேமிங் அனுபவத்தை மேம்படுத்துவோம்",
    "Loading…": "ஏற்றுகிறது…",
    "You're all set.": "அனைத்தும் தயாராக உள்ளது.",
    "Full premium access unlocked. Every optimization is now yours.": "முழு பிரீமியம் அணுகல் திறக்கப்பட்டது. ஒவ்வொரு மேம்படுத்தலும் இப்போது உங்களுடையது.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl உள்ளமைக்கப்பட்டு உங்கள் சிஸ்டத்தை அதிகரிக்கத் தயாராக உள்ளது.",
    "Step": "படி",
    "of": "இல்",
    "Next": "அடுத்து",
    "Finish": "முடிக்கவும்",
    "Premium": "Premium",
    "Dashboard Overview": "டேஷ்போர்டு மேலோட்டம்",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "உங்கள் சிஸ்டத்தை நிகழ்நேரத்தில் கண்காணிக்கவும் — CPU, RAM, GPU மற்றும் Disk அனைத்தையும் ஒரே பார்வையில் காணலாம்.",
    "System Tweaks": "கணினி மாற்றங்கள்",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "தாமதத்தைக் குறைக்கவும் உங்கள் வன்பொருளிலிருந்து அதிக FPS பெறவும் நிரூபிக்கப்பட்ட Windows மேம்படுத்தல்களைப் பயன்படுத்தவும்.",
    "Network Optimization": "நெட்வொர்க் மேம்படுத்தல்",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "குறைந்த பிங், பூஜ்ஜிய பாக்கெட் இழப்பு மற்றும் நிலையான ஆன்லைன் அமர்வுகளுக்காக உங்கள் நெட்வொர்க் ஸ்டேக்கை நன்றாக மாற்றவும்.",
    "BIOS Advisor": "BIOS Advisor",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "உங்கள் CPU மற்றும் மதர்போர்டிற்கு ஏற்றவாறு தனிப்பயனாக்கப்பட்ட BIOS மேம்படுத்தல் பரிந்துரைகளைப் பெறுங்கள்.",
    "AI Advisor": "AI Advisor",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "உங்கள் தனிப்பட்ட மேம்படுத்தல் AI உடன் உரையாடுங்கள் — இது உங்கள் சிஸ்டத்தை ஸ்கேன் செய்து எதை மாற்ற வேண்டும் என்று சரியாகப் பரிந்துரைக்கும்.",
    "Security Center": "பாதுகாப்பு மையம்",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "கேமிங் செயல்திறனைப் பாதிக்காமல் உங்கள் சிஸ்டத்தைப் பாதுகாப்பாகவும் நேர்மையாகவும் வைத்திருங்கள்.",
    "Join the Community": "சமூகத்தில் இணையுங்கள்",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "ஆயிரக்கணக்கான கேமர்களுடன் இணையுங்கள், புதுப்பிப்புகளைப் பெறுங்கள், மேலும் எங்கள் Discord-இல் பிரீமியம் பரிசுகளை வெல்லுங்கள்.",
    "Join Discord": "Discord-இல் இணையுங்கள்",
    "By continuing you agree to the": "தொடர்வதன் மூலம் நீங்கள் இணங்குகிறீர்கள்",
    "and": "மற்றும்",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl என்பது வன்பொருள் மேம்படுத்தல் தொகுப்பாகும் — எந்த உத்தரவாதமும் இல்லை.",
    "4 active": "4 செயல்பாட்டில் உள்ளது",
    "4 recommendations": "4 பரிந்துரைகள்",
    "AI Chat": "AI சாட்",
    "AI System Advisor": "AI சிஸ்டம் ஆலோசகர்",
    "After removing interference → more stable": "குறுக்கீடுகளை நீக்கிய பிறகு → அதிக நிலைத்தன்மை",
    "Analysis confidence": "ஆய்வு நம்பிக்கை",
    "Analyzing…": "ஆய்வு செய்யப்படுகிறது…",
    "Applied Tweaks": "பயன்படுத்தப்பட்ட மாற்றங்கள்",
    "BIOS Intelligence": "BIOS நுண்ணறிவு",
    "Background processes creating noise": "பின்னணி செயல்பாடுகள் சத்தத்தை உருவாக்குகின்றன",
    "CPU": "CPU",
    "Demo": "டெமோ",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPS-ஐ அதிகரிக்காது. மறைக்கப்பட்ட தாமதங்களை நீக்குகிறது.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "அனைத்தும் திறக்கப்பட்டுள்ளன. முன்னுரிமை ஆதரவு, மேம்பட்ட டெலிமெட்ரி மற்றும் முழு மேம்படுத்தல் கட்டுப்பாடு இப்போது உங்களுடையவை. உங்கள் பிரீமியம் அனுபவத்தை அனுபவிக்கவும்.",
    "Example": "உதாரணம்",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "உங்கள் மதர்போர்டு மற்றும் CPU-க்கு ஏற்றவாறு நிபுணர் BIOS உள்ளமைவு வழிகாட்டுதல். உங்கள் செட்டப்பிற்கு பாதுகாப்பான, செயல்திறன் பரிசோதிக்கப்பட்ட பரிந்துரைகளைப் பெறுங்கள்.",
    "FPS stability": "FPS நிலைத்தன்மை",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "அதிகபட்ச கேமிங் செயல்திறனுக்காக உங்கள் Windows பவர் செட்டிங்ஸை நன்றாக மாற்றவும். மேம்படுத்தப்பட்ட புரோஃபைல்களைத் தேர்வு செய்யவும் அல்லது உங்கள் வன்பொருளுக்கு ஏற்ப தனிப்பயன் மாற்றங்களை உருவாக்கவும்.",
    "Full System Visibility": "முழு சிஸ்டம் தெரிவுநிலை",
    "GPU": "GPU",
    "Health": "ஆரோக்கியம்",
    "Illustration only": "விளக்கப்படத்திற்கு மட்டுமே",
    "Join the Discord for updates, announcements, and premium giveaways.": "புதுப்பிப்புகள், அறிவிப்புகள் மற்றும் பிரீமியம் பரிசுகளுக்காக Discord-இல் இணையுங்கள்.",
    "Latency trace": "தாமதத் தடமறிதல்",
    "Live Performance": "நேரடி செயல்திறன்",
    "Loss": "இழப்பு",
    "No fake boosts. Just removing what slows your system down.": "போலி ஊக்கங்கள் இல்லை. உங்கள் சிஸ்டத்தை மெதுவாக்கும் விஷயங்களை மட்டும் நீக்குகிறது.",
    "PREMIUM": "பிரீமியம்",
    "Ping": "பிங்",
    "Power Plan Control": "பவர் பிளான் கட்டுப்பாடு",
    "Premium Activated": "பிரீமியம் செயல்படுத்தப்பட்டது",
    "Premium Upgrade": "பிரீமியம் மேம்படுத்தல்",
    "Premium only": "பிரீமியம் மட்டும்",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "மேம்பட்ட TCP/IP, UDP, DNS மற்றும் SMB மேம்படுத்தல்களுடன் தாமதம் மற்றும் பாக்கெட் இழப்பைக் குறைக்கவும். போட்டி கேமிங்கிற்கான பிரீமியம் நெட்வொர்க் ஸ்டேக் ட்யூனிங்.",
    "Score": "மதிப்பெண்",
    "Score trajectory": "மதிப்பெண் பாதை",
    "Security health trend": "பாதுகாப்பு ஆரோக்கிய போக்கு",
    "System Interference — Demo": "சிஸ்டம் குறுக்கீடு — டெமோ",
    "Temp": "வெப்பநிலை",
    "Thinking...": "சிந்திக்கிறது...",
    "Throughput": "செயல்திறன்",
    "Welcome to Premium": "பிரீமியத்திற்கு வரவேற்கிறோம்",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "இப்போது உங்களுக்கு முழு SwitchControl சூட்டிற்கான அணுகல் உள்ளது. திறக்கப்பட்ட அனைத்தையும் நாங்கள் உங்களுக்குக் காட்டுகிறோம்.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "உங்கள் தனிப்பட்ட AI-ஆல் இயங்கும் மேம்படுத்தல் உதவியாளர். இது உங்கள் சிஸ்டத்தை ஸ்கேன் செய்து உங்கள் வன்பொருளுக்கு சிறந்த மாற்றங்களைப் பரிந்துரைக்கும் — பிரீமியம் பயனர்களுக்கு மட்டுமே கிடைக்கும்.",
    "live": "நேரலை"
  },
  "vi": {
    "Signed in": "Đã đăng nhập",
    "Review before you optimize": "Xem xét trước khi tối ưu hóa",
    "Terms": "Điều khoản",
    "Privacy": "Quyền riêng tư",
    "Terms of Service": "Điều khoản dịch vụ",
    "Privacy Policy": "Chính sách quyền riêng tư",
    "Terms of Service and Privacy Policy": "Điều khoản dịch vụ và Chính sách quyền riêng tư",
    "Last updated:": "Cập nhật lần cuối:",
    "Required first step": "Bước đầu tiên bắt buộc",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Đọc Điều khoản dịch vụ và Chính sách quyền riêng tư, sau đó cuộn xuống cuối để tiếp tục với SwitchControl.",
    "Ready to agree": "Sẵn sàng đồng ý",
    "Scroll to continue": "Cuộn để tiếp tục",
    "We could not save your consent. Check browser storage access and try again.": "Chúng tôi không thể lưu sự đồng ý của bạn. Vui lòng kiểm tra quyền truy cập bộ nhớ trình duyệt và thử lại.",
    "Decline & quit": "Từ chối & thoát",
    "Agree & continue": "Đồng ý & tiếp tục",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Bằng cách chọn Đồng ý, bạn xác nhận rằng mình đã xem xét cả hai tài liệu và đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư.",
    "Important Notice": "Thông báo quan trọng",
    "Keep SwitchControl closed while gaming": "Giữ SwitchControl đóng khi chơi game",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl được thiết kế để cấu hình và tối ưu hóa hệ thống của bạn trước khi chơi game — không phải để chạy cùng với các trò chơi của bạn. Việc giữ ứng dụng mở trong khi chơi game có thể tiêu tốn thêm CPU và bộ nhớ, điều này có thể làm giảm hiệu suất thay vì cải thiện nó.",
    "Apply tweaks, then close": "Áp dụng các tinh chỉnh, sau đó đóng lại",
    "Launch your game after closing": "Khởi chạy trò chơi của bạn sau khi đóng",
    "Don't keep it open mid-game": "Không giữ ứng dụng mở khi đang chơi",
    "It's not a game overlay tool": "Đây không phải là công cụ phủ game (overlay)",
    "I Understand — Continue": "Tôi hiểu — Tiếp tục",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Bằng cách tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư. SwitchControl là một bộ tối ưu hóa phần cứng — không có bảo hành nào được ngụ ý.",
    "Confirm & Continue": "Xác nhận & Tiếp tục",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Để chắc chắn — bạn hiểu rằng SwitchControl nên được đóng trước khi bạn bắt đầu chơi game, thay vì chạy ngầm?",
    "Yes, I'm ready to continue": "Có, tôi đã sẵn sàng tiếp tục",
    "← Go back and re-read": "← Quay lại và đọc lại",
    "Welcome": "Chào mừng",
    "Premium Member": "Thành viên Premium",
    "Let's optimize your gaming experience": "Hãy tối ưu hóa trải nghiệm chơi game của bạn",
    "Loading…": "Đang tải…",
    "You're all set.": "Bạn đã sẵn sàng.",
    "Full premium access unlocked. Every optimization is now yours.": "Đã mở khóa quyền truy cập Premium đầy đủ. Mọi tối ưu hóa giờ đây là của bạn.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl đã được cấu hình và sẵn sàng tăng tốc hệ thống của bạn.",
    "Step": "Bước",
    "of": "trên",
    "Next": "Tiếp theo",
    "Finish": "Hoàn tất",
    "Premium": "Premium",
    "Dashboard Overview": "Tổng quan bảng điều khiển",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Giám sát hệ thống của bạn theo thời gian thực — CPU, RAM, GPU và ổ đĩa chỉ trong một cái nhìn.",
    "System Tweaks": "Tinh chỉnh hệ thống",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Áp dụng các tối ưu hóa Windows đã được chứng minh để giảm độ trễ và tăng thêm FPS cho phần cứng của bạn.",
    "Network Optimization": "Tối ưu hóa mạng",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Tinh chỉnh ngăn xếp mạng của bạn để có ping thấp hơn, không mất gói tin và các phiên trực tuyến ổn định.",
    "BIOS Advisor": "Cố vấn BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Nhận các đề xuất tối ưu hóa BIOS cá nhân hóa phù hợp với chính xác CPU và bo mạch chủ của bạn.",
    "AI Advisor": "Cố vấn AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Trò chuyện với AI tối ưu hóa cá nhân của bạn — nó quét hệ thống và đề xuất chính xác những gì cần thay đổi.",
    "Security Center": "Trung tâm bảo mật",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Giữ cho hệ thống của bạn an toàn và được kiểm tra tính toàn vẹn mà không làm ảnh hưởng đến hiệu năng chơi game.",
    "Join the Community": "Tham gia cộng đồng",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Kết nối với hàng ngàn game thủ, nhận cập nhật và giành các quà tặng Premium trên Discord của chúng tôi.",
    "Join Discord": "Tham gia Discord",
    "By continuing you agree to the": "Bằng cách tiếp tục, bạn đồng ý với",
    "and": "và",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl là một bộ tối ưu hóa phần cứng — không có bảo hành nào được ngụ ý.",
    "4 active": "4 đang hoạt động",
    "4 recommendations": "4 đề xuất",
    "AI Chat": "Trò chuyện với AI",
    "AI System Advisor": "Cố vấn hệ thống AI",
    "After removing interference → more stable": "Sau khi loại bỏ nhiễu → ổn định hơn",
    "Analysis confidence": "Độ tin cậy của phân tích",
    "Analyzing…": "Đang phân tích…",
    "Applied Tweaks": "Các tinh chỉnh đã áp dụng",
    "BIOS Intelligence": "Thông minh BIOS",
    "Background processes creating noise": "Các tiến trình nền gây nhiễu",
    "CPU": "CPU",
    "Demo": "Bản trình diễn",
    "Disk": "Ổ đĩa",
    "Does not increase FPS. Removes hidden delays.": "Không tăng FPS. Loại bỏ các độ trễ ẩn.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Mọi thứ đã được mở khóa. Hỗ trợ ưu tiên, đo lường từ xa nâng cao và toàn quyền kiểm soát tối ưu hóa hiện đã thuộc về bạn. Tận hưởng trải nghiệm Premium của bạn.",
    "Example": "Ví dụ",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Hướng dẫn cấu hình BIOS chuyên gia phù hợp với bo mạch chủ và CPU cụ thể của bạn. Nhận các đề xuất an toàn, đã được kiểm tra hiệu năng cho thiết lập chính xác của bạn.",
    "FPS stability": "Độ ổn định FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Tinh chỉnh cài đặt nguồn Windows để đạt hiệu năng chơi game tối đa. Chọn từ các hồ sơ tối ưu hóa hoặc tạo các tùy chỉnh phù hợp với phần cứng của bạn.",
    "Full System Visibility": "Khả năng hiển thị toàn bộ hệ thống",
    "GPU": "GPU",
    "Health": "Sức khỏe",
    "Illustration only": "Chỉ dành cho mục đích minh họa",
    "Join the Discord for updates, announcements, and premium giveaways.": "Tham gia Discord để nhận cập nhật, thông báo và các quà tặng Premium.",
    "Latency trace": "Dấu vết độ trễ",
    "Live Performance": "Hiệu năng trực tiếp",
    "Loss": "Mất mát",
    "No fake boosts. Just removing what slows your system down.": "Không có tăng tốc giả. Chỉ loại bỏ những gì làm chậm hệ thống của bạn.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Kiểm soát kế hoạch nguồn điện",
    "Premium Activated": "Đã kích hoạt Premium",
    "Premium Upgrade": "Nâng cấp Premium",
    "Premium only": "Chỉ dành cho Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Giảm độ trễ và mất gói tin với các tối ưu hóa TCP/IP, UDP, DNS và SMB nâng cao. Tinh chỉnh ngăn xếp mạng chỉ dành cho Premium để chơi game cạnh tranh.",
    "Score": "Điểm số",
    "Score trajectory": "Quỹ đạo điểm số",
    "Security health trend": "Xu hướng sức khỏe bảo mật",
    "System Interference — Demo": "Nhiễu hệ thống — Bản trình diễn",
    "Temp": "Nhiệt độ",
    "Thinking...": "Đang suy nghĩ...",
    "Throughput": "Thông lượng",
    "Welcome to Premium": "Chào mừng đến với Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Bạn hiện có quyền truy cập vào bộ SwitchControl đầy đủ. Hãy để chúng tôi chỉ cho bạn mọi thứ vừa được mở khóa.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Trợ lý tối ưu hóa chạy bằng AI cá nhân của bạn. Nó quét hệ thống và đề xuất các tinh chỉnh tốt nhất cho phần cứng của bạn — khả dụng dành riêng cho người dùng Premium.",
    "live": "trực tiếp"
  },
  "ur": {
    "Signed in": "سائن ان کیا گیا",
    "Review before you optimize": "آپٹمائز کرنے سے پہلے جائزہ لیں",
    "Terms": "شرائط",
    "Privacy": "پرائیویسی",
    "Terms of Service": "سروس کی شرائط",
    "Privacy Policy": "پرائیویسی پالیسی",
    "Terms of Service and Privacy Policy": "سروس کی شرائط اور پرائیویسی پالیسی",
    "Last updated:": "آخری بار اپ ڈیٹ کیا گیا:",
    "Required first step": "پہلا ضروری مرحلہ",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "سروس کی شرائط اور پرائیویسی پالیسی کو پڑھیں، پھر SwitchControl کے ساتھ جاری رکھنے کے لیے آخر تک اسکرول کریں۔",
    "Ready to agree": "اتفاق کرنے کے لیے تیار",
    "Scroll to continue": "جاری رکھنے کے لیے اسکرول کریں",
    "We could not save your consent. Check browser storage access and try again.": "ہم آپ کی رضامندی محفوظ نہیں کر سکے۔ براؤزر اسٹوریج تک رسائی چیک کریں اور دوبارہ کوشش کریں۔",
    "Decline & quit": "انکار کریں اور چھوڑ دیں",
    "Agree & continue": "اتفاق کریں اور جاری رکھیں",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "اتفاق کریں منتخب کر کے، آپ تصدیق کرتے ہیں کہ آپ نے دونوں دستاویزات کا جائزہ لے لیا ہے اور سروس کی شرائط اور پرائیویسی پالیسی سے اتفاق کرتے ہیں۔",
    "Important Notice": "اہم نوٹس",
    "Keep SwitchControl closed while gaming": "گیمنگ کے دوران SwitchControl کو بند رکھیں",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl کو آپ کے گیم کھیلنے سے پہلے سسٹم کو کنفیگر اور آپٹمائز کرنے کے لیے ڈیزائن کیا گیا ہے — نہ کہ آپ کے گیمز کے ساتھ چلنے کے لیے۔ گیمنگ کے دوران ایپ کو کھلا رکھنے سے اضافی CPU اور میموری استعمال ہو سکتی ہے، جو بہتری کے بجائے کارکردگی کو کم کر سکتی ہے۔",
    "Apply tweaks, then close": "ٹوییکس لاگو کریں، پھر بند کریں",
    "Launch your game after closing": "بند کرنے کے بعد اپنا گیم لانچ کریں",
    "Don't keep it open mid-game": "اسے گیم کے دوران کھلا نہ رکھیں",
    "It's not a game overlay tool": "یہ گیم اوورلے ٹول نہیں ہے",
    "I Understand — Continue": "میں سمجھتا ہوں — جاری رکھیں",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "جاری رکھ کر آپ سروس کی شرائط اور پرائیویسی پالیسی سے اتفاق کرتے ہیں۔ SwitchControl ایک ہارڈویئر آپٹیمائزیشن سویٹ ہے — کوئی وارنٹی مضمر نہیں ہے۔",
    "Confirm & Continue": "تصدیق کریں اور جاری رکھیں",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "صرف یقین دہانی کے لیے — کیا آپ سمجھتے ہیں کہ گیمنگ شروع کرنے سے پہلے SwitchControl کو بند ہونا چاہیے، نہ کہ بیک گراؤنڈ میں چلنا چاہیے؟",
    "Yes, I'm ready to continue": "جی ہاں، میں جاری رکھنے کے لیے تیار ہوں",
    "← Go back and re-read": "← واپس جائیں اور دوبارہ پڑھیں",
    "Welcome": "خوش آمدید",
    "Premium Member": "Premium ممبر",
    "Let's optimize your gaming experience": "آئیں آپ کے گیمنگ کے تجربے کو آپٹمائز کریں",
    "Loading…": "لوڈ ہو رہا ہے…",
    "You're all set.": "آپ سب تیار ہیں۔",
    "Full premium access unlocked. Every optimization is now yours.": "مکمل premium رسائی ان لاک ہو گئی۔ ہر آپٹیمائزیشن اب آپ کی ہے۔",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl کنفیگر ہو چکا ہے اور آپ کے سسٹم کو بوسٹ کرنے کے لیے تیار ہے۔",
    "Step": "مرحلہ",
    "of": "کا",
    "Next": "اگلا",
    "Finish": "ختم",
    "Premium": "Premium",
    "Dashboard Overview": "ڈیش بورڈ کا جائزہ",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "اپنے سسٹم کو ریئل ٹائم میں مانیٹر کریں — CPU، RAM، GPU، اور disk سب ایک نظر میں۔",
    "System Tweaks": "سسٹم ٹوییکس",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "لیٹنسی کم کرنے اور اپنے ہارڈویئر سے زیادہ FPS نکالنے کے لیے ثابت شدہ Windows آپٹیمائزیشنز کا اطلاق کریں۔",
    "Network Optimization": "نیٹ ورک آپٹیمائزیشن",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "کم پنگ، صفر پیکٹ لاس، اور مستحکم آن لائن سیشنز کے لیے اپنے نیٹ ورک اسٹیک کو ٹھیک کریں۔",
    "BIOS Advisor": "BIOS ایڈوائزر",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "اپنے CPU اور مدر بورڈ کے مطابق ذاتی نوعیت کی BIOS آپٹیمائزیشن تجاویز حاصل کریں۔",
    "AI Advisor": "AI ایڈوائزر",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "اپنے ذاتی آپٹیمائزیشن AI کے ساتھ چیٹ کریں — یہ آپ کے سسٹم کو اسکین کرتا ہے اور تجویز کرتا ہے کہ بالکل کیا تبدیل کرنا ہے۔",
    "Security Center": "سیکیورٹی سینٹر",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "گیمنگ کارکردگی کو قربان کیے بغیر اپنے سسٹم کو محفوظ اور انٹیگریٹی چیک رکھیں۔",
    "Join the Community": "کمیونٹی میں شامل ہوں",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "ہزاروں گیمرز کے ساتھ جڑیں، اپ ڈیٹس حاصل کریں، اور ہمارے Discord پر Premium انعامات جیتیں۔",
    "Join Discord": "Discord میں شامل ہوں",
    "By continuing you agree to the": "جاری رکھ کر آپ اتفاق کرتے ہیں",
    "and": "اور",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": "۔ SwitchControl ایک ہارڈویئر آپٹیمائزیشن سویٹ ہے - کوئی وارنٹی مضمر نہیں ہے۔",
    "4 active": "4 فعال",
    "4 recommendations": "4 تجاویز",
    "AI Chat": "AI چیٹ",
    "AI System Advisor": "AI سسٹم ایڈوائزر",
    "After removing interference → more stable": "مداخلت ہٹانے کے بعد → زیادہ مستحکم",
    "Analysis confidence": "تجزیہ کا اعتماد",
    "Analyzing…": "تجزیہ ہو رہا ہے...",
    "Applied Tweaks": "اطلاق شدہ ٹویکس",
    "BIOS Intelligence": "BIOS انٹیلیجنس",
    "Background processes creating noise": "بیک گراؤنڈ پروسیسز جو شور پیدا کر رہے ہیں",
    "CPU": "CPU",
    "Demo": "ڈیمو",
    "Disk": "Disk",
    "Does not increase FPS. Removes hidden delays.": "FPS میں اضافہ نہیں کرتا۔ پوشیدہ تاخیر کو دور کرتا ہے۔",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "سب کچھ ان لاک ہو گیا ہے۔ ترجیحی سپورٹ، جدید ٹیلی میٹری، اور مکمل آپٹیمائزیشن کنٹرول اب آپ کے پاس ہیں۔ اپنے Premium تجربے سے لطف اٹھائیں۔",
    "Example": "مثال",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "آپ کے مخصوص مدر بورڈ اور CPU کے مطابق ماہر BIOS کنفیگریشن رہنمائی۔ اپنے سیٹ اپ کے لیے محفوظ اور کارکردگی سے ٹیسٹ شدہ تجاویز حاصل کریں۔",
    "FPS stability": "FPS استحکام",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "زیادہ سے زیادہ گیمنگ کارکردگی کے لیے اپنی Windows پاور سیٹنگز کو ٹھیک کریں۔ آپٹیمائزڈ پروفائلز میں سے انتخاب کریں یا اپنے ہارڈویئر کے مطابق کسٹم اوور رائیڈز بنائیں۔",
    "Full System Visibility": "مکمل سسٹم ویزیبلٹی",
    "GPU": "GPU",
    "Health": "صحت",
    "Illustration only": "صرف مثال کے لیے",
    "Join the Discord for updates, announcements, and premium giveaways.": "اپ ڈیٹس، اعلانات، اور premium انعامات کے لیے Discord میں شامل ہوں۔",
    "Latency trace": "لیٹنسی ٹریس",
    "Live Performance": "لائیو کارکردگی",
    "Loss": "لاس",
    "No fake boosts. Just removing what slows your system down.": "کوئی جعلی بوسٹس نہیں۔ صرف وہ چیزیں ہٹانا جو آپ کے سسٹم کو سست کرتی ہیں۔",
    "PREMIUM": "PREMIUM",
    "Ping": "پنگ",
    "Power Plan Control": "پاور پلان کنٹرول",
    "Premium Activated": "Premium فعال ہو گیا",
    "Premium Upgrade": "Premium اپ گریڈ",
    "Premium only": "صرف Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "جدید TCP/IP، UDP، DNS، اور SMB آپٹیمائزیشنز کے ساتھ لیٹنسی اور پیکٹ لاس کو کم کریں۔ مسابقتی گیمنگ کے لیے صرف Premium نیٹ ورک اسٹیک ٹیوننگ۔",
    "Score": "اسکور",
    "Score trajectory": "اسکور ٹریجیکٹری",
    "Security health trend": "سیکیورٹی ہیلتھ ٹرینڈ",
    "System Interference — Demo": "سسٹم مداخلت — ڈیمو",
    "Temp": "ٹیمپ",
    "Thinking...": "سوچ رہا ہے...",
    "Throughput": "تھرو پٹ",
    "Welcome to Premium": "Premium میں خوش آمدید",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "اب آپ کے پاس مکمل SwitchControl سویٹ تک رسائی ہے۔ آئیے ہم آپ کو دکھائیں کہ کیا کچھ ان لاک ہوا ہے۔",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "آپ کا ذاتی AI سے چلنے والا آپٹیمائزیشن اسسٹنٹ۔ یہ آپ کے سسٹم کو اسکین کرتا ہے اور آپ کے ہارڈویئر کے لیے بہترین ٹویکس تجویز کرتا ہے — جو خصوصی طور پر Premium صارفین کے لیے دستیاب ہے۔",
    "live": "لائیو"
  },
  "es": {
    "Signed in": "Sesión iniciada",
    "Review before you optimize": "Revisar antes de optimizar",
    "Terms": "Términos",
    "Privacy": "Privacidad",
    "Terms of Service": "Términos de servicio",
    "Privacy Policy": "Política de privacidad",
    "Terms of Service and Privacy Policy": "Términos de servicio y política de privacidad",
    "Last updated:": "Última actualización:",
    "Required first step": "Paso inicial necesario",
    "Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.": "Lea los Términos de servicio y la Política de privacidad, luego desplácese hasta el final para continuar con SwitchControl.",
    "Ready to agree": "Listo para aceptar",
    "Scroll to continue": "Desplácese para continuar",
    "We could not save your consent. Check browser storage access and try again.": "No pudimos guardar su consentimiento. Verifique el acceso al almacenamiento del navegador e intente de nuevo.",
    "Decline & quit": "Rechazar y salir",
    "Agree & continue": "Aceptar y continuar",
    "By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.": "Al seleccionar Aceptar, confirma que ha revisado ambos documentos y acepta los Términos de servicio y la Política de privacidad.",
    "Important Notice": "Aviso importante",
    "Keep SwitchControl closed while gaming": "Mantenga SwitchControl cerrado mientras juega",
    "SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.": "SwitchControl está diseñado para configurar y optimizar su sistema antes de jugar, no para ejecutarse junto con sus juegos. Mantener la aplicación abierta mientras juega puede consumir CPU y memoria adicional, lo cual puede reducir el rendimiento en lugar de mejorarlo.",
    "Apply tweaks, then close": "Aplique ajustes y luego cierre",
    "Launch your game after closing": "Inicie su juego después de cerrar",
    "Don't keep it open mid-game": "No la mantenga abierta durante el juego",
    "It's not a game overlay tool": "No es una herramienta de superposición de juegos",
    "I Understand — Continue": "Entiendo — Continuar",
    "By continuing you agree to the Terms of Service and Privacy Policy. SwitchControl is a hardware optimization suite — no warranty is implied.": "Al continuar, acepta los Términos de servicio y la Política de privacidad. SwitchControl es una suite de optimización de hardware; no se implica ninguna garantía.",
    "Confirm & Continue": "Confirmar y continuar",
    "Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?": "Solo para estar seguros, ¿entiende que SwitchControl debe cerrarse antes de comenzar a jugar y no ejecutarse en segundo plano?",
    "Yes, I'm ready to continue": "Sí, estoy listo para continuar",
    "← Go back and re-read": "← Regresar y volver a leer",
    "Welcome": "Bienvenido",
    "Premium Member": "Miembro Premium",
    "Let's optimize your gaming experience": "Optimicemos su experiencia de juego",
    "Loading…": "Cargando…",
    "You're all set.": "Todo listo.",
    "Full premium access unlocked. Every optimization is now yours.": "Acceso Premium total desbloqueado. Cada optimización es ahora tuya.",
    "SwitchControl is configured and ready to boost your system.": "SwitchControl está configurado y listo para potenciar tu sistema.",
    "Step": "Paso",
    "of": "de",
    "Next": "Siguiente",
    "Finish": "Finalizar",
    "Premium": "Premium",
    "Dashboard Overview": "Resumen del panel",
    "Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.": "Monitorea tu sistema en tiempo real: CPU, RAM, GPU y disco, todo de un vistazo.",
    "System Tweaks": "Ajustes del sistema",
    "Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.": "Aplica optimizaciones probadas de Windows para reducir la latencia y exprimir más FPS de tu hardware.",
    "Network Optimization": "Optimización de red",
    "Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.": "Ajusta tu pila de red para menor ping, cero pérdida de paquetes y sesiones online estables.",
    "BIOS Advisor": "Asesor de BIOS",
    "Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.": "Obtén recomendaciones personalizadas de optimización de BIOS adaptadas a tu CPU y placa base exacta.",
    "AI Advisor": "Asesor de AI",
    "Chat with your personal optimization AI — it scans your system and recommends exactly what to change.": "Chatea con tu IA de optimización personal: analiza tu sistema y recomienda exactamente qué cambiar.",
    "Security Center": "Centro de seguridad",
    "Keep your system secure and integrity-checked without sacrificing gaming performance.": "Mantén tu sistema seguro y con la integridad verificada sin sacrificar el rendimiento en juegos.",
    "Join the Community": "Únete a la comunidad",
    "Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.": "Conecta con miles de gamers, recibe actualizaciones y gana sorteos Premium en nuestro Discord.",
    "Join Discord": "Únete a Discord",
    "By continuing you agree to the": "Al continuar, aceptas los",
    "and": "y",
    ". SwitchControl is a hardware optimization suite — no warranty is implied.": ". SwitchControl es un paquete de optimización de hardware; no se garantiza ninguna garantía.",
    "4 active": "4 activos",
    "4 recommendations": "4 recomendaciones",
    "AI Chat": "AI Chat",
    "AI System Advisor": "Asesor de sistema AI",
    "After removing interference → more stable": "Tras eliminar interferencias → más estable",
    "Analysis confidence": "Confianza del análisis",
    "Analyzing…": "Analizando…",
    "Applied Tweaks": "Ajustes aplicados",
    "BIOS Intelligence": "Inteligencia BIOS",
    "Background processes creating noise": "Procesos en segundo plano creando ruido",
    "CPU": "CPU",
    "Demo": "Demo",
    "Disk": "Disco",
    "Does not increase FPS. Removes hidden delays.": "No aumenta los FPS. Elimina retrasos ocultos.",
    "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.": "Todo desbloqueado. Soporte prioritario, telemetría avanzada y control total de optimización son ahora tuyos. Disfruta de tu experiencia Premium.",
    "Example": "Ejemplo",
    "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.": "Guía experta de configuración de BIOS adaptada a tu placa base y CPU específicas. Obtén recomendaciones seguras y probadas en rendimiento para tu configuración exacta.",
    "FPS stability": "Estabilidad de FPS",
    "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.": "Ajusta tu configuración de energía de Windows para el máximo rendimiento en juegos. Elige perfiles optimizados o crea ajustes personalizados adaptados a tu hardware.",
    "Full System Visibility": "Visibilidad completa del sistema",
    "GPU": "GPU",
    "Health": "Salud",
    "Illustration only": "Solo ilustración",
    "Join the Discord for updates, announcements, and premium giveaways.": "Únete al Discord para actualizaciones, anuncios y sorteos Premium.",
    "Latency trace": "Seguimiento de latencia",
    "Live Performance": "Rendimiento en vivo",
    "Loss": "Pérdida",
    "No fake boosts. Just removing what slows your system down.": "Nada de mejoras falsas. Solo eliminamos lo que ralentiza tu sistema.",
    "PREMIUM": "PREMIUM",
    "Ping": "Ping",
    "Power Plan Control": "Control del plan de energía",
    "Premium Activated": "Premium activado",
    "Premium Upgrade": "Actualización Premium",
    "Premium only": "Solo para Premium",
    "RAM": "RAM",
    "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.": "Reduce la latencia y la pérdida de paquetes con optimizaciones avanzadas de TCP/IP, UDP, DNS y SMB. Ajuste de pila de red exclusivo para Premium para juegos competitivos.",
    "Score": "Puntaje",
    "Score trajectory": "Trayectoria del puntaje",
    "Security health trend": "Tendencia de salud de seguridad",
    "System Interference — Demo": "Interferencia del sistema — Demo",
    "Temp": "Temp",
    "Thinking...": "Pensando...",
    "Throughput": "Rendimiento",
    "Welcome to Premium": "Bienvenido a Premium",
    "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.": "Ahora tienes acceso a la suite completa de SwitchControl. Déjanos mostrarte todo lo que se acaba de desbloquear.",
    "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.": "Tu asistente de optimización personal impulsado por IA. Analiza tu sistema y recomienda los mejores ajustes para tu hardware, disponible exclusivamente para usuarios Premium.",
    "live": "en vivo"
  }
};

export const LEGAL_TRANSLATIONS: Partial<Record<Exclude<Locale, "en">, LocalizedLegalSections>> = {
  "es": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl recopila y utiliza información solo cuando es necesario para proporcionar el producto, administrar cuentas, brindar soporte a los usuarios, prevenir el fraude y mantener la seguridad. Esta política explica qué recopilamos, por qué y cómo se maneja."
        ],
        "title": "1. Descripción general"
      },
      {
        "paragraphs": [
          "Al iniciar sesión, almacenamos:"
        ],
        "title": "2. Datos de cuenta"
      },
      {
        "paragraphs": [
          "Almacenamos información sobre su estado de acceso para que el producto pueda ofrecer las funciones correctas. Esto incluye:"
        ],
        "title": "3. Datos de derechos y acceso"
      },
      {
        "paragraphs": [
          "Para respaldar la funcionalidad, la seguridad y la gestión de la cuenta del producto, podemos registrar:"
        ],
        "title": "4. Datos de actividad de la aplicación y el dispositivo"
      },
      {
        "paragraphs": [
          "Al utilizar la aplicación de escritorio, SwitchControl puede acceder a información de hardware y del sistema para potenciar sus funciones de optimización, análisis y asesoramiento. Esto incluye:"
        ],
        "title": "5. Datos del sistema y telemetría"
      },
      {
        "paragraphs": [
          "Los administradores autorizados de SwitchControl pueden acceder a datos a nivel de cuenta para fines operativos legítimos, incluidos:"
        ],
        "title": "6. Acceso administrativo"
      },
      {
        "paragraphs": [
          "Utilizamos los datos que conservamos para:"
        ],
        "title": "7. Cómo usamos sus datos"
      },
      {
        "paragraphs": [
          "Podemos compartir datos con terceros de confianza que ayudan a operar el servicio:"
        ],
        "title": "8. Intercambio y proveedores de servicios"
      },
      {
        "paragraphs": [
          "Utilizamos cookies y tokens de sesión para mantenerlo conectado y mantener su estado de acceso durante las visitas. Estos se limitan a lo necesario para que el servicio funcione."
        ],
        "title": "9. Cookies y almacenamiento de sesión"
      },
      {
        "paragraphs": [
          "Conservamos sus datos durante el tiempo que sea razonablemente necesario para los siguientes propósitos:"
        ],
        "title": "10. Retención de datos"
      },
      {
        "paragraphs": [
          "Utilizamos salvaguardas técnicas y organizativas razonables para proteger los datos de la cuenta. Ningún sistema es completamente inmune a los riesgos. Si cree que su cuenta ha sido comprometida, contáctenos de inmediato."
        ],
        "title": "11. Seguridad"
      },
      {
        "paragraphs": [
          "Dependiendo de su ubicación, puede tener derechos a:"
        ],
        "title": "12. Sus derechos y eliminación de cuenta"
      },
      {
        "paragraphs": [
          "SwitchControl no está destinado para uso por cualquier persona que no pueda formalizar legalmente un acuerdo vinculante en su jurisdicción, o que sea menor de la edad mínima requerida sin el permiso apropiado de los padres o tutores. Si cree que un menor ha proporcionado datos personales sin permiso, contáctenos para que podamos eliminarlos."
        ],
        "title": "13. Requisitos de edad"
      },
      {
        "paragraphs": [
          "Para preguntas de privacidad, solicitudes de datos o inquietudes, contáctenos en switchcontrol67@gmail.com"
        ],
        "title": "14. Contacto"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl proporciona software y servicios diseñados para ayudar a los usuarios a configurar, optimizar y analizar la configuración de equipos Windows y el rendimiento del sistema. Al usar SwitchControl, usted acepta estos términos. Si no está de acuerdo, no utilice el servicio."
        ],
        "title": "1. Descripción general"
      },
      {
        "paragraphs": [
          "Debe ser capaz de formalizar un acuerdo legalmente vinculante en su jurisdicción. Si es menor de la edad mínima requerida, debe contar con el permiso de un padre o tutor. Al usar SwitchControl, usted confirma que cumple con estos requisitos."
        ],
        "title": "2. Elegibilidad"
      },
      {
        "paragraphs": [
          "SwitchControl ofrece tres estados de acceso: Free, acceso básico a funciones seleccionadas sin costo; Trial, acceso temporal a funciones Premium por tiempo limitado; y Premium, acceso completo a las funciones, desbloqueado mediante compra. Las funciones disponibles en cada nivel pueden cambiar con el tiempo. SwitchControl se reserva el derecho de ajustar lo que incluye cada plan."
        ],
        "title": "3. Niveles de acceso"
      },
      {
        "paragraphs": [
          "Si recibe una prueba gratuita de funciones Premium:"
        ],
        "title": "4. Pruebas gratuitas"
      },
      {
        "paragraphs": [
          "La compra de Premium le otorga una licencia personal e intransferible para acceder a las funciones Premium bajo los términos vigentes en el momento de la compra. Los precios, modelos de acceso, derechos y conjuntos de funciones pueden cambiar con el tiempo. SwitchControl no garantiza que ninguna función específica permanezca disponible indefinidamente. No puede revender, transferir ni compartir su acceso con otros a menos que se permita explícitamente."
        ],
        "title": "5. Acceso Premium y licencias"
      },
      {
        "paragraphs": [
          "SwitchControl le otorga un derecho limitado, personal, no exclusivo e intransferible para usar el software y el servicio para sus propios fines. Todos los derechos no otorgados expresamente están reservados."
        ],
        "title": "6. Licencia y acceso general"
      },
      {
        "paragraphs": [
          "Usted acepta no:"
        ],
        "title": "7. Uso aceptable"
      },
      {
        "paragraphs": [
          "SwitchControl puede tomar las siguientes acciones en cualquier cuenta como parte de las operaciones normales de la plataforma:"
        ],
        "title": "8. Acciones administrativas de cuenta"
      },
      {
        "paragraphs": [
          "SwitchControl puede suspender o terminar su acceso, con o sin previo aviso, si determinamos razonablemente que usted ha violado estos Términos de Servicio, ha participado en comportamientos fraudulentos, abusivos o engañosos, ha intentado manipular o eludir los controles de acceso o los sistemas de derechos, ha representado un riesgo de seguridad para el servicio u otros usuarios, o ha utilizado el servicio de una manera que cause daños o exposición legal. Si su cuenta es suspendida o terminada por causa justificada, usted no tiene derecho a un reembolso."
        ],
        "title": "9. Suspensión y terminación"
      },
      {
        "paragraphs": [
          "SwitchControl puede modificar la configuración de Windows, las preferencias del sistema, la configuración de inicio, los parámetros de red y los perfiles de energía según las funciones que utilice. Usted es responsable de usar el software con cuidado y comprender lo que hace cada función antes de aplicarla. SwitchControl no se hace responsable de la inestabilidad del sistema, la pérdida de datos u otros problemas que puedan surgir al aplicar cambios en su sistema. Realice siempre una copia de seguridad de los datos importantes antes de usar herramientas de optimización."
        ],
        "title": "10. Cambios en el sistema y riesgos"
      },
      {
        "paragraphs": [
          "SwitchControl no garantiza resultados de rendimiento específicos. Los resultados varían según la configuración del hardware, el software instalado, los controladores, las condiciones de la red y muchos otros factores fuera de nuestro control. Esto incluye, entre otros: FPS, tiempo de fotogramas, latencia de entrada, ping, estabilidad de la red, velocidad de arranque y respuesta general del sistema. Las recomendaciones generadas por AI Advisor y las salidas de BIOS Advisor se proporcionan solo como orientación informativa; no se garantiza que sean precisas o adecuadas para todos los sistemas."
        ],
        "title": "11. Sin resultados garantizados"
      },
      {
        "paragraphs": [
          "Todos los precios se muestran al finalizar la compra antes de completar una transacción. Los pagos son gestionados de forma segura por nuestro procesador de pagos externo."
        ],
        "title": "12. Pagos y reembolsos"
      },
      {
        "paragraphs": [
          "Algunas funciones dependen de proveedores externos, incluidos procesadores de pagos, servicios de autenticación e infraestructura de alojamiento. Sus términos y políticas de privacidad también pueden aplicarse a su uso de esos servicios. SwitchControl no es responsable de la conducta o las políticas de terceros."
        ],
        "title": "13. Servicios de terceros"
      },
      {
        "paragraphs": [
          "Todos los derechos sobre el software, la marca, el diseño, el contenido y los servicios de SwitchControl son propiedad de SwitchControl. Nada en estos términos transfiere ninguna propiedad a usted. No puede reproducir, distribuir ni crear obras derivadas de ninguna parte de SwitchControl sin un permiso escrito explícito."
        ],
        "title": "14. Propiedad intelectual"
      },
      {
        "paragraphs": [
          "En la medida máxima permitida por la ley, SwitchControl no es responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluidos, entre otros, la pérdida de datos, la pérdida de beneficios o daños al sistema que surjan de su uso o incapacidad para usar el servicio."
        ],
        "title": "15. Limitación de responsabilidad"
      },
      {
        "paragraphs": [
          "SwitchControl puede actualizar funciones, precios, niveles de acceso y la estructura del servicio en cualquier momento. También podemos actualizar estos términos y nuestra Política de Privacidad. Cuando realicemos cambios sustanciales, actualizaremos la fecha de \"Última actualización\". El uso continuado del servicio después de que los cambios entren en vigor constituye la aceptación de los términos actualizados."
        ],
        "title": "16. Cambios en el servicio y en estos términos"
      },
      {
        "paragraphs": [
          "Para preguntas sobre estos términos, contáctenos en switchcontrol67@gmail.com"
        ],
        "title": "17. Contacto"
      }
    ]
  },
  "zh-CN": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl 仅在需要提供产品、管理帐户、支持用户、防止欺诈和维护安全时才收集和使用信息。本政策说明了我们收集的内容、原因以及处理方式。"
        ],
        "title": "1. 概述"
      },
      {
        "paragraphs": [
          "当您登录时，我们存储：",
          "您的电子邮箱地址",
          "您的显示名称（如果由您的身份验证提供商提供）",
          "唯一的帐户标识符",
          "管理您的登录会话所需的身份验证元数据（例如 OAuth 提供商令牌）"
        ],
        "title": "2. 帐户数据"
      },
      {
        "paragraphs": [
          "我们存储有关您的访问状态的信息，以便产品能够提供正确的功能。这包括：",
          "您当前的计划 (Free, Trial, 或 Premium)",
          "如果已激活试用，则包括试用开始日期、结束日期和持续时间",
          "Premium 激活和付款状态",
          "您是否已完成引导之旅或首次设置流程",
          "用于确定您可见和可用内容的特征访问标志"
        ],
        "title": "3. 权利和访问数据"
      },
      {
        "paragraphs": [
          "为了支持产品功能、安全和帐户管理，我们可能会记录：",
          "您上次登录的时间",
          "桌面应用在您的设备上最后一次处于活动状态的时间",
          "应用是否已安装并使用",
          "与安全、支持和欺诈预防相关的帐户或管理员活动事件",
          "我们不会记录击键、个人文件、剪贴板内容或完整的浏览历史记录。"
        ],
        "title": "4. 应用和设备活动数据"
      },
      {
        "paragraphs": [
          "使用桌面应用时，SwitchControl 可能会访问硬件和系统信息以驱动其优化、分析和咨询功能。这包括：",
          "优化和咨询功能使用的硬件配置文件信息 (CPU, GPU, RAM, 存储)",
          "仪表板中显示的实时系统指标 (CPU 负载, 内存使用情况, GPU 负载)",
          "AI Advisor 和 BIOS Advisor 用于生成建议的诊断数据",
          "网络优化功能使用的网络配置数据",
          "此数据在本地用于驱动应用的功能。我们仅收集提供功能、分析和支持所需的信息，不多收集任何内容。"
        ],
        "title": "5. 系统和遥测数据"
      },
      {
        "paragraphs": [
          "授权的 SwitchControl 管理员可以出于合法的运营目的访问帐户级数据，包括：",
          "授予或撤销试用或 Premium 访问权限",
          "更新订阅或计划状态",
          "重置产品标志，如引导完成状态",
          "处理帐户删除请求",
          "调查滥用、欺诈或政策违规的报告",
          "提供帐户支持",
          "行政操作会被记录在案，以满足问责和安全目的。"
        ],
        "title": "6. 行政访问权限"
      },
      {
        "paragraphs": [
          "我们使用持有的数据来：",
          "创建和管理您的帐户",
          "提供您的计划所赋予的功能",
          "驱动应用中的优化、咨询和诊断功能",
          "处理和验证付款",
          "防止欺诈、滥用和未经授权的访问",
          "提供客户和技术支持",
          "遵守法律义务"
        ],
        "title": "7. 我们如何使用您的数据"
      },
      {
        "paragraphs": [
          "我们可能会与帮助运营服务的受信任第三方共享数据：",
          "支付处理器，用于完成和验证购买",
          "身份验证提供商，例如 Google，用于处理登录",
          "托管和基础设施提供商，用于运行和交付服务",
          "我们不会出售您的个人信息。我们不会出于广告目的共享数据。"
        ],
        "title": "8. 共享和服务提供商"
      },
      {
        "paragraphs": [
          "我们使用 Cookie 和会话令牌来保持您的登录状态，并在访问期间维持您的访问状态。这些仅限于服务运行所需的内容。"
        ],
        "title": "9. Cookie 和会话存储"
      },
      {
        "paragraphs": [
          "我们会在以下目的所需的合理必要时间内保留您的数据：",
          "交付和支持产品",
          "维护账单和付款记录",
          "欺诈预防和安全",
          "履行法律或监管义务",
          "解决争议或处理支持案例",
          "在运营需要时维护审计记录",
          "如果您请求删除您的帐户，我们将删除您的数据，但需受任何法律或安全保留要求的约束。"
        ],
        "title": "10. 数据保留"
      },
      {
        "paragraphs": [
          "我们使用合理的物理、技术和组织防护措施来保护帐户数据。没有任何系统可以完全免疫风险。如果您认为您的帐户已受损，请立即联系我们。"
        ],
        "title": "11. 安全"
      },
      {
        "paragraphs": [
          "根据您所在的地点，您可能拥有以下权利：",
          "请求获取我们持有的关于您的数据副本",
          "请求更正不准确的数据",
          "请求删除您的帐户及相关数据",
          "反对或限制对您数据的某些使用",
          "如需提出上述任何请求，请发送电子邮件至 switchcontrol67@gmail.com。我们将及时响应。请注意，在法律或运营要求的情况下（例如账单记录或安全日志），某些数据在删除后可能会被保留。"
        ],
        "title": "12. 您的权利和帐户删除"
      },
      {
        "paragraphs": [
          "SwitchControl 不适用于任何无法在其司法管辖区内签署具有法律约束力的协议的人，或在未经适当的父母或监护人许可的情况下低于最低法定年龄的人。如果您认为未成年人在未经许可的情况下提供了个人数据，请联系我们以便我们删除该数据。"
        ],
        "title": "13. 年龄要求"
      },
      {
        "paragraphs": [
          "有关隐私问题、数据请求或疑虑，请通过 switchcontrol67@gmail.com 与我们联系"
        ],
        "title": "14. 联系方式"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl 提供旨在帮助用户配置、优化和分析 Windows PC 设置及系统性能的软件和服务。通过使用 SwitchControl，即表示您同意本条款。如果您不同意，请勿使用本服务。"
        ],
        "title": "1. 概述"
      },
      {
        "paragraphs": [
          "您必须能够在您所在司法管辖区达成具有法律约束力的协议。如果您未达到最低法定年龄，则必须获得父母或监护人的许可。通过使用 SwitchControl，即表示您确认符合这些要求。"
        ],
        "title": "2. 资格要求"
      },
      {
        "paragraphs": [
          "SwitchControl 提供三种访问状态：Free，免费访问选定功能；Trial，在有限时间内临时访问 Premium 功能；以及 Premium，通过购买解锁的完整功能访问权限。各层级可用的功能可能会随时间推移而更改。SwitchControl 保留调整每个计划所包含内容的权利。"
        ],
        "title": "3. 访问层级"
      },
      {
        "paragraphs": [
          "如果您获得了 Premium 功能的免费试用：",
          "试用是临时的，并在试用期结束时自动过期",
          "试用持续时间可能有所不同，并由 SwitchControl 决定",
          "试用可能由 SwitchControl 自行决定手动授予",
          "试用并不保证在过期后继续享有 Premium 访问权限",
          "当试用过期时，您的帐户将恢复为标准的 Free 访问权限，除非您已购买了 Premium"
        ],
        "title": "4. 免费试用"
      },
      {
        "paragraphs": [
          "购买 Premium 授予您在购买时有效的条款下访问 Premium 功能的个人、不可转让许可。定价、访问模式、权益和功能集可能会随时间推移而更改。SwitchControl 不保证任何特定功能将无限期保持可用。除非明确许可，否则您不得转售、转让或与他人共享您的访问权限。"
        ],
        "title": "5. Premium 访问权限和许可"
      },
      {
        "paragraphs": [
          "SwitchControl 授予您有限的、个人的、非排他性的、不可转让的权利，以出于您自身目的使用本软件和服务。所有未明确授予的权利均予保留。"
        ],
        "title": "6. 许可和一般访问权限"
      },
      {
        "paragraphs": [
          "您同意不：",
          "将服务用于任何非法目的",
          "尝试反向工程、反编译或提取服务的源代码或逻辑",
          "尝试绕过、规避或篡改权利、许可或访问控制系统",
          "使用自动化工具、机器人或脚本滥用或使服务过载",
          "干扰服务或降低其他用户的体验",
          "尝试未经授权访问您不拥有的帐户、系统或数据",
          "上传、传输或引入恶意软件或有害代码",
          "虚假陈述您的身份或帐户状态"
        ],
        "title": "7. 可接受的使用"
      },
      {
        "paragraphs": [
          "作为常规平台操作的一部分，SwitchControl 可能会对任何帐户采取以下操作：",
          "授予、修改或撤销访问层级 (Free, Trial, Premium)",
          "重置产品标志，如引导状态",
          "调查涉嫌滥用、欺诈或政策违规的行为",
          "在必要时暂停或终止访问（参见第 9 节）",
          "处理帐户删除请求",
          "响应法律、安全或支持要求",
          "这些操作仅出于合法的运营或安全原因而采取，并会被记录在案。"
        ],
        "title": "8. 行政帐户操作"
      },
      {
        "paragraphs": [
          "如果 SwitchControl 合理地确定您违反了本服务条款、从事欺诈性、滥用性或欺骗性行为、试图篡改或规避访问控制或权利系统、对服务或其他用户构成安全风险，或以导致损害或法律风险的方式使用服务，SwitchControl 可能会在通知或不通知的情况下暂停或终止您的访问权限。如果您的帐户因故被暂停或终止，您无权获得退款。"
        ],
        "title": "9. 暂停和终止"
      },
      {
        "paragraphs": [
          "SwitchControl 可能会根据您使用的功能修改 Windows 设置、系统首选项、启动配置、网络参数和电源配置文件。您有责任谨慎使用本软件，并在应用每项功能前了解其作用。对于因在您的系统上应用更改而可能导致的系统不稳定、数据丢失或其他问题，SwitchControl 概不负责。在使用优化工具之前，请务必备份重要数据。"
        ],
        "title": "10. 系统变更与风险"
      },
      {
        "paragraphs": [
          "SwitchControl 不保证特定的性能结果。结果因硬件配置、已安装软件、驱动程序、网络状况以及我们无法控制的许多其他因素而异。这包括但不限于：FPS、帧时间、输入延迟、ping、网络稳定性、启动速度和常规系统响应能力。AI Advisor 和 BIOS Advisor 的建议输出仅作为信息参考提供，不保证其对每个系统都是准确或适用的。"
        ],
        "title": "11. 不保证结果"
      },
      {
        "paragraphs": [
          "所有定价均在完成购买前的结账页面显示。付款由我们的第三方支付处理器安全处理。",
          "除非 SwitchControl 明确提供或适用法律要求，否则所有销售均为最终销售",
          "税费可能根据您所在的地点和支付服务提供商的规则适用",
          "如果您认为收费有误，请尽快联系我们"
        ],
        "title": "12. 付款和退款"
      },
      {
        "paragraphs": [
          "某些功能依赖于第三方提供商，包括支付处理器、身份验证服务和托管基础设施。您对这些服务的使用也可能受其条款和隐私政策的约束。SwitchControl 对第三方的行为或政策不承担责任。"
        ],
        "title": "13. 第三方服务"
      },
      {
        "paragraphs": [
          "SwitchControl 软件、品牌、设计、内容和服务的所有权利均由 SwitchControl 所有。本条款中的任何内容均不将任何所有权转让给您。未经明确书面许可，您不得复制、分发或基于 SwitchControl 的任何部分创作衍生作品。"
        ],
        "title": "14. 知识产权"
      },
      {
        "paragraphs": [
          "在法律允许的最大范围内，对于因您使用或无法使用服务而引起的间接、偶然、特殊、后果性或惩罚性损害，包括但不限于数据丢失、利润损失或系统损坏，SwitchControl 不承担任何责任。"
        ],
        "title": "15. 责任限制"
      },
      {
        "paragraphs": [
          "SwitchControl 可随时更新功能、定价、访问层级和服务结构。我们也可能更新本条款和我们的隐私政策。当我们做出重大变更时，我们将更新“最后更新”日期。变更生效后继续使用服务即构成接受更新后的条款。"
        ],
        "title": "16. 服务和本条款的变更"
      },
      {
        "paragraphs": [
          "有关本条款的问题，请通过 switchcontrol67@gmail.com 与我们联系"
        ],
        "title": "17. 联系方式"
      }
    ]
  },
  "hi": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl जानकारी तभी एकत्र और उपयोग करता है जब उत्पाद प्रदान करने, खातों का प्रबंधन करने, उपयोगकर्ताओं का समर्थन करने, धोखाधड़ी को रोकने और सुरक्षा बनाए रखने की आवश्यकता होती है। यह नीति बताती है कि हम क्या एकत्र करते हैं, क्यों, और इसे कैसे संभाला जाता है।"
        ],
        "title": "1. अवलोकन"
      },
      {
        "paragraphs": [
          "जब आप साइन इन करते हैं, तो हम संग्रहीत करते हैं:"
        ],
        "title": "2. खाता डेटा"
      },
      {
        "paragraphs": [
          "हम आपकी एक्सेस स्थिति के बारे में जानकारी संग्रहीत करते हैं ताकि उत्पाद सही सुविधाएँ प्रदान कर सके। इसमें शामिल है:"
        ],
        "title": "3. पात्रता और एक्सेस डेटा"
      },
      {
        "paragraphs": [
          "उत्पाद कार्यक्षमता, सुरक्षा और खाता प्रबंधन का समर्थन करने के लिए, हम रिकॉर्ड कर सकते हैं:"
        ],
        "title": "4. ऐप और डिवाइस गतिविधि डेटा"
      },
      {
        "paragraphs": [
          "डेस्कटॉप ऐप का उपयोग करते समय, SwitchControl अपने ऑप्टिमाइज़ेशन, विश्लेषण और सलाहकार सुविधाओं को शक्ति देने के लिए हार्डवेयर और सिस्टम जानकारी तक पहुंच सकता है। इसमें शामिल है:"
        ],
        "title": "5. सिस्टम और टेलीमेट्री डेटा"
      },
      {
        "paragraphs": [
          "अधिकृत SwitchControl व्यवस्थापक वैध परिचालन उद्देश्यों के लिए खाता-स्तरीय डेटा तक पहुंच सकते हैं, जिसमें शामिल हैं:"
        ],
        "title": "6. प्रशासनिक एक्सेस"
      },
      {
        "paragraphs": [
          "हम जिस डेटा को रखते हैं उसका उपयोग हम निम्न के लिए करते हैं:"
        ],
        "title": "7. हम आपके डेटा का उपयोग कैसे करते हैं"
      },
      {
        "paragraphs": [
          "हम विश्वसनीय तृतीय पक्षों के साथ डेटा साझा कर सकते हैं जो सेवा को संचालित करने में मदद करते हैं:"
        ],
        "title": "8. साझाकरण और सेवा प्रदाता"
      },
      {
        "paragraphs": [
          "हम आपको साइन इन रखने और यात्राओं के दौरान आपकी एक्सेस स्थिति बनाए रखने के लिए कुकीज़ और सत्र टोकन का उपयोग करते हैं। ये केवल उस तक सीमित हैं जो सेवा के कार्य करने के लिए आवश्यक है।"
        ],
        "title": "9. कुकीज़ और सत्र भंडारण"
      },
      {
        "paragraphs": [
          "हम आपके डेटा को निम्नलिखित उद्देश्यों के लिए उचित रूप से आवश्यक समय तक बनाए रखते हैं:"
        ],
        "title": "10. डेटा प्रतिधारण"
      },
      {
        "paragraphs": [
          "हम खाता डेटा की सुरक्षा के लिए उचित तकनीकी और संगठनात्मक सुरक्षा उपायों का उपयोग करते हैं। कोई भी सिस्टम पूरी तरह से जोखिम से मुक्त नहीं है। यदि आपको लगता है कि आपका खाता खतरे में पड़ गया है, तो तुरंत हमसे संपर्क करें।"
        ],
        "title": "11. सुरक्षा"
      },
      {
        "paragraphs": [
          "आपके स्थान के आधार पर, आपके पास निम्न अधिकार हो सकते हैं:"
        ],
        "title": "12. आपके अधिकार और खाता विलोपन"
      },
      {
        "paragraphs": [
          "SwitchControl का उद्देश्य ऐसे किसी भी व्यक्ति द्वारा उपयोग नहीं किया जाना है जो अपने अधिकार क्षेत्र में कानूनी रूप से बाध्यकारी समझौता नहीं कर सकता है, या जो उचित माता-पिता या अभिभावक की अनुमति के बिना न्यूनतम आवश्यक आयु से कम है। यदि आपको लगता है कि किसी नाबालिग ने अनुमति के बिना व्यक्तिगत डेटा प्रदान किया है, तो हमसे संपर्क करें ताकि हम इसे हटा सकें।"
        ],
        "title": "13. आयु आवश्यकताएं"
      },
      {
        "paragraphs": [
          "गोपनीयता प्रश्नों, डेटा अनुरोधों या चिंताओं के लिए, हमसे switchcontrol67@gmail.com पर संपर्क करें"
        ],
        "title": "14. संपर्क"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl विंडोज़ पीसी सेटिंग्स और सिस्टम प्रदर्शन को कॉन्फ़िगर, ऑप्टिमाइज़ और विश्लेषण करने में उपयोगकर्ताओं की सहायता के लिए डिज़ाइन किए गए सॉफ़्टवेयर और सेवाएँ प्रदान करता है। SwitchControl का उपयोग करके, आप इन शर्तों से सहमत हैं। यदि आप सहमत नहीं हैं, तो सेवा का उपयोग न करें।"
        ],
        "title": "1. अवलोकन"
      },
      {
        "paragraphs": [
          "आपको अपने अधिकार क्षेत्र में कानूनी रूप से बाध्यकारी समझौता करने में सक्षम होना चाहिए। यदि आप न्यूनतम आवश्यक आयु से कम हैं, तो आपके पास माता-पिता या अभिभावक की अनुमति होनी चाहिए। SwitchControl का उपयोग करके, आप पुष्टि करते हैं कि आप इन आवश्यकताओं को पूरा करते हैं।"
        ],
        "title": "2. पात्रता"
      },
      {
        "paragraphs": [
          "SwitchControl तीन एक्सेस स्थितियां प्रदान करता है: Free, बिना किसी लागत के चयनित सुविधाओं तक बुनियादी पहुंच; Trial, सीमित समय के लिए Premium सुविधाओं तक अस्थायी पहुंच; और Premium, खरीद के माध्यम से अनलॉक की गई पूर्ण सुविधा पहुंच। प्रत्येक टियर पर उपलब्ध सुविधाएँ समय के साथ बदल सकती हैं। SwitchControl प्रत्येक योजना में क्या शामिल है, इसे समायोजित करने का अधिकार सुरक्षित रखता है।"
        ],
        "title": "3. एक्सेस टियर"
      },
      {
        "paragraphs": [
          "यदि आप Premium सुविधाओं का एक फ्री ट्रायल प्राप्त करते हैं:"
        ],
        "title": "4. Free ट्रायल"
      },
      {
        "paragraphs": [
          "Premium खरीदने से आपको खरीद के समय प्रभावी शर्तों के तहत Premium सुविधाओं तक पहुंचने के लिए एक व्यक्तिगत, अहस्तांतरणीय लाइसेंस मिलता है। मूल्य निर्धारण, एक्सेस मॉडल, पात्रता और सुविधा सेट समय के साथ बदल सकते हैं। SwitchControl यह गारंटी नहीं देता है कि कोई विशिष्ट सुविधा अनिश्चित काल तक उपलब्ध रहेगी। जब तक स्पष्ट रूप से अनुमति न हो, आप अपनी एक्सेस को पुनर्विक्रय, स्थानांतरित या साझा नहीं कर सकते हैं।"
        ],
        "title": "5. Premium एक्सेस और लाइसेंसिंग"
      },
      {
        "paragraphs": [
          "SwitchControl आपको अपने उद्देश्यों के लिए सॉफ़्टवेयर और सेवा का उपयोग करने के लिए एक सीमित, व्यक्तिगत, गैर-अनन्य, अहस्तांतरणीय अधिकार देता है। स्पष्ट रूप से नहीं दिए गए सभी अधिकार सुरक्षित हैं।"
        ],
        "title": "6. लाइसेंस और सामान्य एक्सेस"
      },
      {
        "paragraphs": [
          "आप निम्नलिखित के लिए सहमत नहीं हैं:"
        ],
        "title": "7. स्वीकार्य उपयोग"
      },
      {
        "paragraphs": [
          "सामान्य प्लेटफ़ॉर्म संचालन के हिस्से के रूप में SwitchControl किसी भी खाते पर निम्नलिखित क्रियाएँ कर सकता है:"
        ],
        "title": "8. प्रशासनिक खाता क्रियाएँ"
      },
      {
        "paragraphs": [
          "SwitchControl आपकी एक्सेस को निलंबित या समाप्त कर सकता है, नोटिस के साथ या बिना, यदि हम उचित रूप से निर्धारित करते हैं कि आपने इन सेवा की शर्तों का उल्लंघन किया है, धोखाधड़ीपूर्ण, अपमानजनक या भ्रामक व्यवहार में संलग्न हुए हैं, एक्सेस कंट्रोल या पात्रता प्रणालियों के साथ छेड़छाड़ करने या दरकिनार करने का प्रयास किया है, सेवा या अन्य उपयोगकर्ताओं के लिए सुरक्षा जोखिम उत्पन्न किया है, या ऐसी सेवा का उपयोग किया है जिससे नुकसान या कानूनी जोखिम होता है। यदि आपका खाता कारण से निलंबित या समाप्त कर दिया जाता है, तो आप रिफंड के हकदार नहीं हैं।"
        ],
        "title": "9. निलंबन और समाप्ति"
      },
      {
        "paragraphs": [
          "SwitchControl आपके द्वारा उपयोग की जाने वाली सुविधाओं के आधार पर विंडोज़ सेटिंग्स, सिस्टम प्राथमिकताएँ, स्टार्टअप कॉन्फ़िगरेशन, नेटवर्क पैरामीटर और पावर प्रोफाइल को संशोधित कर सकता है। आप सावधानीपूर्वक सॉफ़्टवेयर का उपयोग करने और इसे लागू करने से पहले प्रत्येक सुविधा क्या करती है, यह समझने के लिए ज़िम्मेदार हैं। SwitchControl सिस्टम अस्थिरता, डेटा हानि, या अन्य मुद्दों के लिए ज़िम्मेदार नहीं है जो आपके सिस्टम में परिवर्तन लागू करने से उत्पन्न हो सकते हैं। ऑप्टिमाइज़ेशन टूल का उपयोग करने से पहले हमेशा महत्वपूर्ण डेटा का बैकअप लें।"
        ],
        "title": "10. सिस्टम परिवर्तन और जोखिम"
      },
      {
        "paragraphs": [
          "SwitchControl विशिष्ट प्रदर्शन परिणामों की गारंटी नहीं देता है। परिणाम हार्डवेयर कॉन्फ़िगरेशन, इंस्टॉल किए गए सॉफ़्टवेयर, ड्राइवर, नेटवर्क स्थितियों और हमारे नियंत्रण से बाहर कई अन्य कारकों के आधार पर भिन्न होते हैं। इसमें FPS, फ्रेम समय, इनपुट लेटेंसी, पिंग, नेटवर्क स्थिरता, बूट गति और सामान्य सिस्टम प्रतिक्रियाशीलता शामिल है, लेकिन यह इन्हीं तक सीमित नहीं है। AI Advisor और BIOS Advisor आउटपुट केवल सूचनात्मक मार्गदर्शन के रूप में प्रदान किए जाते हैं, वे हर सिस्टम के लिए सटीक या उपयुक्त होने की गारंटी नहीं देते हैं।"
        ],
        "title": "11. कोई गारंटीकृत परिणाम नहीं"
      },
      {
        "paragraphs": [
          "सभी मूल्य निर्धारण खरीद पूरी करने से पहले चेकआउट पर दिखाए जाते हैं। भुगतान हमारे तृतीय-पक्ष भुगतान प्रोसेसर द्वारा सुरक्षित रूप से संभाले जाते हैं।"
        ],
        "title": "12. भुगतान और रिफंड"
      },
      {
        "paragraphs": [
          "कुछ सुविधाएँ तृतीय-पक्ष प्रदाताओं पर निर्भर करती हैं जिनमें भुगतान प्रोसेसर, प्रमाणीकरण सेवाएँ और होस्टिंग अवसंरचना शामिल हैं। उनकी शर्तें और गोपनीयता नीतियां उन सेवाओं के आपके उपयोग पर भी लागू हो सकती हैं। SwitchControl तृतीय पक्षों के आचरण या नीतियों के लिए ज़िम्मेदार नहीं है।"
        ],
        "title": "13. तृतीय-पक्ष सेवाएँ"
      },
      {
        "paragraphs": [
          "SwitchControl सॉफ़्टवेयर, ब्रांड, डिज़ाइन, सामग्री और सेवाओं में सभी अधिकार SwitchControl के स्वामित्व में हैं। इन शर्तों में कुछ भी आपको कोई स्वामित्व स्थानांतरित नहीं करता है। आप स्पष्ट लिखित अनुमति के बिना SwitchControl के किसी भी हिस्से से व्युत्पन्न कार्य को पुन: प्रस्तुत, वितरित या निर्माण नहीं कर सकते हैं।"
        ],
        "title": "14. बौद्धिक संपदा"
      },
      {
        "paragraphs": [
          "कानून द्वारा अनुमत पूर्ण सीमा तक, SwitchControl अप्रत्यक्ष, आकस्मिक, विशेष, परिणामी या दंडात्मक नुकसान के लिए उत्तरदायी नहीं है, जिसमें डेटा की हानि, लाभ की हानि, या सिस्टम क्षति शामिल है, लेकिन यह सीमित नहीं है, जो आपके उपयोग से, या सेवा का उपयोग करने में असमर्थता से उत्पन्न होती है।"
        ],
        "title": "15. दायित्व की सीमा"
      },
      {
        "paragraphs": [
          "SwitchControl किसी भी समय सुविधाओं, मूल्य निर्धारण, एक्सेस टियर और सेवा संरचना को अपडेट कर सकता है। हम इन शर्तों और हमारी गोपनीयता नीति को भी अपडेट कर सकते हैं। जब हम महत्वपूर्ण परिवर्तन करते हैं, तो हम “अंतिम अपडेट” तिथि अपडेट करेंगे। परिवर्तनों के प्रभावी होने के बाद सेवा का निरंतर उपयोग अपडेट की गई शर्तों की स्वीकृति का गठन करता है।"
        ],
        "title": "16. सेवा और इन शर्तों में परिवर्तन"
      },
      {
        "paragraphs": [
          "इन शर्तों के बारे में प्रश्नों के लिए, हमसे switchcontrol67@gmail.com पर संपर्क करें"
        ],
        "title": "17. संपर्क"
      }
    ]
  },
  "ar": {
    "terms": [
      {
        "paragraphs": [
          "يوفر SwitchControl برامج وخدمات مصممة لمساعدة المستخدمين في تهيئة وتحسين وتحليل إعدادات Windows وأداء النظام. من خلال استخدام SwitchControl، فإنك توافق على هذه الشروط. إذا كنت لا توافق، فلا تستخدم الخدمة."
        ],
        "title": "1. نظرة عامة"
      },
      {
        "paragraphs": [
          "يجب أن تكون قادرًا على إبرام اتفاقية ملزمة قانونًا في ولايتك القضائية. إذا كنت أقل من الحد الأدنى للسن المطلوب، فيجب أن تحصل على إذن من أحد الوالدين أو الأوصياء. باستخدام SwitchControl، فإنك تؤكد استيفاء هذه المتطلبات."
        ],
        "title": "2. الأهلية"
      },
      {
        "paragraphs": [
          "يقدم SwitchControl ثلاث حالات وصول: Free، وصول أساسي إلى ميزات مختارة مجانًا؛ Trial، وصول مؤقت إلى ميزات Premium لفترة محدودة؛ و Premium، وصول كامل للميزات، يتم فتحه عبر الشراء. قد تتغير الميزات المتاحة في كل مستوى بمرور الوقت. يحتفظ SwitchControl بالحق في تعديل ما يتم تضمينه في كل خطة."
        ],
        "title": "3. مستويات الوصول"
      },
      {
        "paragraphs": [
          "إذا حصلت على تجربة مجانية لميزات Premium:",
          "التجارب مؤقتة وتنتهي تلقائيًا عند انتهاء فترة التجربة",
          "قد تختلف مدة التجربة ويحددها SwitchControl",
          "قد يتم منح التجارب يدويًا بواسطة SwitchControl وفقًا لتقديرها",
          "لا تضمن التجربة استمرار الوصول إلى Premium بعد انتهاء صلاحيتها",
          "عند انتهاء التجربة، يعود حسابك إلى وصول Free القياسي ما لم تكن قد اشتريت Premium"
        ],
        "title": "4. التجارب المجانية"
      },
      {
        "paragraphs": [
          "يمنحك شراء Premium ترخيصًا شخصيًا غير قابل للتحويل للوصول إلى ميزات Premium بموجب الشروط المعمول بها في وقت الشراء. قد تتغير الأسعار، ونماذج الوصول، والاستحقاقات، ومجموعات الميزات بمرور الوقت. لا يضمن SwitchControl بقاء أي ميزة محددة متاحة إلى أجل غير مسمى. لا يجوز لك إعادة بيع أو نقل أو مشاركة وصولك مع الآخرين ما لم يُسمح بذلك صراحة."
        ],
        "title": "5. الوصول إلى Premium والترخيص"
      },
      {
        "paragraphs": [
          "يمنحك SwitchControl حقًا محدودًا وشخصيًا وغير حصري وغير قابل للتحويل لاستخدام البرنامج والخدمة لأغراضك الخاصة. جميع الحقوق غير الممنوحة صراحة محفوظة."
        ],
        "title": "6. الترخيص والوصول العام"
      },
      {
        "paragraphs": [
          "أنت توافق على عدم:",
          "استخدام الخدمة لأي غرض غير قانوني",
          "محاولة الهندسة العكسية أو إلغاء تجميع أو استخراج الكود المصدري أو منطق الخدمة",
          "محاولة تجاوز أو التحايل أو العبث بأنظمة الاستحقاق أو الترخيص أو التحكم في الوصول",
          "استخدام أدوات آلية أو برامج روبوت أو نصوص برمجية لإساءة استخدام الخدمة أو تحميلها فوق طاقتها",
          "التدخل في الخدمة أو تدهور التجربة للمستخدمين الآخرين",
          "محاولة الوصول غير المصرح به إلى الحسابات أو الأنظمة أو البيانات التي لا تملكها",
          "تحميل أو نقل أو إدخال برامج ضارة أو كود ضار",
          "تحريف هويتك أو حالة حسابك"
        ],
        "title": "7. الاستخدام المقبول"
      },
      {
        "paragraphs": [
          "قد يتخذ SwitchControl الإجراءات التالية على أي حساب كجزء من عمليات النظام الأساسي العادية:",
          "منح أو تعديل أو إلغاء مستويات الوصول (Free، Trial، Premium)",
          "إعادة تعيين علامات المنتج مثل حالة الإعداد",
          "التحقيق في الاشتباه في سوء الاستخدام أو الاحتيال أو انتهاكات السياسة",
          "تعليق أو إنهاء الوصول عند الضرورة (انظر القسم 9)",
          "معالجة طلبات حذف الحساب",
          "الاستجابة للمتطلبات القانونية أو الأمنية أو متطلبات الدعم",
          "يتم اتخاذ هذه الإجراءات فقط لأسباب تشغيلية أو أمنية مشروعة ويتم تسجيلها."
        ],
        "title": "8. إجراءات الحساب الإدارية"
      },
      {
        "paragraphs": [
          "قد يقوم SwitchControl بتعليق أو إنهاء وصولك، مع أو بدون إشعار، إذا قررنا بشكل معقول أنك انتهكت شروط الخدمة هذه، أو شاركت في سلوك احتيالي أو مسيء أو خادع، أو حاولت العبث بضوابط الوصول أو أنظمة الاستحقاق أو التحايل عليها، أو شكلت خطرًا أمنيًا على الخدمة أو المستخدمين الآخرين، أو استخدمت الخدمة بطريقة تسبب ضررًا أو تعرضنا للمساءلة القانونية. إذا تم تعليق حسابك أو إنهاؤه لسبب ما، فأنت لا تستحق استرداد الأموال."
        ],
        "title": "9. التعليق والإنهاء"
      },
      {
        "paragraphs": [
          "قد يقوم SwitchControl بتعديل إعدادات Windows وتفضيلات النظام وتكوين بدء التشغيل ومعايير الشبكة وملفات تعريف الطاقة اعتمادًا على الميزات التي تستخدمها. أنت مسؤول عن استخدام البرنامج بعناية وفهم ما تفعله كل ميزة قبل تطبيقها. SwitchControl ليست مسؤولة عن عدم استقرار النظام أو فقدان البيانات أو المشكلات الأخرى التي قد تنشأ عن تطبيق تغييرات على نظامك. قم دائمًا بنسخ البيانات المهمة احتياطيًا قبل استخدام أدوات التحسين."
        ],
        "title": "10. تغييرات النظام والمخاطر"
      },
      {
        "paragraphs": [
          "لا يضمن SwitchControl نتائج أداء محددة. تختلف النتائج بناءً على تكوين الأجهزة والبرامج المثبتة وبرامج التشغيل وظروف الشبكة والعديد من العوامل الأخرى الخارجة عن سيطرتنا. يشمل ذلك على سبيل المثال لا الحصر: معدل الإطارات (FPS)، ووقت الإطار، وزمن انتقال الإدخال، و ping، واستقرار الشبكة، وسرعة التمهيد، واستجابة النظام العامة. يتم توفير التوصيات التي تم إنشاؤها بواسطة AI Advisor ومخرجات BIOS Advisor كإرشادات معلوماتية فقط، ولا يُضمن أنها دقيقة أو مناسبة لكل نظام."
        ],
        "title": "11. عدم ضمان النتائج"
      },
      {
        "paragraphs": [
          "يتم عرض جميع الأسعار عند الدفع قبل إكمال الشراء. تتم معالجة المدفوعات بشكل آمن بواسطة معالج الدفع التابع لجهة خارجية.",
          "جميع المبيعات نهائية ما لم يتم تقديم استرداد صراحة من قبل SwitchControl أو يقتضيه القانون المعمول به",
          "قد يتم تطبيق الضرائب بناءً على موقعك وقواعد مزود الدفع",
          "إذا كنت تعتقد أن هناك خطأ في الرسوم، اتصل بنا على الفور"
        ],
        "title": "12. المدفوعات والمبالغ المستردة"
      },
      {
        "paragraphs": [
          "تعتمد بعض الميزات على مزودي طرف ثالث بما في ذلك معالجات الدفع وخدمات المصادقة وبنية الاستضافة التحتية. قد تنطبق شروطهم وسياسات الخصوصية الخاصة بهم أيضًا على استخدامك لتلك الخدمات. SwitchControl ليست مسؤولة عن سلوك أو سياسات الأطراف الثالثة."
        ],
        "title": "13. خدمات الطرف الثالث"
      },
      {
        "paragraphs": [
          "جميع الحقوق في برنامج SwitchControl والعلامة التجارية والتصميم والمحتوى والخدمات مملوكة لشركة SwitchControl. لا تنقل هذه الشروط أي ملكية إليك. لا يجوز لك إعادة إنتاج أو توزيع أو إنشاء أعمال مشتقة من أي جزء من SwitchControl دون إذن كتابي صريح."
        ],
        "title": "14. الملكية الفكرية"
      },
      {
        "paragraphs": [
          "إلى أقصى حد يسمح به القانون، لا يتحمل SwitchControl المسؤولية عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية أو تأديبية، بما في ذلك على سبيل المثال لا الحصر فقدان البيانات أو خسارة الأرباح أو تلف النظام، الناتجة عن استخدامك للخدمة أو عدم قدرتك على استخدامها."
        ],
        "title": "15. تحديد المسؤولية"
      },
      {
        "paragraphs": [
          "قد يقوم SwitchControl بتحديث الميزات والأسعار ومستويات الوصول وهيكل الخدمة في أي وقت. قد نقوم أيضًا بتحديث هذه الشروط وسياسة الخصوصية الخاصة بنا. عندما نقوم بإجراء تغييرات جوهرية، سنقوم بتحديث تاريخ \"آخر تحديث\". استمرار استخدام الخدمة بعد سريان التغييرات يشكل قبولًا للشروط المحدثة."
        ],
        "title": "16. تغييرات الخدمة وهذه الشروط"
      },
      {
        "paragraphs": [
          "للأسئلة حول هذه الشروط، اتصل بنا على switchcontrol67@gmail.com"
        ],
        "title": "17. الاتصال"
      }
    ],
    "privacy": [
      {
        "paragraphs": [
          "يجمع SwitchControl المعلومات ويستخدمها فقط عند الحاجة لتوفير المنتج وإدارة الحسابات ودعم المستخدمين ومنع الاحتيال والحفاظ على الأمان. تشرح هذه السياسة ما نجمعه، ولماذا، وكيف يتم التعامل معه."
        ],
        "title": "1. نظرة عامة"
      },
      {
        "paragraphs": [
          "عند تسجيل الدخول، نقوم بتخزين:",
          "عنوان بريدك الإلكتروني",
          "اسم العرض الخاص بك، إذا تم توفيره بواسطة مزود المصادقة الخاص بك",
          "معرف حساب فريد",
          "بيانات التعريف الوصفية للمصادقة اللازمة لإدارة جلسة تسجيل الدخول الخاصة بك (مثل رموز مزود OAuth)"
        ],
        "title": "2. بيانات الحساب"
      },
      {
        "paragraphs": [
          "نقوم بتخزين معلومات حول حالة وصولك حتى يتمكن المنتج من تقديم الميزات الصحيحة. وهذا يشمل:",
          "خطتك الحالية (Free أو Trial أو Premium)",
          "تاريخ بدء التجربة وتاريخ انتهائها ومدتها إذا تم تنشيط التجربة",
          "حالة تنشيط Premium والدفع",
          "ما إذا كنت قد أكملت جولات الإعداد أو تدفقات الإعداد لأول مرة",
          "علامات الوصول إلى الميزات المستخدمة لتحديد ما يمكنك رؤيته واستخدامه"
        ],
        "title": "3. بيانات الاستحقاق والوصول"
      },
      {
        "paragraphs": [
          "لدعم وظائف المنتج والأمان وإدارة الحساب، قد نسجل:",
          "وقت آخر تسجيل دخول لك",
          "آخر مرة كان فيها تطبيق سطح المكتب نشطًا على جهازك",
          "ما إذا كان قد تم تثبيت التطبيق واستخدامه",
          "أحداث نشاط الحساب أو المسؤول ذات الصلة بالأمان والدعم ومنع الاحتيال",
          "نحن لا نسجل ضغطات المفاتيح أو الملفات الشخصية أو محتويات الحافظة أو سجل التصفح الكامل."
        ],
        "title": "4. بيانات نشاط التطبيق والجهاز"
      },
      {
        "paragraphs": [
          "عند استخدام تطبيق سطح المكتب، قد يصل SwitchControl إلى معلومات الأجهزة والنظام لتشغيل ميزات التحسين والتحليل والاستشارات الخاصة به. وهذا يشمل:",
          "معلومات ملف تعريف الأجهزة (CPU، GPU، RAM، التخزين) المستخدمة بواسطة ميزات التحسين والاستشارات",
          "مقاييس النظام في الوقت الفعلي (تحميل CPU، استخدام الذاكرة، تحميل GPU) المعروضة في لوحة المعلومات",
          "البيانات التشخيصية التي يستخدمها AI Advisor و BIOS Advisor لإنشاء توصيات",
          "بيانات تكوين الشبكة المستخدمة بواسطة ميزات تحسين الشبكة",
          "تُستخدم هذه البيانات محليًا لتشغيل ميزات التطبيق. نحن نجمع فقط ما هو مطلوب لتوفير الوظائف والتحليل والدعم، ولا شيء أكثر."
        ],
        "title": "5. بيانات النظام والقياس عن بعد"
      },
      {
        "paragraphs": [
          "قد يصل مسؤولو SwitchControl المصرح لهم إلى بيانات على مستوى الحساب لأغراض تشغيلية مشروعة، بما في ذلك:",
          "منح أو إلغاء التجربة أو الوصول إلى Premium",
          "تحديث حالة الاشتراك أو الخطة",
          "إعادة تعيين علامات المنتج مثل إكمال الإعداد",
          "معالجة طلبات حذف الحساب",
          "التحقيق في تقارير سوء الاستخدام أو الاحتيال أو انتهاكات السياسة",
          "تقديم دعم الحساب",
          "يتم تسجيل الإجراءات الإدارية لأغراض المساءلة والأمن."
        ],
        "title": "6. الوصول الإداري"
      },
      {
        "paragraphs": [
          "نستخدم البيانات التي نحتفظ بها لـ:",
          "إنشاء حسابك وإدارته",
          "تقديم الميزات التي تخولك خطتك لها",
          "تشغيل ميزات التحسين والاستشارات والتشخيص في التطبيق",
          "معالجة المدفوعات والتحقق منها",
          "منع الاحتيال وسوء الاستخدام والوصول غير المصرح به",
          "تقديم دعم العملاء والدعم الفني",
          "الامتثال للالتزامات القانونية"
        ],
        "title": "7. كيفية استخدامنا لبياناتك"
      },
      {
        "paragraphs": [
          "قد نشارك البيانات مع أطراف ثالثة موثوقة تساعد في تشغيل الخدمة:",
          "معالجو الدفع، لإكمال المشتريات والتحقق منها",
          "مزودو المصادقة، مثل Google، للتعامل مع تسجيل الدخول",
          "مزودو الاستضافة والبنية التحتية، لتشغيل الخدمة وتقديمها",
          "نحن لا نبيع معلوماتك الشخصية. نحن لا نشارك البيانات لأغراض إعلانية."
        ],
        "title": "8. المشاركة ومزودي الخدمة"
      },
      {
        "paragraphs": [
          "نستخدم ملفات تعريف الارتباط ورموز الجلسة لإبقائك مسجلاً للدخول والحفاظ على حالة وصولك عبر الزيارات. تقتصر هذه على ما هو ضروري لعمل الخدمة."
        ],
        "title": "9. ملفات تعريف الارتباط وتخزين الجلسة"
      },
      {
        "paragraphs": [
          "نحتفظ ببياناتك طالما كان ذلك ضروريًا بشكل معقول للأغراض التالية:",
          "تقديم المنتج ودعمه",
          "الحفاظ على سجلات الفواتير والمدفوعات",
          "منع الاحتيال والأمن",
          "الوفاء بالالتزامات القانونية أو التنظيمية",
          "حل النزاعات أو التعامل مع حالات الدعم",
          "الحفاظ على سجلات التدقيق حيثما كان ذلك مطلوبًا تشغيليًا",
          "إذا طلبت حذف حسابك، فسنقوم بإزالة بياناتك مع مراعاة أي متطلبات احتجاز قانونية أو أمنية."
        ],
        "title": "10. الاحتفاظ بالبيانات"
      },
      {
        "paragraphs": [
          "نستخدم ضمانات تقنية وتنظيمية معقولة لحماية بيانات الحساب. لا يوجد نظام محصن تمامًا ضد المخاطر. إذا كنت تعتقد أن حسابك قد تعرض للاختراق، اتصل بنا على الفور."
        ],
        "title": "11. الأمان"
      },
      {
        "paragraphs": [
          "اعتمادًا على موقعك، قد تكون لديك حقوق لـ:",
          "طلب نسخة من البيانات التي نحتفظ بها عنك",
          "طلب تصحيحات للبيانات غير الدقيقة",
          "طلب حذف حسابك والبيانات المرتبطة به",
          "الاعتراض على أو تقييد استخدامات معينة لبياناتك",
          "لتقديم أي من هذه الطلبات، راسلنا عبر البريد الإلكتروني على switchcontrol67@gmail.com. سنرد على الفور. لاحظ أن بعض البيانات قد يتم الاحتفاظ بها بعد الحذف حيثما كان ذلك مطلوبًا قانونيًا أو تشغيليًا (على سبيل المثال، سجلات الفواتير أو سجلات الأمان)."
        ],
        "title": "12. حقوقك وحذف الحساب"
      },
      {
        "paragraphs": [
          "SwitchControl غير مخصص للاستخدام من قبل أي شخص لا يمكنه قانونًا إبرام اتفاقية ملزمة في ولايته القضائية، أو من هو أقل من الحد الأدنى للسن المطلوب دون إذن مناسب من الوالدين أو الأوصياء. إذا كنت تعتقد أن قاصرًا قد قدم بيانات شخصية دون إذن، فاتصل بنا حتى نتمكن من إزالتها."
        ],
        "title": "13. متطلبات العمر"
      },
      {
        "paragraphs": [
          "للأسئلة المتعلقة بالخصوصية أو طلبات البيانات أو المخاوف، اتصل بنا على switchcontrol67@gmail.com"
        ],
        "title": "14. الاتصال"
      }
    ]
  },
  "pt-BR": {
    "privacy": [
      {
        "paragraphs": [
          "O SwitchControl coleta e usa informações apenas quando necessário para fornecer o produto, gerenciar contas, oferecer suporte aos usuários, prevenir fraudes e manter a segurança. Esta política explica o que coletamos, por que e como é tratado."
        ],
        "title": "1. Visão geral"
      },
      {
        "paragraphs": [
          "Ao entrar, armazenamos:",
          "Seu endereço de e-mail",
          "Seu nome de exibição, se fornecido pelo seu provedor de autenticação",
          "Um identificador de conta exclusivo",
          "Metadados de autenticação necessários para gerenciar sua sessão de login (como tokens de provedor OAuth)"
        ],
        "title": "2. Dados da conta"
      },
      {
        "paragraphs": [
          "Armazenamos informações sobre seu estado de acesso para que o produto possa fornecer os recursos corretos. Isso inclui:",
          "Seu plano atual (Free, Trial ou Premium)",
          "Data de início, data de término e duração da avaliação, se uma avaliação tiver sido ativada",
          "Status de ativação e pagamento do Premium",
          "Se você concluiu as tours de integração ou fluxos de configuração inicial",
          "Sinalizadores de acesso a recursos usados para determinar o que você pode ver e usar"
        ],
        "title": "3. Dados de direitos e acesso"
      },
      {
        "paragraphs": [
          "Para apoiar a funcionalidade do produto, segurança e gerenciamento de conta, podemos registrar:",
          "A hora do seu último login",
          "A última vez que o aplicativo de desktop esteve ativo no seu dispositivo",
          "Se o aplicativo foi instalado e usado",
          "Eventos de atividade de conta ou administrador relevantes para segurança, suporte e prevenção de fraudes",
          "Não registramos teclas digitadas, arquivos pessoais, conteúdo da área de transferência ou histórico completo de navegação."
        ],
        "title": "4. Dados de atividade do aplicativo e do dispositivo"
      },
      {
        "paragraphs": [
          "Ao usar o aplicativo de desktop, o SwitchControl pode acessar informações de hardware e sistema para impulsionar seus recursos de otimização, análise e consultoria. Isso inclui:",
          "Informações do perfil de hardware (CPU, GPU, RAM, armazenamento) usadas pelos recursos de otimização e consultoria",
          "Métricas de sistema em tempo real (carga da CPU, uso de memória, carga da GPU) exibidas no painel",
          "Dados de diagnóstico usados pelo AI Advisor e BIOS Advisor para gerar recomendações",
          "Dados de configuração de rede usados por recursos de otimização de rede",
          "Esses dados são usados localmente para alimentar os recursos do aplicativo. Coletamos apenas o que é necessário para fornecer funcionalidade, análise e suporte, e nada mais."
        ],
        "title": "5. Dados de sistema e telemetria"
      },
      {
        "paragraphs": [
          "Administradores autorizados do SwitchControl podem acessar dados em nível de conta para fins operacionais legítimos, incluindo:",
          "Conceder ou revogar acesso de avaliação ou premium",
          "Atualizar status de assinatura ou plano",
          "Redefinir sinalizadores do produto, como conclusão de integração",
          "Processar solicitações de exclusão de conta",
          "Investigar denúncias de abuso, fraude ou violações de política",
          "Fornecer suporte à conta",
          "As ações administrativas são registradas para fins de prestação de contas e segurança."
        ],
        "title": "6. Acesso administrativo"
      },
      {
        "paragraphs": [
          "Usamos os dados que mantemos para:",
          "Criar e gerenciar sua conta",
          "Fornecer os recursos aos quais seu plano lhe dá direito",
          "Impulsionar recursos de otimização, consultoria e diagnóstico no aplicativo",
          "Processar e verificar pagamentos",
          "Prevenir fraudes, abusos e acesso não autorizado",
          "Fornecer suporte técnico e ao cliente",
          "Cumprir obrigações legais"
        ],
        "title": "7. Como usamos seus dados"
      },
      {
        "paragraphs": [
          "Podemos compartilhar dados com terceiros confiáveis que ajudam a operar o serviço:",
          "Processadores de pagamento, para concluir e verificar compras",
          "Provedores de autenticação, como o Google, para gerenciar o login",
          "Provedores de hospedagem e infraestrutura, para executar e entregar o serviço",
          "Não vendemos suas informações pessoais. Não compartilhamos dados para fins publicitários."
        ],
        "title": "8. Compartilhamento e provedores de serviço"
      },
      {
        "paragraphs": [
          "Usamos cookies e tokens de sessão para mantê-lo conectado e manter seu estado de acesso durante as visitas. Estes são limitados ao que é necessário para o funcionamento do serviço."
        ],
        "title": "9. Cookies e armazenamento de sessão"
      },
      {
        "paragraphs": [
          "Retemos seus dados pelo tempo razoavelmente necessário para os seguintes fins:",
          "Fornecer e apoiar o produto",
          "Manter registros de faturamento e pagamento",
          "Prevenção de fraudes e segurança",
          "Cumprir obrigações legais ou regulatórias",
          "Resolver disputas ou lidar com casos de suporte",
          "Manter registros de auditoria onde for operacionalmente necessário",
          "Se você solicitar a exclusão da sua conta, removeremos seus dados sujeitos a quaisquer requisitos de retenção legal ou de segurança."
        ],
        "title": "10. Retenção de dados"
      },
      {
        "paragraphs": [
          "Usamos salvaguardas técnicas e organizacionais razoáveis para proteger os dados da conta. Nenhum sistema é completamente imune a riscos. Se você acredita que sua conta foi comprometida, entre em contato conosco imediatamente."
        ],
        "title": "11. Segurança"
      },
      {
        "paragraphs": [
          "Dependendo da sua localização, você pode ter direitos para:",
          "Solicitar uma cópia dos dados que mantemos sobre você",
          "Solicitar correções de dados imprecisos",
          "Solicitar a exclusão da sua conta e dados associados",
          "Obstar ou restringir certos usos de seus dados",
          "Para fazer qualquer uma dessas solicitações, envie-nos um e-mail para switchcontrol67@gmail.com. Responderemos prontamente. Observe que alguns dados podem ser retidos após a exclusão quando exigido legal ou operacionalmente (por exemplo, registros de faturamento ou logs de segurança)."
        ],
        "title": "12. Seus direitos e exclusão de conta"
      },
      {
        "paragraphs": [
          "O SwitchControl não se destina ao uso por qualquer pessoa que não possa celebrar legalmente um contrato vinculativo em sua jurisdição, ou que esteja abaixo da idade mínima exigida sem a permissão apropriada dos pais ou responsáveis. Se você acredita que um menor forneceu dados pessoais sem permissão, entre em contato conosco para que possamos removê-los."
        ],
        "title": "13. Requisitos de idade"
      },
      {
        "paragraphs": [
          "Para perguntas sobre privacidade, solicitações de dados ou preocupações, entre em contato conosco em switchcontrol67@gmail.com"
        ],
        "title": "14. Contato"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "O SwitchControl fornece software e serviços projetados para ajudar os usuários a configurar, otimizar e analisar as configurações e o desempenho do sistema do PC Windows. Ao usar o SwitchControl, você concorda com estes termos. Se você não concordar, não utilize o serviço."
        ],
        "title": "1. Visão geral"
      },
      {
        "paragraphs": [
          "Você deve ser capaz de formar um contrato legalmente vinculativo em sua jurisdição. Se estiver abaixo da idade mínima exigida, você deve ter permissão de um dos pais ou responsável. Ao usar o SwitchControl, você confirma que atende a estes requisitos."
        ],
        "title": "2. Elegibilidade"
      },
      {
        "paragraphs": [
          "O SwitchControl oferece três estados de acesso: Free, acesso básico a recursos selecionados sem custo; Trial, acesso temporário a recursos Premium por tempo limitado; e Premium, acesso total aos recursos, desbloqueado mediante compra. Os recursos disponíveis em cada nível podem mudar ao longo do tempo. O SwitchControl reserva-se o direito de ajustar o que está incluído em cada plano."
        ],
        "title": "3. Níveis de acesso"
      },
      {
        "paragraphs": [
          "Se você receber uma avaliação gratuita de recursos Premium:",
          "As avaliações são temporárias e expiram automaticamente quando o período de teste termina",
          "A duração da avaliação pode variar e é determinada pelo SwitchControl",
          "As avaliações podem ser concedidas manualmente pelo SwitchControl a seu critério",
          "Uma avaliação não garante acesso Premium contínuo após a expiração",
          "Quando uma avaliação expira, sua conta reverte para o acesso padrão Free, a menos que você tenha comprado o Premium"
        ],
        "title": "4. Avaliações gratuitas (Free trials)"
      },
      {
        "paragraphs": [
          "A compra do Premium concede a você uma licença pessoal e intransferível para acessar recursos Premium sob os termos em vigor no momento da compra. Preços, modelos de acesso, direitos e conjuntos de recursos podem mudar ao longo do tempo. O SwitchControl não garante que qualquer recurso específico permanecerá disponível indefinidamente. Você não pode revender, transferir ou compartilhar seu acesso com terceiros, a menos que explicitamente permitido."
        ],
        "title": "5. Acesso Premium e licenciamento"
      },
      {
        "paragraphs": [
          "O SwitchControl concede a você um direito limitado, pessoal, não exclusivo e intransferível de usar o software e o serviço para seus próprios fins. Todos os direitos não concedidos expressamente estão reservados."
        ],
        "title": "6. Licença e acesso geral"
      },
      {
        "paragraphs": [
          "Você concorda em não:",
          "Usar o serviço para qualquer finalidade ilegal",
          "Tentar fazer engenharia reversa, descompilar ou extrair o código-fonte ou a lógica do serviço",
          "Tentar ignorar, contornar ou adulterar sistemas de direitos, licenciamento ou controle de acesso",
          "Usar ferramentas automatizadas, bots ou scripts para abusar ou sobrecarregar o serviço",
          "Interferir no serviço ou degradar a experiência de outros usuários",
          "Tentar acesso não autorizado a contas, sistemas ou dados que não lhe pertencem",
          "Fazer upload, transmitir ou introduzir malware ou código prejudicial",
          "Deturpar sua identidade ou status de conta"
        ],
        "title": "7. Uso aceitável"
      },
      {
        "paragraphs": [
          "O SwitchControl pode tomar as seguintes ações em qualquer conta como parte das operações normais da plataforma:",
          "Conceder, modificar ou revogar níveis de acesso (Free, Trial, Premium)",
          "Redefinir sinalizadores do produto, como o status de integração",
          "Investigar suspeitas de abuso, fraude ou violações de política",
          "Suspender ou encerrar o acesso quando necessário (consulte a Seção 9)",
          "Processar solicitações de exclusão de conta",
          "Responder a requisitos legais, de segurança ou de suporte",
          "Essas ações são tomadas apenas por motivos operacionais ou de segurança legítimos e são registradas."
        ],
        "title": "8. Ações administrativas da conta"
      },
      {
        "paragraphs": [
          "O SwitchControl pode suspender ou encerrar seu acesso, com ou sem aviso prévio, se determinarmos razoavelmente que você violou estes Termos de Serviço, se envolveu em comportamento fraudulento, abusivo ou enganoso, tentou adulterar ou contornar controles de acesso ou sistemas de direitos, representou um risco de segurança para o serviço ou outros usuários, ou usou o serviço de uma forma que cause dano ou exposição legal. Se sua conta for suspensa ou encerrada por justa causa, você não terá direito a reembolso."
        ],
        "title": "9. Suspensão e rescisão"
      },
      {
        "paragraphs": [
          "O SwitchControl pode modificar as configurações do Windows, preferências do sistema, configuração de inicialização, parâmetros de rede e perfis de energia, dependendo dos recursos que você usar. Você é responsável por usar o software com cuidado e entender o que cada recurso faz antes de aplicá-lo. O SwitchControl não é responsável por instabilidade do sistema, perda de dados ou outros problemas que possam surgir da aplicação de alterações ao seu sistema. Sempre faça backup de dados importantes antes de usar ferramentas de otimização."
        ],
        "title": "10. Mudanças no sistema e riscos"
      },
      {
        "paragraphs": [
          "O SwitchControl não garante resultados de desempenho específicos. Os resultados variam com base na configuração do hardware, software instalado, drivers, condições de rede e muitos outros fatores fora do nosso controle. Isso inclui, mas não se limita a: FPS, frame time, latência de entrada, ping, estabilidade de rede, velocidade de inicialização e capacidade de resposta geral do sistema. Recomendações geradas por IA e saídas do AI Advisor e BIOS Advisor são fornecidas apenas como orientação informativa; não há garantia de que sejam precisas ou adequadas para todos os sistemas."
        ],
        "title": "11. Sem resultados garantidos"
      },
      {
        "paragraphs": [
          "Todos os preços são exibidos no checkout antes de você concluir uma compra. Os pagamentos são processados com segurança pelo nosso processador de pagamentos terceirizado.",
          "Todas as vendas são finais, a menos que um reembolso seja expressamente oferecido pelo SwitchControl ou exigido pela lei aplicável",
          "Impostos podem ser aplicados com base na sua localização e nas regras do provedor de pagamento",
          "Se você acredita que uma cobrança está incorreta, entre em contato conosco prontamente"
        ],
        "title": "12. Pagamentos e reembolsos"
      },
      {
        "paragraphs": [
          "Alguns recursos dependem de provedores terceirizados, incluindo processadores de pagamento, serviços de autenticação e infraestrutura de hospedagem. Seus termos e políticas de privacidade também podem se aplicar ao seu uso desses serviços. O SwitchControl não é responsável pela conduta ou políticas de terceiros."
        ],
        "title": "13. Serviços de terceiros"
      },
      {
        "paragraphs": [
          "Todos os direitos sobre o software, marca, design, conteúdo e serviços do SwitchControl são de propriedade do SwitchControl. Nada nestes termos transfere qualquer propriedade para você. Você não pode reproduzir, distribuir ou criar trabalhos derivados de qualquer parte do SwitchControl sem permissão por escrito explicitamente concedida."
        ],
        "title": "14. Propriedade intelectual"
      },
      {
        "paragraphs": [
          "Na extensão máxima permitida por lei, o SwitchControl não é responsável por danos indiretos, incidentais, especiais, consequenciais ou punitivos, incluindo, mas não se limitando a, perda de dados, perda de lucro ou danos ao sistema, decorrentes do uso ou da incapacidade de usar o serviço."
        ],
        "title": "15. Limitação de responsabilidade"
      },
      {
        "paragraphs": [
          "O SwitchControl pode atualizar recursos, preços, níveis de acesso e a estrutura do serviço a qualquer momento. Também podemos atualizar estes termos e nossa Política de Privacidade. Quando fizermos alterações importantes, atualizaremos a data de “Última atualização”. O uso continuado do serviço após a entrada em vigor das alterações constitui aceitação dos termos atualizados."
        ],
        "title": "16. Mudanças no serviço e nestes termos"
      },
      {
        "paragraphs": [
          "Para perguntas sobre estes termos, entre em contato conosco em switchcontrol67@gmail.com"
        ],
        "title": "17. Contato"
      }
    ]
  },
  "bn": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl শুধুমাত্র তখনই তথ্য সংগ্রহ এবং ব্যবহার করে যখন পণ্য সরবরাহ, অ্যাকাউন্ট পরিচালনা, ব্যবহারকারীদের সহায়তা, প্রতারণা রোধ এবং নিরাপত্তা বজায় রাখার প্রয়োজন হয়। এই নীতিটি ব্যাখ্যা করে যে আমরা কী সংগ্রহ করি, কেন করি এবং কীভাবে এটি পরিচালনা করা হয়।"
        ],
        "title": "1. পরিচিতি"
      },
      {
        "paragraphs": [
          "আপনি যখন সাইন ইন করেন, আমরা সংরক্ষণ করি:"
        ],
        "title": "2. অ্যাকাউন্টের ডেটা"
      },
      {
        "paragraphs": [
          "পণ্যটি যাতে সঠিক ফিচার প্রদান করতে পারে সেজন্য আমরা আপনার অ্যাক্সেস অবস্থা সম্পর্কে তথ্য সংরক্ষণ করি। এর মধ্যে অন্তর্ভুক্ত:"
        ],
        "title": "3. এনটাইটেলমেন্ট এবং অ্যাক্সেস ডেটা"
      },
      {
        "paragraphs": [
          "পণ্য কার্যকারিতা, নিরাপত্তা এবং অ্যাকাউন্ট পরিচালনার সুবিধার্থে, আমরা রেকর্ড করতে পারি:"
        ],
        "title": "4. অ্যাপ এবং ডিভাইসের কার্যকলাপের ডেটা"
      },
      {
        "paragraphs": [
          "ডেস্কটপ অ্যাপ ব্যবহার করার সময়, SwitchControl এর অপ্টিমাইজেশন, বিশ্লেষণ এবং উপদেষ্টা ফিচারগুলোকে শক্তি দেওয়ার জন্য হার্ডওয়্যার এবং সিস্টেম তথ্যে অ্যাক্সেস করতে পারে। এর মধ্যে অন্তর্ভুক্ত:"
        ],
        "title": "5. সিস্টেম এবং টেলিমেট্রি ডেটা"
      },
      {
        "paragraphs": [
          "অনুমোদিত SwitchControl অ্যাডমিনিস্ট্রেটররা বৈধ অপারেশনাল উদ্দেশ্যে অ্যাকাউন্টের ডেটা অ্যাক্সেস করতে পারেন, যার মধ্যে রয়েছে:"
        ],
        "title": "6. প্রশাসনিক অ্যাক্সেস"
      },
      {
        "paragraphs": [
          "আমরা আমাদের কাছে থাকা ডেটা ব্যবহার করি:"
        ],
        "title": "7. আমরা কীভাবে আপনার ডেটা ব্যবহার করি"
      },
      {
        "paragraphs": [
          "আমরা পরিষেবাটি পরিচালনায় সাহায্যকারী বিশ্বস্ত তৃতীয় পক্ষের সাথে ডেটা শেয়ার করতে পারি:"
        ],
        "title": "8. শেয়ারিং এবং পরিষেবা প্রদানকারী"
      },
      {
        "paragraphs": [
          "আপনাকে সাইন ইন রাখা এবং বিভিন্ন ভিজিটের সময় আপনার অ্যাক্সেস অবস্থা বজায় রাখার জন্য আমরা কুকি এবং সেশন টোকেন ব্যবহার করি। এগুলি শুধুমাত্র পরিষেবার কাজ করার জন্য প্রয়োজনীয় বিষয়ের মধ্যে সীমাবদ্ধ।"
        ],
        "title": "9. কুকিজ এবং সেশন স্টোরেজ"
      },
      {
        "paragraphs": [
          "আমরা নিম্নলিখিত উদ্দেশ্যে যতক্ষণ প্রয়োজন ততক্ষণ আপনার ডেটা ধরে রাখি:"
        ],
        "title": "10. ডেটা ধারণ"
      },
      {
        "paragraphs": [
          "অ্যাকাউন্ট ডেটা সুরক্ষিত রাখতে আমরা যুক্তিসঙ্গত প্রযুক্তিগত এবং সাংগঠনিক সুরক্ষা ব্যবস্থা ব্যবহার করি। কোনো সিস্টেমই ঝুঁকির ঊর্ধ্বে নয়। আপনি যদি মনে করেন আপনার অ্যাকাউন্ট কম্প্রোমাইজড হয়েছে, তবে অবিলম্বে আমাদের সাথে যোগাযোগ করুন।"
        ],
        "title": "11. নিরাপত্তা"
      },
      {
        "paragraphs": [
          "আপনার অবস্থানের উপর ভিত্তি করে, আপনার নিম্নলিখিত অধিকার থাকতে পারে:"
        ],
        "title": "12. আপনার অধিকার এবং অ্যাকাউন্ট মুছে ফেলা"
      },
      {
        "paragraphs": [
          "SwitchControl এমন কারো ব্যবহারের জন্য নয় যারা তাদের এখতিয়ারে আইনিভাবে চুক্তিতে আবদ্ধ হতে অক্ষম, অথবা যারা উপযুক্ত অভিভাবকের অনুমতি ছাড়া ন্যূনতম প্রয়োজনীয় বয়সের নিচে। যদি আপনি মনে করেন যে কোনো নাবালক অনুমতি ছাড়া ব্যক্তিগত ডেটা প্রদান করেছে, তবে আমাদের সাথে যোগাযোগ করুন যাতে আমরা তা মুছে ফেলতে পারি।"
        ],
        "title": "13. বয়সের প্রয়োজনীয়তা"
      },
      {
        "paragraphs": [
          "গোপনীয়তা সংক্রান্ত প্রশ্ন, ডেটা অনুরোধ বা উদ্বেগের জন্য, আমাদের সাথে যোগাযোগ করুন switchcontrol67@gmail.com"
        ],
        "title": "14. যোগাযোগ"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl এমন সফটওয়্যার এবং পরিষেবা প্রদান করে যা ব্যবহারকারীদের Windows পিসি সেটিংস এবং সিস্টেম কর্মক্ষমতা কনফিগার, অপ্টিমাইজ এবং বিশ্লেষণ করতে সহায়তা করে। SwitchControl ব্যবহার করে, আপনি এই শর্তাবলীতে সম্মত হচ্ছেন। আপনি যদি সম্মত না হন তবে পরিষেবাটি ব্যবহার করবেন না।"
        ],
        "title": "1. পরিচিতি"
      },
      {
        "paragraphs": [
          "আপনার এখতিয়ারে আইনত বাধ্যতামূলক চুক্তি করার ক্ষমতা থাকতে হবে। আপনার বয়স যদি ন্যূনতম প্রয়োজনীয় বয়সের নিচে হয়, তবে আপনার অবশ্যই অভিভাবকের অনুমতি থাকতে হবে। SwitchControl ব্যবহার করে, আপনি নিশ্চিত করছেন যে আপনি এই প্রয়োজনীয়তাগুলি পূরণ করেন।"
        ],
        "title": "2. যোগ্যতা"
      },
      {
        "paragraphs": [
          "SwitchControl তিনটি অ্যাক্সেস স্তর অফার করে: Free, কোনো খরচ ছাড়াই নির্বাচিত ফিচারে প্রাথমিক অ্যাক্সেস; Trial, সীমিত সময়ের জন্য Premium ফিচারে অস্থায়ী অ্যাক্সেস; এবং Premium, ক্রয়ের মাধ্যমে আনলক করা সম্পূর্ণ ফিচার অ্যাক্সেস। প্রতিটি স্তরের ফিচার সময়ের সাথে পরিবর্তিত হতে পারে। SwitchControl প্রতিটি প্ল্যানে কী অন্তর্ভুক্ত থাকবে তা সমন্বয় করার অধিকার সংরক্ষণ করে।"
        ],
        "title": "3. অ্যাক্সেস স্তর"
      },
      {
        "paragraphs": [
          "আপনি যদি Premium ফিচারের একটি ফ্রি ট্রায়াল পান:"
        ],
        "title": "4. ফ্রি ট্রায়াল"
      },
      {
        "paragraphs": [
          "Premium ক্রয় আপনাকে ক্রয়ের সময় কার্যকর শর্তাবলির অধীনে Premium ফিচার অ্যাক্সেস করার জন্য একটি ব্যক্তিগত, হস্তান্তর অযোগ্য লাইসেন্স প্রদান করে। মূল্য, অ্যাক্সেস মডেল, এনটাইটেলমেন্ট এবং ফিচার সেট সময়ের সাথে পরিবর্তিত হতে পারে। SwitchControl নিশ্চিত করে না যে কোনো নির্দিষ্ট ফিচার অনির্দিষ্টকালের জন্য উপলব্ধ থাকবে। স্পষ্টভাবে অনুমতি না থাকলে আপনি আপনার অ্যাক্সেস পুনরায় বিক্রি, হস্তান্তর বা অন্যদের সাথে শেয়ার করতে পারবেন না।"
        ],
        "title": "5. Premium অ্যাক্সেস এবং লাইসেন্সিং"
      },
      {
        "paragraphs": [
          "SwitchControl আপনাকে আপনার নিজের প্রয়োজনের জন্য সফটওয়্যার এবং পরিষেবা ব্যবহার করার জন্য একটি সীমিত, ব্যক্তিগত, অ-এক্সক্লুসিভ, হস্তান্তর অযোগ্য অধিকার প্রদান করে। স্পষ্টভাবে প্রদত্ত নয় এমন সমস্ত অধিকার সংরক্ষিত।"
        ],
        "title": "6. লাইসেন্স এবং সাধারণ অ্যাক্সেস"
      },
      {
        "paragraphs": [
          "আপনি নিম্নলিখিত কাজগুলো না করতে সম্মত হচ্ছেন:"
        ],
        "title": "7. গ্রহণযোগ্য ব্যবহার"
      },
      {
        "paragraphs": [
          "SwitchControl সাধারণ প্ল্যাটফর্ম অপারেশনের অংশ হিসেবে যেকোনো অ্যাকাউন্টে নিম্নলিখিত পদক্ষেপ নিতে পারে:"
        ],
        "title": "8. প্রশাসনিক অ্যাকাউন্টের কাজ"
      },
      {
        "paragraphs": [
          "আমরা যদি যৌক্তিকভাবে নির্ধারণ করি যে আপনি এই পরিষেবার শর্তাবলী লঙ্ঘন করেছেন, প্রতারণামূলক বা আপত্তিজনক আচরণে লিপ্ত হয়েছেন, অ্যাক্সেস কন্ট্রোল বা এনটাইটেলমেন্ট সিস্টেম বাইপাস করার চেষ্টা করেছেন, পরিষেবা বা অন্যান্য ব্যবহারকারীদের জন্য নিরাপত্তার ঝুঁকি তৈরি করেছেন, অথবা এমনভাবে পরিষেবাটি ব্যবহার করেছেন যা ক্ষতি বা আইনি দায় সৃষ্টি করে, তবে SwitchControl নোটিশ সহ বা ছাড়াই আপনার অ্যাক্সেস স্থগিত বা বন্ধ করতে পারে। কারণ দর্শিয়ে আপনার অ্যাকাউন্ট স্থগিত বা বন্ধ করা হলে, আপনি রিফান্ড পাওয়ার অধিকারী নন।"
        ],
        "title": "9. সাসপেনশন এবং টার্মিনেশন"
      },
      {
        "paragraphs": [
          "আপনার ব্যবহৃত ফিচারের উপর ভিত্তি করে SwitchControl Windows সেটিংস, সিস্টেম পছন্দ, স্টার্টআপ কনফিগারেশন, নেটওয়ার্ক প্যারামিটার এবং পাওয়ার প্রোফাইল পরিবর্তন করতে পারে। সফটওয়্যারটি সাবধানে ব্যবহার করা এবং প্রতিটি ফিচার প্রয়োগ করার আগে তা কী কাজ করে তা বোঝা আপনার দায়িত্ব। আপনার সিস্টেমে পরিবর্তন প্রয়োগের ফলে সিস্টেম অস্থিতিশীলতা, ডেটা হারানো বা অন্যান্য সমস্যা দেখা দিলে তার জন্য SwitchControl দায়ী নয়। অপ্টিমাইজেশন টুল ব্যবহার করার আগে সবসময় গুরুত্বপূর্ণ ডেটার ব্যাকআপ নিন।"
        ],
        "title": "10. সিস্টেম পরিবর্তন এবং ঝুঁকি"
      },
      {
        "paragraphs": [
          "SwitchControl কোনো নির্দিষ্ট কর্মক্ষমতা ফলাফলের নিশ্চয়তা দেয় না। হার্ডওয়্যার কনফিগারেশন, ইনস্টল করা সফটওয়্যার, ড্রাইভার, নেটওয়ার্ক পরিস্থিতি এবং আমাদের নিয়ন্ত্রণের বাইরের অন্যান্য অনেক বিষয়ের উপর ভিত্তি করে ফলাফল পরিবর্তিত হয়। এর মধ্যে অন্তর্ভুক্ত কিন্তু সীমাবদ্ধ নয়: FPS, ফ্রেম টাইম, ইনপুট ল্যাটেন্সি, পিং, নেটওয়ার্ক স্ট্যাবিলিটি, বুট স্পিড এবং সাধারণ সিস্টেম রেসপন্সিভনেস। AI Advisor এবং BIOS Advisor-এর আউটপুট শুধুমাত্র তথ্যমূলক নির্দেশিকা হিসেবে প্রদান করা হয়, এগুলি সঠিক বা প্রতিটি সিস্টেমের জন্য উপযুক্ত হওয়ার নিশ্চয়তা নেই।"
        ],
        "title": "11. কোনো ফলাফল নিশ্চিত নয়"
      },
      {
        "paragraphs": [
          "ক্রয় সম্পূর্ণ করার আগে চেকআউটে সমস্ত মূল্য দেখানো হয়। পেমেন্ট আমাদের তৃতীয় পক্ষের পেমেন্ট প্রসেসর দ্বারা নিরাপদে পরিচালনা করা হয়।"
        ],
        "title": "12. পেমেন্ট এবং রিফান্ড"
      },
      {
        "paragraphs": [
          "কিছু ফিচার পেমেন্ট প্রসেসর, অথেন্টিকেশন পরিষেবা এবং হোস্টিং অবকাঠামো সহ তৃতীয় পক্ষের প্রদানকারীদের উপর নির্ভর করে। সেই পরিষেবাগুলি ব্যবহারের ক্ষেত্রে তাদের শর্তাবলী এবং গোপনীয়তা নীতি প্রযোজ্য হতে পারে। তৃতীয় পক্ষের আচরণ বা নীতির জন্য SwitchControl দায়ী নয়।"
        ],
        "title": "13. তৃতীয় পক্ষের পরিষেবা"
      },
      {
        "paragraphs": [
          "SwitchControl সফটওয়্যার, ব্র্যান্ড, ডিজাইন, কন্টেন্ট এবং পরিষেবার সমস্ত অধিকার SwitchControl-এর মালিকানাধীন। এই শর্তাবলীর কোনো কিছুই আপনার কাছে কোনো মালিকানা স্থানান্তর করে না। আপনি স্পষ্টভাবে লিখিত অনুমতি ছাড়া SwitchControl-এর কোনো অংশ থেকে ডেরিভেটিভ কাজ তৈরি, বিতরণ বা পুনরুত্পাদন করতে পারবেন না।"
        ],
        "title": "14. মেধা সম্পত্তি"
      },
      {
        "paragraphs": [
          "আইন দ্বারা অনুমোদিত সর্বাধিক সীমা পর্যন্ত, পরিষেবা ব্যবহার বা ব্যবহারের অক্ষমতা থেকে উদ্ভূত ডেটা হারানো, মুনাফা হারানো বা সিস্টেমের ক্ষতি সহ কোনো পরোক্ষ, আনুষঙ্গিক, বিশেষ, ফলাফলগত বা শাস্তিমূলক ক্ষতির জন্য SwitchControl দায়ী নয়।"
        ],
        "title": "15. দায়বদ্ধতার সীমাবদ্ধতা"
      },
      {
        "paragraphs": [
          "SwitchControl যেকোনো সময় ফিচার, মূল্য, অ্যাক্সেস স্তর এবং পরিষেবার কাঠামো আপডেট করতে পারে। আমরা এই শর্তাবলী এবং আমাদের গোপনীয়তা নীতিও আপডেট করতে পারি। আমরা যখন গুরুত্বপূর্ণ পরিবর্তন করি, তখন আমরা “Last updated” তারিখ আপডেট করব। পরিবর্তনের পর পরিষেবাটি ব্যবহার চালিয়ে যাওয়া মানে হলো আপডেট করা শর্তাবলী মেনে নেওয়া।"
        ],
        "title": "16. পরিষেবা এবং এই শর্তাবলীতে পরিবর্তন"
      },
      {
        "paragraphs": [
          "এই শর্তাবলী সম্পর্কে প্রশ্নের জন্য, আমাদের সাথে যোগাযোগ করুন switchcontrol67@gmail.com"
        ],
        "title": "17. যোগাযোগ"
      }
    ]
  },
  "ru": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl собирает и использует информацию только там, где это необходимо для предоставления продукта, управления аккаунтами, поддержки пользователей, предотвращения мошенничества и обеспечения безопасности. Эта политика объясняет, что мы собираем, зачем и как это обрабатывается."
        ],
        "title": "1. Обзор"
      },
      {
        "paragraphs": [
          "Когда вы входите в систему, мы сохраняем:",
          "Ваш адрес электронной почты",
          "Ваше отображаемое имя, если оно предоставлено вашим провайдером аутентификации",
          "Уникальный идентификатор аккаунта",
          "Метаданные аутентификации, необходимые для управления вашей сессией входа (такие как токены провайдера OAuth)"
        ],
        "title": "2. Данные аккаунта"
      },
      {
        "paragraphs": [
          "Мы храним информацию о вашем статусе доступа, чтобы продукт мог предоставлять правильные функции. Это включает:",
          "Ваш текущий план (Free, Trial, или Premium)",
          "Дата начала, дата окончания и длительность пробного периода, если он был активирован",
          "Активация Premium и статус оплаты",
          "Завершили ли вы ознакомительные туры или потоки первичной настройки",
          "Флаги доступа к функциям, используемые для определения того, что вы можете видеть и использовать"
        ],
        "title": "3. Данные о правах и доступе"
      },
      {
        "paragraphs": [
          "Для поддержки функциональности продукта, безопасности и управления аккаунтом мы можем записывать:",
          "Время вашего последнего входа",
          "Последнее время, когда настольное приложение было активно на вашем устройстве",
          "Было ли приложение установлено и использовалось",
          "События активности аккаунта или администратора, важные для безопасности, поддержки и предотвращения мошенничества",
          "Мы не записываем нажатия клавиш, личные файлы, содержимое буфера обмена или полную историю просмотра."
        ],
        "title": "4. Данные об активности приложения и устройства"
      },
      {
        "paragraphs": [
          "При использовании настольного приложения SwitchControl может получать доступ к информации об оборудовании и системе для работы своих функций оптимизации, анализа и рекомендаций. Это включает:",
          "Информацию о профиле оборудования (CPU, GPU, RAM, накопитель), используемую функциями оптимизации и рекомендаций",
          "Системные показатели в реальном времени (нагрузка на CPU, использование памяти, нагрузка на GPU), отображаемые на панели управления",
          "Диагностические данные, используемые AI Advisor и BIOS Advisor для генерации рекомендаций",
          "Данные о конфигурации сети, используемые функциями оптимизации сети",
          "Эти данные используются локально для работы функций приложения. Мы собираем только то, что необходимо для предоставления функциональности, анализа и поддержки, и ничего больше."
        ],
        "title": "5. Системные данные и телеметрия"
      },
      {
        "paragraphs": [
          "Авторизованные администраторы SwitchControl могут получать доступ к данным на уровне аккаунта для законных операционных целей, включая:",
          "Предоставление или отзыв пробного или премиум доступа",
          "Обновление статуса подписки или плана",
          "Сброс флагов продукта, таких как завершение ознакомления",
          "Обработку запросов на удаление аккаунта",
          "Расследование сообщений о злоупотреблениях, мошенничестве или нарушениях политики",
          "Предоставление поддержки аккаунта",
          "Административные действия протоколируются для целей подотчетности и безопасности."
        ],
        "title": "6. Административный доступ"
      },
      {
        "paragraphs": [
          "Мы используем хранящиеся у нас данные, чтобы:",
          "Создавать и управлять вашим аккаунтом",
          "Предоставлять функции, на которые дает право ваш план",
          "Обеспечивать работу функций оптимизации, рекомендаций и диагностики в приложении",
          "Обрабатывать и проверять платежи",
          "Предотвращать мошенничество, злоупотребления и несанкционированный доступ",
          "Предоставлять клиентскую и техническую поддержку",
          "Соблюдать юридические обязательства"
        ],
        "title": "7. Как мы используем ваши данные"
      },
      {
        "paragraphs": [
          "Мы можем передавать данные доверенным третьим лицам, которые помогают управлять сервисом:",
          "Процессорам платежей для завершения и проверки покупок",
          "Провайдерам аутентификации, таким как Google, для обработки входа в систему",
          "Провайдерам хостинга и инфраструктуры для запуска и предоставления сервиса",
          "Мы не продаем вашу личную информацию. Мы не передаем данные в рекламных целях."
        ],
        "title": "8. Передача данных и сторонние провайдеры"
      },
      {
        "paragraphs": [
          "Мы используем файлы cookie и токены сессий, чтобы вы оставались в системе и поддерживали состояние доступа между посещениями. Они ограничиваются тем, что необходимо для функционирования сервиса."
        ],
        "title": "9. Cookies и хранение сессий"
      },
      {
        "paragraphs": [
          "Мы храним ваши данные столько, сколько это обоснованно необходимо для следующих целей:",
          "Предоставления и поддержки продукта",
          "Ведения записей о биллинге и оплатах",
          "Предотвращения мошенничества и безопасности",
          "Выполнения юридических или регуляторных обязательств",
          "Разрешения споров или обработки случаев поддержки",
          "Ведения аудиторских записей, где это операционно необходимо",
          "Если вы запрашиваете удаление своего аккаунта, мы удалим ваши данные при условии соблюдения любых требований по юридическому или безопасному хранению."
        ],
        "title": "10. Хранение данных"
      },
      {
        "paragraphs": [
          "Мы используем разумные технические и организационные меры для защиты данных аккаунта. Ни одна система не застрахована от рисков полностью. Если вы считаете, что ваш аккаунт был скомпрометирован, немедленно свяжитесь с нами."
        ],
        "title": "11. Безопасность"
      },
      {
        "paragraphs": [
          "В зависимости от вашего местоположения вы можете иметь право на:",
          "Запрос копии данных, которые мы храним о вас",
          "Запрос исправления неточных данных",
          "Запрос на удаление вашего аккаунта и связанных данных",
          "Возражение или ограничение определенных видов использования ваших данных",
          "Чтобы сделать любой из этих запросов, напишите нам на switchcontrol67@gmail.com. Мы ответим оперативно. Обратите внимание, что некоторые данные могут быть сохранены после удаления, если это требуется законом или операционно (например, платежные записи или журналы безопасности)."
        ],
        "title": "12. Ваши права и удаление аккаунта"
      },
      {
        "paragraphs": [
          "SwitchControl не предназначен для использования никем, кто не может юридически заключить обязательное соглашение в своей юрисдикции, или кто не достиг минимального требуемого возраста без надлежащего разрешения родителя или опекуна. Если вы считаете, что несовершеннолетний предоставил личные данные без разрешения, свяжитесь с нами, чтобы мы могли удалить их."
        ],
        "title": "13. Возрастные требования"
      },
      {
        "paragraphs": [
          "По вопросам конфиденциальности, запросам данных или опасениям свяжитесь с нами по адресу switchcontrol67@gmail.com"
        ],
        "title": "14. Контакт"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl предоставляет программное обеспечение и услуги, разработанные для помощи пользователям в настройке, оптимизации и анализе параметров Windows PC и производительности системы. Используя SwitchControl, вы соглашаетесь с настоящими условиями. Если вы не согласны, не используйте этот сервис."
        ],
        "title": "1. Обзор"
      },
      {
        "paragraphs": [
          "Вы должны иметь возможность заключать юридически обязательное соглашение в вашей юрисдикции. Если вы не достигли минимально требуемого возраста, вы должны получить разрешение от родителя или опекуна. Используя SwitchControl, вы подтверждаете, что соответствуете этим требованиям."
        ],
        "title": "2. Соответствие требованиям"
      },
      {
        "paragraphs": [
          "SwitchControl предлагает три состояния доступа: Free, базовый доступ к выбранным функциям бесплатно; Trial, временный доступ к функциям Premium на ограниченный срок; и Premium, полный доступ к функциям, открываемый через покупку. Функции, доступные на каждом уровне, могут меняться со временем. SwitchControl оставляет за собой право корректировать содержание каждого плана."
        ],
        "title": "3. Уровни доступа"
      },
      {
        "paragraphs": [
          "Если вы получаете бесплатную пробную версию функций Premium:",
          "Пробные версии являются временными и истекают автоматически по окончании пробного периода",
          "Длительность пробной версии может варьироваться и определяется SwitchControl",
          "Пробные версии могут быть предоставлены вручную SwitchControl по его усмотрению",
          "Пробная версия не гарантирует сохранение доступа к Premium после ее истечения",
          "Когда срок действия пробной версии истекает, ваш аккаунт возвращается к стандартному доступу Free, если вы не приобрели Premium"
        ],
        "title": "4. Бесплатные пробные версии"
      },
      {
        "paragraphs": [
          "Покупка Premium предоставляет вам персональную, непередаваемую лицензию на доступ к функциям Premium в соответствии с условиями, действующими на момент покупки. Ценообразование, модели доступа, права и наборы функций могут меняться со временем. SwitchControl не гарантирует, что какая-либо конкретная функция будет оставаться доступной неопределенно долго. Вы не можете перепродавать, передавать или предоставлять общий доступ к своему доступу другим лицам, если это не разрешено явно."
        ],
        "title": "5. Доступ Premium и лицензирование"
      },
      {
        "paragraphs": [
          "SwitchControl предоставляет вам ограниченное, персональное, неисключительное, непередаваемое право использовать программное обеспечение и сервис для ваших собственных целей. Все права, которые не предоставлены явно, сохраняются."
        ],
        "title": "6. Лицензия и общий доступ"
      },
      {
        "paragraphs": [
          "Вы соглашаетесь не:",
          "Использовать сервис для любых незаконных целей",
          "Пытаться проводить обратный инжиниринг, декомпилировать или извлекать исходный код или логику сервиса",
          "Пытаться обойти, обмануть или вмешаться в работу систем прав, лицензирования или контроля доступа",
          "Использовать автоматизированные инструменты, ботов или скрипты для злоупотребления или перегрузки сервиса",
          "Мешать работе сервиса или ухудшать опыт других пользователей",
          "Пытаться получить несанкционированный доступ к аккаунтам, системам или данным, которые вам не принадлежат",
          "Загружать, передавать или внедрять вредоносное ПО или вредоносный код",
          "Искажать свою личность или статус аккаунта"
        ],
        "title": "7. Допустимое использование"
      },
      {
        "paragraphs": [
          "SwitchControl может предпринимать следующие действия в отношении любого аккаунта в рамках обычных операций платформы:",
          "Предоставлять, изменять или отзывать уровни доступа (Free, Trial, Premium)",
          "Сбрасывать флаги продукта, такие как статус ознакомления",
          "Расследовать подозрения в злоупотреблениях, мошенничестве или нарушениях политики",
          "Приостанавливать или прекращать доступ при необходимости (см. Раздел 9)",
          "Обрабатывать запросы на удаление аккаунта",
          "Реагировать на юридические требования, требования безопасности или поддержки",
          "Эти действия предпринимаются только по законным операционным причинам или причинам безопасности и протоколируются."
        ],
        "title": "8. Административные действия с аккаунтом"
      },
      {
        "paragraphs": [
          "SwitchControl может приостановить или прекратить ваш доступ, с уведомлением или без него, если мы обоснованно определим, что вы нарушили настоящие Условия обслуживания, занимались мошенническим, оскорбительным или обманным поведением, пытались вмешаться в работу или обойти средства контроля доступа или системы прав, создали угрозу безопасности для сервиса или других пользователей, или использовали сервис способом, который вызывает вред или юридические риски. Если ваш аккаунт приостановлен или прекращен по причине, вы не имеете права на возврат средств."
        ],
        "title": "9. Приостановка и прекращение доступа"
      },
      {
        "paragraphs": [
          "SwitchControl может изменять настройки Windows, системные предпочтения, конфигурацию автозагрузки, параметры сети и профили электропитания в зависимости от используемых вами функций. Вы несете ответственность за осторожное использование программного обеспечения и понимание того, что делает каждая функция перед ее применением. SwitchControl не несет ответственности за системную нестабильность, потерю данных или другие проблемы, которые могут возникнуть в результате внесения изменений в вашу систему. Всегда делайте резервную копию важных данных перед использованием инструментов оптимизации."
        ],
        "title": "10. Системные изменения и риски"
      },
      {
        "paragraphs": [
          "SwitchControl не гарантирует конкретных результатов производительности. Результаты варьируются в зависимости от конфигурации оборудования, установленного ПО, драйверов, условий сети и многих других факторов вне нашего контроля. Это включает, но не ограничивается: FPS, время кадра, задержку ввода, пинг, стабильность сети, скорость загрузки и общую отзывчивость системы. Рекомендации, сгенерированные AI Advisor и BIOS Advisor, предоставляются только в качестве информационного руководства, они не гарантируются как точные или подходящие для каждой системы."
        ],
        "title": "11. Нет гарантии результатов"
      },
      {
        "paragraphs": [
          "Все цены отображаются при оформлении заказа до завершения покупки. Платежи обрабатываются безопасно нашим сторонним процессором платежей.",
          "Все продажи являются окончательными, если возврат средств не предложен явно SwitchControl или не требуется применимым законодательством",
          "Могут применяться налоги в зависимости от вашего местоположения и правил платежного провайдера",
          "Если вы считаете, что списание произошло ошибочно, немедленно свяжитесь с нами"
        ],
        "title": "12. Платежи и возвраты"
      },
      {
        "paragraphs": [
          "Некоторые функции полагаются на сторонних провайдеров, включая процессоры платежей, службы аутентификации и инфраструктуру хостинга. Их условия и политики конфиденциальности также могут применяться к использованию вами этих сервисов. SwitchControl не несет ответственности за действия или политики третьих лиц."
        ],
        "title": "13. Сторонние сервисы"
      },
      {
        "paragraphs": [
          "Все права на программное обеспечение, бренд, дизайн, контент и услуги SwitchControl принадлежат SwitchControl. Ничто в настоящих условиях не передает вам право собственности. Вы не можете воспроизводить, распространять или создавать производные работы из любой части SwitchControl без явного письменного разрешения."
        ],
        "title": "14. Интеллектуальная собственность"
      },
      {
        "paragraphs": [
          "В максимальной степени, разрешенной законом, SwitchControl не несет ответственности за косвенные, случайные, особые, последующие или штрафные убытки, включая, но не ограничиваясь, потерю данных, потерю прибыли или повреждение системы, возникающие в результате вашего использования или невозможности использования сервиса."
        ],
        "title": "15. Ограничение ответственности"
      },
      {
        "paragraphs": [
          "SwitchControl может обновлять функции, цены, уровни доступа и структуру сервиса в любое время. Мы также можем обновлять настоящие условия и нашу Политику конфиденциальности. Когда мы вносим существенные изменения, мы обновляем дату «Последнего обновления». Продолжение использования сервиса после вступления изменений в силу означает принятие обновленных условий."
        ],
        "title": "16. Изменения в сервисе и настоящих условиях"
      },
      {
        "paragraphs": [
          "По вопросам об этих условиях свяжитесь с нами по адресу switchcontrol67@gmail.com"
        ],
        "title": "17. Контакт"
      }
    ]
  },
  "ja": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControlは、製品の提供、アカウントの管理、ユーザーのサポート、不正防止、セキュリティ維持に必要な場合にのみ情報を収集・使用します。本ポリシーでは、何を収集し、なぜ収集し、どのように取り扱われるかを説明します。"
        ],
        "title": "1. 概要"
      },
      {
        "paragraphs": [
          "サインイン時に、以下の情報を保存します："
        ],
        "title": "2. アカウントデータ"
      },
      {
        "paragraphs": [
          "製品が適切な機能を提供できるように、お客様のアクセス状態に関する情報を保存します。これには以下が含まれます："
        ],
        "title": "3. 権限およびアクセスデータ"
      },
      {
        "paragraphs": [
          "製品の機能、セキュリティ、アカウント管理をサポートするために、以下を記録する場合があります："
        ],
        "title": "4. アプリおよびデバイスの活動データ"
      },
      {
        "paragraphs": [
          "デスクトップアプリを使用する際、SwitchControlは最適化、分析、アドバイザー機能を強化するためにハードウェアおよびシステム情報にアクセスする場合があります。これには以下が含まれます："
        ],
        "title": "5. システムおよびテレメトリデータ"
      },
      {
        "paragraphs": [
          "許可されたSwitchControlの管理者は、正当な運用目的のためにアカウントレベルのデータにアクセスする場合があります。これには以下が含まれます："
        ],
        "title": "6. 管理者アクセス"
      },
      {
        "paragraphs": [
          "当社は、保持するデータを以下の目的で使用します："
        ],
        "title": "7. データの使用方法"
      },
      {
        "paragraphs": [
          "サービスの運営を支援する信頼できるサードパーティとデータを共有する場合があります："
        ],
        "title": "8. 共有およびサービスプロバイダー"
      },
      {
        "paragraphs": [
          "お客様のサインイン状態を維持し、訪問を通じてアクセス状態を保持するために、Cookieおよびセッショントークンを使用します。これらは、サービスを機能させるために必要なものに限定されています。"
        ],
        "title": "9. Cookieおよびセッションストレージ"
      },
      {
        "paragraphs": [
          "以下の目的で合理的に必要な期間、データをお客様のデータを保持します："
        ],
        "title": "10. データの保持"
      },
      {
        "paragraphs": [
          "当社は、アカウントデータを保護するために合理的な技術的および組織的な安全対策を講じています。いかなるシステムもリスクに対して完全に免疫があるわけではありません。アカウントが侵害されたと思われる場合は、直ちに当社にご連絡ください。"
        ],
        "title": "11. セキュリティ"
      },
      {
        "paragraphs": [
          "居住地に応じて、以下の権利を有する場合があります："
        ],
        "title": "12. お客様の権利およびアカウントの削除"
      },
      {
        "paragraphs": [
          "SwitchControlは、居住する法域で拘束力のある契約を法的に締結できない方、または適切な親や保護者の許可なく最低年齢に達していない方が使用することを意図していません。未成年者が許可なく個人データを提供したと思われる場合は、当社が削除できるようにご連絡ください。"
        ],
        "title": "13. 年齢要件"
      },
      {
        "paragraphs": [
          "プライバシーに関するご質問、データリクエスト、懸念については、switchcontrol67@gmail.comまでお問い合わせください。"
        ],
        "title": "14. お問い合わせ"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControlは、Windows PCの設定およびシステムパフォーマンスの構成、最適化、分析を支援するように設計されたソフトウェアおよびサービスを提供します。SwitchControlを使用することにより、お客様は本利用規約に同意したものとみなされます。同意いただけない場合は、本サービスを使用しないでください。"
        ],
        "title": "1. 概要"
      },
      {
        "paragraphs": [
          "お客様は、居住する法域において法的に拘束力のある契約を締結できる必要があります。最低年齢に達していない場合は、親または保護者の許可を得る必要があります。SwitchControlを使用することにより、お客様はこれらの要件を満たしていることを確認したものとみなされます。"
        ],
        "title": "2. 利用資格"
      },
      {
        "paragraphs": [
          "SwitchControlは、3つのアクセス状態を提供します。Free（無料で選択された機能への基本的なアクセス）、Trial（期間限定でPremium機能への一時的なアクセス）、およびPremium（購入により解除される全機能へのアクセス）です。各階層で利用可能な機能は時間の経過とともに変更される可能性があります。SwitchControlは、各プランに含まれる内容を調整する権利を留保します。"
        ],
        "title": "3. アクセス階層"
      },
      {
        "paragraphs": [
          "Premium機能の無料トライアルを受ける場合："
        ],
        "title": "4. 無料トライアル"
      },
      {
        "paragraphs": [
          "Premiumを購入すると、購入時に有効な条件に基づいてPremium機能にアクセスするための、譲渡不可能な個人ライセンスが付与されます。価格、アクセスモデル、権限、機能セットは時間の経過とともに変更される可能性があります。SwitchControlは、特定の機能が永続的に利用可能であることを保証するものではありません。明示的に許可されている場合を除き、アクセス権を再販、譲渡、または他者と共有することはできません。"
        ],
        "title": "5. Premiumアクセスおよびライセンス"
      },
      {
        "paragraphs": [
          "SwitchControlは、お客様自身の目的でソフトウェアおよびサービスを使用するための、限定的、個人的、非独占的、かつ譲渡不可能な権利を付与します。明示的に付与されていないすべての権利は留保されます。"
        ],
        "title": "6. ライセンスおよび一般的なアクセス"
      },
      {
        "paragraphs": [
          "お客様は以下を行わないことに同意するものとします："
        ],
        "title": "7. 禁止事項"
      },
      {
        "paragraphs": [
          "SwitchControlは、通常のプラットフォーム運営の一環として、アカウントに対して以下の操作を行う場合があります："
        ],
        "title": "8. 管理用アカウント操作"
      },
      {
        "paragraphs": [
          "SwitchControlは、お客様が本利用規約に違反した、不正・悪意・欺瞞的な行為に関与した、アクセス制御や権限システムを改ざんまたは回避しようとした、本サービスまたは他のお客様にセキュリティ上のリスクをもたらした、あるいは損害や法的責任を生じさせるような方法でサービスを使用したと当社が合理的に判断した場合、通知の有無にかかわらず、お客様のアクセスを停止または終了させることがあります。正当な理由によりアカウントが停止または終了された場合、返金を受ける権利はありません。"
        ],
        "title": "9. 停止および終了"
      },
      {
        "paragraphs": [
          "SwitchControlは、使用する機能に応じて、Windowsの設定、システム環境設定、スタートアップ構成、ネットワークパラメータ、電源プロファイルを変更する場合があります。お客様は、ソフトウェアを慎重に使用し、各機能が何を行うかを適用前に理解する責任を負います。SwitchControlは、システムへの変更の適用から生じる可能性のあるシステム不安定化、データ損失、またはその他の問題について責任を負いません。最適化ツールを使用する前に、必ず重要なデータをバックアップしてください。"
        ],
        "title": "10. システム変更およびリスク"
      },
      {
        "paragraphs": [
          "SwitchControlは、具体的なパフォーマンス結果を保証するものではありません。結果は、ハードウェア構成、インストールされているソフトウェア、ドライバー、ネットワーク状態、および当社が制御できないその他の多くの要因によって異なります。これには、FPS、フレームタイム、入力遅延、ping、ネットワーク安定性、起動速度、および一般的なシステム応答性が含まれますが、これらに限定されません。AI AdvisorおよびBIOS Advisorによる推奨事項およびアドバイザーの出力は、情報提供のみを目的としており、すべてのシステムにおいて正確であることや適合することを保証するものではありません。"
        ],
        "title": "11. 結果の保証なし"
      },
      {
        "paragraphs": [
          "すべての価格は、購入を完了する前のチェックアウト時に表示されます。支払いは、当社のサードパーティ決済処理業者によって安全に処理されます。"
        ],
        "title": "12. 支払いおよび返金"
      },
      {
        "paragraphs": [
          "一部の機能は、決済処理業者、認証サービス、ホスティングインフラストラクチャを含むサードパーティプロバイダーに依存しています。それらのサービスの使用には、それらのプロバイダーの利用規約やプライバシーポリシーも適用される場合があります。SwitchControlは、サードパーティの行為やポリシーについて責任を負いません。"
        ],
        "title": "13. サードパーティサービス"
      },
      {
        "paragraphs": [
          "SwitchControlソフトウェア、ブランド、デザイン、コンテンツ、およびサービスに関するすべての権利は、SwitchControlが所有しています。本規約のいかなる内容も、所有権をお客様に移転するものではありません。SwitchControlのいかなる部分も、書面による明示的な許可なく、複製、配布、または二次的著作物の作成を行うことはできません。"
        ],
        "title": "14. 知的財産"
      },
      {
        "paragraphs": [
          "法律で許可される最大限の範囲において、SwitchControlは、サービスの利用または利用不能から生じる、データの損失、利益の損失、システム損傷を含むがこれに限定されない、間接的、付随的、特別、派生的な損害または懲罰的損害賠償について一切の責任を負いません。"
        ],
        "title": "15. 責任の制限"
      },
      {
        "paragraphs": [
          "SwitchControlは、機能、価格、アクセス階層、およびサービス構造をいつでも更新する可能性があります。また、本規約および当社のプライバシーポリシーを更新する場合もあります。重要な変更を行う際には、「最終更新日」を更新します。変更が発効した後にサービスを継続して使用することは、更新された規約に同意したものとみなされます。"
        ],
        "title": "16. サービスおよび本規約の変更"
      },
      {
        "paragraphs": [
          "本規約に関するご質問は、switchcontrol67@gmail.comまでお問い合わせください。"
        ],
        "title": "17. お問い合わせ"
      }
    ]
  },
  "pa": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl ਸਿਰਫ਼ ਉੱਥੇ ਹੀ ਜਾਣਕਾਰੀ ਇਕੱਠੀ ਕਰਦਾ ਅਤੇ ਵਰਤਦਾ ਹੈ ਜਿੱਥੇ ਉਤਪਾਦ ਪ੍ਰਦਾਨ ਕਰਨ, ਖਾਤਿਆਂ ਦਾ ਪ੍ਰਬੰਧਨ ਕਰਨ, ਉਪਭੋਗਤਾਵਾਂ ਦਾ ਸਮਰਥਨ ਕਰਨ, ਧੋਖਾਧੜੀ ਨੂੰ ਰੋਕਣ ਅਤੇ ਸੁਰੱਖਿਆ ਬਣਾਈ ਰੱਖਣ ਲਈ ਲੋੜ ਹੁੰਦੀ ਹੈ। ਇਹ ਨੀਤੀ ਦੱਸਦੀ ਹੈ ਕਿ ਅਸੀਂ ਕੀ ਇਕੱਠਾ ਕਰਦੇ ਹਾਂ, ਕਿਉਂ, ਅਤੇ ਇਸਨੂੰ ਕਿਵੇਂ ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ।"
        ],
        "title": "1. ਸੰਖੇਪ ਜਾਣਕਾਰੀ"
      },
      {
        "paragraphs": [
          "ਜਦੋਂ ਤੁਸੀਂ ਸਾਈਨ ਇਨ ਕਰਦੇ ਹੋ, ਅਸੀਂ ਸਟੋਰ ਕਰਦੇ ਹਾਂ:",
          "bullets"
        ],
        "title": "2. ਖਾਤਾ ਡੇਟਾ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਤੁਹਾਡੀ ਪਹੁੰਚ ਸਥਿਤੀ ਬਾਰੇ ਜਾਣਕਾਰੀ ਸਟੋਰ ਕਰਦੇ ਹਾਂ ਤਾਂ ਜੋ ਉਤਪਾਦ ਸਹੀ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਪ੍ਰਦਾਨ ਕਰ ਸਕੇ। ਇਸ ਵਿੱਚ ਸ਼ਾਮਲ ਹਨ:",
          "bullets"
        ],
        "title": "3. ਹੱਕ ਅਤੇ ਪਹੁੰਚ ਡੇਟਾ"
      },
      {
        "paragraphs": [
          "ਉਤਪਾਦ ਦੀ ਕਾਰਜਕੁਸ਼ਲਤਾ, ਸੁਰੱਖਿਆ, ਅਤੇ ਖਾਤਾ ਪ੍ਰਬੰਧਨ ਦਾ ਸਮਰਥਨ ਕਰਨ ਲਈ, ਅਸੀਂ ਰਿਕਾਰਡ ਕਰ ਸਕਦੇ ਹਾਂ:",
          "bullets"
        ],
        "title": "4. ਐਪ ਅਤੇ ਡਿਵਾਈਸ ਗਤੀਵਿਧੀ ਡੇਟਾ"
      },
      {
        "paragraphs": [
          "ਡੈਸਕਟਾਪ ਐਪ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਸਮੇਂ, SwitchControl ਇਸਦੇ ਓਪਟੀਮਾਈਜੇਸ਼ਨ, ਵਿਸ਼ਲੇਸ਼ਣ, ਅਤੇ ਸਲਾਹਕਾਰੀ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਨੂੰ ਪਾਵਰ ਦੇਣ ਲਈ ਹਾਰਡਵੇਅਰ ਅਤੇ ਸਿਸਟਮ ਜਾਣਕਾਰੀ ਤੱਕ ਪਹੁੰਚ ਕਰ ਸਕਦਾ ਹੈ। ਇਸ ਵਿੱਚ ਸ਼ਾਮਲ ਹਨ:",
          "bullets"
        ],
        "title": "5. ਸਿਸਟਮ ਅਤੇ ਟੈਲੀਮੈਟਰੀ ਡੇਟਾ"
      },
      {
        "paragraphs": [
          "ਅਧਿਕਾਰਤ SwitchControl ਪ੍ਰਸ਼ਾਸਕ ਜਾਇਜ਼ ਸੰਚਾਲਨ ਉਦੇਸ਼ਾਂ ਲਈ ਖਾਤਾ-ਪੱਧਰ ਦੇ ਡੇਟਾ ਤੱਕ ਪਹੁੰਚ ਕਰ ਸਕਦੇ ਹਨ, ਜਿਸ ਵਿੱਚ ਸ਼ਾਮਲ ਹਨ:",
          "bullets"
        ],
        "title": "6. ਪ੍ਰਸ਼ਾਸਨਿਕ ਪਹੁੰਚ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਆਪਣੇ ਕੋਲ ਮੌਜੂਦ ਡੇਟਾ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਹਾਂ:",
          "bullets"
        ],
        "title": "7. ਅਸੀਂ ਤੁਹਾਡੇ ਡੇਟਾ ਦੀ ਵਰਤੋਂ ਕਿਵੇਂ ਕਰਦੇ ਹਾਂ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਭਰੋਸੇਮੰਦ ਤੀਜੀ ਧਿਰਾਂ ਨਾਲ ਡੇਟਾ ਸਾਂਝਾ ਕਰ ਸਕਦੇ ਹਾਂ ਜੋ ਸੇਵਾ ਨੂੰ ਚਲਾਉਣ ਵਿੱਚ ਮਦਦ ਕਰਦੇ ਹਨ:",
          "bullets"
        ],
        "title": "8. ਸ਼ੇਅਰਿੰਗ ਅਤੇ ਸੇਵਾ ਪ੍ਰਦਾਤਾ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਤੁਹਾਨੂੰ ਸਾਈਨ ਇਨ ਰੱਖਣ ਅਤੇ ਵਿਜ਼ਿਟਾਂ ਦੌਰਾਨ ਤੁਹਾਡੀ ਪਹੁੰਚ ਸਥਿਤੀ ਨੂੰ ਬਣਾਈ ਰੱਖਣ ਲਈ ਕੂਕੀਜ਼ ਅਤੇ ਸੈਸ਼ਨ ਟੋਕਨਾਂ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਹਾਂ। ਇਹ ਸੇਵਾ ਦੇ ਕੰਮ ਕਰਨ ਲਈ ਲੋੜੀਂਦੀ ਚੀਜ਼ਾਂ ਤੱਕ ਸੀਮਿਤ ਹਨ।"
        ],
        "title": "9. ਕੂਕੀਜ਼ ਅਤੇ ਸੈਸ਼ਨ ਸਟੋਰੇਜ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਤੁਹਾਡੇ ਡੇਟਾ ਨੂੰ ਉਦੋਂ ਤੱਕ ਬਰਕਰਾਰ ਰੱਖਦੇ ਹਾਂ ਜਦੋਂ ਤੱਕ ਹੇਠਾਂ ਦਿੱਤੇ ਉਦੇਸ਼ਾਂ ਲਈ ਵਾਜਬ ਤੌਰ 'ਤੇ ਜ਼ਰੂਰੀ ਹੈ:",
          "bullets"
        ],
        "title": "10. ਡੇਟਾ ਰੀਟੈਨਸ਼ਨ"
      },
      {
        "paragraphs": [
          "ਅਸੀਂ ਖਾਤਾ ਡੇਟਾ ਦੀ ਸੁਰੱਖਿਆ ਲਈ ਵਾਜਬ ਤਕਨੀਕੀ ਅਤੇ ਸੰਗਠਨਾਤਮਕ ਸੁਰੱਖਿਆ ਉਪਾਵਾਂ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਹਾਂ। ਕੋਈ ਵੀ ਸਿਸਟਮ ਜੋਖਮ ਤੋਂ ਪੂਰੀ ਤਰ੍ਹਾਂ ਮੁਕਤ ਨਹੀਂ ਹੈ। ਜੇਕਰ ਤੁਹਾਨੂੰ ਲੱਗਦਾ ਹੈ ਕਿ ਤੁਹਾਡਾ ਖਾਤਾ ਨਾਲ ਸਮਝੌਤਾ ਕੀਤਾ ਗਿਆ ਹੈ, ਤਾਂ ਤੁਰੰਤ ਸਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।"
        ],
        "title": "11. ਸੁਰੱਖਿਆ"
      },
      {
        "paragraphs": [
          "ਤੁਹਾਡੇ ਸਥਾਨ ਦੇ ਆਧਾਰ 'ਤੇ, ਤੁਹਾਡੇ ਕੋਲ ਇਹਨਾਂ ਦੇ ਅਧਿਕਾਰ ਹੋ ਸਕਦੇ ਹਨ:",
          "bullets"
        ],
        "title": "12. ਤੁਹਾਡੇ ਅਧਿਕਾਰ ਅਤੇ ਖਾਤਾ ਮਿਟਾਉਣਾ"
      },
      {
        "paragraphs": [
          "SwitchControl ਉਹਨਾਂ ਕਿਸੇ ਵੀ ਵਿਅਕਤੀ ਦੁਆਰਾ ਵਰਤੋਂ ਲਈ ਨਹੀਂ ਹੈ ਜੋ ਆਪਣੇ ਅਧਿਕਾਰ ਖੇਤਰ ਵਿੱਚ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਇੱਕ ਬਾਈਡਿੰਗ ਸਮਝੌਤਾ ਨਹੀਂ ਕਰ ਸਕਦਾ ਹੈ, ਜਾਂ ਜੋ ਉਚਿਤ ਮਾਪਿਆਂ ਜਾਂ ਸਰਪ੍ਰਸਤ ਦੀ ਇਜਾਜ਼ਤ ਤੋਂ ਬਿਨਾਂ ਘੱਟੋ-ਘੱਟ ਲੋੜੀਂਦੀ ਉਮਰ ਤੋਂ ਘੱਟ ਹੈ। ਜੇਕਰ ਤੁਹਾਨੂੰ ਲੱਗਦਾ ਹੈ ਕਿ ਕਿਸੇ ਨਾਬਾਲਗ ਨੇ ਇਜਾਜ਼ਤ ਤੋਂ ਬਿਨਾਂ ਨਿੱਜੀ ਡੇਟਾ ਪ੍ਰਦਾਨ ਕੀਤਾ ਹੈ, ਤਾਂ ਸਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਤਾਂ ਜੋ ਅਸੀਂ ਇਸਨੂੰ ਹਟਾ ਸਕੀਏ।"
        ],
        "title": "13. ਉਮਰ ਦੀਆਂ ਲੋੜਾਂ"
      },
      {
        "paragraphs": [
          "ਗੋਪਨੀਯਤਾ ਦੇ ਸਵਾਲਾਂ, ਡੇਟਾ ਬੇਨਤੀਆਂ, ਜਾਂ ਚਿੰਤਾਵਾਂ ਲਈ, ਸਾਡੇ ਨਾਲ switchcontrol67@gmail.com 'ਤੇ ਸੰਪਰਕ ਕਰੋ"
        ],
        "title": "14. ਸੰਪਰਕ"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl ਸਾਫਟਵੇਅਰ ਅਤੇ ਸੇਵਾਵਾਂ ਪ੍ਰਦਾਨ ਕਰਦਾ ਹੈ ਜੋ ਉਪਭੋਗਤਾਵਾਂ ਨੂੰ Windows PC ਸੈਟਿੰਗਾਂ ਅਤੇ ਸਿਸਟਮ ਪ੍ਰਦਰਸ਼ਨ ਨੂੰ ਕੌਂਫਿਗਰ, ਅਨੁਕੂਲਿਤ ਅਤੇ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਨ ਲਈ ਤਿਆਰ ਕੀਤਾ ਗਿਆ ਹੈ। SwitchControl ਦੀ ਵਰਤੋਂ ਕਰਕੇ, ਤੁਸੀਂ ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਨਾਲ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ। ਜੇਕਰ ਤੁਸੀਂ ਸਹਿਮਤ ਨਹੀਂ ਹੋ, ਤਾਂ ਸੇਵਾ ਦੀ ਵਰਤੋਂ ਨਾ ਕਰੋ।"
        ],
        "title": "1. ਸੰਖੇਪ ਜਾਣਕਾਰੀ"
      },
      {
        "paragraphs": [
          "ਤੁਹਾਡੇ ਕੋਲ ਆਪਣੇ ਅਧਿਕਾਰ ਖੇਤਰ ਵਿੱਚ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਬਾਈਡਿੰਗ ਸਮਝੌਤਾ ਬਣਾਉਣ ਦੇ ਯੋਗ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ। ਜੇਕਰ ਤੁਸੀਂ ਘੱਟੋ-ਘੱਟ ਲੋੜੀਂਦੀ ਉਮਰ ਤੋਂ ਘੱਟ ਹੋ, ਤਾਂ ਤੁਹਾਡੇ ਕੋਲ ਮਾਤਾ-ਪਿਤਾ ਜਾਂ ਸਰਪ੍ਰਸਤ ਦੀ ਇਜਾਜ਼ਤ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। SwitchControl ਦੀ ਵਰਤੋਂ ਕਰਕੇ, ਤੁਸੀਂ ਪੁਸ਼ਟੀ ਕਰਦੇ ਹੋ ਕਿ ਤੁਸੀਂ ਇਹਨਾਂ ਲੋੜਾਂ ਨੂੰ ਪੂਰਾ ਕਰਦੇ ਹੋ।"
        ],
        "title": "2. ਯੋਗਤਾ"
      },
      {
        "paragraphs": [
          "SwitchControl ਤਿੰਨ ਪਹੁੰਚ ਸਥਿਤੀਆਂ ਦੀ ਪੇਸ਼ਕਸ਼ ਕਰਦਾ ਹੈ: Free, ਬਿਨਾਂ ਕਿਸੇ ਕੀਮਤ ਦੇ ਚੁਣੀਆਂ ਗਈਆਂ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਤੱਕ ਮੁੱਢਲੀ ਪਹੁੰਚ; Trial, ਸੀਮਤ ਸਮੇਂ ਲਈ Premium ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਤੱਕ ਅਸਥਾਈ ਪਹੁੰਚ; ਅਤੇ Premium, ਪੂਰੀ ਵਿਸ਼ੇਸ਼ਤਾ ਪਹੁੰਚ, ਖਰੀਦ ਦੁਆਰਾ ਅਨਲੌਕ ਕੀਤੀ ਗਈ। ਹਰੇਕ ਪੱਧਰ 'ਤੇ ਉਪਲਬਧ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਸਮੇਂ ਦੇ ਨਾਲ ਬਦਲ ਸਕਦੀਆਂ ਹਨ। SwitchControl ਹਰੇਕ ਯੋਜਨਾ ਵਿੱਚ ਕੀ ਸ਼ਾਮਲ ਹੈ ਇਸ ਨੂੰ ਅਨੁਕੂਲ ਕਰਨ ਦਾ ਅਧਿਕਾਰ ਰਾਖਵਾਂ ਰੱਖਦਾ ਹੈ।"
        ],
        "title": "3. ਪਹੁੰਚ ਦੇ ਪੱਧਰ"
      },
      {
        "paragraphs": [
          "ਜੇਕਰ ਤੁਸੀਂ Premium ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਦਾ ਇੱਕ ਮੁਫਤ ਟ੍ਰਾਇਲ ਪ੍ਰਾਪਤ ਕਰਦੇ ਹੋ:",
          "bullets"
        ],
        "title": "4. Free trials"
      },
      {
        "paragraphs": [
          "Premium ਖਰੀਦਣਾ ਤੁਹਾਨੂੰ ਖਰੀਦ ਦੇ ਸਮੇਂ ਲਾਗੂ ਸ਼ਰਤਾਂ ਦੇ ਤਹਿਤ Premium ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਤੱਕ ਪਹੁੰਚ ਕਰਨ ਲਈ ਇੱਕ ਨਿੱਜੀ, ਗੈਰ-ਤਬਾਦਲਾਯੋਗ ਲਾਇਸੰਸ ਦਿੰਦਾ ਹੈ। ਕੀਮਤ, ਪਹੁੰਚ ਮਾਡਲ, ਹੱਕ ਅਤੇ ਵਿਸ਼ੇਸ਼ਤਾ ਸੈੱਟ ਸਮੇਂ ਦੇ ਨਾਲ ਬਦਲ ਸਕਦੇ ਹਨ। SwitchControl ਇਹ ਗਰੰਟੀ ਨਹੀਂ ਦਿੰਦਾ ਹੈ ਕਿ ਕੋਈ ਖਾਸ ਵਿਸ਼ੇਸ਼ਤਾ ਅਣਮਿੱਥੇ ਸਮੇਂ ਲਈ ਉਪਲਬਧ ਰਹੇਗੀ। ਤੁਸੀਂ ਆਪਣੀ ਪਹੁੰਚ ਨੂੰ ਦੁਬਾਰਾ ਵੇਚ, ਟ੍ਰਾਂਸਫਰ ਜਾਂ ਦੂਜਿਆਂ ਨਾਲ ਸਾਂਝਾ ਨਹੀਂ ਕਰ ਸਕਦੇ ਹੋ ਜਦੋਂ ਤੱਕ ਸਪੱਸ਼ਟ ਤੌਰ 'ਤੇ ਇਜਾਜ਼ਤ ਨਾ ਦਿੱਤੀ ਗਈ ਹੋਵੇ।"
        ],
        "title": "5. Premium ਪਹੁੰਚ ਅਤੇ ਲਾਇਸੰਸਿੰਗ"
      },
      {
        "paragraphs": [
          "SwitchControl ਤੁਹਾਨੂੰ ਆਪਣੇ ਉਦੇਸ਼ਾਂ ਲਈ ਸਾਫਟਵੇਅਰ ਅਤੇ ਸੇਵਾ ਦੀ ਵਰਤੋਂ ਕਰਨ ਦਾ ਇੱਕ ਸੀਮਤ, ਨਿੱਜੀ, ਗੈਰ-ਨਿਵੇਕਲਾ, ਗੈਰ-ਤਬਾਦਲਾਯੋਗ ਅਧਿਕਾਰ ਦਿੰਦਾ ਹੈ। ਸਪੱਸ਼ਟ ਤੌਰ 'ਤੇ ਨਾ ਦਿੱਤੇ ਗਏ ਸਾਰੇ ਅਧਿਕਾਰ ਰਾਖਵੇਂ ਹਨ।"
        ],
        "title": "6. ਲਾਇਸੰਸ ਅਤੇ ਆਮ ਪਹੁੰਚ"
      },
      {
        "paragraphs": [
          "ਤੁਸੀਂ ਸਹਿਮਤ ਹੋ ਕਿ ਤੁਸੀਂ ਨਹੀਂ ਕਰੋਗੇ:",
          "bullets"
        ],
        "title": "7. ਸਵੀਕਾਰਯੋਗ ਵਰਤੋਂ"
      },
      {
        "paragraphs": [
          "SwitchControl ਆਮ ਪਲੇਟਫਾਰਮ ਓਪਰੇਸ਼ਨਾਂ ਦੇ ਹਿੱਸੇ ਵਜੋਂ ਕਿਸੇ ਵੀ ਖਾਤੇ 'ਤੇ ਹੇਠ ਲਿਖੀਆਂ ਕਾਰਵਾਈਆਂ ਕਰ ਸਕਦਾ ਹੈ:",
          "bullets"
        ],
        "title": "8. ਪ੍ਰਸ਼ਾਸਨਿਕ ਖਾਤਾ ਕਾਰਵਾਈਆਂ"
      },
      {
        "paragraphs": [
          "SwitchControl ਤੁਹਾਡੀ ਪਹੁੰਚ ਨੂੰ ਮੁਅੱਤਲ ਜਾਂ ਖਤਮ ਕਰ ਸਕਦਾ ਹੈ, ਨੋਟਿਸ ਦੇ ਨਾਲ ਜਾਂ ਬਿਨਾਂ, ਜੇਕਰ ਅਸੀਂ ਵਾਜਬ ਤੌਰ 'ਤੇ ਇਹ ਨਿਰਧਾਰਤ ਕਰਦੇ ਹਾਂ ਕਿ ਤੁਸੀਂ ਇਹਨਾਂ ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ ਦੀ ਉਲੰਘਣਾ ਕੀਤੀ ਹੈ, ਧੋਖਾਧੜੀ, ਅਪਮਾਨਜਨਕ ਜਾਂ ਧੋਖੇਬਾਜ਼ ਵਿਵਹਾਰ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਏ ਹੋ, ਪਹੁੰਚ ਨਿਯੰਤਰਣਾਂ ਜਾਂ ਹੱਕ ਪ੍ਰਣਾਲੀਆਂ ਨੂੰ ਨਸ਼ਟ ਕਰਨ ਜਾਂ ਉਹਨਾਂ ਨੂੰ ਦਰਕਿਨਾਰ ਕਰਨ ਦੀ ਕੋਸ਼ਿਸ਼ ਕੀਤੀ ਹੈ, ਸੇਵਾ ਜਾਂ ਹੋਰ ਉਪਭੋਗਤਾਵਾਂ ਲਈ ਸੁਰੱਖਿਆ ਜੋਖਮ ਪੈਦਾ ਕੀਤਾ ਹੈ, ਜਾਂ ਸੇਵਾ ਦੀ ਵਰਤੋਂ ਇਸ ਤਰੀਕੇ ਨਾਲ ਕੀਤੀ ਹੈ ਜੋ ਨੁਕਸਾਨ ਜਾਂ ਕਾਨੂੰਨੀ ਐਕਸਪੋਜ਼ਰ ਦਾ ਕਾਰਨ ਬਣਦੀ ਹੈ। ਜੇਕਰ ਤੁਹਾਡਾ ਖਾਤਾ ਕਿਸੇ ਕਾਰਨ ਕਰਕੇ ਮੁਅੱਤਲ ਜਾਂ ਖਤਮ ਕਰ ਦਿੱਤਾ ਜਾਂਦਾ ਹੈ, ਤਾਂ ਤੁਸੀਂ ਰਿਫੰਡ ਦੇ ਹੱਕਦਾਰ ਨਹੀਂ ਹੋ।"
        ],
        "title": "9. ਮੁਅੱਤਲੀ ਅਤੇ ਸਮਾਪਤੀ"
      },
      {
        "paragraphs": [
          "SwitchControl ਤੁਹਾਡੇ ਦੁਆਰਾ ਵਰਤੀਆਂ ਜਾਣ ਵਾਲੀਆਂ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਦੇ ਆਧਾਰ 'ਤੇ Windows ਸੈਟਿੰਗਾਂ, ਸਿਸਟਮ ਤਰਜੀਹਾਂ, ਸਟਾਰਟਅੱਪ ਕੌਂਫਿਗਰੇਸ਼ਨ, ਨੈੱਟਵਰਕ ਪੈਰਾਮੀਟਰਾਂ ਅਤੇ ਪਾਵਰ ਪ੍ਰੋਫਾਈਲਾਂ ਨੂੰ ਸੋਧ ਸਕਦਾ ਹੈ। ਤੁਸੀਂ ਸਾਫਟਵੇਅਰ ਨੂੰ ਸਾਵਧਾਨੀ ਨਾਲ ਵਰਤਣ ਅਤੇ ਇਸਨੂੰ ਲਾਗੂ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਇਹ ਸਮਝਣ ਲਈ ਜ਼ਿੰਮੇਵਾਰ ਹੋ ਕਿ ਹਰੇਕ ਵਿਸ਼ੇਸ਼ਤਾ ਕੀ ਕਰਦੀ ਹੈ। SwitchControl ਸਿਸਟਮ ਦੀ ਅਸਥਿਰਤਾ, ਡੇਟਾ ਦੇ ਨੁਕਸਾਨ, ਜਾਂ ਹੋਰ ਮੁੱਦਿਆਂ ਲਈ ਜ਼ਿੰਮੇਵਾਰ ਨਹੀਂ ਹੈ ਜੋ ਤੁਹਾਡੇ ਸਿਸਟਮ ਵਿੱਚ ਤਬਦੀਲੀਆਂ ਲਾਗੂ ਕਰਨ ਨਾਲ ਪੈਦਾ ਹੋ ਸਕਦੇ ਹਨ। ਓਪਟੀਮਾਈਜੇਸ਼ਨ ਟੂਲਸ ਦੀ ਵਰਤੋਂ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਹਮੇਸ਼ਾ ਮਹੱਤਵਪੂਰਨ ਡੇਟਾ ਦਾ ਬੈਕਅੱਪ ਲਓ।"
        ],
        "title": "10. ਸਿਸਟਮ ਤਬਦੀਲੀਆਂ ਅਤੇ ਜੋਖਮ"
      },
      {
        "paragraphs": [
          "SwitchControl ਖਾਸ ਪ੍ਰਦਰਸ਼ਨ ਦੇ ਨਤੀਜਿਆਂ ਦੀ ਗਰੰਟੀ ਨਹੀਂ ਦਿੰਦਾ ਹੈ। ਨਤੀਜੇ ਹਾਰਡਵੇਅਰ ਕੌਂਫਿਗਰੇਸ਼ਨ, ਸਥਾਪਿਤ ਸਾਫਟਵੇਅਰ, ਡਰਾਈਵਰਾਂ, ਨੈੱਟਵਰਕ ਸਥਿਤੀਆਂ, ਅਤੇ ਸਾਡੇ ਨਿਯੰਤਰਣ ਤੋਂ ਬਾਹਰ ਕਈ ਹੋਰ ਕਾਰਕਾਂ ਦੇ ਆਧਾਰ 'ਤੇ ਵੱਖ-ਵੱਖ ਹੁੰਦੇ ਹਨ। ਇਸ ਵਿੱਚ ਸ਼ਾਮਲ ਹਨ ਪਰ ਇਹ ਸੀਮਤ ਨਹੀਂ ਹਨ: FPS, ਫਰੇਮ ਸਮਾਂ, ਇਨਪੁਟ ਲੇਟੈਂਸੀ, ਪਿੰਗ, ਨੈੱਟਵਰਕ ਸਥਿਰਤਾ, ਬੂਟ ਸਪੀਡ, ਅਤੇ ਆਮ ਸਿਸਟਮ ਜਵਾਬਦੇਹੀ। AI Advisor ਅਤੇ BIOS Advisor ਦੁਆਰਾ ਤਿਆਰ ਕੀਤੀਆਂ ਸਿਫ਼ਾਰਸ਼ਾਂ ਕੇਵਲ ਜਾਣਕਾਰੀ ਦੇ ਮਾਰਗਦਰਸ਼ਨ ਵਜੋਂ ਪ੍ਰਦਾਨ ਕੀਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ, ਉਹ ਹਰ ਸਿਸਟਮ ਲਈ ਸਹੀ ਜਾਂ ਢੁਕਵੀਂ ਹੋਣ ਦੀ ਗਰੰਟੀ ਨਹੀਂ ਹਨ।"
        ],
        "title": "11. ਕੋਈ ਗਾਰੰਟੀਸ਼ੁਦਾ ਨਤੀਜੇ ਨਹੀਂ"
      },
      {
        "paragraphs": [
          "ਸਾਰੀਆਂ ਕੀਮਤਾਂ ਖਰੀਦਦਾਰੀ ਪੂਰੀ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਚੈੱਕਆਉਟ 'ਤੇ ਦਿਖਾਈਆਂ ਜਾਂਦੀਆਂ ਹਨ। ਭੁਗਤਾਨ ਸਾਡੇ ਤੀਜੀ-ਧਿਰ ਭੁਗਤਾਨ ਪ੍ਰੋਸੈਸਰ ਦੁਆਰਾ ਸੁਰੱਖਿਅਤ ਢੰਗ ਨਾਲ ਸੰਭਾਲੇ ਜਾਂਦੇ ਹਨ।",
          "bullets"
        ],
        "title": "12. ਭੁਗਤਾਨ ਅਤੇ ਰਿਫੰਡ"
      },
      {
        "paragraphs": [
          "ਕੁਝ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਤੀਜੀ-ਧਿਰ ਦੇ ਪ੍ਰਦਾਤਾਵਾਂ 'ਤੇ ਨਿਰਭਰ ਕਰਦੀਆਂ ਹਨ ਜਿਸ ਵਿੱਚ ਭੁਗਤਾਨ ਪ੍ਰੋਸੈਸਰ, ਪ੍ਰਮਾਣੀਕਰਨ ਸੇਵਾਵਾਂ, ਅਤੇ ਹੋਸਟਿੰਗ ਬੁਨਿਆਦੀ ਢਾਂਚਾ ਸ਼ਾਮਲ ਹੈ। ਉਹਨਾਂ ਦੀਆਂ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀਆਂ ਵੀ ਉਹਨਾਂ ਸੇਵਾਵਾਂ ਦੀ ਤੁਹਾਡੀ ਵਰਤੋਂ 'ਤੇ ਲਾਗੂ ਹੋ ਸਕਦੀਆਂ ਹਨ। SwitchControl ਤੀਜੀ ਧਿਰਾਂ ਦੇ ਵਿਵਹਾਰ ਜਾਂ ਨੀਤੀਆਂ ਲਈ ਜ਼ਿੰਮੇਵਾਰ ਨਹੀਂ ਹੈ।"
        ],
        "title": "13. ਤੀਜੀ-ਧਿਰ ਸੇਵਾਵਾਂ"
      },
      {
        "paragraphs": [
          "SwitchControl ਸਾਫਟਵੇਅਰ, ਬ੍ਰਾਂਡ, ਡਿਜ਼ਾਈਨ, ਸਮੱਗਰੀ ਅਤੇ ਸੇਵਾਵਾਂ ਵਿੱਚ ਸਾਰੇ ਅਧਿਕਾਰ SwitchControl ਦੀ ਮਲਕੀਅਤ ਹਨ। ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਵਿੱਚ ਕੁਝ ਵੀ ਤੁਹਾਡੇ ਲਈ ਕੋਈ ਮਾਲਕੀ ਤਬਦੀਲ ਨਹੀਂ ਕਰਦਾ ਹੈ। ਤੁਸੀਂ ਸਪੱਸ਼ਟ ਲਿਖਤੀ ਇਜਾਜ਼ਤ ਤੋਂ ਬਿਨਾਂ SwitchControl ਦੇ ਕਿਸੇ ਵੀ ਹਿੱਸੇ ਤੋਂ ਪ੍ਰਜਨਨ, ਵੰਡ, ਜਾਂ ਡੈਰੀਵੇਟਿਵ ਕੰਮ ਨਹੀਂ ਬਣਾ ਸਕਦੇ ਹੋ।"
        ],
        "title": "14. ਬੌਧਿਕ ਸੰਪੱਤੀ"
      },
      {
        "paragraphs": [
          "ਕਾਨੂੰਨ ਦੁਆਰਾ ਅਨੁਮਤੀ ਦਿੱਤੀ ਗਈ ਪੂਰੀ ਹੱਦ ਤੱਕ, SwitchControl ਅਸਿੱਧੇ, ਇਤਫਾਕਨ, ਵਿਸ਼ੇਸ਼, ਨਤੀਜੇ ਵਜੋਂ, ਜਾਂ ਦੰਡਕਾਰੀ ਨੁਕਸਾਨਾਂ ਲਈ ਜਵਾਬਦੇਹ ਨਹੀਂ ਹੈ, ਜਿਸ ਵਿੱਚ ਡੇਟਾ ਦਾ ਨੁਕਸਾਨ, ਮੁਨਾਫੇ ਦਾ ਨੁਕਸਾਨ, ਜਾਂ ਸਿਸਟਮ ਦਾ ਨੁਕਸਾਨ ਸ਼ਾਮਲ ਹੈ, ਜੋ ਤੁਹਾਡੀ ਵਰਤੋਂ ਤੋਂ ਪੈਦਾ ਹੁੰਦਾ ਹੈ, ਜਾਂ ਸੇਵਾ ਦੀ ਵਰਤੋਂ ਕਰਨ ਵਿੱਚ ਅਸਮਰੱਥਾ ਹੈ।"
        ],
        "title": "15. ਦੇਣਦਾਰੀ ਦੀ ਸੀਮਾ"
      },
      {
        "paragraphs": [
          "SwitchControl ਕਿਸੇ ਵੀ ਸਮੇਂ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ, ਕੀਮਤਾਂ, ਪਹੁੰਚ ਦੇ ਪੱਧਰਾਂ, ਅਤੇ ਸੇਵਾ ਢਾਂਚੇ ਨੂੰ ਅਪਡੇਟ ਕਰ ਸਕਦਾ ਹੈ। ਅਸੀਂ ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਅਤੇ ਸਾਡੀ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਨੂੰ ਵੀ ਅਪਡੇਟ ਕਰ ਸਕਦੇ ਹਾਂ। ਜਦੋਂ ਅਸੀਂ ਮਹੱਤਵਪੂਰਨ ਤਬਦੀਲੀਆਂ ਕਰਦੇ ਹਾਂ, ਅਸੀਂ \"ਆਖਰੀ ਵਾਰ ਅੱਪਡੇਟ ਕੀਤਾ\" ਮਿਤੀ ਨੂੰ ਅੱਪਡੇਟ ਕਰਾਂਗੇ। ਤਬਦੀਲੀਆਂ ਲਾਗੂ ਹੋਣ ਤੋਂ ਬਾਅਦ ਸੇਵਾ ਦੀ ਨਿਰੰਤਰ ਵਰਤੋਂ ਅੱਪਡੇਟ ਕੀਤੀਆਂ ਸ਼ਰਤਾਂ ਦੀ ਸਵੀਕ੍ਰਿਤੀ ਦਾ ਗਠਨ ਕਰਦੀ ਹੈ।"
        ],
        "title": "16. ਸੇਵਾ ਅਤੇ ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਵਿੱਚ ਤਬਦੀਲੀਆਂ"
      },
      {
        "paragraphs": [
          "ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਬਾਰੇ ਸਵਾਲਾਂ ਲਈ, ਸਾਡੇ ਨਾਲ switchcontrol67@gmail.com 'ਤੇ ਸੰਪਰਕ ਕਰੋ"
        ],
        "title": "17. ਸੰਪਰਕ"
      }
    ]
  },
  "de": {
    "terms": [
      {
        "paragraphs": [
          "SwitchControl bietet Software und Dienste an, die Benutzern helfen sollen, Windows PC-Einstellungen und Systemleistung zu konfigurieren, zu optimieren und zu analysieren. Durch die Nutzung von SwitchControl stimmen Sie diesen Bedingungen zu. Wenn Sie nicht zustimmen, nutzen Sie den Dienst nicht."
        ],
        "title": "1. Übersicht"
      },
      {
        "paragraphs": [
          "Sie müssen in der Lage sein, in Ihrer Rechtsprechung eine rechtsverbindliche Vereinbarung einzugehen. Wenn Sie unter dem erforderlichen Mindestalter sind, benötigen Sie die Erlaubnis eines Elternteils oder Erziehungsberechtigten. Durch die Nutzung von SwitchControl bestätigen Sie, dass Sie diese Anforderungen erfüllen."
        ],
        "title": "2. Teilnahmeberechtigung"
      },
      {
        "paragraphs": [
          "SwitchControl bietet drei Zugangsstufen: Free, Basiszugang zu ausgewählten Funktionen ohne Kosten; Trial, temporärer Zugang zu Premium Funktionen für eine begrenzte Zeit; und Premium, vollständiger Funktionszugang, freigeschaltet durch Kauf. Die in jeder Stufe verfügbaren Funktionen können sich im Laufe der Zeit ändern. SwitchControl behält sich das Recht vor, den Inhalt jedes Plans anzupassen."
        ],
        "title": "3. Zugangsstufen"
      },
      {
        "paragraphs": [
          "Wenn Sie eine kostenlose Testversion von Premium Funktionen erhalten:"
        ],
        "title": "4. Kostenlose Testversionen"
      },
      {
        "paragraphs": [
          "Der Kauf von Premium gewährt Ihnen eine persönliche, nicht übertragbare Lizenz zum Zugriff auf Premium Funktionen gemäß den zum Zeitpunkt des Kaufs geltenden Bedingungen. Preise, Zugangsmodelle, Berechtigungen und Funktionssätze können sich im Laufe der Zeit ändern. SwitchControl garantiert nicht, dass eine bestimmte Funktion auf unbestimmte Zeit verfügbar bleibt. Sie dürfen Ihren Zugang nicht weiterverkaufen, übertragen oder mit anderen teilen, sofern dies nicht ausdrücklich gestattet ist."
        ],
        "title": "5. Premium Zugang und Lizenzierung"
      },
      {
        "paragraphs": [
          "SwitchControl gewährt Ihnen ein begrenztes, persönliches, nicht exklusives, nicht übertragbares Recht zur Nutzung der Software und des Dienstes für Ihre eigenen Zwecke. Alle nicht ausdrücklich gewährten Rechte bleiben vorbehalten."
        ],
        "title": "6. Lizenz und allgemeiner Zugang"
      },
      {
        "paragraphs": [
          "Sie stimmen zu, Folgendes zu unterlassen:"
        ],
        "title": "7. Zulässige Nutzung"
      },
      {
        "paragraphs": [
          "SwitchControl kann als Teil des normalen Plattformbetriebs folgende Aktionen für jedes Konto durchführen:"
        ],
        "title": "8. Administrative Kontoaktionen"
      },
      {
        "paragraphs": [
          "SwitchControl kann Ihren Zugang mit oder ohne Vorankündigung aussetzen oder beenden, wenn wir vernünftigerweise feststellen, dass Sie gegen diese Nutzungsbedingungen verstoßen, betrügerisches, missbräuchliches oder täuschendes Verhalten an den Tag gelegt, versucht haben, Zugangskontrollen oder Berechtigungssysteme zu manipulieren oder zu umgehen, ein Sicherheitsrisiko für den Dienst oder andere Benutzer dargestellt oder den Dienst auf eine Weise genutzt haben, die Schaden oder rechtliche Konsequenzen verursacht. Wenn Ihr Konto aus wichtigem Grund ausgesetzt oder beendet wird, haben Sie keinen Anspruch auf eine Rückerstattung."
        ],
        "title": "9. Aussetzung und Beendigung"
      },
      {
        "paragraphs": [
          "SwitchControl kann Windows Einstellungen, Systemeinstellungen, Startkonfigurationen, Netzwerkparameter und Energieprofile abhängig von den verwendeten Funktionen ändern. Sie sind dafür verantwortlich, die Software sorgfältig zu verwenden und zu verstehen, was jede Funktion bewirkt, bevor Sie sie anwenden. SwitchControl ist nicht verantwortlich für Systeminstabilität, Datenverlust oder andere Probleme, die durch die Anwendung von Änderungen an Ihrem System entstehen können. Erstellen Sie immer eine Sicherungskopie wichtiger Daten, bevor Sie Optimierungstools verwenden."
        ],
        "title": "10. Systemänderungen und Risiko"
      },
      {
        "paragraphs": [
          "SwitchControl garantiert keine spezifischen Leistungsergebnisse. Die Ergebnisse variieren je nach Hardwarekonfiguration, installierter Software, Treibern, Netzwerkbedingungen und vielen anderen Faktoren, die außerhalb unserer Kontrolle liegen. Dies umfasst unter anderem: FPS, Frame-Zeit, Eingabelatenz, Ping, Netzwerkstabilität, Boot-Geschwindigkeit und allgemeine Systemreaktionsfähigkeit. Durch KI generierte Empfehlungen und Beraterausgaben werden nur als informative Anleitung bereitgestellt; es wird nicht garantiert, dass sie für jedes System genau oder geeignet sind."
        ],
        "title": "11. Keine garantierten Ergebnisse"
      },
      {
        "paragraphs": [
          "Alle Preise werden an der Kasse angezeigt, bevor Sie einen Kauf abschließen. Zahlungen werden sicher von unserem externen Zahlungsabwickler verarbeitet."
        ],
        "title": "12. Zahlungen und Rückerstattungen"
      },
      {
        "paragraphs": [
          "Einige Funktionen basieren auf Drittanbietern, einschließlich Zahlungsabwicklern, Authentifizierungsdiensten und Hosting-Infrastruktur. Deren Bedingungen und Datenschutzrichtlinien können ebenfalls für Ihre Nutzung dieser Dienste gelten. SwitchControl ist nicht verantwortlich für das Verhalten oder die Richtlinien Dritter."
        ],
        "title": "13. Dienste Dritter"
      },
      {
        "paragraphs": [
          "Alle Rechte an der SwitchControl Software, Marke, Design, Inhalt und Dienstleistungen sind Eigentum von SwitchControl. Nichts in diesen Bedingungen überträgt Ihnen Eigentumsrechte. Sie dürfen ohne ausdrückliche schriftliche Genehmigung keinen Teil von SwitchControl reproduzieren, verbreiten oder abgeleitete Werke erstellen."
        ],
        "title": "14. Geistiges Eigentum"
      },
      {
        "paragraphs": [
          "Im größtmöglichen gesetzlich zulässigen Umfang haftet SwitchControl nicht für indirekte, beiläufig entstandene, besondere, Folgeschäden oder Strafschadenersatz, einschließlich, aber nicht beschränkt auf Datenverlust, Gewinnverlust oder Systemschäden, die aus Ihrer Nutzung oder der Unfähigkeit zur Nutzung des Dienstes entstehen."
        ],
        "title": "15. Haftungsbeschränkung"
      },
      {
        "paragraphs": [
          "SwitchControl kann jederzeit Funktionen, Preise, Zugangsstufen und die Dienststruktur aktualisieren. Wir können auch diese Bedingungen und unsere Datenschutzrichtlinie aktualisieren. Wenn wir wesentliche Änderungen vornehmen, aktualisieren wir das Datum „Zuletzt aktualisiert“. Die fortgesetzte Nutzung des Dienstes nach Inkrafttreten der Änderungen gilt als Annahme der aktualisierten Bedingungen."
        ],
        "title": "16. Änderungen am Dienst und diesen Bedingungen"
      },
      {
        "paragraphs": [
          "Bei Fragen zu diesen Bedingungen kontaktieren Sie uns unter switchcontrol67@gmail.com"
        ],
        "title": "17. Kontakt"
      }
    ],
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl sammelt und verwendet Informationen nur dort, wo dies erforderlich ist, um das Produkt bereitzustellen, Konten zu verwalten, Benutzer zu unterstützen, Betrug zu verhindern und die Sicherheit zu wahren. Diese Richtlinie erklärt, was wir sammeln, warum und wie es verarbeitet wird."
        ],
        "title": "1. Übersicht"
      },
      {
        "paragraphs": [
          "Wenn Sie sich anmelden, speichern wir:"
        ],
        "title": "2. Kontodaten"
      },
      {
        "paragraphs": [
          "Wir speichern Informationen über Ihren Zugangsstatus, damit das Produkt die richtigen Funktionen liefern kann. Dies beinhaltet:"
        ],
        "title": "3. Berechtigungs- und Zugangsdaten"
      },
      {
        "paragraphs": [
          "Um die Produktfunktionalität, Sicherheit und Kontoverwaltung zu unterstützen, können wir Folgendes aufzeichnen:"
        ],
        "title": "4. App- und Geräteaktivitätsdaten"
      },
      {
        "paragraphs": [
          "Bei der Nutzung der Desktop-App kann SwitchControl auf Hardware- und Systeminformationen zugreifen, um seine Optimierungs-, Analyse- und Beratungsfunktionen zu unterstützen. Dies beinhaltet:"
        ],
        "title": "5. System- und Telemetriedaten"
      },
      {
        "paragraphs": [
          "Autorisierte SwitchControl Administratoren können zu legitimen betrieblichen Zwecken auf Daten auf Kontoebene zugreifen, einschließlich:"
        ],
        "title": "6. Administrativer Zugriff"
      },
      {
        "paragraphs": [
          "Wir verwenden die von uns gespeicherten Daten, um:"
        ],
        "title": "7. Wie wir Ihre Daten verwenden"
      },
      {
        "paragraphs": [
          "Wir können Daten an vertrauenswürdige Dritte weitergeben, die beim Betrieb des Dienstes helfen:"
        ],
        "title": "8. Weitergabe und Dienstanbieter"
      },
      {
        "paragraphs": [
          "Wir verwenden Cookies und Sitzungstoken, um Sie angemeldet zu halten und Ihren Zugangsstatus über verschiedene Besuche hinweg aufrechtzuerhalten. Diese sind auf das für das Funktionieren des Dienstes erforderliche Maß beschränkt."
        ],
        "title": "9. Cookies und Sitzungsspeicherung"
      },
      {
        "paragraphs": [
          "Wir bewahren Ihre Daten so lange auf, wie dies für die folgenden Zwecke vernünftigerweise erforderlich ist:"
        ],
        "title": "10. Datenaufbewahrung"
      },
      {
        "paragraphs": [
          "Wir verwenden angemessene technische und organisatorische Sicherheitsvorkehrungen, um Kontodaten zu schützen. Kein System ist vollständig immun gegen Risiken. Wenn Sie glauben, dass Ihr Konto kompromittiert wurde, kontaktieren Sie uns umgehend."
        ],
        "title": "11. Sicherheit"
      },
      {
        "paragraphs": [
          "Abhängig von Ihrem Standort haben Sie möglicherweise das Recht:"
        ],
        "title": "12. Ihre Rechte und Kontolöschung"
      },
      {
        "paragraphs": [
          "SwitchControl ist nicht für die Nutzung durch Personen bestimmt, die in ihrer Rechtsprechung keine rechtsverbindliche Vereinbarung eingehen können oder die ohne entsprechende Erlaubnis der Eltern oder Erziehungsberechtigten unter dem erforderlichen Mindestalter sind. Wenn Sie glauben, dass ein Minderjähriger personenbezogene Daten ohne Erlaubnis bereitgestellt hat, kontaktieren Sie uns, damit wir diese entfernen können."
        ],
        "title": "13. Altersanforderungen"
      },
      {
        "paragraphs": [
          "Für Fragen zum Datenschutz, Datenanfragen oder Bedenken kontaktieren Sie uns unter switchcontrol67@gmail.com"
        ],
        "title": "14. Kontakt"
      }
    ]
  },
  "id": {
    "terms": [
      {
        "paragraphs": [
          "SwitchControl menyediakan perangkat lunak dan layanan yang dirancang untuk membantu pengguna mengonfigurasi, mengoptimalkan, dan menganalisis pengaturan Windows PC serta kinerja sistem. Dengan menggunakan SwitchControl, Anda menyetujui persyaratan ini. Jika Anda tidak setuju, jangan gunakan layanan ini."
        ],
        "title": "1. Gambaran Umum"
      },
      {
        "paragraphs": [
          "Anda harus mampu membuat perjanjian yang mengikat secara hukum di yurisdiksi Anda. Jika Anda berada di bawah usia minimum yang dipersyaratkan, Anda harus memiliki izin dari orang tua atau wali. Dengan menggunakan SwitchControl, Anda mengonfirmasi bahwa Anda memenuhi persyaratan ini."
        ],
        "title": "2. Kelayakan"
      },
      {
        "paragraphs": [
          "SwitchControl menawarkan tiga status akses: Free, akses dasar ke fitur tertentu tanpa biaya; Trial, akses sementara ke fitur Premium untuk waktu terbatas; dan Premium, akses fitur penuh, dibuka melalui pembelian. Fitur yang tersedia di setiap tingkat dapat berubah seiring waktu. SwitchControl berhak menyesuaikan apa yang disertakan dalam setiap paket."
        ],
        "title": "3. Tingkat akses"
      },
      {
        "paragraphs": [
          "Jika Anda menerima uji coba gratis fitur Premium:",
          "Uji coba bersifat sementara dan berakhir secara otomatis saat periode uji coba selesai",
          "Durasi uji coba dapat bervariasi dan ditentukan oleh SwitchControl",
          "Uji coba dapat diberikan secara manual oleh SwitchControl atas kebijakannya sendiri",
          "Uji coba tidak menjamin akses Premium yang berkelanjutan setelah berakhir",
          "Saat uji coba berakhir, akun Anda akan kembali ke akses Free standar kecuali Anda telah membeli Premium"
        ],
        "title": "4. Uji coba gratis"
      },
      {
        "paragraphs": [
          "Membeli Premium memberikan Anda lisensi pribadi yang tidak dapat dipindahtangankan untuk mengakses fitur Premium berdasarkan ketentuan yang berlaku pada saat pembelian. Harga, model akses, hak, dan rangkaian fitur dapat berubah seiring waktu. SwitchControl tidak menjamin bahwa fitur tertentu akan tetap tersedia tanpa batas waktu. Anda tidak boleh menjual kembali, memindahtangankan, atau membagikan akses Anda kepada orang lain kecuali diizinkan secara eksplisit."
        ],
        "title": "5. Akses dan lisensi Premium"
      },
      {
        "paragraphs": [
          "SwitchControl memberikan Anda hak terbatas, pribadi, non-eksklusif, dan tidak dapat dipindahtangankan untuk menggunakan perangkat lunak dan layanan untuk tujuan Anda sendiri. Semua hak yang tidak diberikan secara tegas adalah milik kami."
        ],
        "title": "6. Lisensi dan akses umum"
      },
      {
        "paragraphs": [
          "Anda setuju untuk tidak:",
          "Menggunakan layanan untuk tujuan yang melanggar hukum",
          "Mencoba untuk merekayasa balik, mendekompilasi, atau mengekstrak kode sumber atau logika layanan",
          "Mencoba untuk memintas, mengakali, atau merusak sistem hak, lisensi, atau kontrol akses",
          "Menggunakan alat otomatis, bot, atau skrip untuk menyalahgunakan atau membebani layanan secara berlebihan",
          "Mengganggu layanan atau menurunkan pengalaman bagi pengguna lain",
          "Mencoba akses tidak sah ke akun, sistem, atau data yang bukan milik Anda",
          "Mengunggah, mengirimkan, atau memasukkan malware atau kode berbahaya",
          "Menyalahgunakan identitas atau status akun Anda"
        ],
        "title": "7. Penggunaan yang dapat diterima"
      },
      {
        "paragraphs": [
          "SwitchControl dapat mengambil tindakan berikut pada akun mana pun sebagai bagian dari operasi platform normal:",
          "Memberikan, memodifikasi, atau mencabut tingkat akses (Free, Trial, Premium)",
          "Mengatur ulang tanda produk seperti status orientasi",
          "Menyelidiki dugaan penyalahgunaan, penipuan, atau pelanggaran kebijakan",
          "Menangguhkan atau menghentikan akses jika diperlukan (lihat Bagian 9)",
          "Memproses permintaan penghapusan akun",
          "Menanggapi persyaratan hukum, keamanan, atau dukungan",
          "Tindakan ini diambil hanya untuk alasan operasional atau keamanan yang sah dan dicatat."
        ],
        "title": "8. Tindakan akun administratif"
      },
      {
        "paragraphs": [
          "SwitchControl dapat menangguhkan atau menghentikan akses Anda, dengan atau tanpa pemberitahuan, jika kami secara wajar menentukan bahwa Anda telah melanggar Persyaratan Layanan ini, terlibat dalam perilaku curang, kasar, atau menipu, mencoba merusak atau mengakali kontrol akses atau sistem hak, menimbulkan risiko keamanan bagi layanan atau pengguna lain, atau menggunakan layanan dengan cara yang menyebabkan bahaya atau paparan hukum. Jika akun Anda ditangguhkan atau dihentikan karena suatu alasan, Anda tidak berhak atas pengembalian dana."
        ],
        "title": "9. Penangguhan dan penghentian"
      },
      {
        "paragraphs": [
          "SwitchControl dapat memodifikasi pengaturan Windows, preferensi sistem, konfigurasi startup, parameter jaringan, dan profil daya tergantung pada fitur yang Anda gunakan. Anda bertanggung jawab untuk menggunakan perangkat lunak dengan hati-hati dan memahami apa yang dilakukan setiap fitur sebelum menerapkannya. SwitchControl tidak bertanggung jawab atas ketidakstabilan sistem, kehilangan data, atau masalah lain yang mungkin timbul dari penerapan perubahan pada sistem Anda. Selalu cadangkan data penting sebelum menggunakan alat pengoptimalan."
        ],
        "title": "10. Perubahan sistem dan risiko"
      },
      {
        "paragraphs": [
          "SwitchControl tidak menjamin hasil kinerja tertentu. Hasil bervariasi berdasarkan konfigurasi perangkat keras, perangkat lunak yang terinstal, driver, kondisi jaringan, dan banyak faktor lain di luar kendali kami. Ini termasuk namun tidak terbatas pada: FPS, waktu bingkai, latensi input, ping, stabilitas jaringan, kecepatan booting, dan responsivitas sistem secara umum. Rekomendasi yang dihasilkan AI dan output advisor disediakan hanya sebagai panduan informasi, dan tidak dijamin akurat atau cocok untuk setiap sistem."
        ],
        "title": "11. Tidak ada hasil yang dijamin"
      },
      {
        "paragraphs": [
          "Semua harga ditampilkan saat checkout sebelum Anda menyelesaikan pembelian. Pembayaran ditangani dengan aman oleh pemroses pembayaran pihak ketiga kami.",
          "Semua penjualan bersifat final kecuali pengembalian dana secara tegas ditawarkan oleh SwitchControl atau diwajibkan oleh hukum yang berlaku",
          "Pajak mungkin berlaku berdasarkan lokasi Anda dan aturan penyedia pembayaran",
          "Jika Anda yakin ada kesalahan dalam tagihan, hubungi kami segera"
        ],
        "title": "12. Pembayaran dan pengembalian dana"
      },
      {
        "paragraphs": [
          "Beberapa fitur bergantung pada penyedia pihak ketiga termasuk pemroses pembayaran, layanan autentikasi, dan infrastruktur hosting. Ketentuan dan kebijakan privasi mereka mungkin juga berlaku untuk penggunaan layanan tersebut oleh Anda. SwitchControl tidak bertanggung jawab atas perilaku atau kebijakan pihak ketiga."
        ],
        "title": "13. Layanan pihak ketiga"
      },
      {
        "paragraphs": [
          "Semua hak atas perangkat lunak, merek, desain, konten, dan layanan SwitchControl dimiliki oleh SwitchControl. Tidak ada satu pun dalam persyaratan ini yang mengalihkan kepemilikan apa pun kepada Anda. Anda tidak boleh mereproduksi, mendistribusikan, atau membuat karya turunan dari bagian mana pun dari SwitchControl tanpa izin tertulis yang eksplisit."
        ],
        "title": "14. Kekayaan intelektual"
      },
      {
        "paragraphs": [
          "Sejauh diizinkan oleh hukum, SwitchControl tidak bertanggung jawab atas kerusakan tidak langsung, insidental, khusus, konsekuensial, atau hukuman, termasuk namun tidak terbatas pada kehilangan data, kehilangan keuntungan, atau kerusakan sistem, yang timbul dari penggunaan Anda, atau ketidakmampuan untuk menggunakan, layanan tersebut."
        ],
        "title": "15. Batasan tanggung jawab"
      },
      {
        "paragraphs": [
          "SwitchControl dapat memperbarui fitur, harga, tingkat akses, dan struktur layanan kapan saja. Kami juga dapat memperbarui ketentuan ini dan Kebijakan Privasi kami. Ketika kami membuat perubahan material, kami akan memperbarui tanggal “Terakhir diperbarui”. Penggunaan layanan yang berkelanjutan setelah perubahan berlaku merupakan penerimaan terhadap persyaratan yang diperbarui."
        ],
        "title": "16. Perubahan pada layanan dan ketentuan ini"
      },
      {
        "paragraphs": [
          "Untuk pertanyaan tentang persyaratan ini, hubungi kami di switchcontrol67@gmail.com"
        ],
        "title": "17. Kontak"
      }
    ],
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl mengumpulkan dan menggunakan informasi hanya jika diperlukan untuk menyediakan produk, mengelola akun, mendukung pengguna, mencegah penipuan, dan menjaga keamanan. Kebijakan ini menjelaskan apa yang kami kumpulkan, mengapa, dan bagaimana data tersebut ditangani."
        ],
        "title": "1. Gambaran Umum"
      },
      {
        "paragraphs": [
          "Saat Anda masuk, kami menyimpan:",
          "Alamat email Anda",
          "Nama tampilan Anda, jika disediakan oleh penyedia autentikasi Anda",
          "Pengidentifikasi akun unik",
          "Metadata autentikasi yang diperlukan untuk mengelola sesi masuk Anda (seperti token penyedia OAuth)"
        ],
        "title": "2. Data akun"
      },
      {
        "paragraphs": [
          "Kami menyimpan informasi tentang status akses Anda agar produk dapat memberikan fitur yang benar. Ini termasuk:",
          "Paket Anda saat ini (Free, Trial, atau Premium)",
          "Tanggal mulai, tanggal berakhir, dan durasi uji coba jika uji coba telah diaktifkan",
          "Status aktivasi dan pembayaran Premium",
          "Apakah Anda telah menyelesaikan tur orientasi atau alur penyiapan pertama kali",
          "Tanda akses fitur yang digunakan untuk menentukan apa yang dapat Anda lihat dan gunakan"
        ],
        "title": "3. Data hak dan akses"
      },
      {
        "paragraphs": [
          "Untuk mendukung fungsionalitas produk, keamanan, dan manajemen akun, kami dapat merekam:",
          "Waktu masuk terakhir Anda",
          "Terakhir kali aplikasi desktop aktif di perangkat Anda",
          "Apakah aplikasi telah diinstal dan digunakan",
          "Peristiwa aktivitas akun atau admin yang relevan dengan keamanan, dukungan, dan pencegahan penipuan",
          "Kami tidak merekam penekanan tombol, file pribadi, konten papan klip, atau riwayat penjelajahan lengkap."
        ],
        "title": "4. Data aktivitas aplikasi dan perangkat"
      },
      {
        "paragraphs": [
          "Saat menggunakan aplikasi desktop, SwitchControl dapat mengakses informasi perangkat keras dan sistem untuk mendukung fitur pengoptimalan, analisis, dan sarannya. Ini termasuk:",
          "Informasi profil perangkat keras (CPU, GPU, RAM, penyimpanan) yang digunakan oleh fitur pengoptimalan dan advisor",
          "Metrik sistem waktu nyata (beban CPU, penggunaan memori, beban GPU) yang ditampilkan di dasbor",
          "Data diagnostik yang digunakan oleh AI Advisor dan BIOS Advisor untuk menghasilkan rekomendasi",
          "Data konfigurasi jaringan yang digunakan oleh fitur pengoptimalan jaringan",
          "Data ini digunakan secara lokal untuk mendukung fitur aplikasi. Kami hanya mengumpulkan apa yang diperlukan untuk menyediakan fungsionalitas, analisis, dan dukungan, dan tidak lebih."
        ],
        "title": "5. Data sistem dan telemetri"
      },
      {
        "paragraphs": [
          "Administrator SwitchControl yang berwenang dapat mengakses data tingkat akun untuk tujuan operasional yang sah, termasuk:",
          "Memberikan atau mencabut akses uji coba atau premium",
          "Memperbarui status langganan atau paket",
          "Mengatur ulang tanda produk seperti penyelesaian orientasi",
          "Memproses permintaan penghapusan akun",
          "Menyelidiki laporan penyalahgunaan, penipuan, atau pelanggaran kebijakan",
          "Menyediakan dukungan akun",
          "Tindakan administratif dicatat untuk tujuan akuntabilitas dan keamanan."
        ],
        "title": "6. Akses administratif"
      },
      {
        "paragraphs": [
          "Kami menggunakan data yang kami miliki untuk:",
          "Membuat dan mengelola akun Anda",
          "Memberikan fitur yang menjadi hak paket Anda",
          "Mendukung fitur pengoptimalan, advisor, dan diagnostik di aplikasi",
          "Memproses dan memverifikasi pembayaran",
          "Mencegah penipuan, penyalahgunaan, dan akses tidak sah",
          "Menyediakan dukungan pelanggan dan teknis",
          "Mematuhi kewajiban hukum"
        ],
        "title": "7. Bagaimana kami menggunakan data Anda"
      },
      {
        "paragraphs": [
          "Kami mungkin membagikan data dengan pihak ketiga tepercaya yang membantu mengoperasikan layanan:",
          "Pemroses pembayaran, untuk menyelesaikan dan memverifikasi pembelian",
          "Penyedia autentikasi, seperti Google, untuk menangani proses masuk",
          "Penyedia hosting dan infrastruktur, untuk menjalankan dan memberikan layanan",
          "Kami tidak menjual informasi pribadi Anda. Kami tidak membagikan data untuk tujuan periklanan."
        ],
        "title": "8. Berbagi dan penyedia layanan"
      },
      {
        "paragraphs": [
          "Kami menggunakan cookie dan token sesi agar Anda tetap masuk dan mempertahankan status akses Anda di seluruh kunjungan. Ini terbatas pada apa yang diperlukan agar layanan berfungsi."
        ],
        "title": "9. Cookie dan penyimpanan sesi"
      },
      {
        "paragraphs": [
          "Kami menyimpan data Anda selama diperlukan secara wajar untuk tujuan berikut:",
          "Memberikan dan mendukung produk",
          "Memelihara catatan penagihan dan pembayaran",
          "Pencegahan penipuan dan keamanan",
          "Memenuhi kewajiban hukum atau peraturan",
          "Menyelesaikan sengketa atau menangani kasus dukungan",
          "Memelihara catatan audit jika diperlukan secara operasional",
          "Jika Anda meminta penghapusan akun Anda, kami akan menghapus data Anda dengan tunduk pada persyaratan penahanan hukum atau keamanan apa pun."
        ],
        "title": "10. Retensi data"
      },
      {
        "paragraphs": [
          "Kami menggunakan perlindungan teknis dan organisasi yang wajar untuk melindungi data akun. Tidak ada sistem yang sepenuhnya kebal terhadap risiko. Jika Anda yakin akun Anda telah disusupi, hubungi kami segera."
        ],
        "title": "11. Keamanan"
      },
      {
        "paragraphs": [
          "Tergantung pada lokasi Anda, Anda mungkin memiliki hak untuk:",
          "Meminta salinan data yang kami miliki tentang Anda",
          "Meminta koreksi atas data yang tidak akurat",
          "Meminta penghapusan akun dan data terkait Anda",
          "Keberatan atau membatasi penggunaan tertentu atas data Anda",
          "Untuk membuat permintaan ini, kirim email kepada kami di switchcontrol67@gmail.com. Kami akan merespons dengan cepat. Perhatikan bahwa beberapa data mungkin tetap disimpan setelah penghapusan jika diwajibkan secara hukum atau operasional (misalnya, catatan penagihan atau log keamanan)."
        ],
        "title": "12. Hak Anda dan penghapusan akun"
      },
      {
        "paragraphs": [
          "SwitchControl tidak ditujukan untuk digunakan oleh siapa pun yang tidak dapat secara hukum membuat perjanjian yang mengikat di yurisdiksinya, atau yang berada di bawah usia minimum yang diwajibkan tanpa izin orang tua atau wali yang sesuai. Jika Anda yakin seorang anak di bawah umur telah memberikan data pribadi tanpa izin, hubungi kami agar kami dapat menghapusnya."
        ],
        "title": "13. Persyaratan usia"
      },
      {
        "paragraphs": [
          "Untuk pertanyaan privasi, permintaan data, atau masalah, hubungi kami di switchcontrol67@gmail.com"
        ],
        "title": "14. Kontak"
      }
    ]
  },
  "ko": {
    "terms": [
      {
        "paragraphs": [
          "SwitchControl은 사용자가 Windows PC 설정 및 시스템 성능을 구성, 최적화 및 분석할 수 있도록 돕는 소프트웨어와 서비스를 제공합니다. SwitchControl을 사용함으로써 귀하는 본 약관에 동의하게 됩니다. 동의하지 않는 경우 서비스를 사용하지 마십시오."
        ],
        "title": "1. 개요"
      },
      {
        "paragraphs": [
          "귀하는 귀하의 관할권에서 법적 구속력이 있는 계약을 체결할 수 있어야 합니다. 최소 연령 미만인 경우 부모 또는 보호자의 동의가 있어야 합니다. SwitchControl을 사용함으로써 귀하는 이러한 요건을 충족함을 확인하는 것입니다."
        ],
        "title": "2. 자격 요건"
      },
      {
        "paragraphs": [
          "SwitchControl은 세 가지 액세스 상태를 제공합니다: 선택된 기능을 무료로 이용할 수 있는 Free, 프리미엄 기능을 일정 기간 동안 임시로 이용할 수 있는 Trial, 구매를 통해 잠금 해제되는 전체 기능 액세스인 Premium. 각 등급에서 제공되는 기능은 시간이 지남에 따라 변경될 수 있습니다. SwitchControl은 각 플랜에 포함된 내용을 조정할 권리를 보유합니다."
        ],
        "title": "3. 액세스 등급"
      },
      {
        "paragraphs": [
          "프리미엄 기능의 무료 체험을 받는 경우:"
        ],
        "title": "4. 무료 체험(Free trials)"
      },
      {
        "paragraphs": [
          "프리미엄을 구매하면 구매 시점에 적용되는 약관에 따라 프리미엄 기능을 액세스할 수 있는 개인적이고 양도 불가능한 라이선스가 부여됩니다. 가격, 액세스 모델, 자격 및 기능 세트는 시간이 지남에 따라 변경될 수 있습니다. SwitchControl은 특정 기능이 무기한 제공될 것이라고 보장하지 않습니다. 명시적으로 허용된 경우를 제외하고 귀하는 귀하의 액세스 권한을 재판매, 양도 또는 공유할 수 없습니다."
        ],
        "title": "5. 프리미엄 액세스 및 라이선스"
      },
      {
        "paragraphs": [
          "SwitchControl은 귀하에게 본인 목적을 위해 소프트웨어와 서비스를 사용할 수 있는 제한적이고 개인적이며 비독점적이고 양도 불가능한 권리를 부여합니다. 명시적으로 부여되지 않은 모든 권리는 보유됩니다."
        ],
        "title": "6. 라이선스 및 일반 액세스"
      },
      {
        "paragraphs": [
          "귀하는 다음 사항을 수행하지 않는 것에 동의합니다:"
        ],
        "title": "7. 허용되는 사용"
      },
      {
        "paragraphs": [
          "SwitchControl은 정상적인 플랫폼 운영의 일환으로 모든 계정에 대해 다음 작업을 수행할 수 있습니다:"
        ],
        "title": "8. 관리 계정 작업"
      },
      {
        "paragraphs": [
          "귀하가 본 서비스 약관을 위반했거나, 사기, 학대 또는 기만적인 행동에 가담했거나, 액세스 제어 또는 권한 시스템을 조작하거나 우회하려고 시도했거나, 서비스 또는 다른 사용자에게 보안 위험을 초래했거나, 피해 또는 법적 책임을 야기하는 방식으로 서비스를 사용했다고 합리적으로 판단되는 경우 SwitchControl은 통지 여부와 관계없이 귀하의 액세스를 일시 중지하거나 종료할 수 있습니다. 위반 사유로 계정이 일시 중지되거나 종료된 경우 귀하는 환불을 받을 자격이 없습니다."
        ],
        "title": "9. 일시 중지 및 종료"
      },
      {
        "paragraphs": [
          "SwitchControl은 사용하는 기능에 따라 Windows 설정, 시스템 기본 설정, 시작 구성, 네트워크 매개변수 및 전원 프로필을 수정할 수 있습니다. 귀하는 소프트웨어를 주의 깊게 사용하고 각 기능이 적용되기 전에 어떤 역할을 하는지 이해할 책임이 있습니다. SwitchControl은 시스템에 변경 사항을 적용함으로써 발생할 수 있는 시스템 불안정, 데이터 손실 또는 기타 문제에 대해 책임을 지지 않습니다. 최적화 도구를 사용하기 전에 항상 중요한 데이터를 백업하십시오."
        ],
        "title": "10. 시스템 변경 및 위험"
      },
      {
        "paragraphs": [
          "SwitchControl은 특정 성능 결과를 보장하지 않습니다. 결과는 하드웨어 구성, 설치된 소프트웨어, 드라이버, 네트워크 상태 및 당사가 통제할 수 없는 기타 여러 요인에 따라 다릅니다. 여기에는 FPS, 프레임 시간, 입력 지연, 핑, 네트워크 안정성, 부팅 속도 및 일반적인 시스템 응답성이 포함되나 이에 국한되지 않습니다. AI Advisor 및 BIOS Advisor의 AI 생성 권장 사항은 정보 제공 목적으로만 제공되며, 모든 시스템에 대해 정확하거나 적합하다고 보장되지 않습니다."
        ],
        "title": "11. 결과 보장 없음"
      },
      {
        "paragraphs": [
          "모든 가격은 구매를 완료하기 전 결제 단계에서 표시됩니다. 결제는 타사 결제 처리업체에 의해 안전하게 처리됩니다."
        ],
        "title": "12. 결제 및 환불"
      },
      {
        "paragraphs": [
          "일부 기능은 결제 처리업체, 인증 서비스 및 호스팅 인프라를 포함한 제3자 제공업체에 의존합니다. 해당 서비스 이용 시 해당 업체의 약관 및 개인정보 보호정책이 적용될 수 있습니다. SwitchControl은 제3자의 행위나 정책에 대해 책임을 지지 않습니다."
        ],
        "title": "13. 제3자 서비스"
      },
      {
        "paragraphs": [
          "SwitchControl 소프트웨어, 브랜드, 디자인, 콘텐츠 및 서비스에 대한 모든 권리는 SwitchControl이 소유합니다. 본 약관의 어떠한 내용도 귀하에게 소유권을 양도하지 않습니다. 명시적인 서면 허가 없이 SwitchControl의 일부를 복제, 배포하거나 파생물을 생성할 수 없습니다."
        ],
        "title": "14. 지적 재산권"
      },
      {
        "paragraphs": [
          "법이 허용하는 최대 범위 내에서, SwitchControl은 서비스 사용 또는 사용 불능으로 인해 발생하는 데이터 손실, 이익 손실 또는 시스템 손상을 포함하되 이에 국한되지 않는 간접적, 부수적, 특별, 결과적 또는 징벌적 손해에 대해 책임을 지지 않습니다."
        ],
        "title": "15. 책임의 제한"
      },
      {
        "paragraphs": [
          "SwitchControl은 언제든지 기능, 가격, 액세스 등급 및 서비스 구조를 업데이트할 수 있습니다. 또한 본 약관과 개인정보 보호정책을 업데이트할 수 있습니다. 중요한 변경 사항이 있을 경우 \"마지막 업데이트\" 날짜를 업데이트합니다. 변경 사항이 적용된 후에도 서비스를 계속 사용하는 것은 업데이트된 약관에 동의함을 의미합니다."
        ],
        "title": "16. 서비스 및 본 약관의 변경"
      },
      {
        "paragraphs": [
          "본 약관에 대한 질문은 switchcontrol67@gmail.com으로 문의하십시오."
        ],
        "title": "17. 연락처"
      }
    ],
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl은 제품 제공, 계정 관리, 사용자 지원, 사기 방지 및 보안 유지를 위해 필요한 경우에만 정보를 수집하고 사용합니다. 본 정책은 수집하는 정보, 수집 이유 및 처리 방법에 대해 설명합니다."
        ],
        "title": "1. 개요"
      },
      {
        "paragraphs": [
          "로그인 시 다음 정보를 저장합니다:"
        ],
        "title": "2. 계정 데이터"
      },
      {
        "paragraphs": [
          "제품이 올바른 기능을 제공할 수 있도록 귀하의 액세스 상태에 대한 정보를 저장합니다. 여기에는 다음이 포함됩니다:"
        ],
        "title": "3. 권한 및 액세스 데이터"
      },
      {
        "paragraphs": [
          "제품 기능, 보안 및 계정 관리를 지원하기 위해 다음을 기록할 수 있습니다:"
        ],
        "title": "4. 앱 및 기기 활동 데이터"
      },
      {
        "paragraphs": [
          "데스크톱 앱을 사용할 때 SwitchControl은 최적화, 분석 및 자문 기능을 강화하기 위해 하드웨어 및 시스템 정보에 액세스할 수 있습니다. 여기에는 다음이 포함됩니다:"
        ],
        "title": "5. 시스템 및 원격 측정 데이터"
      },
      {
        "paragraphs": [
          "승인된 SwitchControl 관리자는 다음과 같은 합법적인 운영 목적을 위해 계정 수준 데이터에 액세스할 수 있습니다:"
        ],
        "title": "6. 관리자 액세스"
      },
      {
        "paragraphs": [
          "당사는 보유한 데이터를 다음 목적으로 사용합니다:"
        ],
        "title": "7. 데이터 사용 방식"
      },
      {
        "paragraphs": [
          "서비스 운영을 돕는 신뢰할 수 있는 제3자와 데이터를 공유할 수 있습니다:"
        ],
        "title": "8. 공유 및 서비스 제공업체"
      },
      {
        "paragraphs": [
          "귀하의 로그인 상태를 유지하고 방문 간 액세스 상태를 유지하기 위해 쿠키와 세션 토큰을 사용합니다. 이는 서비스 작동에 필요한 범위로 제한됩니다."
        ],
        "title": "9. 쿠키 및 세션 저장소"
      },
      {
        "paragraphs": [
          "다음 목적을 위해 합리적으로 필요한 기간 동안 귀하의 데이터를 보존합니다:"
        ],
        "title": "10. 데이터 보존"
      },
      {
        "paragraphs": [
          "당사는 계정 데이터를 보호하기 위해 합리적인 기술적 및 조직적 보호 조치를 사용합니다. 어떤 시스템도 위험으로부터 완전히 자유로울 수는 없습니다. 귀하의 계정이 손상되었다고 판단되면 즉시 당사에 문의하십시오."
        ],
        "title": "11. 보안"
      },
      {
        "paragraphs": [
          "거주 지역에 따라 귀하는 다음과 같은 권리를 가질 수 있습니다:"
        ],
        "title": "12. 귀하의 권리 및 계정 삭제"
      },
      {
        "paragraphs": [
          "SwitchControl은 관할권 내에서 법적 구속력이 있는 계약을 체결할 수 없거나 적절한 부모 또는 보호자의 동의 없이 최소 연령 미만인 사람이 사용하도록 의도되지 않았습니다. 미성년자가 동의 없이 개인정보를 제공했다고 판단되는 경우 당사에 연락하여 삭제할 수 있도록 하십시오."
        ],
        "title": "13. 연령 요건"
      },
      {
        "paragraphs": [
          "개인정보 관련 질문, 데이터 요청 또는 우려 사항은 switchcontrol67@gmail.com으로 문의하십시오."
        ],
        "title": "14. 연락처"
      }
    ]
  },
  "fr": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl collecte et utilise des informations uniquement lorsque cela est nécessaire pour fournir le produit, gérer les comptes, assister les utilisateurs, prévenir la fraude et maintenir la sécurité. Cette politique explique ce que nous collectons, pourquoi et comment cela est traité."
        ],
        "title": "1. Vue d'ensemble"
      },
      {
        "paragraphs": [
          "Lorsque vous vous connectez, nous stockons :"
        ],
        "title": "2. Données de compte"
      },
      {
        "paragraphs": [
          "Nous stockons des informations sur votre état d'accès afin que le produit puisse fournir les fonctionnalités correctes. Cela inclut :"
        ],
        "title": "3. Données sur les droits et l'accès"
      },
      {
        "paragraphs": [
          "Pour prendre en charge la fonctionnalité du produit, la sécurité et la gestion du compte, nous pouvons enregistrer :"
        ],
        "title": "4. Données d'activité de l'application et de l'appareil"
      },
      {
        "paragraphs": [
          "Lors de l'utilisation de l'application de bureau, SwitchControl peut accéder aux informations matérielles et système pour alimenter ses fonctionnalités d'optimisation, d'analyse et de conseil. Cela inclut :"
        ],
        "title": "5. Données système et de télémétrie"
      },
      {
        "paragraphs": [
          "Les administrateurs autorisés de SwitchControl peuvent accéder aux données au niveau du compte à des fins opérationnelles légitimes, notamment :"
        ],
        "title": "6. Accès administratif"
      },
      {
        "paragraphs": [
          "Nous utilisons les données que nous détenons pour :"
        ],
        "title": "7. Comment nous utilisons vos données"
      },
      {
        "paragraphs": [
          "Nous pouvons partager des données avec des tiers de confiance qui aident à faire fonctionner le service :"
        ],
        "title": "8. Partage et prestataires de services"
      },
      {
        "paragraphs": [
          "Nous utilisons des cookies et des jetons de session pour vous garder connecté et maintenir votre état d'accès d'une visite à l'autre. Ceux-ci sont limités à ce qui est nécessaire au fonctionnement du service."
        ],
        "title": "9. Cookies et stockage de session"
      },
      {
        "paragraphs": [
          "Nous conservons vos données aussi longtemps que cela est raisonnablement nécessaire aux fins suivantes :"
        ],
        "title": "10. Conservation des données"
      },
      {
        "paragraphs": [
          "Nous utilisons des mesures de protection techniques et organisationnelles raisonnables pour protéger les données du compte. Aucun système n'est totalement à l'abri des risques. Si vous pensez que votre compte a été compromis, contactez-nous immédiatement."
        ],
        "title": "11. Sécurité"
      },
      {
        "paragraphs": [
          "Selon votre emplacement, vous pouvez avoir le droit de :"
        ],
        "title": "12. Vos droits et suppression de compte"
      },
      {
        "paragraphs": [
          "SwitchControl n'est pas destiné à être utilisé par quiconque ne pouvant pas conclure légalement un accord contraignant dans sa juridiction, ou qui est en dessous de l'âge minimum requis sans l'autorisation appropriée d'un parent ou d'un tuteur. Si vous pensez qu'un mineur a fourni des données personnelles sans autorisation, contactez-nous afin que nous puissions les supprimer."
        ],
        "title": "13. Exigences d'âge"
      },
      {
        "paragraphs": [
          "Pour toute question relative à la confidentialité, demande de données ou préoccupation, contactez-nous à switchcontrol67@gmail.com"
        ],
        "title": "14. Contact"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl fournit des logiciels et des services conçus pour aider les utilisateurs à configurer, optimiser et analyser les paramètres Windows PC et les performances du système. En utilisant SwitchControl, vous acceptez ces conditions. Si vous n'êtes pas d'accord, n'utilisez pas le service."
        ],
        "title": "1. Vue d'ensemble"
      },
      {
        "paragraphs": [
          "Vous devez être en mesure de conclure un accord juridiquement contraignant dans votre juridiction. Si vous avez moins que l'âge minimum requis, vous devez avoir l'autorisation d'un parent ou d'un tuteur. En utilisant SwitchControl, vous confirmez que vous remplissez ces exigences."
        ],
        "title": "2. Admissibilité"
      },
      {
        "paragraphs": [
          "SwitchControl propose trois états d'accès : Free, un accès de base à certaines fonctionnalités sans frais ; Trial, un accès temporaire aux fonctionnalités Premium pour une durée limitée ; et Premium, un accès complet aux fonctionnalités, débloqué par achat. Les fonctionnalités disponibles à chaque niveau peuvent changer au fil du temps. SwitchControl se réserve le droit d'ajuster ce qui est inclus dans chaque plan."
        ],
        "title": "3. Niveaux d'accès"
      },
      {
        "paragraphs": [
          "Si vous recevez un essai gratuit des fonctionnalités Premium :"
        ],
        "title": "4. Essais gratuits"
      },
      {
        "paragraphs": [
          "L'achat de Premium vous accorde une licence personnelle et incessible pour accéder aux fonctionnalités Premium selon les conditions en vigueur au moment de l'achat. La tarification, les modèles d'accès, les droits et les ensembles de fonctionnalités peuvent changer au fil du temps. SwitchControl ne garantit pas qu'une fonctionnalité spécifique restera disponible indéfiniment. Vous ne pouvez pas revendre, transférer ou partager votre accès avec des tiers, sauf autorisation explicite."
        ],
        "title": "5. Accès Premium et licences"
      },
      {
        "paragraphs": [
          "SwitchControl vous accorde un droit limité, personnel, non exclusif et incessible d'utiliser le logiciel et le service pour vos propres besoins. Tous les droits non expressément accordés sont réservés."
        ],
        "title": "6. Licence et accès général"
      },
      {
        "paragraphs": [
          "Vous acceptez de ne pas :"
        ],
        "title": "7. Utilisation acceptable"
      },
      {
        "paragraphs": [
          "SwitchControl peut prendre les mesures suivantes sur tout compte dans le cadre des opérations normales de la plateforme :"
        ],
        "title": "8. Actions administratives sur le compte"
      },
      {
        "paragraphs": [
          "SwitchControl peut suspendre ou résilier votre accès, avec ou sans préavis, si nous déterminons raisonnablement que vous avez enfreint ces Conditions d'utilisation, engagé un comportement frauduleux, abusif ou trompeur, tenté de manipuler ou de contourner les contrôles d'accès ou les systèmes de droits, présenté un risque de sécurité pour le service ou d'autres utilisateurs, ou utilisé le service d'une manière causant des préjudices ou une exposition juridique. Si votre compte est suspendu ou résilié pour motif valable, vous n'avez pas droit à un remboursement."
        ],
        "title": "9. Suspension et résiliation"
      },
      {
        "paragraphs": [
          "SwitchControl peut modifier les paramètres Windows, les préférences système, la configuration de démarrage, les paramètres réseau et les profils d'alimentation en fonction des fonctionnalités que vous utilisez. Vous êtes responsable de l'utilisation prudente du logiciel et de la compréhension de ce que fait chaque fonctionnalité avant de l'appliquer. SwitchControl n'est pas responsable de l'instabilité du système, de la perte de données ou d'autres problèmes pouvant découler de l'application de modifications sur votre système. Sauvegardez toujours les données importantes avant d'utiliser des outils d'optimisation."
        ],
        "title": "10. Modifications du système et risques"
      },
      {
        "paragraphs": [
          "SwitchControl ne garantit pas de résultats de performance spécifiques. Les résultats varient en fonction de la configuration matérielle, des logiciels installés, des pilotes, des conditions réseau et de nombreux autres facteurs hors de notre contrôle. Cela inclut, sans s'y limiter : les FPS, le temps de trame, la latence d'entrée, le ping, la stabilité du réseau, la vitesse de démarrage et la réactivité générale du système. Les recommandations générées par l'AI Advisor et le BIOS Advisor sont fournies à titre informatif uniquement ; elles ne sont pas garanties comme étant exactes ou adaptées à chaque système."
        ],
        "title": "11. Aucune garantie de résultats"
      },
      {
        "paragraphs": [
          "Tous les prix sont affichés au moment de la commande avant que vous ne finalisiez un achat. Les paiements sont traités en toute sécurité par notre processeur de paiement tiers."
        ],
        "title": "12. Paiements et remboursements"
      },
      {
        "paragraphs": [
          "Certaines fonctionnalités dépendent de fournisseurs tiers, notamment des processeurs de paiement, des services d'authentification et une infrastructure d'hébergement. Leurs conditions et politiques de confidentialité peuvent également s'appliquer à votre utilisation de ces services. SwitchControl n'est pas responsable de la conduite ou des politiques des tiers."
        ],
        "title": "13. Services tiers"
      },
      {
        "paragraphs": [
          "Tous les droits sur le logiciel, la marque, le design, le contenu et les services SwitchControl sont la propriété de SwitchControl. Rien dans ces conditions ne vous transfère de droits de propriété. Vous ne pouvez pas reproduire, distribuer ou créer des œuvres dérivées à partir d'une quelconque partie de SwitchControl sans autorisation écrite explicite."
        ],
        "title": "14. Propriété intellectuelle"
      },
      {
        "paragraphs": [
          "Dans la mesure maximale permise par la loi, SwitchControl n'est pas responsable des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, y compris, mais sans s'y limiter, la perte de données, la perte de profit ou les dommages au système découlant de votre utilisation ou de votre incapacité à utiliser le service."
        ],
        "title": "15. Limitation de responsabilité"
      },
      {
        "paragraphs": [
          "SwitchControl peut mettre à jour les fonctionnalités, la tarification, les niveaux d'accès et la structure du service à tout moment. Nous pouvons également mettre à jour ces conditions et notre Politique de confidentialité. Lorsque nous apportons des modifications importantes, nous mettrons à jour la date de « Dernière mise à jour ». L'utilisation continue du service après la prise d'effet des modifications constitue l'acceptation des conditions mises à jour."
        ],
        "title": "16. Modifications du service et de ces conditions"
      },
      {
        "paragraphs": [
          "Pour toute question concernant ces conditions, contactez-nous à switchcontrol67@gmail.com"
        ],
        "title": "17. Contact"
      }
    ]
  },
  "te": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl ఉత్పత్తిని అందించడానికి, ఖాతాలను నిర్వహించడానికి, వినియోగదారులకు మద్దతు ఇవ్వడానికి, మోసాన్ని నిరోధించడానికి మరియు భద్రతను నిర్వహించడానికి అవసరమైనప్పుడు మాత్రమే సమాచారాన్ని సేకరిస్తుంది మరియు ఉపయోగిస్తుంది. ఈ విధానం మేము ఏమి సేకరిస్తాము, ఎందుకు మరియు అది ఎలా నిర్వహించబడుతుందో వివరిస్తుంది."
        ],
        "title": "1. అవలోకనం"
      },
      {
        "paragraphs": [
          "మీరు సైన్ ఇన్ చేసినప్పుడు, మేము నిల్వ చేస్తాము:"
        ],
        "title": "2. ఖాతా డేటా"
      },
      {
        "paragraphs": [
          "ఉత్పత్తి సరైన ఫీచర్లను అందించడానికి మీ యాక్సెస్ స్థితి గురించి మేము సమాచారాన్ని నిల్వ చేస్తాము. ఇందులో ఇవి ఉన్నాయి:"
        ],
        "title": "3. ఎంటైటిల్‌మెంట్ మరియు యాక్సెస్ డేటా"
      },
      {
        "paragraphs": [
          "ఉత్పత్తి కార్యాచరణ, భద్రత మరియు ఖాతా నిర్వహణకు మద్దతు ఇవ్వడానికి, మేము వీటిని రికార్డ్ చేయవచ్చు:"
        ],
        "title": "4. యాప్ మరియు పరికర కార్యాచరణ డేటా"
      },
      {
        "paragraphs": [
          "డెస్క్‌టాప్ యాప్‌ను ఉపయోగిస్తున్నప్పుడు, SwitchControl దాని ఆప్టిమైజేషన్, విశ్లేషణ మరియు సలహా ఫీచర్లకు శక్తినివ్వడానికి హార్డ్‌వేర్ మరియు సిస్టమ్ సమాచారాన్ని యాక్సెస్ చేయవచ్చు. ఇందులో ఇవి ఉన్నాయి:"
        ],
        "title": "5. సిస్టమ్ మరియు టెలిమెట్రీ డేటా"
      },
      {
        "paragraphs": [
          "అధికారిక SwitchControl అడ్మినిస్ట్రేటర్లు చట్టబద్ధమైన కార్యాచరణ ప్రయోజనాల కోసం ఖాతా-స్థాయి డేటాను యాక్సెస్ చేయవచ్చు, ఇందులో ఇవి ఉన్నాయి:"
        ],
        "title": "6. పరిపాలనా యాక్సెస్"
      },
      {
        "paragraphs": [
          "మేము కలిగి ఉన్న డేటాను మేము వీటి కోసం ఉపయోగిస్తాము:"
        ],
        "title": "7. మేము మీ డేటాను ఎలా ఉపయోగిస్తాము"
      },
      {
        "paragraphs": [
          "సేవను నిర్వహించడంలో సహాయపడే విశ్వసనీయ మూడవ పక్షాలతో మేము డేటాను పంచుకోవచ్చు:"
        ],
        "title": "8. షేరింగ్ మరియు సేవా ప్రదాతలు"
      },
      {
        "paragraphs": [
          "మీరు సైన్ ఇన్ అయి ఉండటానికి మరియు సందర్శనల అంతటా మీ యాక్సెస్ స్థితిని నిర్వహించడానికి మేము కుక్కీలు మరియు సెషన్ టోకెన్‌లను ఉపయోగిస్తాము. ఇవి సేవ పని చేయడానికి అవసరమైన వాటికి మాత్రమే పరిమితం."
        ],
        "title": "9. కుక్కీలు మరియు సెషన్ నిల్వ"
      },
      {
        "paragraphs": [
          "ఈ క్రింది ప్రయోజనాల కోసం సహేతుకంగా అవసరమైనంత కాలం మేము మీ డేటాను నిలుపుకుంటాము:"
        ],
        "title": "10. డేటా నిలుపుదల"
      },
      {
        "paragraphs": [
          "ఖాతా డేటాను రక్షించడానికి మేము సహేతుకమైన సాంకేతిక మరియు సంస్థాగత భద్రతలను ఉపయోగిస్తాము. ఏ సిస్టమ్ కూడా ప్రమాదాలకు పూర్తిగా అతీతం కాదు. మీ ఖాతా రాజీపడిందని మీరు విశ్వసిస్తే, వెంటనే మమ్మల్ని సంప్రదించండి."
        ],
        "title": "11. భద్రత"
      },
      {
        "paragraphs": [
          "మీ స్థానాన్ని బట్టి, మీకు ఈ క్రింది హక్కులు ఉండవచ్చు:"
        ],
        "title": "12. మీ హక్కులు మరియు ఖాతా తొలగింపు"
      },
      {
        "paragraphs": [
          "SwitchControl తమ పరిధిలో చట్టబద్ధంగా కట్టుబడి ఉండే ఒప్పందాన్ని చేసుకోలేని లేదా సరైన తల్లిదండ్రుల లేదా సంరక్షకుల అనుమతి లేకుండా కనీస వయస్సు కంటే తక్కువ వయస్సు ఉన్న ఎవరూ ఉపయోగించడానికి ఉద్దేశించబడలేదు. మైనర్ అనుమతి లేకుండా వ్యక్తిగత డేటాను అందించారని మీరు విశ్వసిస్తే, మేము దానిని తొలగించగలిగేలా మమ్మల్ని సంప్రదించండి."
        ],
        "title": "13. వయస్సు అవసరాలు"
      },
      {
        "paragraphs": [
          "గోప్యతా ప్రశ్నలు, డేటా అభ్యర్థనలు లేదా ఆందోళనల కోసం, మమ్మల్ని switchcontrol67@gmail.com వద్ద సంప్రదించండి"
        ],
        "title": "14. సంప్రదించండి"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl అనేది Windows PC సెట్టింగ్‌లు మరియు సిస్టమ్ పనితీరును కాన్ఫిగర్ చేయడానికి, ఆప్టిమైజ్ చేయడానికి మరియు విశ్లేషించడానికి వినియోగదారులకు సహాయపడటానికి రూపొందించబడిన సాఫ్ట్‌వేర్ మరియు సేవలను అందిస్తుంది. SwitchControlని ఉపయోగించడం ద్వారా, మీరు ఈ నిబంధనలను అంగీకరిస్తున్నారు. మీరు అంగీకరించకపోతే, సేవను ఉపయోగించవద్దు."
        ],
        "title": "1. అవలోకనం"
      },
      {
        "paragraphs": [
          "మీరు మీ పరిధిలో చట్టబద్ధంగా కట్టుబడి ఉండే ఒప్పందాన్ని చేసుకోగలగాలి. మీరు కనీస వయస్సు కంటే తక్కువ వయస్సు కలిగి ఉంటే, తల్లిదండ్రులు లేదా సంరక్షకుల నుండి అనుమతి తప్పనిసరి. SwitchControlని ఉపయోగించడం ద్వారా, మీరు ఈ అవసరాలను తీరుస్తున్నారని నిర్ధారిస్తున్నారు."
        ],
        "title": "2. అర్హత"
      },
      {
        "paragraphs": [
          "SwitchControl మూడు యాక్సెస్ స్థితులను అందిస్తుంది: Free, ఎంపిక చేసిన ఫీచర్లకు ఎటువంటి ఖర్చు లేకుండా ప్రాథమిక యాక్సెస్; Trial, పరిమిత సమయం వరకు Premium ఫీచర్లకు తాత్కాలిక యాక్సెస్; మరియు Premium, కొనుగోలు ద్వారా అన్‌లాక్ చేయబడిన పూర్తి ఫీచర్ యాక్సెస్. ప్రతి శ్రేణిలో అందుబాటులో ఉన్న ఫీచర్లు కాలక్రమేణా మారవచ్చు. ప్రతి ప్లాన్‌లో ఏమి చేర్చాలో సర్దుబాటు చేసే హక్కును SwitchControl కలిగి ఉంది."
        ],
        "title": "3. యాక్సెస్ శ్రేణులు"
      },
      {
        "paragraphs": [
          "మీరు Premium ఫీచర్ల యొక్క ఉచిత ట్రయల్‌ను పొందితే:"
        ],
        "title": "4. ఉచిత ట్రయల్స్"
      },
      {
        "paragraphs": [
          "Premiumని కొనుగోలు చేయడం ద్వారా మీకు కొనుగోలు సమయంలో అమలులో ఉన్న నిబంధనల ప్రకారం Premium ఫీచర్లను యాక్సెస్ చేయడానికి వ్యక్తిగత, బదిలీ చేయలేని లైసెన్స్ లభిస్తుంది. ధరలు, యాక్సెస్ నమూనాలు, హక్కులు మరియు ఫీచర్ సెట్లు కాలక్రమేణా మారవచ్చు. ఏదైనా నిర్దిష్ట ఫీచర్ నిరవధికంగా అందుబాటులో ఉంటుందని SwitchControl హామీ ఇవ్వదు. మీరు స్పష్టంగా అనుమతిస్తే తప్ప, మీ యాక్సెస్‌ను ఇతరులకు విక్రయించకూడదు, బదిలీ చేయకూడదు లేదా పంచుకోకూడదు."
        ],
        "title": "5. Premium యాక్సెస్ మరియు లైసెన్సింగ్"
      },
      {
        "paragraphs": [
          "SwitchControl మీకు సాఫ్ట్‌వేర్ మరియు సేవను మీ స్వంత ప్రయోజనాల కోసం ఉపయోగించడానికి పరిమిత, వ్యక్తిగత, ప్రత్యేకత లేని, బదిలీ చేయలేని హక్కును మంజూరు చేస్తుంది. స్పష్టంగా మంజూరు చేయని అన్ని హక్కులు ప్రత్యేకించబడ్డాయి."
        ],
        "title": "6. లైసెన్స్ మరియు సాధారణ యాక్సెస్"
      },
      {
        "paragraphs": [
          "మీరు ఈ క్రింది వాటిని చేయకూడదని అంగీకరిస్తున్నారు:"
        ],
        "title": "7. ఆమోదయోగ్యమైన వినియోగం"
      },
      {
        "paragraphs": [
          "సాధారణ ప్లాట్‌ఫారమ్ కార్యకలాపాలలో భాగంగా SwitchControl ఏదైనా ఖాతాపై ఈ క్రింది చర్యలను తీసుకోవచ్చు:"
        ],
        "title": "8. పరిపాలనా ఖాతా చర్యలు"
      },
      {
        "paragraphs": [
          "మీరు ఈ సేవా నిబంధనలను ఉల్లంఘించారని, మోసపూరిత, దుర్వినియోగ లేదా మోసపూరిత ప్రవర్తనకు పాల్పడ్డారని, యాక్సెస్ నియంత్రణలను లేదా ఎంటైటిల్‌మెంట్ సిస్టమ్‌లను మార్చడానికి లేదా దాటవేయడానికి ప్రయత్నించారని, సేవ లేదా ఇతర వినియోగదారులకు భద్రతా ప్రమాదాన్ని కలిగించారని లేదా హాని కలిగించే విధంగా సేవను ఉపయోగించారని మేము సహేతుకంగా నిర్ధారిస్తే, SwitchControl మీ యాక్సెస్‌ను నోటీసుతో లేదా లేకుండానే సస్పెండ్ చేయవచ్చు లేదా రద్దు చేయవచ్చు. కారణం కోసం మీ ఖాతా సస్పెండ్ చేయబడినా లేదా రద్దు చేయబడినా, మీరు రీఫండ్‌కు అర్హులు కాదు."
        ],
        "title": "9. సస్పెన్షన్ మరియు రద్దు"
      },
      {
        "paragraphs": [
          "మీరు ఉపయోగించే ఫీచర్లను బట్టి SwitchControl Windows సెట్టింగ్‌లు, సిస్టమ్ ప్రాధాన్యతలు, స్టార్టప్ కాన్ఫిగరేషన్, నెట్‌వర్క్ పారామితులు మరియు పవర్ ప్రొఫైల్‌లను సవరించవచ్చు. సాఫ్ట్‌వేర్‌ను జాగ్రత్తగా ఉపయోగించడం మరియు దేనిని వర్తింపజేయడానికి ముందు ప్రతి ఫీచర్ ఏమి చేస్తుందో అర్థం చేసుకోవడం మీ బాధ్యత. మీ సిస్టమ్‌కు మార్పులను వర్తింపజేయడం వల్ల ఉత్పన్నమయ్యే సిస్టమ్ అస్థిరత, డేటా కోల్పోవడం లేదా ఇతర సమస్యలకు SwitchControl బాధ్యత వహించదు. ఆప్టిమైజేషన్ సాధనాలను ఉపయోగించే ముందు ముఖ్యమైన డేటాను ఎల్లప్పుడూ బ్యాకప్ చేయండి."
        ],
        "title": "10. సిస్టమ్ మార్పులు మరియు రిస్క్"
      },
      {
        "paragraphs": [
          "SwitchControl నిర్దిష్ట పనితీరు ఫలితాలకు హామీ ఇవ్వదు. హార్డ్‌వేర్ కాన్ఫిగరేషన్, ఇన్‌స్టాల్ చేసిన సాఫ్ట్‌వేర్, డ్రైవర్లు, నెట్‌వర్క్ పరిస్థితులు మరియు మా నియంత్రణలో లేని అనేక ఇతర అంశాల ఆధారంగా ఫలితాలు మారుతూ ఉంటాయి. ఇందులో FPS, ఫ్రేమ్ టైమ్, ఇన్‌పుట్ లేటెన్సీ, పింగ్, నెట్‌వర్క్ స్థిరత్వం, బూట్ స్పీడ్ మరియు సాధారణ సిస్టమ్ రెస్పాన్సివ్‌నెస్‌తో సహా పరిమితం కాకుండా ఉంటాయి. AI Advisor మరియు BIOS Advisor అవుట్‌పుట్‌లు సమాచార మార్గదర్శకత్వం కోసం మాత్రమే అందించబడతాయి, అవి ఖచ్చితమైనవని లేదా ప్రతి సిస్టమ్‌కు సరిపోతాయని హామీ లేదు."
        ],
        "title": "11. ఫలితాలకు హామీ లేదు"
      },
      {
        "paragraphs": [
          "మీరు కొనుగోలు పూర్తి చేయడానికి ముందు అన్ని ధరలు చెక్-అవుట్ వద్ద చూపబడతాయి. మా మూడవ పక్ష చెల్లింపు ప్రాసెసర్ ద్వారా చెల్లింపులు సురక్షితంగా నిర్వహించబడతాయి."
        ],
        "title": "12. చెల్లింపులు మరియు రీఫండ్‌లు"
      },
      {
        "paragraphs": [
          "కొన్ని ఫీచర్లు చెల్లింపు ప్రాసెసర్‌లు, అథెంటికేషన్ సేవలు మరియు హోస్టింగ్ ఇన్‌ఫ్రాస్ట్రక్చర్‌తో సహా మూడవ పక్ష ప్రొవైడర్‌లపై ఆధారపడి ఉంటాయి. ఆ సేవలను మీరు ఉపయోగించేటప్పుడు వారి నిబంధనలు మరియు గోప్యతా విధానాలు కూడా వర్తించవచ్చు. మూడవ పక్షాల ప్రవర్తనకు లేదా విధానాలకు SwitchControl బాధ్యత వహించదు."
        ],
        "title": "13. మూడవ పక్ష సేవలు"
      },
      {
        "paragraphs": [
          "SwitchControl సాఫ్ట్‌వేర్, బ్రాండ్, డిజైన్, కంటెంట్ మరియు సేవలపై అన్ని హక్కులు SwitchControlకి చెందినవి. ఈ నిబంధనలలో ఏదీ మీకు ఎటువంటి యాజమాన్యాన్ని బదిలీ చేయదు. మీరు స్పష్టమైన వ్రాతపూర్వక అనుమతి లేకుండా SwitchControl యొక్క ఏ భాగాన్ని పునరుత్పత్తి చేయకూడదు, పంపిణీ చేయకూడదు లేదా ఉత్పన్న పనులను సృష్టించకూడదు."
        ],
        "title": "14. మేధో సంపత్తి"
      },
      {
        "paragraphs": [
          "చట్టం ద్వారా అనుమతించబడిన గరిష్ట పరిధి వరకు, మీరు సేవను ఉపయోగించడం లేదా ఉపయోగించలేకపోవడం వల్ల కలిగే డేటా నష్టం, లాభం కోల్పోవడం లేదా సిస్టమ్ నష్టంతో సహా పరోక్ష, యాదృచ్ఛిక, ప్రత్యేక, పర్యవసాన లేదా శిక్షాత్మక నష్టాలకు SwitchControl బాధ్యత వహించదు."
        ],
        "title": "15. బాధ్యత యొక్క పరిమితి"
      },
      {
        "paragraphs": [
          "SwitchControl ఫీచర్లు, ధరలు, యాక్సెస్ శ్రేణులు మరియు సేవా నిర్మాణాన్ని ఎప్పుడైనా అప్‌డేట్ చేయవచ్చు. మేము ఈ నిబంధనలను మరియు మా గోప్యతా విధానాన్ని కూడా అప్‌డేట్ చేయవచ్చు. మేము ముఖ్యమైన మార్పులు చేసినప్పుడు, మేము “చివరిగా అప్‌డేట్ చేయబడింది” తేదీని అప్‌డేట్ చేస్తాము. మార్పులు అమలులోకి వచ్చిన తర్వాత సేవను ఉపయోగించడం కొనసాగించడం అంటే అప్‌డేట్ చేయబడిన నిబంధనలను అంగీకరించడమే."
        ],
        "title": "16. సేవలో మార్పులు మరియు ఈ నిబంధనలు"
      },
      {
        "paragraphs": [
          "ఈ నిబంధనల గురించి ప్రశ్నల కోసం, మమ్మల్ని switchcontrol67@gmail.com వద్ద సంప్రదించండి"
        ],
        "title": "17. సంప్రదించండి"
      }
    ]
  },
  "tr": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl bilgileri yalnızca ürünü sağlamak, hesapları yönetmek, kullanıcıları desteklemek, sahtekarlığı önlemek ve güvenliği korumak için gerektiğinde toplar ve kullanır. Bu politika ne topladığımızı, nedenini ve nasıl işlendiğini açıklar."
        ],
        "title": "1. Genel Bakış"
      },
      {
        "paragraphs": [
          "Oturum açtığınızda şunları depolarız:"
        ],
        "title": "2. Hesap verileri"
      },
      {
        "paragraphs": [
          "Ürünün doğru özellikleri sunabilmesi için erişim durumunuz hakkındaki bilgileri depolarız. Buna şunlar dahildir:"
        ],
        "title": "3. Yetkilendirme ve erişim verileri"
      },
      {
        "paragraphs": [
          "Ürün işlevselliğini, güvenliğini ve hesap yönetimini desteklemek için şunları kaydedebiliriz:"
        ],
        "title": "4. Uygulama ve cihaz etkinlik verileri"
      },
      {
        "paragraphs": [
          "Masaüstü uygulamasını kullanırken, SwitchControl optimizasyon, analiz ve danışmanlık özelliklerini güçlendirmek için donanım ve sistem bilgilerine erişebilir. Buna şunlar dahildir:"
        ],
        "title": "5. Sistem ve telemetri verileri"
      },
      {
        "paragraphs": [
          "Yetkili SwitchControl yöneticileri, meşru operasyonel amaçlar için hesap düzeyi verilere erişebilir; buna şunlar dahildir:"
        ],
        "title": "6. İdari erişim"
      },
      {
        "paragraphs": [
          "Elimizdeki verileri şu amaçlarla kullanırız:"
        ],
        "title": "7. Verilerinizi nasıl kullanıyoruz"
      },
      {
        "paragraphs": [
          "Hizmeti yürütmemize yardımcı olan güvenilir üçüncü taraflarla verileri paylaşabiliriz:"
        ],
        "title": "8. Paylaşım ve hizmet sağlayıcılar"
      },
      {
        "paragraphs": [
          "Oturumunuzu açık tutmak ve ziyaretleriniz boyunca erişim durumunuzu korumak için çerezler ve oturum belirteçleri kullanırız. Bunlar, hizmetin çalışması için gerekenlerle sınırlıdır."
        ],
        "title": "9. Çerezler ve oturum depolama"
      },
      {
        "paragraphs": [
          "Verilerinizi aşağıdaki amaçlar için makul ölçüde gerekli olduğu sürece saklarız:"
        ],
        "title": "10. Veri saklama"
      },
      {
        "paragraphs": [
          "Hesap verilerini korumak için makul teknik ve organizasyonel önlemler kullanıyoruz. Hiçbir sistem risklere karşı tamamen bağışık değildir. Hesabınızın ele geçirildiğini düşünüyorsanız, hemen bizimle iletişime geçin."
        ],
        "title": "11. Güvenlik"
      },
      {
        "paragraphs": [
          "Bulunduğunuz yere bağlı olarak şunlara hakkınız olabilir:"
        ],
        "title": "12. Haklarınız ve hesap silme"
      },
      {
        "paragraphs": [
          "SwitchControl, yargı bölgesinde yasal olarak bağlayıcı bir sözleşme yapamayan veya uygun ebeveyn veya vasi izni olmadan asgari yaş sınırının altında olan hiç kimse tarafından kullanılmak üzere tasarlanmamıştır. Bir reşit olmayanın izinsiz olarak kişisel veri sağladığını düşünüyorsanız, kaldırabilmemiz için bizimle iletişime geçin."
        ],
        "title": "13. Yaş gereksinimleri"
      },
      {
        "paragraphs": [
          "Gizlilik soruları, veri talepleri veya endişeleriniz için switchcontrol67@gmail.com adresinden bizimle iletişime geçin."
        ],
        "title": "14. İletişim"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl, kullanıcıların Windows PC ayarlarını ve sistem performansını yapılandırmasına, optimize etmesine ve analiz etmesine yardımcı olmak için tasarlanmış yazılım ve hizmetler sağlar. SwitchControl'ü kullanarak bu şartları kabul etmiş olursunuz. Kabul etmiyorsanız hizmeti kullanmayın."
        ],
        "title": "1. Genel Bakış"
      },
      {
        "paragraphs": [
          "Bulunduğunuz yargı bölgesinde yasal olarak bağlayıcı bir sözleşme yapabilecek durumda olmalısınız. Asgari yaş sınırının altındaysanız, ebeveyn veya vasinin iznine sahip olmanız gerekir. SwitchControl'ü kullanarak bu gereksinimleri karşıladığınızı onaylamış olursunuz."
        ],
        "title": "2. Uygunluk"
      },
      {
        "paragraphs": [
          "SwitchControl üç erişim durumu sunar: Free, seçilen özelliklere ücretsiz temel erişim; Trial, Premium özelliklere sınırlı bir süre için geçici erişim; ve Premium, satın alma yoluyla kilidi açılan tam özellik erişimi. Her kademede sunulan özellikler zamanla değişebilir. SwitchControl, her planda nelerin dahil olduğunu ayarlama hakkını saklı tutar."
        ],
        "title": "3. Erişim kademeleri"
      },
      {
        "paragraphs": [
          "Premium özelliklerin bir deneme sürümünü alırsanız:"
        ],
        "title": "4. Free denemeler"
      },
      {
        "paragraphs": [
          "Premium satın almak, satın alma sırasında yürürlükte olan şartlar uyarınca Premium özelliklere erişmeniz için size kişisel, devredilemez bir lisans verir. Fiyatlandırma, erişim modelleri, haklar ve özellik setleri zamanla değişebilir. SwitchControl, belirli bir özelliğin süresiz olarak kullanılabilir kalacağını garanti etmez. Açıkça izin verilmedikçe erişiminizi başkalarına satamaz, devredemez veya paylaşamazsınız."
        ],
        "title": "5. Premium erişim ve lisanslama"
      },
      {
        "paragraphs": [
          "SwitchControl, yazılımı ve hizmeti kendi amaçlarınız için kullanmanız adına size sınırlı, kişisel, münhasır olmayan, devredilemez bir hak tanır. Açıkça verilmeyen tüm haklar saklıdır."
        ],
        "title": "6. Lisans ve genel erişim"
      },
      {
        "paragraphs": [
          "Şunları yapmamayı kabul edersiniz:"
        ],
        "title": "7. Kabul edilebilir kullanım"
      },
      {
        "paragraphs": [
          "SwitchControl, normal platform operasyonlarının bir parçası olarak herhangi bir hesapta aşağıdaki işlemleri gerçekleştirebilir:"
        ],
        "title": "8. İdari hesap işlemleri"
      },
      {
        "paragraphs": [
          "SwitchControl, bu Hizmet Şartlarını ihlal ettiğinizi, hileli, istismarcı veya yanıltıcı davranışlarda bulunduğunuzu, erişim kontrollerini veya yetkilendirme sistemlerini kurcalamaya veya atlatmaya çalıştığınızı, hizmet veya diğer kullanıcılar için bir güvenlik riski oluşturduğunuzu veya hizmeti zarar verecek veya yasal sorumluluk doğuracak şekilde kullandığınızı makul bir şekilde belirlememiz durumunda, bildirimde bulunarak veya bulunmayarak erişiminizi askıya alabilir veya feshedebilir. Hesabınız kusurlu nedenlerle askıya alınır veya feshedilirse, para iadesi alma hakkınız yoktur."
        ],
        "title": "9. Askıya alma ve fesih"
      },
      {
        "paragraphs": [
          "SwitchControl, kullandığınız özelliklere bağlı olarak Windows ayarlarını, sistem tercihlerini, başlangıç yapılandırmasını, ağ parametrelerini ve güç profillerini değiştirebilir. Yazılımı dikkatli kullanmaktan ve uygulamadan önce her özelliğin ne işe yaradığını anlamaktan siz sorumlusunuz. SwitchControl, sisteminizde değişiklik yapmaktan kaynaklanabilecek sistem kararsızlığı, veri kaybı veya diğer sorunlardan sorumlu değildir. Optimizasyon araçlarını kullanmadan önce önemli verilerinizi her zaman yedekleyin."
        ],
        "title": "10. Sistem değişiklikleri ve risk"
      },
      {
        "paragraphs": [
          "SwitchControl belirli performans sonuçlarını garanti etmez. Sonuçlar donanım yapılandırmasına, yüklü yazılıma, sürücülere, ağ koşullarına ve kontrolümüz dışındaki birçok başka faktöre bağlı olarak değişir. Buna FPS, kare süresi, giriş gecikmesi, ping, ağ kararlılığı, açılış hızı ve genel sistem yanıt hızı dahildir ancak bunlarla sınırlı değildir. AI Advisor tarafından üretilen öneriler ve danışman çıktıları yalnızca bilgilendirme amaçlı sağlanır, her sistem için doğru veya uygun olacağı garanti edilmez."
        ],
        "title": "11. Garantili sonuç yoktur"
      },
      {
        "paragraphs": [
          "Tüm fiyatlar, satın alma işlemini tamamlamadan önce ödeme ekranında gösterilir. Ödemeler, üçüncü taraf ödeme işlemcimiz tarafından güvenli bir şekilde gerçekleştirilir."
        ],
        "title": "12. Ödemeler ve iadeler"
      },
      {
        "paragraphs": [
          "Bazı özellikler, ödeme işlemcileri, kimlik doğrulama hizmetleri ve barındırma altyapısı dahil olmak üzere üçüncü taraf sağlayıcılara dayanır. Bu hizmetleri kullanımınız için onların şartları ve gizlilik politikaları da geçerli olabilir. SwitchControl, üçüncü tarafların davranışlarından veya politikalarından sorumlu değildir."
        ],
        "title": "13. Üçüncü taraf hizmetleri"
      },
      {
        "paragraphs": [
          "SwitchControl yazılımı, markası, tasarımı, içeriği ve hizmetlerindeki tüm haklar SwitchControl'e aittir. Bu şartlardaki hiçbir şey size herhangi bir mülkiyet hakkı devretmez. Açık yazılı izin olmadan SwitchControl'ün hiçbir bölümünü çoğaltamaz, dağıtamaz veya bunlardan türev çalışmalar oluşturamazsınız."
        ],
        "title": "14. Fikri mülkiyet"
      },
      {
        "paragraphs": [
          "Yasaların izin verdiği en geniş ölçüde SwitchControl, hizmeti kullanımınızdan veya kullanamamanızdan kaynaklanan veri kaybı, kar kaybı veya sistem hasarı dahil ancak bunlarla sınırlı olmamak üzere dolaylı, arızi, özel, sonuçsal veya cezai zararlardan sorumlu değildir."
        ],
        "title": "15. Sorumluluk sınırlaması"
      },
      {
        "paragraphs": [
          "SwitchControl özellikleri, fiyatlandırmayı, erişim kademelerini ve hizmet yapısını istediği zaman güncelleyebilir. Ayrıca bu şartları ve Gizlilik Politikamızı güncelleyebiliriz. Önemli değişiklikler yaptığımızda, \"Son güncellenme\" tarihini güncelleyeceğiz. Değişiklikler yürürlüğe girdikten sonra hizmetin kullanılmaya devam edilmesi, güncellenmiş şartların kabul edildiği anlamına gelir."
        ],
        "title": "16. Hizmette ve bu şartlarda yapılan değişiklikler"
      },
      {
        "paragraphs": [
          "Bu şartlarla ilgili sorularınız için switchcontrol67@gmail.com adresinden bizimle iletişime geçin."
        ],
        "title": "17. İletişim"
      }
    ]
  },
  "mr": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl माहिती केवळ उत्पादन प्रदान करण्यासाठी, खाती व्यवस्थापित करण्यासाठी, वापरकर्त्यांना समर्थन देण्यासाठी, फसवणूक रोखण्यासाठी आणि सुरक्षा राखण्यासाठी आवश्यक असेल तेव्हाच गोळा करते आणि वापरते. हे धोरण आम्ही काय गोळा करतो, का करतो आणि ते कसे हाताळले जाते हे स्पष्ट करते."
        ],
        "title": "1. विहंगावलोकन"
      },
      {
        "paragraphs": [
          "जेव्हा तुम्ही साइन इन करता, तेव्हा आम्ही स्टोअर करतो:"
        ],
        "title": "2. खाते डेटा"
      },
      {
        "paragraphs": [
          "आम्ही तुमच्या प्रवेश स्थितीबद्दल माहिती संचयित करतो जेणेकरून उत्पादन योग्य वैशिष्ट्ये देऊ शकेल. यामध्ये समाविष्ट आहे:"
        ],
        "title": "3. हक्क आणि प्रवेश डेटा"
      },
      {
        "paragraphs": [
          "उत्पादन कार्यक्षमता, सुरक्षा आणि खाते व्यवस्थापनास समर्थन देण्यासाठी, आम्ही रेकॉर्ड करू शकतो:"
        ],
        "title": "4. ॲप आणि डिव्हाइस क्रियाकलाप डेटा"
      },
      {
        "paragraphs": [
          "डेस्कटॉप ॲप वापरताना, SwitchControl त्याच्या ऑप्टिमायझेशन, विश्लेषण आणि सल्लागार वैशिष्ट्यांना सक्षम करण्यासाठी हार्डवेअर आणि सिस्टम माहितीमध्ये प्रवेश करू शकते. यामध्ये समाविष्ट आहे:"
        ],
        "title": "5. सिस्टम आणि टेलिमेट्री डेटा"
      },
      {
        "paragraphs": [
          "अधिकृत SwitchControl प्रशासक कायदेशीर कार्यात्मक कारणांसाठी खाते-स्तरीय डेटा ॲक्सेस करू शकतात, ज्यामध्ये समाविष्ट आहे:"
        ],
        "title": "6. प्रशासकीय प्रवेश"
      },
      {
        "paragraphs": [
          "आम्ही ठेवलेला डेटा आम्ही यासाठी वापरतो:"
        ],
        "title": "7. आम्ही तुमचा डेटा कसा वापरतो"
      },
      {
        "paragraphs": [
          "आम्ही विश्वासार्ह तृतीय-पक्षांसोबत डेटा शेअर करू शकतो जे सेवा चालवण्यास मदत करतात:"
        ],
        "title": "8. सामायिकरणा आणि सेवा प्रदाते"
      },
      {
        "paragraphs": [
          "आम्ही तुम्हाला साइन इन ठेवण्यासाठी आणि भेटीदरम्यान तुमची प्रवेश स्थिती राखण्यासाठी कुकीज आणि सत्र टोकन वापरतो. हे सेवा कार्य करण्यासाठी आवश्यक असलेल्या गोष्टींपुरते मर्यादित आहेत."
        ],
        "title": "9. कुकीज आणि सत्र संचयन"
      },
      {
        "paragraphs": [
          "आम्ही तुमचा डेटा खालील कारणांसाठी वाजवीपणे आवश्यक असेल तोपर्यंत राखून ठेवतो:"
        ],
        "title": "10. डेटा धारणा"
      },
      {
        "paragraphs": [
          "खाते डेटा संरक्षित करण्यासाठी आम्ही वाजवी तांत्रिक आणि संस्थात्मक सुरक्षितता वापरतो. कोणतीही सिस्टम जोखमीपासून पूर्णपणे मुक्त नाही. जर तुम्हाला वाटत असेल की तुमच्या खात्याशी तडजोड झाली आहे, तर आमच्याशी त्वरित संपर्क साधा."
        ],
        "title": "11. सुरक्षा"
      },
      {
        "paragraphs": [
          "तुमच्या स्थानावर अवलंबून, तुम्हाला याचे अधिकार असू शकतात:"
        ],
        "title": "12. तुमचे अधिकार आणि खाते हटवणे"
      },
      {
        "paragraphs": [
          "SwitchControl कोणासाठीही वापरण्यासाठी नाही जे त्यांच्या अधिकारक्षेत्रात कायदेशीररित्या बंधनकारक करार करू शकत नाहीत, किंवा जे योग्य पालकांच्या किंवा कायदेशीर पालकांच्या परवानगीशिवाय किमान आवश्यक वयापेक्षा कमी आहेत. जर तुम्हाला वाटत असेल की एखाद्या अल्पवयीन मुलाने परवानगीशिवाय वैयक्तिक डेटा प्रदान केला आहे, तर आमच्याशी संपर्क साधा जेणेकरून आम्ही तो काढू शकू."
        ],
        "title": "13. वयाच्या आवश्यकता"
      },
      {
        "paragraphs": [
          "गोपनीयता प्रश्नांसाठी, डेटा विनंत्या किंवा चिंतांसाठी, आमच्याशी switchcontrol67@gmail.com वर संपर्क साधा"
        ],
        "title": "14. संपर्क"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl हे सॉफ्टवेअर आणि सेवा प्रदान करते जे वापरकर्त्यांना Windows पीसी सेटिंग्ज आणि सिस्टम कार्यक्षमता कॉन्फिगर, ऑप्टिमाइझ आणि विश्लेषित करण्यात मदत करण्यासाठी डिझाइन केलेले आहे. SwitchControl चा वापर करून, तुम्ही या अटींशी सहमत आहात. जर तुम्ही सहमत नसाल, तर ही सेवा वापरू नका."
        ],
        "title": "1. विहंगावलोकन"
      },
      {
        "paragraphs": [
          "तुम्ही तुमच्या अधिकारक्षेत्रात कायदेशीररित्या बंधनकारक करार करण्यास सक्षम असणे आवश्यक आहे. जर तुम्ही किमान आवश्यक वयापेक्षा कमी असाल, तर तुमच्याकडे पालक किंवा कायदेशीर पालकाची परवानगी असणे आवश्यक आहे. SwitchControl चा वापर करून, तुम्ही या आवश्यकता पूर्ण करत असल्याचे सुनिश्चित करता."
        ],
        "title": "2. पात्रता"
      },
      {
        "paragraphs": [
          "SwitchControl तीन प्रवेश स्तर ऑफर करते: Free, निवडक वैशिष्ट्यांमध्ये विनामूल्य मूलभूत प्रवेश; Trial, मर्यादित काळासाठी Premium वैशिष्ट्यांमध्ये तात्पुरता प्रवेश; आणि Premium, खरेदीद्वारे अनलॉक केलेला पूर्ण वैशिष्ट्य प्रवेश. प्रत्येक स्तरावर उपलब्ध असलेली वैशिष्ट्ये कालांतराने बदलू शकतात. प्रत्येक प्लॅनमध्ये काय समाविष्ट आहे हे समायोजित करण्याचा अधिकार SwitchControl राखून ठेवते."
        ],
        "title": "3. ऍक्सेस टियर्स (प्रवेश स्तर)"
      },
      {
        "paragraphs": [
          "जर तुम्हाला Premium वैशिष्ट्यांची विनामूल्य चाचणी मिळाली:"
        ],
        "title": "4. विनामूल्य चाचण्या (Free trials)"
      },
      {
        "paragraphs": [
          "Premium खरेदी केल्याने तुम्हाला खरेदीच्या वेळी लागू असलेल्या अटींनुसार Premium वैशिष्ट्यांमध्ये प्रवेश करण्यासाठी वैयक्तिक, हस्तांतरित न करता येणारा परवाना मिळतो. किंमत, प्रवेश मॉडेल्स, हक्क आणि वैशिष्ट्ये कालांतराने बदलू शकतात. SwitchControl कोणतीही विशिष्ट वैशिष्ट्ये कायमस्वरूपी उपलब्ध राहतील याची हमी देत नाही. जोपर्यंत स्पष्टपणे परवानगी दिली जात नाही तोपर्यंत तुम्ही तुमचा प्रवेश इतरांना विकू, हस्तांतरित करू किंवा शेअर करू शकत नाही."
        ],
        "title": "5. Premium प्रवेश आणि परवाना"
      },
      {
        "paragraphs": [
          "SwitchControl तुम्हाला सॉफ्टवेअर आणि सेवा तुमच्या स्वतःच्या उद्देशांसाठी वापरण्यासाठी मर्यादित, वैयक्तिक, अनन्य नसलेला, हस्तांतरित न करता येणारा अधिकार प्रदान करते. स्पष्टपणे प्रदान न केलेले सर्व अधिकार राखून ठेवले आहेत."
        ],
        "title": "6. परवाना आणि सामान्य प्रवेश"
      },
      {
        "paragraphs": [
          "तुम्ही खालील गोष्टी करण्यास सहमत आहात:"
        ],
        "title": "7. स्वीकार्य वापर"
      },
      {
        "paragraphs": [
          "सामान्य प्लॅटफॉर्म ऑपरेशन्सचा भाग म्हणून SwitchControl कोणत्याही खात्यावर खालील क्रिया करू शकते:"
        ],
        "title": "8. प्रशासकीय खाते क्रिया"
      },
      {
        "paragraphs": [
          "जर आम्हाला वाजवीपणे खात्री पटली की तुम्ही या सेवा अटींचे उल्लंघन केले आहे, फसवणूक, अपमानास्पद किंवा फसवे वर्तन केले आहे, प्रवेश नियंत्रण किंवा हक्क प्रणालीमध्ये फेरफार किंवा ते टाळण्याचा प्रयत्न केला आहे, सेवा किंवा इतर वापरकर्त्यांसाठी सुरक्षेचा धोका निर्माण केला आहे, किंवा सेवेचा अशा प्रकारे वापर केला आहे ज्यामुळे हानी किंवा कायदेशीर धोका निर्माण होतो, तर SwitchControl नोटीससह किंवा त्याशिवाय तुमचा प्रवेश निलंबित किंवा समाप्त करू शकते. जर तुमचे खाते कारणास्तव निलंबित किंवा समाप्त केले गेले असेल, तर तुम्ही परताव्यासाठी पात्र नाही."
        ],
        "title": "9. निलंबन आणि समाप्ती"
      },
      {
        "paragraphs": [
          "SwitchControl तुमच्या वापरकर्त्या वैशिष्ट्यांवर अवलंबून Windows सेटिंग्ज, सिस्टम प्राधान्ये, स्टार्टअप कॉन्फिगरेशन, नेटवर्क पॅरामीटर्स आणि पॉवर प्रोफाइल्समध्ये बदल करू शकते. तुम्ही सॉफ्टवेअर काळजीपूर्वक वापरण्यासाठी आणि ते लागू करण्यापूर्वी प्रत्येक वैशिष्ट्य काय करते हे समजून घेण्यासाठी जबाबदार आहात. तुमच्या सिस्टममध्ये बदल लागू केल्यामुळे उद्भवू शकणाऱ्या सिस्टम अस्थिरता, डेटा गहाळ होणे किंवा इतर समस्यांसाठी SwitchControl जबाबदार नाही. ऑप्टिमायझेशन टूल्स वापरण्यापूर्वी नेहमी महत्त्वाच्या डेटाचा बॅकअप घ्या."
        ],
        "title": "10. सिस्टममधील बदल आणि जोखीम"
      },
      {
        "paragraphs": [
          "SwitchControl विशिष्ट कार्यप्रदर्शन परिणामांची हमी देत नाही. हार्डवेअर कॉन्फिगरेशन, स्थापित सॉफ्टवेअर, ड्रायव्हर्स, नेटवर्क परिस्थिती आणि आमच्या नियंत्रणाबाहेरील इतर अनेक घटकांवर आधारित परिणाम बदलतात. यामध्ये FPS, फ्रेम टाइम, इनपुट लेटन्सी, पिंग, नेटवर्क स्थिरता, बूट स्पीड आणि सामान्य सिस्टम प्रतिसाद यांचा समावेश होतो पण इतक्यापुरतेच मर्यादित नाही. AI Advisor आणि BIOS Advisor द्वारे दिलेली शिफारस आणि आउटपुट फक्त माहितीपूर्ण मार्गदर्शनासाठी आहेत, ते प्रत्येक सिस्टमसाठी अचूक किंवा योग्य असतीलच याची हमी नाही."
        ],
        "title": "11. परिणामांची कोणतीही हमी नाही"
      },
      {
        "paragraphs": [
          "तुम्ही खरेदी पूर्ण करण्यापूर्वी सर्व किमती चेकआउटवर दर्शवल्या जातात. पेमेंट्स आमच्या तृतीय-पक्ष पेमेंट प्रोसेसरद्वारे सुरक्षितपणे हाताळली जातात."
        ],
        "title": "12. पेमेंट्स आणि परतावा"
      },
      {
        "paragraphs": [
          "काही वैशिष्ट्ये पेमेंट प्रोसेसर, प्रमाणीकरण सेवा आणि होस्टिंग इन्फ्रास्ट्रक्चरसह तृतीय-पक्ष प्रदात्यांवर अवलंबून असतात. त्यांच्या अटी आणि गोपनीयता धोरणे तुमच्या त्या सेवांच्या वापरावर लागू होऊ शकतात. तृतीय-पक्षांच्या आचरणासाठी किंवा धोरणांसाठी SwitchControl जबाबदार नाही."
        ],
        "title": "13. तृतीय-पक्ष सेवा"
      },
      {
        "paragraphs": [
          "SwitchControl सॉफ्टवेअर, ब्रँड, डिझाइन, सामग्री आणि सेवांमधील सर्व अधिकार SwitchControl च्या मालकीचे आहेत. या अटींमधील कोणतीही गोष्ट मालकी हक्क तुमच्याकडे हस्तांतरित करत नाही. तुम्ही स्पष्ट लेखी परवानगीशिवाय SwitchControl चा कोणताही भाग पुनरुत्पादित, वितरित किंवा त्यापासून व्युत्पन्न कार्ये तयार करू शकत नाही."
        ],
        "title": "14. बौद्धिक संपदा"
      },
      {
        "paragraphs": [
          " कायद्याने परवानगी दिलेल्या पूर्ण मर्यादेपर्यंत, SwitchControl कोणत्याही अप्रत्यक्ष, प्रासंगिक, विशेष, परिणामी किंवा दंडात्मक नुकसानासाठी जबाबदार नाही, ज्यामध्ये डेटाचे नुकसान, नफ्याचे नुकसान किंवा सिस्टमचे नुकसान यांचा समावेश आहे, जे तुमच्या सेवेच्या वापरामुळे किंवा वापरण्यास असमर्थतेमुळे उद्भवते."
        ],
        "title": "15. दायित्वाची मर्यादा"
      },
      {
        "paragraphs": [
          "SwitchControl कधीही वैशिष्ट्ये, किंमत, प्रवेश स्तर आणि सेवा संरचना अद्यतनित करू शकते. आम्ही या अटी आणि आमचे गोपनीयता धोरण देखील अद्यतनित करू शकतो. जेव्हा आम्ही महत्त्वपूर्ण बदल करतो, तेव्हा आम्ही “शेवटचे अद्यतनित” तारीख अद्यतनित करू. बदल प्रभावी झाल्यानंतर सेवेचा सतत वापर करणे म्हणजे अद्यतनित अटींचा स्वीकार करणे होय."
        ],
        "title": "16. सेवा आणि या अटींमध्ये बदल"
      },
      {
        "paragraphs": [
          "या अटींबद्दल प्रश्नांसाठी, आमच्याशी switchcontrol67@gmail.com वर संपर्क साधा"
        ],
        "title": "17. संपर्क"
      }
    ]
  },
  "ta": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl தயாரிப்பை வழங்கவும், கணக்குகளை நிர்வகிக்கவும், பயனர்களை ஆதரிக்கவும், மோசடியைத் தடுக்கவும் மற்றும் பாதுகாப்பைப் பராமரிக்கவும் தேவையான தகவல்களை மட்டுமே சேகரிக்கிறது மற்றும் பயன்படுத்துகிறது. நாங்கள் எதைச் சேகரிக்கிறோம், ஏன், மற்றும் அது எவ்வாறு கையாளப்படுகிறது என்பதை இந்தக் கொள்கை விளக்குகிறது."
        ],
        "title": "1. கண்ணோட்டம்"
      },
      {
        "paragraphs": [
          "நீங்கள் உள்நுழையும்போது, நாங்கள் சேமிப்பவை:"
        ],
        "title": "2. கணக்கு தரவு"
      },
      {
        "paragraphs": [
          "தயாரிப்பு சரியான அம்சங்களை வழங்க உங்கள் அணுகல் நிலை பற்றிய தகவல்களை நாங்கள் சேமிக்கிறோம். இதில் அடங்குபவை:"
        ],
        "title": "3. உரிமை மற்றும் அணுகல் தரவு"
      },
      {
        "paragraphs": [
          "தயாரிப்பு செயல்பாடு, பாதுகாப்பு மற்றும் கணக்கு நிர்வாகத்தை ஆதரிக்க, நாங்கள் பதிவு செய்யக்கூடியவை:"
        ],
        "title": "4. பயன்பாடு மற்றும் சாதனச் செயல்பாட்டுத் தரவு"
      },
      {
        "paragraphs": [
          "டெஸ்க்டாப் செயலியைப் பயன்படுத்தும்போது, SwitchControl அதன் மேம்படுத்தல், பகுப்பாய்வு மற்றும் ஆலோசனை அம்சங்களை இயக்க வன்பொருள் மற்றும் கணினி தகவல்களை அணுகலாம். இதில் அடங்குபவை:"
        ],
        "title": "5. கணினி மற்றும் தொலைத்தொடர்பு தரவு"
      },
      {
        "paragraphs": [
          "அங்கீகரிக்கப்பட்ட SwitchControl நிர்வாகிகள் சட்டபூர்வமான செயல்பாட்டு நோக்கங்களுக்காக கணக்கு-நிலை தரவை அணுகலாம், இதில் அடங்குபவை:"
        ],
        "title": "6. நிர்வாக அணுகல்"
      },
      {
        "paragraphs": [
          "நாங்கள் வைத்திருக்கும் தரவை நாங்கள் இதற்காகப் பயன்படுத்துகிறோம்:"
        ],
        "title": "7. நாங்கள் உங்கள் தரவை எவ்வாறு பயன்படுத்துகிறோம்"
      },
      {
        "paragraphs": [
          "சேவையை இயக்க உதவும் நம்பகமான மூன்றாம் தரப்பினருடன் நாங்கள் தரவைப் பகிர்ந்து கொள்ளலாம்:"
        ],
        "title": "8. பகிர்வு மற்றும் சேவை வழங்குநர்கள்"
      },
      {
        "paragraphs": [
          "நீங்கள் உள்நுழைந்திருக்கவும், வருகைகளின் போது உங்கள் அணுகல் நிலையைப் பராமரிக்கவும் நாங்கள் குக்கீகள் மற்றும் அமர்வு டோக்கன்களைப் பயன்படுத்துகிறோம். இவை சேவை செயல்படுவதற்குத் தேவையானவைக்கு மட்டுமே மட்டுப்படுத்தப்பட்டுள்ளன."
        ],
        "title": "9. குக்கீகள் மற்றும் அமர்வு சேமிப்பு"
      },
      {
        "paragraphs": [
          "பின்வரும் நோக்கங்களுக்காகத் தேவையான காலத்திற்கு நாங்கள் உங்கள் தரவைத் தக்கவைத்துக்கொள்கிறோம்:"
        ],
        "title": "10. தரவுத் தக்கவைப்பு"
      },
      {
        "paragraphs": [
          "கணக்கு தரவைப் பாதுகாக்க நாங்கள் நியாயமான தொழில்நுட்ப மற்றும் நிறுவன பாதுகாப்பு நடவடிக்கைகளைப் பயன்படுத்துகிறோம். எந்த அமைப்பும் ஆபத்திலிருந்து முற்றிலும் விடுபட்டது அல்ல. உங்கள் கணக்கு சமரசம் செய்யப்பட்டதாக நீங்கள் நம்பினால், உடனடியாக எங்களைத் தொடர்பு கொள்ளுங்கள்."
        ],
        "title": "11. பாதுகாப்பு"
      },
      {
        "paragraphs": [
          "உங்கள் இருப்பிடத்தைப் பொறுத்து, உங்களுக்கு பின்வரும் உரிமைகள் இருக்கலாம்:"
        ],
        "title": "12. உங்கள் உரிமைகள் மற்றும் கணக்கு நீக்கம்"
      },
      {
        "paragraphs": [
          "SwitchControl என்பது அவர்களின் அதிகார வரம்பில் சட்டப்பூர்வமாக பிணைக்கக்கூடிய ஒப்பந்தத்தை மேற்கொள்ள முடியாத அல்லது தகுந்த பெற்றோர் அல்லது பாதுகாவலர் அனுமதியின்றி குறைந்தபட்ச வயது வரம்பிற்கு கீழ் உள்ள எவரும் பயன்படுத்துவதற்காக அல்ல. ஒரு மைனர் அனுமதியின்றி தனிப்பட்ட தரவை வழங்கியதாக நீங்கள் நம்பினால், அதை நாங்கள் அகற்ற எங்களைத் தொடர்பு கொள்ளுங்கள்."
        ],
        "title": "13. வயதுத் தேவைகள்"
      },
      {
        "paragraphs": [
          "தனியுரிமைக் கேள்விகள், தரவு கோரிக்கைகள் அல்லது கவலைகளுக்கு, எங்களை switchcontrol67@gmail.com இல் தொடர்பு கொள்ளவும்"
        ],
        "title": "14. தொடர்பு"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl பயனர்கள் Windows கணினி அமைப்புகள் மற்றும் கணினி செயல்திறனை உள்ளமைக்க, மேம்படுத்த மற்றும் பகுப்பாய்வு செய்ய உதவும் மென்பொருள் மற்றும் சேவைகளை வழங்குகிறது. SwitchControl-ஐப் பயன்படுத்துவதன் மூலம், இந்த நிபந்தனைகளுக்கு நீங்கள் ஒப்புக்கொள்கிறீர்கள். நீங்கள் ஒப்புக்கொள்ளவில்லை என்றால், சேவையைப் பயன்படுத்த வேண்டாம்."
        ],
        "title": "1. கண்ணோட்டம்"
      },
      {
        "paragraphs": [
          "உங்கள் அதிகார வரம்பிற்குள் சட்டப்பூர்வமாக பிணைக்கக்கூடிய ஒப்பந்தத்தை உருவாக்கும் திறன் உங்களுக்கு இருக்க வேண்டும். நீங்கள் குறைந்தபட்ச வயது வரம்பிற்கு கீழ் இருந்தால், பெற்றோர் அல்லது பாதுகாவலரிடமிருந்து அனுமதி பெற்றிருக்க வேண்டும். SwitchControl-ஐப் பயன்படுத்துவதன் மூலம், இந்தத் தேவைகளை நீங்கள் பூர்த்தி செய்கிறீர்கள் என்பதை உறுதிப்படுத்துகிறீர்கள்."
        ],
        "title": "2. தகுதி"
      },
      {
        "paragraphs": [
          "SwitchControl மூன்று அணுகல் நிலைகளை வழங்குகிறது: Free, தேர்ந்தெடுக்கப்பட்ட அம்சங்களுக்கு கட்டணமில்லா அடிப்படை அணுகல்; Trial, குறிப்பிட்ட காலத்திற்கு Premium அம்சங்களுக்கான தற்காலிக அணுகல்; மற்றும் Premium, வாங்குவதன் மூலம் திறக்கப்படும் முழு அம்ச அணுகல். ஒவ்வொரு நிலையிலும் கிடைக்கும் அம்சங்கள் காலப்போக்கில் மாறலாம். ஒவ்வொரு திட்டத்திலும் என்ன சேர்க்கப்பட்டுள்ளது என்பதை மாற்றியமைக்கும் உரிமையை SwitchControl கொண்டுள்ளது."
        ],
        "title": "3. அணுகல் நிலைகள்"
      },
      {
        "paragraphs": [
          "Premium அம்சங்களின் இலவச சோதனையைப் பெற்றால்:"
        ],
        "title": "4. Free trials"
      },
      {
        "paragraphs": [
          "Premium-ஐ வாங்குவது, வாங்கிய நேரத்தில் நடைமுறையில் உள்ள விதிமுறைகளின் கீழ் Premium அம்சங்களை அணுக உங்களுக்கு தனிப்பட்ட, மாற்ற முடியாத உரிமத்தை வழங்குகிறது. விலை நிர்ணயம், அணுகல் மாதிரிகள், உரிமைகள் மற்றும் அம்சத் தொகுப்புகள் காலப்போக்கில் மாறலாம். எந்தவொரு குறிப்பிட்ட அம்சமும் காலவரையறையின்றி கிடைக்கும் என்பதற்கு SwitchControl உத்தரவாதம் அளிக்காது. வெளிப்படையாக அனுமதிக்கப்படாவிட்டால், உங்கள் அணுகலை நீங்கள் மற்றவர்களுக்கு விற்கவோ, மாற்றவோ அல்லது பகிரவோ கூடாது."
        ],
        "title": "5. Premium அணுகல் மற்றும் உரிமம்"
      },
      {
        "paragraphs": [
          "SwitchControl உங்களுக்கு மென்பொருள் மற்றும் சேவையை உங்கள் சொந்த நோக்கங்களுக்காகப் பயன்படுத்த மட்டுப்படுத்தப்பட்ட, தனிப்பட்ட, பிரத்யேகமற்ற, மாற்ற முடியாத உரிமையை வழங்குகிறது. வெளிப்படையாக வழங்கப்படாத அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை."
        ],
        "title": "6. உரிமம் மற்றும் பொது அணுகல்"
      },
      {
        "paragraphs": [
          "நீங்கள் கீழ்க்கண்டவற்றைச் செய்யக்கூடாது என்று ஒப்புக்கொள்கிறீர்கள்:"
        ],
        "title": "7. ஏற்றுக்கொள்ளக்கூடிய பயன்பாடு"
      },
      {
        "paragraphs": [
          "இயல்பான தள செயல்பாடுகளின் ஒரு பகுதியாக SwitchControl எந்தக் கணக்கிலும் பின்வரும் நடவடிக்கைகளை எடுக்கலாம்:"
        ],
        "title": "8. நிர்வாகக் கணக்கு நடவடிக்கைகள்"
      },
      {
        "paragraphs": [
          "இந்தச் சேவை விதிமுறைகளை நீங்கள் மீறியதாகவோ, மோசடியான, முறையற்ற அல்லது ஏமாற்றும் நடத்தையில் ஈடுபட்டதாகவோ, அணுகல் கட்டுப்பாடுகளை அல்லது உரிம அமைப்புகளைத் தவிர்க்க அல்லது சேதப்படுத்த முயற்சிப்பதாகவோ, சேவைக்கு அல்லது பிற பயனர்களுக்குப் பாதுகாப்பு ஆபத்தை ஏற்படுத்துவதாகவோ அல்லது தீங்குகளை விளைவிக்கும் வகையில் சேவையைப் பயன்படுத்தினாலோ, SwitchControl முன் அறிவிப்பு இன்றியோ அல்லது அறிவிப்புடனோ உங்கள் அணுகலை இடைநிறுத்தலாம் அல்லது நிறுத்தலாம். உங்கள் கணக்கு காரணத்திற்காக இடைநிறுத்தப்பட்டாலோ அல்லது நிறுத்தப்பட்டாலோ, நீங்கள் பணத்தைத் திரும்பப் பெற உரிமை இல்லை."
        ],
        "title": "9. இடைநீக்கம் மற்றும் நிறுத்தம்"
      },
      {
        "paragraphs": [
          "நீங்கள் பயன்படுத்தும் அம்சங்களைப் பொறுத்து, SwitchControl Windows அமைப்புகள், கணினி விருப்பத்தேர்வுகள், தொடக்க உள்ளமைவு, பிணைய அளவுருக்கள் மற்றும் மின் சுயவிவரங்களை மாற்றலாம். மென்பொருளை கவனமாகப் பயன்படுத்துவதற்கும், ஒவ்வொரு அம்சமும் என்ன செய்கிறது என்பதைப் பயன்படுத்துவதற்கு முன்பு புரிந்துகொள்வதற்கும் நீங்கள் பொறுப்பாவீர்கள். உங்கள் கணினியில் மாற்றங்களைப் பயன்படுத்துவதால் ஏற்படும் கணினி உறுதியற்ற தன்மை, தரவு இழப்பு அல்லது பிற சிக்கல்களுக்கு SwitchControl பொறுப்பல்ல. மேம்படுத்தல் கருவிகளைப் பயன்படுத்துவதற்கு முன்பு எப்போதும் முக்கியமான தரவை காப்புப் பிரதி எடுக்கவும்."
        ],
        "title": "10. கணினி மாற்றங்கள் மற்றும் ஆபத்து"
      },
      {
        "paragraphs": [
          "SwitchControl குறிப்பிட்ட செயல்திறன் முடிவுகளுக்கு உத்தரவாதம் அளிக்காது. வன்பொருள் உள்ளமைவு, நிறுவப்பட்ட மென்பொருள், இயக்கிகள், பிணைய நிலைமைகள் மற்றும் நமது கட்டுப்பாட்டிற்கு அப்பாற்பட்ட பிற காரணிகளைப் பொறுத்து முடிவுகள் மாறுபடும். இது FPS, பிரேம் நேரம், உள்ளீட்டு தாமதம், பிங், பிணைய நிலைத்தன்மை, பூட் வேகம் மற்றும் பொதுவான கணினி பதிலளிப்பு ஆகியவற்றை உள்ளடக்கியது, ஆனால் அவை மட்டுமல்ல. AI Advisor மற்றும் BIOS Advisor வெளியீடுகள் தகவல் வழிகாட்டுதலாக மட்டுமே வழங்கப்படுகின்றன, அவை துல்லியமானவை அல்லது ஒவ்வொரு கணினிக்கும் ஏற்றவை என்று உத்தரவாதம் அளிக்கப்படவில்லை."
        ],
        "title": "11. உத்தரவாதமான முடிவுகள் இல்லை"
      },
      {
        "paragraphs": [
          "நீங்கள் வாங்குவதை முடிப்பதற்கு முன், அனைத்து விலைகளும் செக் அவுட்டில் காட்டப்படும். கொடுப்பனவுகள் எங்கள் மூன்றாம் தரப்பு கட்டண செயலியால் பாதுகாப்பாக கையாளப்படுகின்றன."
        ],
        "title": "12. கொடுப்பனவுகள் மற்றும் பணத்தைத் திரும்பப் பெறுதல்"
      },
      {
        "paragraphs": [
          "சில அம்சங்கள் கட்டண செயலிகள், அங்கீகார சேவைகள் மற்றும் ஹோஸ்டிங் உள்கட்டமைப்பு உள்ளிட்ட மூன்றாம் தரப்பு வழங்குநர்களைச் சார்ந்துள்ளன. அந்தச் சேவைகளைப் பயன்படுத்துவதற்கு அவர்களின் விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கைகளும் பொருந்தலாம். மூன்றாம் தரப்பினரின் நடத்தை அல்லது கொள்கைகளுக்கு SwitchControl பொறுப்பல்ல."
        ],
        "title": "13. மூன்றாம் தரப்பு சேவைகள்"
      },
      {
        "paragraphs": [
          "SwitchControl மென்பொருள், பிராண்ட், வடிவமைப்பு, உள்ளடக்கம் மற்றும் சேவைகளில் உள்ள அனைத்து உரிமைகளும் SwitchControl-க்கு சொந்தமானவை. இந்த விதிமுறைகளில் எதுவுமே எந்த உரிமையையும் உங்களுக்கு மாற்றாது. வெளிப்படையான எழுத்துப்பூர்வ அனுமதியின்றி SwitchControl-ன் எந்தப் பகுதியையும் நீங்கள் இனப்பெருக்கம் செய்யவோ, விநியோகிக்கவோ அல்லது வழித்தோன்றல் படைப்புகளை உருவாக்கவோ கூடாது."
        ],
        "title": "14. அறிவுசார் சொத்து"
      },
      {
        "paragraphs": [
          "சட்டத்தால் அனுமதிக்கப்பட்ட முழு அளவிற்கு, சேவையைப் பயன்படுத்துவதால் அல்லது பயன்படுத்த இயலாததால் ஏற்படும் தரவு இழப்பு, லாப இழப்பு அல்லது கணினி சேதம் உள்ளிட்ட, ஆனால் அவை மட்டுமல்லாமல், மறைமுகமான, தற்செயலான, சிறப்பு, விளைவான அல்லது தண்டனைக்குரிய சேதங்களுக்கு SwitchControl பொறுப்பல்ல."
        ],
        "title": "15. பொறுப்பு வரம்பு"
      },
      {
        "paragraphs": [
          "SwitchControl எந்த நேரத்திலும் அம்சங்கள், விலை, அணுகல் நிலைகள் மற்றும் சேவை கட்டமைப்பைப் புதுப்பிக்கலாம். நாங்கள் இந்த விதிமுறைகளையும் எங்கள் தனியுரிமைக் கொள்கையையும் புதுப்பிக்கலாம். நாங்கள் முக்கியமான மாற்றங்களைச் செய்யும்போது, \"கடைசியாகப் புதுப்பிக்கப்பட்டது\" தேதியைப் புதுப்பிப்போம். மாற்றங்கள் நடைமுறைக்கு வந்த பிறகு சேவையின் தொடர்ச்சியான பயன்பாடு புதுப்பிக்கப்பட்ட விதிமுறைகளை ஏற்றுக்கொள்வதாகக் கருதப்படுகிறது."
        ],
        "title": "16. சேவை மற்றும் இந்த விதிமுறைகளில் மாற்றங்கள்"
      },
      {
        "paragraphs": [
          "இந்த விதிமுறைகள் குறித்த கேள்விகளுக்கு, எங்களை switchcontrol67@gmail.com இல் தொடர்பு கொள்ளவும்"
        ],
        "title": "17. தொடர்பு"
      }
    ]
  },
  "vi": {
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl chỉ thu thập và sử dụng thông tin khi cần thiết để cung cấp sản phẩm, quản lý tài khoản, hỗ trợ người dùng, ngăn chặn gian lận và duy trì bảo mật. Chính sách này giải thích những gì chúng tôi thu thập, lý do tại sao và cách thức xử lý thông tin đó."
        ],
        "title": "1. Tổng quan"
      },
      {
        "paragraphs": [
          "Khi bạn đăng nhập, chúng tôi lưu trữ:"
        ],
        "title": "2. Dữ liệu tài khoản"
      },
      {
        "paragraphs": [
          "Chúng tôi lưu trữ thông tin về trạng thái truy cập của bạn để sản phẩm có thể cung cấp các tính năng chính xác. Điều này bao gồm:"
        ],
        "title": "3. Dữ liệu quyền lợi và truy cập"
      },
      {
        "paragraphs": [
          "Để hỗ trợ chức năng sản phẩm, bảo mật và quản lý tài khoản, chúng tôi có thể ghi lại:"
        ],
        "title": "4. Dữ liệu hoạt động ứng dụng và thiết bị"
      },
      {
        "paragraphs": [
          "Khi sử dụng ứng dụng trên máy tính, SwitchControl có thể truy cập thông tin phần cứng và hệ thống để cung cấp các tính năng tối ưu hóa, phân tích và tư vấn. Điều này bao gồm:"
        ],
        "title": "5. Dữ liệu hệ thống và đo lường từ xa"
      },
      {
        "paragraphs": [
          "Các quản trị viên SwitchControl được ủy quyền có thể truy cập dữ liệu cấp tài khoản cho các mục đích vận hành hợp pháp, bao gồm:"
        ],
        "title": "6. Truy cập quản trị"
      },
      {
        "paragraphs": [
          "Chúng tôi sử dụng dữ liệu mình nắm giữ để:"
        ],
        "title": "7. Cách chúng tôi sử dụng dữ liệu của bạn"
      },
      {
        "paragraphs": [
          "Chúng tôi có thể chia sẻ dữ liệu với các bên thứ ba đáng tin cậy giúp vận hành dịch vụ:"
        ],
        "title": "8. Chia sẻ và nhà cung cấp dịch vụ"
      },
      {
        "paragraphs": [
          "Chúng tôi sử dụng cookie và mã thông báo phiên để giữ cho bạn đăng nhập và duy trì trạng thái truy cập của bạn trong các lần truy cập. Những thông tin này được giới hạn ở mức cần thiết để dịch vụ hoạt động."
        ],
        "title": "9. Cookie và lưu trữ phiên"
      },
      {
        "paragraphs": [
          "Chúng tôi lưu giữ dữ liệu của bạn trong khoảng thời gian hợp lý cần thiết cho các mục đích sau:"
        ],
        "title": "10. Lưu giữ dữ liệu"
      },
      {
        "paragraphs": [
          "Chúng tôi sử dụng các biện pháp bảo vệ kỹ thuật và tổ chức hợp lý để bảo vệ dữ liệu tài khoản. Không có hệ thống nào hoàn toàn miễn nhiễm với rủi ro. Nếu bạn tin rằng tài khoản của mình đã bị xâm phạm, hãy liên hệ với chúng tôi ngay lập tức."
        ],
        "title": "11. Bảo mật"
      },
      {
        "paragraphs": [
          "Tùy thuộc vào vị trí của bạn, bạn có thể có quyền:"
        ],
        "title": "12. Quyền của bạn và việc xóa tài khoản"
      },
      {
        "paragraphs": [
          "SwitchControl không dành cho bất kỳ ai không thể ký kết hợp đồng ràng buộc hợp pháp trong khu vực pháp lý của họ, hoặc dưới độ tuổi tối thiểu yêu cầu mà không có sự cho phép thích hợp của cha mẹ hoặc người giám hộ. Nếu bạn cho rằng một trẻ vị thành niên đã cung cấp dữ liệu cá nhân mà không được phép, hãy liên hệ với chúng tôi để chúng tôi có thể xóa dữ liệu đó."
        ],
        "title": "13. Yêu cầu về độ tuổi"
      },
      {
        "paragraphs": [
          "Đối với các câu hỏi về bảo mật, yêu cầu dữ liệu hoặc thắc mắc, hãy liên hệ với chúng tôi tại switchcontrol67@gmail.com"
        ],
        "title": "14. Liên hệ"
      }
    ],
    "terms": [
      {
        "paragraphs": [
          "SwitchControl cung cấp phần mềm và dịch vụ được thiết kế để giúp người dùng cấu hình, tối ưu hóa và phân tích các cài đặt máy tính Windows và hiệu suất hệ thống. Bằng cách sử dụng SwitchControl, bạn đồng ý với các điều khoản này. Nếu bạn không đồng ý, vui lòng không sử dụng dịch vụ."
        ],
        "title": "1. Tổng quan"
      },
      {
        "paragraphs": [
          "Bạn phải có khả năng tạo một thỏa thuận có tính ràng buộc pháp lý trong khu vực pháp lý của mình. Nếu bạn dưới độ tuổi tối thiểu theo yêu cầu, bạn phải có sự cho phép của cha mẹ hoặc người giám hộ. Bằng cách sử dụng SwitchControl, bạn xác nhận mình đáp ứng các yêu cầu này."
        ],
        "title": "2. Điều kiện sử dụng"
      },
      {
        "paragraphs": [
          "SwitchControl cung cấp ba trạng thái truy cập: Free, quyền truy cập cơ bản vào các tính năng được chọn miễn phí; Trial, quyền truy cập tạm thời vào các tính năng Premium trong một khoảng thời gian giới hạn; và Premium, quyền truy cập đầy đủ các tính năng, được mở khóa thông qua việc mua hàng. Các tính năng khả dụng ở mỗi cấp độ có thể thay đổi theo thời gian. SwitchControl bảo lưu quyền điều chỉnh những gì được bao gồm trong mỗi gói."
        ],
        "title": "3. Các cấp độ truy cập"
      },
      {
        "paragraphs": [
          "Nếu bạn nhận được bản dùng thử miễn phí các tính năng Premium:"
        ],
        "title": "4. Các bản dùng thử Free"
      },
      {
        "paragraphs": [
          "Việc mua Premium cấp cho bạn giấy phép cá nhân, không thể chuyển nhượng để truy cập các tính năng Premium theo các điều khoản có hiệu lực tại thời điểm mua. Giá cả, mô hình truy cập, quyền lợi và bộ tính năng có thể thay đổi theo thời gian. SwitchControl không đảm bảo rằng bất kỳ tính năng cụ thể nào sẽ luôn khả dụng vô thời hạn. Bạn không được bán lại, chuyển nhượng hoặc chia sẻ quyền truy cập của mình với người khác trừ khi được cho phép rõ ràng."
        ],
        "title": "5. Truy cập Premium và cấp phép"
      },
      {
        "paragraphs": [
          "SwitchControl cấp cho bạn quyền hạn chế, cá nhân, không độc quyền, không thể chuyển nhượng để sử dụng phần mềm và dịch vụ cho mục đích riêng của bạn. Tất cả các quyền không được cấp rõ ràng đều được bảo lưu."
        ],
        "title": "6. Giấy phép và truy cập chung"
      },
      {
        "paragraphs": [
          "Bạn đồng ý không:"
        ],
        "title": "7. Sử dụng được chấp nhận"
      },
      {
        "paragraphs": [
          "SwitchControl có thể thực hiện các hành động sau đối với bất kỳ tài khoản nào như một phần của hoạt động nền tảng thông thường:"
        ],
        "title": "8. Các hành động tài khoản quản trị"
      },
      {
        "paragraphs": [
          "SwitchControl có thể đình chỉ hoặc chấm dứt quyền truy cập của bạn, có hoặc không có thông báo, nếu chúng tôi xác định một cách hợp lý rằng bạn đã vi phạm các Điều khoản Dịch vụ này, tham gia vào hành vi gian lận, lạm dụng hoặc lừa đảo, cố gắng giả mạo hoặc phá vỡ các hệ thống kiểm soát truy cập hoặc quyền lợi, gây ra rủi ro bảo mật cho dịch vụ hoặc người dùng khác, hoặc sử dụng dịch vụ theo cách gây hại hoặc phơi bày trách nhiệm pháp lý. Nếu tài khoản của bạn bị đình chỉ hoặc chấm dứt vì nguyên nhân, bạn không có quyền được hoàn tiền."
        ],
        "title": "9. Đình chỉ và chấm dứt"
      },
      {
        "paragraphs": [
          "SwitchControl có thể sửa đổi cài đặt Windows, tùy chọn hệ thống, cấu hình khởi động, thông số mạng và cấu hình nguồn tùy thuộc vào các tính năng bạn sử dụng. Bạn chịu trách nhiệm sử dụng phần mềm cẩn thận và hiểu rõ chức năng của từng tính năng trước khi áp dụng. SwitchControl không chịu trách nhiệm về sự không ổn định của hệ thống, mất dữ liệu hoặc các vấn đề khác có thể phát sinh từ việc áp dụng các thay đổi cho hệ thống của bạn. Luôn sao lưu dữ liệu quan trọng trước khi sử dụng các công cụ tối ưu hóa."
        ],
        "title": "10. Thay đổi hệ thống và rủi ro"
      },
      {
        "paragraphs": [
          "SwitchControl không đảm bảo các kết quả hiệu suất cụ thể. Kết quả thay đổi tùy thuộc vào cấu hình phần cứng, phần mềm đã cài đặt, trình điều khiển, điều kiện mạng và nhiều yếu tố khác nằm ngoài tầm kiểm soát của chúng tôi. Điều này bao gồm nhưng không giới hạn ở: FPS, thời gian khung hình, độ trễ đầu vào, ping, độ ổn định mạng, tốc độ khởi động và khả năng phản hồi chung của hệ thống. Các đề xuất do AI tạo ra và kết quả từ AI Advisor được cung cấp chỉ như hướng dẫn thông tin, chúng không được đảm bảo là chính xác hoặc phù hợp cho mọi hệ thống."
        ],
        "title": "11. Không đảm bảo kết quả"
      },
      {
        "paragraphs": [
          "Tất cả giá cả được hiển thị tại quầy thanh toán trước khi bạn hoàn tất giao dịch mua hàng. Thanh toán được xử lý bảo mật bởi nhà cung cấp dịch vụ thanh toán bên thứ ba của chúng tôi."
        ],
        "title": "12. Thanh toán và hoàn tiền"
      },
      {
        "paragraphs": [
          "Một số tính năng dựa vào các nhà cung cấp bên thứ ba bao gồm nhà xử lý thanh toán, dịch vụ xác thực và hạ tầng lưu trữ. Các điều khoản và chính sách bảo mật của họ cũng có thể áp dụng cho việc bạn sử dụng các dịch vụ đó. SwitchControl không chịu trách nhiệm về hành vi hoặc chính sách của bên thứ ba."
        ],
        "title": "13. Dịch vụ của bên thứ ba"
      },
      {
        "paragraphs": [
          "Tất cả các quyền trong phần mềm, thương hiệu, thiết kế, nội dung và dịch vụ của SwitchControl đều thuộc sở hữu của SwitchControl. Không có điều gì trong các điều khoản này chuyển quyền sở hữu cho bạn. Bạn không được sao chép, phân phối hoặc tạo ra các tác phẩm phái sinh từ bất kỳ phần nào của SwitchControl mà không có sự cho phép rõ ràng bằng văn bản."
        ],
        "title": "14. Quyền sở hữu trí tuệ"
      },
      {
        "paragraphs": [
          "Trong phạm vi tối đa được pháp luật cho phép, SwitchControl không chịu trách nhiệm cho các thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, hệ quả hoặc trừng phạt, bao gồm nhưng không giới hạn ở việc mất dữ liệu, mất lợi nhuận hoặc thiệt hại hệ thống, phát sinh từ việc bạn sử dụng hoặc không thể sử dụng dịch vụ."
        ],
        "title": "15. Giới hạn trách nhiệm"
      },
      {
        "paragraphs": [
          "SwitchControl có thể cập nhật các tính năng, giá cả, cấp độ truy cập và cấu trúc dịch vụ bất cứ lúc nào. Chúng tôi cũng có thể cập nhật các điều khoản này và Chính sách bảo mật của chúng tôi. Khi chúng tôi thực hiện các thay đổi quan trọng, chúng tôi sẽ cập nhật ngày “Cập nhật lần cuối”. Việc tiếp tục sử dụng dịch vụ sau khi các thay đổi có hiệu lực cấu thành sự chấp nhận các điều khoản đã cập nhật."
        ],
        "title": "16. Thay đổi đối với dịch vụ và các điều khoản này"
      },
      {
        "paragraphs": [
          "Đối với các câu hỏi về các điều khoản này, hãy liên hệ với chúng tôi tại switchcontrol67@gmail.com"
        ],
        "title": "17. Liên hệ"
      }
    ]
  },
  "ur": {
    "terms": [
      {
        "paragraphs": [
          "SwitchControl ایسی سافٹ ویئر اور خدمات فراہم کرتا ہے جو صارفین کو Windows PC کی ترتیبات اور سسٹم کی کارکردگی کو ترتیب دینے، بہتر بنانے اور تجزیہ کرنے میں مدد کے لیے ڈیزائن کی گئی ہیں۔ SwitchControl استعمال کرکے، آپ ان شرائط سے اتفاق کرتے ہیں۔ اگر آپ اتفاق نہیں کرتے ہیں، تو سروس کا استعمال نہ کریں۔"
        ],
        "title": "1. جائزہ"
      },
      {
        "paragraphs": [
          "آپ کو اپنے دائرہ اختیار میں قانونی طور پر پابند معاہدہ کرنے کے قابل ہونا چاہیے۔ اگر آپ کم از کم مطلوبہ عمر سے کم ہیں، تو آپ کے پاس والدین یا سرپرست کی اجازت ہونی چاہیے۔ SwitchControl استعمال کرکے، آپ تصدیق کرتے ہیں کہ آپ ان ضروریات کو پورا کرتے ہیں۔"
        ],
        "title": "2. اہلیت"
      },
      {
        "paragraphs": [
          "SwitchControl تین رسائی کی حالتیں پیش کرتا ہے: Free، منتخب خصوصیات تک بلا معاوضہ بنیادی رسائی؛ Trial، محدود وقت کے لیے Premium خصوصیات تک عارضی رسائی؛ اور Premium، خریداری کے ذریعے مکمل خصوصیات تک رسائی۔ ہر ٹائر پر دستیاب خصوصیات وقت کے ساتھ بدل سکتی ہیں۔ SwitchControl ہر پلان میں کیا شامل ہے اسے ایڈجسٹ کرنے کا حق محفوظ رکھتا ہے۔"
        ],
        "title": "3. رسائی کے درجات"
      },
      {
        "paragraphs": [
          "اگر آپ کو Premium خصوصیات کا ایک مفت ٹرائل ملتا ہے:"
        ],
        "title": "4. مفت آزمائشیں",
        "bullets": [
          "ٹرائل عارضی ہوتے ہیں اور ٹرائل کی مدت ختم ہونے پر خود بخود ختم ہو جاتے ہیں",
          "ٹرائل کا دورانیہ مختلف ہو سکتا ہے اور اس کا تعین SwitchControl کرتا ہے",
          "ٹرائل SwitchControl اپنی صوابدید پر دستی طور پر دے سکتا ہے",
          "ایک ٹرائل ختم ہونے کے بعد Premium تک مستقل رسائی کی ضمانت نہیں دیتا",
          "جب ٹرائل ختم ہو جاتا ہے، تو آپ کا اکاؤنٹ معیاری Free رسائی پر واپس آ جاتا ہے جب تک کہ آپ نے Premium خریدا نہ ہو"
        ]
      },
      {
        "paragraphs": [
          "Premium کی خریداری آپ کو خریداری کے وقت نافذ شرائط کے تحت Premium خصوصیات تک رسائی حاصل کرنے کے لیے ایک ذاتی، ناقابل منتقلی لائسنس دیتی ہے۔ قیمتوں کا تعین، رسائی کے ماڈل، استحقاق، اور خصوصیات کے سیٹ وقت کے ساتھ بدل سکتے ہیں۔ SwitchControl اس بات کی ضمانت نہیں دیتا ہے کہ کوئی مخصوص خصوصیت غیر معینہ مدت تک دستیاب رہے گی۔ آپ اپنی رسائی کو دوبارہ فروخت، منتقل یا دوسروں کے ساتھ شیئر نہیں کر سکتے جب تک کہ واضح طور پر اجازت نہ دی گئی ہو۔"
        ],
        "title": "5. پریمیم رسائی اور لائسنسنگ"
      },
      {
        "paragraphs": [
          "SwitchControl آپ کو اپنے مقاصد کے لیے سافٹ ویئر اور سروس استعمال کرنے کا ایک محدود، ذاتی، غیر خصوصی، ناقابل منتقلی حق دیتا ہے۔ تمام حقوق جو واضح طور پر نہیں دیے گئے ہیں محفوظ ہیں۔"
        ],
        "title": "6. لائسنس اور عمومی رسائی"
      },
      {
        "paragraphs": [
          "آپ اس بات سے اتفاق کرتے ہیں کہ آپ درج ذیل کام نہیں کریں گے:"
        ],
        "title": "7. قابل قبول استعمال",
        "bullets": [
          "کسی بھی غیر قانونی مقصد کے لیے سروس کا استعمال",
          "سروس کے سورس کوڈ یا منطق کو ریورس انجینئر، ڈی کمپائل یا ایکسٹریکٹ کرنے کی کوشش کرنا",
          "استحقاق، لائسنسنگ، یا رسائی کنٹرول سسٹمز کو بائی پاس، سرکمنوِینٹ یا ان کے ساتھ چھیڑ چھاڑ کرنے کی کوشش کرنا",
          "سروس کو غلط استعمال کرنے یا اوورلوڈ کرنے کے لیے خودکار ٹولز، بوٹس یا اسکرپٹس کا استعمال",
          "سروس میں مداخلت کرنا یا دوسرے صارفین کے لیے تجربے کو خراب کرنا",
          "ان اکاؤنٹس، سسٹمز یا ڈیٹا تک غیر مجاز رسائی کی کوشش کرنا جو آپ کی ملکیت نہیں ہیں",
          "میلویئر یا نقصان دہ کوڈ اپ لوڈ، منتقل یا متعارف کروانا",
          "اپنی شناخت یا اکاؤنٹ کی حیثیت کو غلط بیان کرنا"
        ]
      },
      {
        "paragraphs": [
          "SwitchControl عام پلیٹ فارم آپریشنز کے حصے کے طور پر کسی بھی اکاؤنٹ پر درج ذیل کارروائیاں کر سکتا ہے:"
        ],
        "title": "8. انتظامی اکاؤنٹ کے اقدامات",
        "bullets": [
          "رسائی کے ٹائرز (Free, Trial, Premium) دینا، تبدیل کرنا یا منسوخ کرنا",
          "پروڈکٹ کے فلیگز جیسے آن بورڈنگ اسٹیٹس کو ری سیٹ کرنا",
          "مشتبہ غلط استعمال، دھوکہ دہی، یا پالیسی کی خلاف ورزیوں کی تحقیقات کرنا",
          "جہاں ضروری ہو رسائی معطل یا ختم کرنا (سیکشن 9 دیکھیں)",
          "اکاؤنٹ ڈیلیٹ کرنے کی درخواستوں پر کارروائی کرنا",
          "قانونی، سیکیورٹی، یا سپورٹ کے تقاضوں کا جواب دینا",
          "یہ کارروائیاں صرف جائز آپریشنل یا سیکیورٹی وجوہات کی بنا پر کی جاتی ہیں اور ریکارڈ کی جاتی ہیں۔"
        ]
      },
      {
        "paragraphs": [
          "SwitchControl آپ کی رسائی کو معطل یا ختم کر سکتا ہے، نوٹس کے ساتھ یا بغیر، اگر ہم معقول طور پر یہ طے کرتے ہیں کہ آپ نے سروس کی ان شرائط کی خلاف ورزی کی ہے، دھوکہ دہی، توہین آمیز، یا فریب کاری پر مبنی رویے میں ملوث رہے ہیں، رسائی کنٹرولز یا استحقاق کے سسٹمز کو چھیڑنے یا بائی پاس کرنے کی کوشش کی ہے، سروس یا دیگر صارفین کے لیے سیکیورٹی کا خطرہ پیدا کیا ہے، یا سروس کو اس طرح استعمال کیا ہے جس سے نقصان یا قانونی خطرہ پیدا ہو۔ اگر آپ کا اکاؤنٹ کسی وجہ سے معطل یا ختم کر دیا جاتا ہے، تو آپ ریفنڈ کے حقدار نہیں ہیں۔"
        ],
        "title": "9. معطلی اور برطرفی"
      },
      {
        "paragraphs": [
          "SwitchControl آپ کے استعمال کردہ فیچرز کے لحاظ سے Windows کی ترتیبات، سسٹم کی ترجیحات، اسٹارٹ اپ کنفیگریشن، نیٹ ورک پیرامیٹرز، اور پاور پروفائلز میں ترمیم کر سکتا ہے۔ آپ احتیاط سے سافٹ ویئر استعمال کرنے اور اسے لاگو کرنے سے پہلے یہ سمجھنے کے ذمہ دار ہیں کہ ہر فیچر کیا کرتا ہے۔ SwitchControl سسٹم کے عدم استحکام، ڈیٹا کے نقصان، یا دیگر مسائل کے لیے ذمہ دار نہیں ہے جو آپ کے سسٹم میں تبدیلیاں لاگو کرنے سے پیدا ہو سکتے ہیں۔ آپٹیمائزیشن ٹولز استعمال کرنے سے پہلے ہمیشہ اہم ڈیٹا کا بیک اپ لیں۔"
        ],
        "title": "10. نظام میں تبدیلیاں اور خطرہ"
      },
      {
        "paragraphs": [
          "SwitchControl مخصوص کارکردگی کے نتائج کی ضمانت نہیں دیتا ہے۔ نتائج ہارڈویئر کنفیگریشن، انسٹال شدہ سافٹ ویئر، ڈرائیورز، نیٹ ورک کے حالات، اور ہمارے کنٹرول سے باہر بہت سے دیگر عوامل کی بنیاد پر مختلف ہوتے ہیں۔ اس میں FPS، فریم ٹائم، ان پٹ لیٹنسی، پنگ، نیٹ ورک کا استحکام، بوٹ اسپیڈ، اور عمومی سسٹم ریسپانسیونس شامل ہیں لیکن ان تک محدود نہیں ہے۔ AI سے تیار کردہ سفارشات اور ایڈوائزر آؤٹ پٹس صرف معلوماتی رہنمائی کے طور پر فراہم کیے جاتے ہیں، ان کے درست یا ہر سسٹم کے لیے موزوں ہونے کی ضمانت نہیں ہے۔"
        ],
        "title": "11. نتائج کی کوئی ضمانت نہیں"
      },
      {
        "paragraphs": [
          "تمام قیمتیں خریداری مکمل کرنے سے پہلے چیک آؤٹ پر دکھائی جاتی ہیں۔ ادائیگیاں ہمارے تھرڈ پارٹی پیمنٹ پروسیسر کے ذریعے محفوظ طریقے سے ہینڈل کی جاتی ہیں۔"
        ],
        "title": "12. ادائیگیاں اور ریفنڈز",
        "bullets": [
          "تمام سیلز حتمی ہیں جب تک کہ SwitchControl کی طرف سے واضح طور پر ریفنڈ کی پیشکش نہ کی جائے یا قابل اطلاق قانون کے تحت ضرورت نہ ہو",
          "آپ کے مقام اور ادائیگی فراہم کنندہ کے قواعد کی بنیاد پر ٹیکس لاگو ہو سکتے ہیں",
          "اگر آپ کو لگتا ہے کہ چارج غلطی سے ہوا ہے، تو ہم سے فوری رابطہ کریں"
        ]
      },
      {
        "paragraphs": [
          "کچھ خصوصیات تھرڈ پارٹی فراہم کنندگان پر انحصار کرتی ہیں جن میں پیمنٹ پروسیسرز، تصدیقی خدمات، اور ہوسٹنگ انفراسٹرکچر شامل ہیں۔ ان کی شرائط اور پرائیویسی پالیسیاں بھی ان خدمات کے آپ کے استعمال پر لاگو ہو سکتی ہیں۔ SwitchControl تیسرے فریق کے طرز عمل یا پالیسیوں کے لیے ذمہ دار نہیں ہے۔"
        ],
        "title": "13. فریق ثالث کی خدمات"
      },
      {
        "paragraphs": [
          "SwitchControl سافٹ ویئر، برانڈ، ڈیزائن، مواد، اور خدمات میں تمام حقوق SwitchControl کی ملکیت ہیں۔ ان شرائط میں سے کوئی بھی چیز آپ کو کوئی ملکیت منتقل نہیں کرتی ہے۔ آپ واضح تحریری اجازت کے بغیر SwitchControl کے کسی بھی حصے کو دوبارہ تیار، تقسیم یا اس سے ماخوذ کام تخلیق نہیں کر سکتے۔"
        ],
        "title": "14. انٹلیکچوئل پراپرٹی"
      },
      {
        "paragraphs": [
          "قانون کی طرف سے اجازت دی گئی مکمل حد تک، SwitchControl بالواسطہ، حادثاتی، خصوصی، نتیجے میں ہونے والے، یا تعزیری نقصانات کے لیے ذمہ دار نہیں ہے، بشمول ڈیٹا کا نقصان، منافع کا نقصان، یا سسٹم کو پہنچنے والا نقصان، جو سروس کے آپ کے استعمال سے، یا استعمال کرنے سے قاصر ہونے سے پیدا ہوتا ہے۔"
        ],
        "title": "15. ذمہ داری کی حد"
      },
      {
        "paragraphs": [
          "SwitchControl کسی بھی وقت خصوصیات، قیمتوں، رسائی کے ٹائرز، اور سروس کے ڈھانچے کو اپ ڈیٹ کر سکتا ہے۔ ہم ان شرائط اور اپنی پرائیویسی پالیسی کو بھی اپ ڈیٹ کر سکتے ہیں۔ جب ہم اہم تبدیلیاں کرتے ہیں، تو ہم 'آخری بار اپ ڈیٹ شدہ' تاریخ کو اپ ڈیٹ کریں گے۔ تبدیلیوں کے نافذ ہونے کے بعد سروس کا مسلسل استعمال اپ ڈیٹ شدہ شرائط کی قبولیت تشکیل دیتا ہے۔"
        ],
        "title": "16. سروس اور ان شرائط میں تبدیلیاں"
      },
      {
        "paragraphs": [
          "ان شرائط کے بارے میں سوالات کے لیے، ہم سے switchcontrol67@gmail.com پر رابطہ کریں"
        ],
        "title": "17. رابطہ"
      }
    ],
    "privacy": [
      {
        "paragraphs": [
          "SwitchControl معلومات صرف وہاں جمع کرتا اور استعمال کرتا ہے جہاں پروڈکٹ فراہم کرنے، اکاؤنٹس کا انتظام کرنے، صارفین کی مدد کرنے، دھوکہ دہی کو روکنے، اور سیکیورٹی کو برقرار رکھنے کے لیے ضرورت ہو۔ یہ پالیسی بتاتی ہے کہ ہم کیا جمع کرتے ہیں، کیوں، اور اسے کیسے ہینڈل کیا جاتا ہے۔"
        ],
        "title": "1. جائزہ"
      },
      {
        "paragraphs": [
          "جب آپ سائن ان کرتے ہیں، تو ہم ذخیرہ کرتے ہیں:"
        ],
        "title": "2. اکاؤنٹ کا ڈیٹا",
        "bullets": [
          "آپ کا ای میل ایڈریس",
          "آپ کا ڈسپلے نام، اگر آپ کے تصدیقی فراہم کنندہ کی طرف سے فراہم کیا گیا ہو",
          "ایک منفرد اکاؤنٹ شناخت کنندہ",
          "آپ کے لاگ ان سیشن کا انتظام کرنے کے لیے درکار تصدیقی میٹا ڈیٹا (جیسے OAuth فراہم کنندہ ٹوکن)"
        ]
      },
      {
        "paragraphs": [
          "ہم آپ کی رسائی کی حالت کے بارے میں معلومات ذخیرہ کرتے ہیں تاکہ پروڈکٹ درست خصوصیات فراہم کر سکے۔ اس میں شامل ہیں:"
        ],
        "title": "3. استحقاق اور رسائی کا ڈیٹا",
        "bullets": [
          "آپ کا موجودہ پلان (Free, Trial, یا Premium)",
          "اگر ٹرائل چالو کیا گیا ہو تو ٹرائل شروع ہونے کی تاریخ، ختم ہونے کی تاریخ، اور دورانیہ",
          "Premium ایکٹیویشن اور ادائیگی کی حیثیت",
          "آیا آپ نے آن بورڈنگ ٹورز یا پہلی بار سیٹ اپ کے بہاؤ مکمل کر لیے ہیں",
          "فیچر تک رسائی کے فلیگز جو یہ تعین کرنے کے لیے استعمال ہوتے ہیں کہ آپ کیا دیکھ سکتے ہیں اور استعمال کر سکتے ہیں"
        ]
      },
      {
        "paragraphs": [
          "پروڈکٹ کی فعالیت، سیکیورٹی، اور اکاؤنٹ مینجمنٹ کی مدد کے لیے، ہم ریکارڈ کر سکتے ہیں:"
        ],
        "title": "4. ایپ اور ڈیوائس کی سرگرمی کا ڈیٹا",
        "bullets": [
          "آپ کے آخری لاگ ان کا وقت",
          "آخری بار جب ڈیسک ٹاپ ایپ آپ کے آلے پر فعال تھی",
          "آیا ایپ انسٹال اور استعمال کی گئی ہے",
          "سیکیورٹی، سپورٹ، اور دھوکہ دہی کی روک تھام سے متعلق اکاؤنٹ یا ایڈمن سرگرمی کے واقعات",
          "ہم کی اسٹروکس، ذاتی فائلیں، کلپ بورڈ کے مواد، یا مکمل براؤزنگ ہسٹری ریکارڈ نہیں کرتے ہیں۔"
        ]
      },
      {
        "paragraphs": [
          "ڈیسک ٹاپ ایپ استعمال کرتے وقت، SwitchControl اپنی آپٹیمائزیشن، تجزیہ، اور مشاورتی خصوصیات کو طاقت دینے کے لیے ہارڈویئر اور سسٹم کی معلومات تک رسائی حاصل کر سکتا ہے۔ اس میں شامل ہیں:"
        ],
        "title": "5. سسٹم اور ٹیلی میٹری ڈیٹا",
        "bullets": [
          "ہارڈویئر پروفائل کی معلومات (CPU, GPU, RAM, اسٹوریج) جو آپٹیمائزیشن اور ایڈوائزر فیچرز استعمال کرتے ہیں",
          "ریئل ٹائم سسٹم میٹرکس (CPU لوڈ، میموری کا استعمال، GPU لوڈ) جو ڈیش بورڈ میں دکھائے جاتے ہیں",
          "تشخیصی ڈیٹا جو AI Advisor اور BIOS Advisor سفارشات تیار کرنے کے لیے استعمال کرتے ہیں",
          "نیٹ ورک کنفیگریشن ڈیٹا جو نیٹ ورک آپٹیمائزیشن فیچرز استعمال کرتے ہیں",
          "یہ ڈیٹا مقامی طور پر ایپ کی خصوصیات کو طاقت دینے کے لیے استعمال ہوتا ہے۔ ہم صرف وہی جمع کرتے ہیں جو فعالیت، تجزیہ، اور سپورٹ فراہم کرنے کے لیے درکار ہو، اور اس سے زیادہ کچھ نہیں۔"
        ]
      },
      {
        "paragraphs": [
          "مجاز SwitchControl ایڈمنسٹریٹرز جائز آپریشنل مقاصد کے لیے اکاؤنٹ کی سطح کے ڈیٹا تک رسائی حاصل کر سکتے ہیں، بشمول:"
        ],
        "title": "6. انتظامی رسائی",
        "bullets": [
          "ٹرائل یا پریمیم رسائی دینا یا منسوخ کرنا",
          "سبسکرپشن یا پلان کی حیثیت کو اپ ڈیٹ کرنا",
          "پروڈکٹ کے فلیگز جیسے آن بورڈنگ مکمل ہونے کو ری سیٹ کرنا",
          "اکاؤنٹ ڈیلیٹ کرنے کی درخواستوں پر کارروائی کرنا",
          "غلط استعمال، دھوکہ دہی، یا پالیسی کی خلاف ورزیوں کی رپورٹس کی تحقیقات کرنا",
          "اکاؤنٹ سپورٹ فراہم کرنا",
          "انتظامی کارروائیاں احتساب اور سیکیورٹی کے مقاصد کے لیے ریکارڈ کی جاتی ہیں۔"
        ]
      },
      {
        "paragraphs": [
          "ہم اپنے پاس موجود ڈیٹا کا استعمال کرتے ہیں:"
        ],
        "title": "7. ہم آپ کا ڈیٹا کیسے استعمال کرتے ہیں",
        "bullets": [
          "آپ کا اکاؤنٹ بنانے اور اس کا انتظام کرنے کے لیے",
          "آپ کے پلان کے مطابق خصوصیات فراہم کرنے کے لیے",
          "ایپ میں آپٹیمائزیشن، ایڈوائزری، اور تشخیصی خصوصیات کو طاقت دینے کے لیے",
          "ادائیگیوں پر کارروائی اور تصدیق کرنے کے لیے",
          "دھوکہ دہی، غلط استعمال، اور غیر مجاز رسائی کو روکنے کے لیے",
          "کسٹمر اور تکنیکی مدد فراہم کرنے کے لیے",
          "قانونی ذمہ داریوں کی تعمیل کرنے کے لیے"
        ]
      },
      {
        "paragraphs": [
          "ہم ڈیٹا ان قابل اعتماد تیسرے فریقوں کے ساتھ شیئر کر سکتے ہیں جو سروس کو چلانے میں مدد کرتے ہیں:"
        ],
        "title": "8. شیئرنگ اور سروس فراہم کرنے والے",
        "bullets": [
          "ادائیگی کے پروسیسرز، خریداریوں کو مکمل اور تصدیق کرنے کے لیے",
          "تصدیقی فراہم کنندگان، جیسے Google، سائن ان کو ہینڈل کرنے کے لیے",
          "ہوسٹنگ اور انفراسٹرکچر فراہم کنندگان، سروس کو چلانے اور فراہم کرنے کے لیے",
          "ہم آپ کی ذاتی معلومات فروخت نہیں کرتے ہیں۔ ہم اشتہاری مقاصد کے لیے ڈیٹا شیئر نہیں کرتے ہیں۔"
        ]
      },
      {
        "paragraphs": [
          "ہم آپ کو سائن ان رکھنے اور دوروں کے دوران آپ کی رسائی کی حالت کو برقرار رکھنے کے لیے کوکیز اور سیشن ٹوکن استعمال کرتے ہیں۔ یہ اس حد تک محدود ہیں جو سروس کے کام کرنے کے لیے ضروری ہے۔"
        ],
        "title": "9. کوکیز اور سیشن اسٹوریج"
      },
      {
        "paragraphs": [
          "ہم آپ کا ڈیٹا اس وقت تک برقرار رکھتے ہیں جب تک درج ذیل مقاصد کے لیے معقول حد تک ضروری ہو:"
        ],
        "title": "10. ڈیٹا کو برقرار رکھنا",
        "bullets": [
          "پروڈکٹ فراہم کرنا اور سپورٹ کرنا",
          "بلنگ اور ادائیگی کے ریکارڈ کو برقرار رکھنا",
          "دھوکہ دہی کی روک تھام اور سیکیورٹی",
          "قانونی یا ریگولیٹری ذمہ داریوں کو پورا کرنا",
          "تنازعات کو حل کرنا یا سپورٹ کیسز کو ہینڈل کرنا",
          "آڈٹ ریکارڈ کو برقرار رکھنا جہاں آپریشنل طور پر ضرورت ہو",
          "اگر آپ اپنے اکاؤنٹ کو ڈیلیٹ کرنے کی درخواست کرتے ہیں، تو ہم آپ کے ڈیٹا کو کسی بھی قانونی یا سیکیورٹی ہولڈ کی ضروریات کے تابع ہٹا دیں گے۔"
        ]
      },
      {
        "paragraphs": [
          "ہم اکاؤنٹ ڈیٹا کی حفاظت کے لیے معقول تکنیکی اور تنظیمی حفاظتی اقدامات کا استعمال کرتے ہیں۔ کوئی بھی سسٹم مکمل طور پر خطرے سے محفوظ نہیں ہے۔ اگر آپ کو لگتا ہے کہ آپ کا اکاؤنٹ ہیک ہو گیا ہے، تو ہم سے فوری رابطہ کریں۔"
        ],
        "title": "11. سیکیورٹی"
      },
      {
        "paragraphs": [
          "آپ کے مقام پر منحصر ہے، آپ کو درج ذیل حقوق حاصل ہو سکتے ہیں:"
        ],
        "title": "12. آپ کے حقوق اور اکاؤنٹ ڈیلیٹ کرنا",
        "bullets": [
          "آپ کے بارے میں ہمارے پاس موجود ڈیٹا کی کاپی کی درخواست کرنا",
          "غلط ڈیٹا میں اصلاح کی درخواست کرنا",
          "اپنے اکاؤنٹ اور متعلقہ ڈیٹا کو ڈیلیٹ کرنے کی درخواست کرنا",
          "اپنے ڈیٹا کے کچھ استعمال پر اعتراض کرنا یا اسے محدود کرنا",
          "ان میں سے کوئی بھی درخواست کرنے کے لیے، ہمیں switchcontrol67@gmail.com پر ای میل کریں۔ ہم فوری جواب دیں گے۔ نوٹ کریں کہ کچھ ڈیٹا ڈیلیٹ ہونے کے بعد بھی برقرار رکھا جا سکتا ہے جہاں قانونی یا آپریشنل طور پر ضرورت ہو (مثال کے طور پر، بلنگ ریکارڈز یا سیکیورٹی لاگز)۔"
        ]
      },
      {
        "paragraphs": [
          "SwitchControl ایسے کسی بھی شخص کے استعمال کے لیے نہیں ہے جو اپنے دائرہ اختیار میں قانونی طور پر پابند معاہدہ نہیں کر سکتا، یا جو مناسب والدین یا سرپرست کی اجازت کے بغیر کم از کم مطلوبہ عمر سے کم ہے۔ اگر آپ کو لگتا ہے کہ کسی نابالغ نے بغیر اجازت کے ذاتی ڈیٹا فراہم کیا ہے، تو ہم سے رابطہ کریں تاکہ ہم اسے ہٹا سکیں۔"
        ],
        "title": "13. عمر کی ضروریات"
      },
      {
        "paragraphs": [
          "پرائیویسی سے متعلق سوالات، ڈیٹا کی درخواستوں، یا خدشات کے لیے، ہم سے switchcontrol67@gmail.com پر رابطہ کریں"
        ],
        "title": "14. رابطہ"
      }
    ]
  }
};

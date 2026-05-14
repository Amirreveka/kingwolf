/**
 * seed-feed.js — Demo data seeder for KingWolf Feed
 * Inserts: 50 Middle East news posts + follow relationships + likes + bookmarks
 *
 * Usage:  node seed-feed.js [http://localhost:3001]
 */

const API = process.argv[2] || 'http://localhost:3001';

// Demo users (auto-seeded by server.js with email: username@kingwolf.demo, pass: demo1234)
const USERS = [
  'ayda_r','nilufar_m','parisa_a','mahsa_k','sara_t',
  'zahra_n','maryam_h','sheyda_s','leila_j','fateme_a',
  'reza_m','ali_k','hamed_r','mehdi_s','arash_n',
  'sina_h','dariush_a','omid_f','nima_b','peyman_z',
];

// 50 Middle East news posts
const NEWS_POSTS = [
  { u:0, t:`🇮🇷 ایران و عربستان سعودی توافق‌نامه احیای روابط دیپلماتیک را امضا کردند.\nوزرای خارجه دو کشور در تهران دیدار و بر سرگشایی سفارتخانه‌ها توافق کردند.\n#خاورمیانه #دیپلماسی\n📰 منبع: Al Jazeera Arabic`, h:['خاورمیانه','دیپلماسی'] },
  { u:1, t:`🇾🇪 آتش‌بس جدید در یمن؛ سازمان ملل از توقف درگیری‌ها در ۱۴ استان خبر داد.\nتأکید بر ادامه مذاکرات صلح در مسقط.\n#یمن #صلح\n📰 منبع: Reuters`, h:['یمن','صلح'] },
  { u:2, t:`🇱🇧 لبنان پس از ماه‌ها بن‌بست سیاسی صاحب رئیس‌جمهور شد.\nمجلس در دور دوازدهم رأی‌گیری به نامزد مورد توافق رأی داد.\n#لبنان #سیاست\n📰 منبع: L'Orient Le Jour`, h:['لبنان','سیاست'] },
  { u:3, t:`🇸🇾 گفتگوهای عادی‌سازی بین سوریه و اردن از سر گرفته شد.\nامان و دمشق سفیران خود را تبادل می‌کنند.\n#سوریه #اردن\n📰 منبع: Arab News`, h:['سوریه','اردن'] },
  { u:4, t:`🇮🇶 عراق میزبان نشست بغداد ۳ با حضور نمایندگان ۱۲ کشور منطقه شد.\nتمرکز بر امنیت انرژی و مبارزه با تروریسم.\n#عراق #همکاری_منطقه‌ای\n📰 منبع: Rudaw`, h:['عراق','همکاری_منطقهای'] },
  { u:5, t:`🛢️ اوپک‌پلاس تولید نفت را روزانه ۵۰۰ هزار بشکه کاهش داد.\nقیمت نفت برنت به ۸۹ دلار رسید.\n#نفت #اوپک #اقتصاد\n📰 منبع: Bloomberg`, h:['نفت','اوپک','اقتصاد'] },
  { u:6, t:`🇸🇦 عربستان سعودی بزرگ‌ترین پروژه انرژی خورشیدی منطقه را در نئوم افتتاح کرد.\nظرفیت ۲ گیگاوات در فاز اول.\n#انرژی_خورشیدی #نئوم\n📰 منبع: Saudi Gazette`, h:['انرژی_خورشیدی','نئوم'] },
  { u:7, t:`🇦🇪 امارات صندوق ۱۰۰ میلیارد دلاری برای سرمایه‌گذاری در فناوری هوش مصنوعی اعلام کرد.\n#امارات #هوش_مصنوعی #اقتصاد\n📰 منبع: The National`, h:['امارات','هوش_مصنوعی','اقتصاد'] },
  { u:8, t:`🇶🇦 قطر پیمان تأمین گاز ۲۰ ساله با ۵ کشور اروپایی امضا کرد.\nصادرات LNG افزایش می‌یابد.\n#قطر #گاز_طبیعی\n📰 منبع: Qatar Tribune`, h:['قطر','گاز_طبیعی'] },
  { u:9, t:`📈 مصر ۱۲ میلیارد دلار وام از صندوق بین‌المللی پول دریافت کرد.\nشرط: اصلاحات اقتصادی و کاهش نرخ ارز دولتی.\n#مصر #IMF\n📰 منبع: Al-Ahram`, h:['مصر','IMF'] },
  { u:10, t:`🤖 امارات مدل زبانی بزرگ Falcon 3 را به‌صورت متن‌باز منتشر کرد.\nبهترین مدل عربی در معیارهای رایج.\n#هوش_مصنوعی #فالکون\n📰 منبع: TII Abu Dhabi`, h:['هوش_مصنوعی','فالکون'] },
  { u:11, t:`🚀 ایران ماهواره ارتباطی «پارس ۲» را با موفقیت به مدار پایین زمین فرستاد.\nدوره مأموریت ۵ سال.\n#ایران #فضا #ماهواره\n📰 منبع: IRNA`, h:['ایران','فضا','ماهواره'] },
  { u:12, t:`💻 عربستان پروژه ۵G ملی را کامل کرد؛ پوشش ۹۸٪ جمعیت.\nسرعت متوسط ۷۰۰ مگابیت بر ثانیه.\n#عربستان #5G\n📰 منبع: Arab News`, h:['عربستان','5G'] },
  { u:13, t:`🌐 اردن اولین «شهر دیجیتال» خاورمیانه را در عقبه افتتاح کرد.\nمرکز داده با ظرفیت ۱۵۰ مگاوات.\n#اردن #دیجیتال\n📰 منبع: Jordan Times`, h:['اردن','دیجیتال'] },
  { u:14, t:`📱 اسرائیل در رتبه‌بندی استارتاپ‌های جهان به جایگاه ۴ رسید.\n۳ شرکت جدید به جمع یونیکورن‌ها پیوستند.\n#اسرائیل #استارتاپ\n📰 منبع: Calcalist`, h:['اسرائیل','استارتاپ'] },
  { u:15, t:`🌊 سطح آب خلیج فارس در ۱۰ سال اخیر ۱۲ سانتی‌متر بالا آمده است.\nتهدید جدی برای سواحل کویت و بحرین.\n#تغییرات_آبوهوا #خلیج_فارس\n📰 منبع: Nature Middle East`, h:['تغییرات_آبوهوا','خلیج_فارس'] },
  { u:16, t:`🌱 مراکش از هدف ۵۲٪ انرژی تجدیدپذیر تا ۲۰۳۰ پیشی گرفت.\nاکنون ۵۷٪ برق از منابع پاک تأمین می‌شود.\n#مراکش #انرژی_پاک\n📰 منبع: Hespress`, h:['مراکش','انرژی_پاک'] },
  { u:17, t:`🌾 بحران آب در عراق؛ رودخانه‌های دجله و فرات به پایین‌ترین سطح ۴۰ سال اخیر رسیدند.\n#عراق #بحران_آب\n📰 منبع: Al-Monitor`, h:['عراق','بحران_آب'] },
  { u:18, t:`🏜️ طوفان ماسه تاریخی در خلیج فارس؛ ۶ کشور درگیر و پروازها لغو شد.\nدید افقی در دبی به ۵۰ متر رسید.\n#طوفان_ماسه #خلیج_فارس\n📰 منبع: Gulf News`, h:['طوفان_ماسه','خلیج_فارس'] },
  { u:19, t:`🌡️ بغداد رکورد گرما شکست: ۵۳.۲ درجه سانتیگراد در تابستان ۱۴۰۴.\nبرق‌رسانی به ۱۲ ساعت در روز کاهش یافت.\n#عراق #گرمای_زمین\n📰 منبع: Reuters`, h:['عراق','گرمای_زمین'] },
  { u:0, t:`🎬 فیلم «درخت گردو» ساخته مجید مجیدی جایزه بزرگ جشنواره کن را برد.\nاولین فیلم ایرانی با این موفقیت از ۱۹۹۷.\n#ایران #سینما #کن\n📰 منبع: Screen Daily`, h:['ایران','سینما','کن'] },
  { u:1, t:`⚽ منتخب عربستان برای اولین بار در تاریخ به نیمه‌نهایی جام جهانی رسید.\nپیروزی ۱-۰ برابر آرژانتین.\n#عربستان #فوتبال\n📰 منبع: Arab News`, h:['عربستان','فوتبال'] },
  { u:2, t:`🏛️ یونسکو پایتخت فرهنگی عرب ۲۰۲۶ را اعلام کرد: بغداد.\nسرمایه‌گذاری ۳۰۰ میلیون دلاری برای احیای میراث فرهنگی.\n#عراق #بغداد #فرهنگ\n📰 منبع: UNESCO`, h:['عراق','بغداد','فرهنگ'] },
  { u:3, t:`📚 ایران در رتبه‌بندی تولید علم به جایگاه ۱۵ جهان رسید.\n۴۲ هزار مقاله ISI در سال گذشته.\n#ایران #علم\n📰 منبع: Scopus`, h:['ایران','علم'] },
  { u:4, t:`🏙️ ریاض در فهرست ۱۰ شهر برتر جهان برای زندگی قرار گرفت.\nرشد سریع زیرساخت‌ها و کاهش هزینه زندگی.\n#عربستان #ریاض\n📰 منبع: Mercer`, h:['عربستان','ریاض'] },
  { u:5, t:`🛡️ اسرائیل و یونان پیمان دفاعی ۱۰ ساله امضا کردند.\nشامل تمرینات مشترک و فروش تسلیحات.\n#اسرائیل #دفاع\n📰 منبع: Haaretz`, h:['اسرائیل','دفاع'] },
  { u:6, t:`🚢 عملیات اروپایی «آسپیدس» در دریای سرخ؛ ناتو ۱۴ کشتی تجاری را اسکورت کرد.\nکاهش حملات حوثی به ۳۰٪.\n#دریای_سرخ #امنیت\n📰 منبع: Euractiv`, h:['دریای_سرخ','امنیت'] },
  { u:7, t:`🇹🇷 ترکیه سامانه پدافند هوایی بومی «سیپر» را آزمایش کرد.\nبرد ۲۵۰ کیلومتری و رهگیری هم‌زمان ۱۶ هدف.\n#ترکیه #صنایع_دفاعی\n📰 منبع: Savunma Sanayii`, h:['ترکیه','صنایع_دفاعی'] },
  { u:8, t:`🇮🇷 ایران از پهپاد شهید-۱۴۸ با برد ۳۰۰۰ کیلومتر رونمایی کرد.\nاولین نمایش عمومی در رزمایش «اقتدار آسمان».\n#ایران #پهپاد\n📰 منبع: Tasnim`, h:['ایران','پهپاد'] },
  { u:9, t:`🌐 مصر، اردن و عراق پیمان مشترک ضد تروریسم سایبری امضا کردند.\n#امنیت_سایبری #خاورمیانه\n📰 منبع: Al Arabiya`, h:['امنیت_سایبری','خاورمیانه'] },
  { u:10, t:`✈️ امارات جنگنده‌های F-35 را پس از رفع موانع دیپلماتیک تحویل گرفت.\n۵۰ فروند در ۳ مرحله تحویل داده می‌شود.\n#امارات #نظامی\n📰 منبع: Defense News`, h:['امارات','نظامی'] },
  { u:11, t:`💊 ایران واکسن بومی سرطان ریه را در فاز سوم آزمایش بالینی وارد کرد.\n۸۰۰ بیمار در ۱۲ مرکز درمانی.\n#ایران #پزشکی\n📰 منبع: Tehran Medical Journal`, h:['ایران','پزشکی'] },
  { u:12, t:`🏥 عربستان مرکز قلب ملک فیصل را با جدیدترین ربات‌های جراحی تجهیز کرد.\nاولین جراحی قلب تله‌روباتیک در منطقه.\n#عربستان #پزشکی\n📰 منبع: Saudi Health`, h:['عربستان','پزشکی'] },
  { u:13, t:`🦠 سازمان بهداشت جهانی هشدار داد: کشورهای خاورمیانه در برابر گرما-موج مرگبار آسیب‌پذیرند.\n#سلامت #WHO\n📰 منبع: WHO EMRO`, h:['سلامت','WHO'] },
  { u:14, t:`💉 اردن داروی ژنریک برای درمان هپاتیت C صادر می‌کند؛ قیمت ۹۵٪ ارزان‌تر از برند اصلی.\n#اردن #دارو\n📰 منبع: Jordan Times`, h:['اردن','دارو'] },
  { u:15, t:`🧬 مصر و کره جنوبی در پروژه نقشه‌برداری ژنوم عرب همکاری می‌کنند.\n۱۰۰ هزار نمونه ژنتیکی تا ۲۰۲۸.\n#مصر #ژنتیک\n📰 منبع: Nature`, h:['مصر','ژنتیک'] },
  { u:16, t:`🚄 عربستان خط آهن ریاض-جده (۱۱۰۰ کیلومتر) را به بهره‌برداری رساند.\nزمان سفر از ۱۲ ساعت به ۳.۵ ساعت کاهش یافت.\n#عربستان #ریل\n📰 منبع: Arab News`, h:['عربستان','ریل'] },
  { u:17, t:`🌉 کویت پل ۳۶ کیلومتری «جابر» را افتتاح کرد.\nبزرگ‌ترین پروژه زیرساختی تاریخ کشور.\n#کویت #زیرساخت\n📰 منبع: Kuwait Times`, h:['کویت','زیرساخت'] },
  { u:18, t:`🏗️ ایران کریدور شمال-جنوب (INSTC) را به بهره‌برداری رساند.\nاتصال روسیه به هند از طریق خاک ایران.\n#ایران #ترانزیت\n📰 منبع: Iran Daily`, h:['ایران','ترانزیت'] },
  { u:19, t:`🏙️ عمان پروژه «مصیره» را افتتاح کرد؛ شهر توریستی ساحلی با ۱ میلیون متر مربع امکانات.\n#عمان #توریسم\n📰 منبع: Times of Oman`, h:['عمان','توریسم'] },
  { u:0, t:`🛳️ بندر بهشهر ایران به بزرگ‌ترین پایانه کانتینری دریای خزر تبدیل شد.\nظرفیت ۱ میلیون TEU در سال.\n#ایران #بندر\n📰 منبع: IRNA`, h:['ایران','بندر'] },
  { u:1, t:`🤝 پیمان گازی بین ایران، ترکیه و آذربایجان؛ انتقال گاز ترکمنستان به اروپا.\n#ایران #ترکیه #گاز\n📰 منبع: Energy Intelligence`, h:['ایران','ترکیه','گاز'] },
  { u:2, t:`🇹🇷 ترکیه به عضویت اتحادیه گمرکی جدید اوراسیا درآمد.\nافزایش ۴۰ درصدی صادرات به بازارهای شرق.\n#ترکیه #تجارت\n📰 منبع: Daily Sabah`, h:['ترکیه','تجارت'] },
  { u:3, t:`🌍 اتحادیه عرب اعلامیه ۲۰۳۵ برای امنیت غذایی منطقه تصویب کرد.\nتأمین ۸۰٪ نیاز غذایی از منابع داخلی.\n#اتحادیه_عرب #امنیت_غذایی\n📰 منبع: Al-Ittihad`, h:['اتحادیه_عرب','امنیت_غذایی'] },
  { u:4, t:`🇵🇸 دادگاه بین‌المللی دادگستری رأی جدید درباره وضعیت سرزمین‌های اشغالی صادر کرد.\n#فلسطین #ICJ\n📰 منبع: Al Jazeera`, h:['فلسطین','ICJ'] },
  { u:5, t:`💰 صندوق سرمایه‌گذاری عمومی عربستان (PIF) ۱۵ میلیارد دلار در پاکستان سرمایه‌گذاری می‌کند.\n#عربستان #پاکستان\n📰 منبع: Khaleej Times`, h:['عربستان','پاکستان'] },
  { u:6, t:`🎓 بیش از ۵ میلیون دانشجو در دانشگاه‌های خاورمیانه در رشته‌های STEM ثبت‌نام کردند.\n#آموزش #STEM #خاورمیانه\n📰 منبع: Times Higher Education`, h:['آموزش','STEM'] },
  { u:7, t:`🚁 بحرین اولین شبکه تاکسی هوایی خاورمیانه را با ۱۲ خودروی پرنده الکتریکی راه‌اندازی کرد.\n#بحرین #eVTOL\n📰 منبع: Gulf Daily News`, h:['بحرین','eVTOL'] },
  { u:8, t:`🌐 منطقه آزاد دیجیتال دبی میزبان ۱۲,۰۰۰ شرکت فناوری از ۸۵ کشور شد.\n#دبی #فناوری\n📰 منبع: DIFC`, h:['دبی','فناوری'] },
  { u:9, t:`📡 ایران شبکه فیبر ملی ۱۰۰ گیگابیت به ۸۰٪ شهرهای بالای ۱۰۰ هزار نفر رساند.\n#ایران #اینترنت\n📰 منبع: IRNA`, h:['ایران','اینترنت'] },
  { u:10, t:`🏆 کویت شاخص شادی سازمان ملل را در منطقه خلیج فارس به دست آورد.\n#کویت #شادی\n📰 منبع: UN World Happiness Report`, h:['کویت','شادی'] },
];

// Follow pairs [follower_idx, followed_idx]
const FOLLOW_PAIRS = [
  [0,1],[0,2],[0,5],[0,10],[0,15],
  [1,0],[1,3],[1,6],[1,11],[1,16],
  [2,0],[2,4],[2,7],[2,12],[2,17],
  [3,1],[3,5],[3,8],[3,13],[3,18],
  [4,2],[4,6],[4,9],[4,14],[4,19],
  [5,0],[5,3],[5,7],[5,10],[5,15],
  [6,1],[6,4],[6,8],[6,11],[6,16],
  [7,2],[7,5],[7,9],[7,12],[7,17],
  [8,3],[8,6],[8,10],[8,13],[8,18],
  [9,4],[9,7],[9,11],[9,14],[9,19],
  [10,0],[10,5],[10,12],[10,15],[10,19],
  [11,1],[11,6],[11,13],[11,16],[11,0],
  [12,2],[12,7],[12,14],[12,17],[12,1],
  [13,3],[13,8],[13,15],[13,18],[13,2],
  [14,4],[14,9],[14,16],[14,19],[14,3],
];

const COMMENTS = [
  'خیلی مهم و جالبه 🙏','ممنون از اشتراک‌گذاری!','اطلاعات مفیدی بود',
  'این خبر مهمیه 🌍','خداروشکر پیشرفت داریم 💪','منم این خبر رو دیدم',
  'عالی بود 👍','نظرتون چیه؟','حق با شماست','تشکر از اطلاع‌رسانی',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    console.warn(`  ⚠ ${method} ${path} → ${res.status}`);
  }
  return { ok: res.ok || res.status === 409, status: res.status, data };
}

async function login(username) {
  const email = `${username}@kingwolf.demo`;
  const r = await api('POST', '/auth/signin', { email, password: 'demo1234' });
  if (r.ok && r.data.access_token) return r.data.access_token;
  return null;
}

async function getMe(token) {
  const r = await api('GET', '/auth/session', null, token);
  return r.data?.user?.id || null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌱  KingWolf Feed Seeder → ${API}\n`);

  // 1. Login
  console.log('📋 Logging in 20 demo users…');
  const tokens = [], ids = [];
  for (const u of USERS) {
    const token = await login(u);
    tokens.push(token);
    if (token) {
      const id = await getMe(token);
      ids.push(id);
      process.stdout.write('✓');
    } else {
      ids.push(null);
      process.stdout.write('✗');
    }
    await sleep(30);
  }
  console.log(`\n  ${tokens.filter(Boolean).length}/20 logged in\n`);

  // 2. Follows
  console.log('👥 Creating follow relationships…');
  let followOk = 0;
  for (const [a, b] of FOLLOW_PAIRS) {
    if (!tokens[a] || !ids[b]) continue;
    const r = await api('POST', `/social/follow/${ids[b]}`, null, tokens[a]);
    if (r.ok) followOk++;
    await sleep(25);
  }
  console.log(`  ✓ ${followOk} follows\n`);

  // 3. Posts
  console.log('📰 Creating 50 news posts…');
  const postIds = [];
  for (let i = 0; i < NEWS_POSTS.length; i++) {
    const p = NEWS_POSTS[i];
    const token = tokens[p.u];
    const authorId = ids[p.u];
    if (!token || !authorId) { postIds.push(null); process.stdout.write('✗'); continue; }

    const r = await api('POST', '/db/feed_posts/insert', {
      row: {
        author_id: authorId,
        content: p.t,
        hashtags: JSON.stringify(p.h),
        media_urls: '[]',
        media_types: '[]',
        visibility: 'public',
      }
    }, token);

    const postId = r.data?.data?.[0]?.id || null;
    postIds.push(postId);

    // Upsert hashtag stats
    if (postId) {
      for (const tag of p.h) {
        await api('POST', '/db/hashtag_stats/upsert', {
          row: { tag, use_count: 1, last_used_at: new Date().toISOString() },
          onConflict: 'tag',
        }, token).catch(() => {});
      }
    }

    process.stdout.write(postId ? '.' : 'e');
    await sleep(40);
  }
  const validPosts = postIds.filter(Boolean);
  console.log(`\n  ✓ ${validPosts.length}/50 posts created\n`);

  if (!validPosts.length) {
    console.log('⚠ No posts created — check if feed_posts table exists and users are approved.');
    return;
  }

  // 4. Likes & Bookmarks
  console.log('❤️  Adding likes and bookmarks…');
  let likeOk = 0, bookmarkOk = 0;
  for (let ui = 0; ui < USERS.length; ui++) {
    if (!tokens[ui]) continue;
    const shuffled = [...validPosts].sort(() => Math.random() - 0.5);
    for (const pid of shuffled.slice(0, 8)) {
      const r = await api('POST', `/social/like/${pid}`, null, tokens[ui]);
      if (r.ok) likeOk++;
      await sleep(15);
    }
    for (const pid of shuffled.slice(8, 11)) {
      const r = await api('POST', `/social/bookmark/${pid}`, null, tokens[ui]);
      if (r.ok) bookmarkOk++;
      await sleep(15);
    }
  }
  console.log(`  ✓ ${likeOk} likes, ${bookmarkOk} bookmarks\n`);

  // 5. Comments
  console.log('💬 Adding comments…');
  let commentOk = 0;
  for (let ui = 0; ui < Math.min(12, USERS.length); ui++) {
    if (!tokens[ui] || !ids[ui]) continue;
    const pid = validPosts[ui * 3 % validPosts.length];
    if (!pid) continue;
    const r = await api('POST', '/db/post_comments/insert', {
      row: { post_id: pid, author_id: ids[ui], content: COMMENTS[ui % COMMENTS.length] }
    }, tokens[ui]);
    if (r.ok) commentOk++;
    await sleep(25);
  }
  console.log(`  ✓ ${commentOk} comments\n`);

  console.log('🎉  Done! Refresh the Feed to see demo content.\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

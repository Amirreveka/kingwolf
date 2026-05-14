// Seed 30 demo posts with real downloaded images
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import db after setup
const { db } = await import('./db.js');

const users = db.prepare("SELECT id, username FROM profiles WHERE username != 'admin'").all();
const uid = () => users[Math.floor(Math.random() * users.length)];

function genId() {
  return crypto.randomBytes(12).toString('base64url');
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (e) => { fs.unlinkSync(dest); reject(e); });
  });
}

const MEDIA_DIR = path.join(__dirname, 'uploads', 'media');

const posts = [
  {
    content: '🔴 گزارش ویژه: وضعیت امنیتی در منطقه خاورمیانه همچنان در حال تغییر است. تحلیلگران بین‌المللی از تشدید تنش‌ها در مرزهای شمالی خبر می‌دهند.',
    hashtags: ['خاورمیانه', 'امنیت', 'اخبار'],
    seed: 'war1', width: 800, height: 500,
  },
  {
    content: '📰 خبرگزاری‌های جهانی: توافق آتش‌بس احتمالی در حال مذاکره است. نمایندگان کشورهای ذینفع در ژنو گرد هم آمده‌اند تا راه‌حلی دیپلماتیک بیابند.',
    hashtags: ['صلح', 'دیپلماسی', 'ژنو'],
    seed: 'peace2', width: 800, height: 500,
  },
  {
    content: '💥 انفجار در بندر بیروت: مقامات لبنانی ابراز نگرانی کردند. تیم‌های امداد و نجات به محل حادثه اعزام شدند.',
    hashtags: ['لبنان', 'بیروت', 'فوری'],
    seed: 'beirut3', width: 900, height: 500,
  },
  {
    content: '🌍 کنفرانس اقلیم خاورمیانه در دوبی: رهبران منطقه‌ای درباره چالش‌های محیط زیستی بحث کردند. کمبود آب بزرگ‌ترین تهدید است.',
    hashtags: ['اقلیم', 'دوبی', 'محیطزیست'],
    seed: 'dubai4', width: 800, height: 450,
  },
  {
    content: '⚔️ ارتش سوریه: عملیات جدید در استان ادلب آغاز شد. گزارش‌ها از آوارگی هزاران نفر حکایت دارند.',
    hashtags: ['سوریه', 'ادلب', 'جنگ'],
    seed: 'syria5', width: 800, height: 500,
  },
  {
    content: '🛢️ قیمت نفت برنت به ۸۵ دلار رسید. تحلیلگران اوپک معتقدند عرضه در ماه آینده کاهش خواهد یافت.',
    hashtags: ['نفت', 'اوپک', 'اقتصاد'],
    seed: 'oil6', width: 800, height: 500,
  },
  {
    content: '🚀 یمن: حملات موشکی گروه انصارالله به زیرساخت‌های انرژی ادامه دارد. مجامع بین‌المللی خواستار توقف درگیری‌ها شدند.',
    hashtags: ['یمن', 'حوثی', 'خاورمیانه'],
    seed: 'yemen7', width: 850, height: 500,
  },
  {
    content: '🏥 سازمان بهداشت جهانی: وضعیت بهداشتی در غزه بحرانی است. بیمارستان‌ها با کمبود شدید دارو و تجهیزات مواجه‌اند.',
    hashtags: ['غزه', 'WHO', 'بحران'],
    seed: 'gaza8', width: 800, height: 500,
  },
  {
    content: '🏛️ پارلمان عراق: قانون جدید سرمایه‌گذاری خارجی تصویب شد. وزیر اقتصاد از جذب ۵ میلیارد دلار سرمایه طی دو سال خبر داد.',
    hashtags: ['عراق', 'اقتصاد', 'سرمایهگذاری'],
    seed: 'iraq9', width: 800, height: 500,
  },
  {
    content: '🌊 سیل در ترکیه: بارندگی‌های شدید باعث جاری شدن سیل در ۷ استان شد. دولت وضعیت اضطراری اعلام کرد.',
    hashtags: ['ترکیه', 'سیل', 'اضطراری'],
    seed: 'flood10', width: 800, height: 500,
  },
  {
    content: '📡 اسرائیل تأیید کرد: حملات هوایی به مواضع حزب‌الله در جنوب لبنان ادامه دارد. آژانس بین‌المللی اتمی خواستار مذاکره شد.',
    hashtags: ['اسرائیل', 'حزبالله', 'لبنان'],
    seed: 'israel11', width: 800, height: 500,
  },
  {
    content: '🏗️ ابوظبی: پروژه شهر هوشمند ۵۰ میلیارد دلاری رسماً کلنگ‌زنی شد. این پروژه تا ۲۰۳۵ تکمیل خواهد شد.',
    hashtags: ['امارات', 'ابوظبی', 'فناوری'],
    seed: 'abudhabi12', width: 800, height: 500,
  },
  {
    content: '🗺️ تغییرات مرزی در اقلیم کردستان عراق: توافق جدید بین اربیل و بغداد درباره توزیع درآمد نفتی امضا شد.',
    hashtags: ['کردستان', 'عراق', 'سیاست'],
    seed: 'kurdish13', width: 800, height: 500,
  },
  {
    content: '🔫 درگیری در صحرای سینا: ارتش مصر عملیات ضدتروریستی موفقی انجام داد. ۳۵ تروریست کشته شدند.',
    hashtags: ['مصر', 'سینا', 'امنیت'],
    seed: 'egypt14', width: 800, height: 500,
  },
  {
    content: '✈️ ایران و عربستان: خطوط هوایی مستقیم بین تهران و ریاض راه‌اندازی شد. این اقدام نمادی از بهبود روابط دو کشور است.',
    hashtags: ['ایران', 'عربستان', 'روابط'],
    seed: 'iran-saudi15', width: 800, height: 500,
  },
  {
    content: '🌴 جشنواره بین‌المللی فیلم در قاهره: کارگردانان خاورمیانه‌ای جوایز برتر را در اختیار گرفتند. سینمای عربی در اوج است.',
    hashtags: ['قاهره', 'فیلم', 'هنر'],
    seed: 'cairo16', width: 800, height: 500,
  },
  {
    content: '⚡ قطع گسترده برق در پاکستان: بیش از ۱۸۰ میلیون نفر تحت تأثیر قرار گرفتند. مقامات از خرابی فنی در شبکه ملی خبر دادند.',
    hashtags: ['پاکستان', 'برق', 'بحران'],
    seed: 'pakistan17', width: 800, height: 500,
  },
  {
    content: '🛡️ ناتو: تمرینات نظامی بزرگ در دریای مدیترانه آغاز شد. ۲۰ کشور با بیش از ۴۰ کشتی جنگی شرکت کردند.',
    hashtags: ['ناتو', 'مدیترانه', 'نظامی'],
    seed: 'nato18', width: 800, height: 500,
  },
  {
    content: '🌾 خشکسالی در سوریه و عراق: رودخانه دجله و فرات به پایین‌ترین سطح تاریخی رسیدند. بحران غذایی در راه است.',
    hashtags: ['خشکسالی', 'دجله', 'فرات'],
    seed: 'drought19', width: 800, height: 500,
  },
  {
    content: '🏦 بانک مرکزی ترکیه نرخ بهره را ۳ درصد کاهش داد. لیر ترکیه در برابر دلار ۲ درصد تقویت شد.',
    hashtags: ['ترکیه', 'اقتصاد', 'لیر'],
    seed: 'turkey-econ20', width: 800, height: 500,
  },
  {
    content: '🕌 مکه مکرمه: ثبت رکورد جدید حجاج در سال جاری. بیش از ۳.۵ میلیون نفر از سراسر جهان در مراسم حج شرکت کردند.',
    hashtags: ['مکه', 'حج', 'اسلام'],
    seed: 'mecca21', width: 800, height: 500,
  },
  {
    content: '🚢 دریای سرخ: ناامنی در کانال‌های دریایی کالاهای اساسی را گران کرد. شرکت‌های کشتیرانی مسیرهای جایگزین انتخاب کردند.',
    hashtags: ['دریای‌سرخ', 'تجارت', 'امنیت'],
    seed: 'redsea22', width: 800, height: 500,
  },
  {
    content: '💻 کنسرسیوم فناوری خلیج فارس: عربستان، امارات و قطر صندوق مشترک ۲۵ میلیارد دلاری برای هوش مصنوعی تأسیس کردند.',
    hashtags: ['هوشمصنوعی', 'خلیجفارس', 'فناوری'],
    seed: 'ai-gulf23', width: 800, height: 500,
  },
  {
    content: '🌡️ موج گرمایی بی‌سابقه: دمای هوا در کویت به ۵۴ درجه سانتی‌گراد رسید. هشدار بهداشتی برای تمام کشورهای منطقه صادر شد.',
    hashtags: ['گرما', 'کویت', 'بحران'],
    seed: 'heatwave24', width: 800, height: 500,
  },
  {
    content: '🗳️ انتخابات اردن: ملک عبدالله نخست‌وزیر جدید را انتصاب کرد. دولت جدید با چالش اصلاحات اقتصادی روبرو است.',
    hashtags: ['اردن', 'سیاست', 'انتخابات'],
    seed: 'jordan25', width: 800, height: 500,
  },
  {
    content: '🚁 افغانستان: طالبان آموزش دختران بالای ۱۲ سال را در ۵ استان ممنوع کرد. سازمان ملل واکنش تندی نشان داد.',
    hashtags: ['افغانستان', 'طالبان', 'حقوق'],
    seed: 'afghanistan26', width: 800, height: 500,
  },
  {
    content: '🔬 دانشگاه پزشکی قاهره: محققان مصری واکسن جدیدی علیه مالاریا آزمایش کردند. نتایج اولیه امیدوارکننده است.',
    hashtags: ['مصر', 'پزشکی', 'واکسن'],
    seed: 'medresearch27', width: 800, height: 500,
  },
  {
    content: '⚽ جام ملت‌های آسیا: تیم‌های عربستان، ایران و ژاپن به مرحله نیمه نهایی راه یافتند. جو استادیوم‌ها پرشور است.',
    hashtags: ['فوتبال', 'آسیا', 'ورزش'],
    seed: 'football28', width: 800, height: 500,
  },
  {
    content: '🔋 عربستان: آرامکو اولین نیروگاه خورشیدی ۵ گیگاواتی را افتتاح کرد. این بزرگ‌ترین نیروگاه خورشیدی خاورمیانه است.',
    hashtags: ['عربستان', 'انرژی', 'خورشیدی'],
    seed: 'solar29', width: 800, height: 500,
  },
  {
    content: '📢 سازمان ملل متحد: گزارش سالانه درباره بحران آوارگان خاورمیانه منتشر شد. بیش از ۱۳ میلیون نفر آواره هستند.',
    hashtags: ['آوارگان', 'سازمانملل', 'بحران'],
    seed: 'refugees30', width: 800, height: 500,
  },
];

console.log('Starting to download images and create posts...');

const insertPost = db.prepare(`
  INSERT INTO feed_posts (id, author_id, content, media_urls, media_types, hashtags, likes_count, reposts_count, comments_count, views_count, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let created = 0;
for (let i = 0; i < posts.length; i++) {
  const p = posts[i];
  const author = uid();
  const postId = genId();
  const filename = `news_${p.seed}_${Date.now()}.jpg`;
  const destPath = path.join(MEDIA_DIR, filename);

  // Use picsum with a seed for deterministic images
  const imageUrl = `https://picsum.photos/seed/${p.seed}/${p.width}/${p.height}`;

  try {
    process.stdout.write(`[${i + 1}/30] Downloading ${imageUrl} ...`);
    await downloadImage(imageUrl, destPath);
    console.log(' ✓');

    const mediaUrl = `/uploads/media/${filename}`;
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const createdAt = new Date(Date.now() - (daysAgo * 86400 + hoursAgo * 3600) * 1000).toISOString().replace('T', ' ').slice(0, 19);

    insertPost.run(
      postId,
      author.id,
      p.content,
      JSON.stringify([mediaUrl]),
      JSON.stringify(['image']),
      JSON.stringify(p.hashtags),
      Math.floor(Math.random() * 250) + 10,
      Math.floor(Math.random() * 80),
      Math.floor(Math.random() * 50),
      Math.floor(Math.random() * 2000) + 100,
      createdAt
    );
    created++;
  } catch (e) {
    console.log(` ✗ (${e.message}) — creating without image`);
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    insertPost.run(
      postId, author.id, p.content,
      JSON.stringify([]), JSON.stringify([]),
      JSON.stringify(p.hashtags),
      Math.floor(Math.random() * 150) + 10,
      Math.floor(Math.random() * 50),
      Math.floor(Math.random() * 30),
      Math.floor(Math.random() * 1500) + 100,
      createdAt
    );
    created++;
  }
}

const total = db.prepare('SELECT COUNT(*) as n FROM feed_posts WHERE is_deleted = 0').get();
console.log(`\n✅ Created ${created} posts. Total feed posts: ${total.n}`);
process.exit(0);

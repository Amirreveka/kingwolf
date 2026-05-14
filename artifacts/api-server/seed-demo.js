// Seed demo content: feed posts, likes, comments, follows, reports, notifications
// Runs only if there are no feed_posts yet (idempotent — safe to re-run).
import { db } from './db.js';
import { nanoid } from 'nanoid';

const existing = db.prepare('SELECT COUNT(*) AS n FROM feed_posts').get().n;
if (existing > 0) {
  console.log(`feed_posts already has ${existing} rows — skip seed`);
  process.exit(0);
}

// Get real users
const users = db.prepare('SELECT id, username, display_name FROM profiles ORDER BY created_at LIMIT 30').all();
if (users.length < 2) {
  console.log('not enough users to seed — skip');
  process.exit(0);
}
console.log(`seeding for ${users.length} users…`);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = Date.now();

// ===== Feed posts =====
const sampleContents = [
  { text: '🐺 امروز اولین روزم با KingWolf بود! خیلی روان کار می‌کنه #اولین_تجربه', tags: ['اولین_تجربه'] },
  { text: 'یه پیام رسان امن داخلی، چی بهتر از این؟ خوبه که خودمون چیزی داریم 🇮🇷', tags: [] },
  { text: 'سرعت ارسال پیام واقعا خوبه. کاش وقتی نت بد میشه هم همینطور باشه 😅 #تست', tags: ['تست'] },
  { text: 'کانال‌ها بی‌نظیرن! بالاخره یه پلتفرم که هم گروه داره هم کانال هم فید', tags: [] },
  { text: '📚 امروز یه کتاب جالب خوندم: «طراحی نرم‌افزار سبک». پیشنهاد می‌کنم!', tags: ['کتاب'] },
  { text: 'فید این اپ خیلی شبیه توییتر شده. لایکش کنید اگه خوشتون اومد 👍', tags: [] },
  { text: 'هوای امروز عالیه ☀️ کسی برای پیاده‌روی پایه‌ست؟', tags: ['طبیعت'] },
  { text: 'یه سوال: کی فکر می‌کنه پیام‌رسان‌های امن آینده ارتباطات هستن؟ #امنیت', tags: ['امنیت'] },
  { text: 'دارک مود این اپ فوق العادست. چشمم رو نمی‌زنه. کیا با دارک مود حال می‌کنن؟', tags: [] },
  { text: 'پروفایلم رو آپدیت کردم! بیاید سر بزنید 😎', tags: [] },
  { text: '🍵 الان یه چایی داغ و یه پنجره بازش، چی از این بهتر؟', tags: ['آرامش'] },
  { text: 'کدنویسی شب بهتره یا روز؟ من شخصاً شب رو ترجیح میدم #برنامه_نویسی', tags: ['برنامه_نویسی'] },
  { text: 'ساخت پیام رسان مستقل کار سخته ولی شدنیه. این پروژه گواه این موضوعه 💪', tags: [] },
  { text: 'یه قابلیت جدید پیشنهاد می‌کنم: ایموجی واکنش زیر پیام‌ها! کی موافقه؟ ❤️🔥', tags: [] },
  { text: '🌙 شب همگی بخیر. فردا روز جدیدی است.', tags: [] },
  { text: 'بهترین موسیقی برای کدنویسی چیه؟ من lo-fi گوش می‌دم 🎶', tags: ['موسیقی'] },
  { text: 'گاهی فکر می‌کنم بهترین ارتباط، ارتباط حضوریه. ولی پیام‌رسان‌ها هم کمک می‌کنن وقتی نمی‌شه دید', tags: [] },
  { text: '📱 PWA چیز جالبیه. اپ تحت وب که مثل اپ نصب می‌شه، بدون نیاز به استور!', tags: ['تکنولوژی'] },
  { text: 'کاش یه روز همه‌ی پیام رسان‌ها رایگان و امن باشن. این هدف بزرگیه', tags: [] },
  { text: '🎉 یک سال از شروع این پروژه گذشت! ممنون از همگی که حمایت کردین', tags: ['تولد'] },
  { text: 'تنبلی یا استراحت؟ مرز این دو خیلی باریکه!', tags: [] },
  { text: 'پلوماهیچه خوردید؟ نظرتون چیه؟ 🍽️ #غذا', tags: ['غذا'] },
  { text: 'هوش مصنوعی داره دنیا رو عوض می‌کنه. خوب یا بد؟', tags: ['هوش_مصنوعی'] },
  { text: '💡 ایده: یه روزی همه پیام‌رسان‌ها به هم متصل باشن مثل ایمیل!', tags: [] },
  { text: 'صبح بخیر دوستان ☀️ امروز قراره عالی باشه!', tags: [] },
];

const insertPost = db.prepare(`
  INSERT INTO feed_posts (id, author_id, content, hashtags, mentions, media_urls, media_types, visibility, likes_count, comments_count, bookmarks_count, views_count, created_at, updated_at)
  VALUES (?, ?, ?, ?, '[]', '[]', '[]', 'public', ?, ?, ?, ?, ?, ?)
`);

const postIds = [];
sampleContents.forEach((p, i) => {
  const id = nanoid();
  postIds.push(id);
  const author = pick(users);
  // Spread over last 7 days
  const ts = new Date(now - Math.random() * 7 * 86400000).toISOString();
  const likesCount = Math.floor(Math.random() * 30);
  const commentsCount = Math.floor(Math.random() * 8);
  const viewsCount = 50 + Math.floor(Math.random() * 500);
  insertPost.run(id, author.id, p.text, JSON.stringify(p.tags), likesCount, commentsCount, 0, viewsCount, ts, ts);
});
console.log(`  ✓ ${postIds.length} feed posts created`);

// ===== Likes =====
const insLike = db.prepare('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)');
let likeCount = 0;
for (const postId of postIds) {
  // Random 3-15 users like each post
  const n = 3 + Math.floor(Math.random() * 13);
  const shuffled = [...users].sort(() => Math.random() - 0.5).slice(0, n);
  for (const u of shuffled) {
    insLike.run(u.id, postId);
    likeCount++;
  }
}
console.log(`  ✓ ${likeCount} likes added`);

// ===== Bookmarks =====
const insBm = db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)');
let bmCount = 0;
for (const u of users.slice(0, 10)) {
  const sel = postIds.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const pid of sel) { insBm.run(u.id, pid); bmCount++; }
}
console.log(`  ✓ ${bmCount} bookmarks added`);

// ===== Comments =====
const sampleComments = [
  'موافقم! 👍',
  'فوق‌العاده بود',
  'دقیقاً همین‌طوره',
  'تجربه‌ام رو بهتر کرد',
  'لطفاً بیشتر توضیح بده',
  '😂 خیلی خنده‌دار بود',
  'آره منم همین فکر رو می‌کنم',
  'سوال خوبیه!',
  '👏👏👏',
  'پشتیبانی می‌کنم',
];
const insComment = db.prepare('INSERT INTO post_comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)');
let commentCount = 0;
for (const postId of postIds.slice(0, 15)) {
  const n = 1 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const author = pick(users);
    const ts = new Date(now - Math.random() * 6 * 86400000).toISOString();
    insComment.run(nanoid(), postId, author.id, pick(sampleComments), ts);
    commentCount++;
  }
}
console.log(`  ✓ ${commentCount} comments added`);

// ===== Follows =====
const insFollow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)');
let followCount = 0;
for (const u of users) {
  const others = users.filter(x => x.id !== u.id).sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 5));
  for (const o of others) { insFollow.run(u.id, o.id); followCount++; }
}
console.log(`  ✓ ${followCount} follow relationships`);

// ===== Sample notifications for admin user =====
const admin = db.prepare("SELECT id FROM profiles WHERE username='admin'").get();
if (admin) {
  const insNotif = db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const types = ['follow', 'like', 'comment', 'mention'];
  for (let i = 0; i < 8; i++) {
    const actor = pick(users.filter(u => u.id !== admin.id));
    const type = pick(types);
    const ts = new Date(now - Math.random() * 3 * 86400000).toISOString();
    insNotif.run(nanoid(), admin.id, type, actor.id, pick(postIds), 'post', '', ts);
  }
  console.log(`  ✓ 8 notifications for admin`);
}

// ===== Sample reports =====
const insReport = db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const reasons = ['اسپم', 'محتوای نامناسب', 'توهین', 'تخلف از قوانین'];
for (let i = 0; i < 5; i++) {
  const reporter = pick(users.filter(u => u.username !== 'admin'));
  const target = pick(postIds);
  insReport.run(
    nanoid(), reporter.id, 'post', target, pick(reasons),
    'این پست به نظر مشکل دار است',
    i < 3 ? 'pending' : 'resolved',
    new Date(now - Math.random() * 5 * 86400000).toISOString()
  );
}
console.log(`  ✓ 5 sample reports`);

// ===== Hashtag stats =====
const allTags = sampleContents.flatMap(p => p.tags);
const tagCounts = {};
allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 + Math.floor(Math.random() * 20); });
const insTag = db.prepare('INSERT OR REPLACE INTO hashtag_stats (tag, use_count) VALUES (?, ?)');
for (const [tag, count] of Object.entries(tagCounts)) insTag.run(tag, count);
console.log(`  ✓ ${Object.keys(tagCounts).length} hashtag stats`);

console.log('\n✅ demo seed complete!\n');
process.exit(0);

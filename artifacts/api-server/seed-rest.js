// Fill in missing seed pieces (likes, comments, follows, etc.) when posts already exist
import { db } from './db.js';
import { nanoid } from 'nanoid';

const users = db.prepare('SELECT id, username FROM profiles ORDER BY created_at LIMIT 30').all();
const postIds = db.prepare('SELECT id FROM feed_posts').all().map(r => r.id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = Date.now();

// Bookmarks
if (db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get().n === 0) {
  const insBm = db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)');
  let n = 0;
  for (const u of users.slice(0, 10)) {
    const sel = [...postIds].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const pid of sel) { insBm.run(u.id, pid); n++; }
  }
  console.log(`✓ ${n} bookmarks`);
}

// Comments
if (db.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n === 0) {
  const samples = ['موافقم 👍', 'فوق‌العاده', 'دقیقاً!', '😂', '👏👏👏', 'پشتیبانی می‌کنم', 'سوال خوبیه', 'منم همینطور'];
  const ins = db.prepare('INSERT INTO post_comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)');
  let n = 0;
  for (const pid of postIds.slice(0, 15)) {
    const k = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) {
      ins.run(nanoid(), pid, pick(users).id, pick(samples), new Date(now - Math.random() * 6 * 86400000).toISOString());
      n++;
    }
  }
  console.log(`✓ ${n} comments`);
}

// Follows
if (db.prepare('SELECT COUNT(*) AS n FROM follows').get().n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)');
  let n = 0;
  for (const u of users) {
    const others = users.filter(x => x.id !== u.id).sort(() => Math.random() - 0.5).slice(0, 4 + Math.floor(Math.random() * 4));
    for (const o of others) { ins.run(u.id, o.id); n++; }
  }
  console.log(`✓ ${n} follows`);
}

// Notifications for admin
const admin = db.prepare("SELECT id FROM profiles WHERE username='admin'").get();
if (admin && db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=?').get(admin.id).n === 0) {
  const ins = db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const types = ['follow', 'like', 'comment', 'mention'];
  for (let i = 0; i < 8; i++) {
    const actor = pick(users.filter(u => u.id !== admin.id));
    ins.run(nanoid(), admin.id, pick(types), actor.id, pick(postIds), 'post', new Date(now - Math.random() * 3 * 86400000).toISOString());
  }
  console.log(`✓ 8 notifications for admin`);
}

// Reports
if (db.prepare('SELECT COUNT(*) AS n FROM reports').get().n === 0) {
  const reasons = ['اسپم', 'محتوای نامناسب', 'توهین', 'تخلف از قوانین'];
  const ins = db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 5; i++) {
    const reporter = pick(users.filter(u => u.username !== 'admin'));
    ins.run(nanoid(), reporter.id, 'post', pick(postIds), pick(reasons), 'این پست به نظر مشکل‌داره', i < 3 ? 'pending' : 'resolved', new Date(now - Math.random() * 5 * 86400000).toISOString());
  }
  console.log(`✓ 5 reports`);
}

// Hashtag stats
if (db.prepare('SELECT COUNT(*) AS n FROM hashtag_stats').get().n === 0) {
  const ins = db.prepare('INSERT OR REPLACE INTO hashtag_stats (tag, use_count) VALUES (?, ?)');
  const tags = ['تست', 'امنیت', 'برنامه_نویسی', 'تکنولوژی', 'موسیقی', 'غذا', 'هوش_مصنوعی', 'کتاب', 'طبیعت', 'آرامش'];
  for (const t of tags) ins.run(t, 5 + Math.floor(Math.random() * 30));
  console.log(`✓ ${tags.length} hashtag stats`);
}

console.log('\n✅ done');
process.exit(0);

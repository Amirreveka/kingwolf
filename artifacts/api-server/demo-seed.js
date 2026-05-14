// Demo data seeder. Run with: KW_SEED_DEMO=true (or via /admin/seed-demo endpoint).
// Idempotent: skips users that already exist. Does NOT touch existing users.
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const DEMO_USERS = [
  { username: 'parisa_a',  display: 'پریسا احمدی',   bio: 'عاشق فناوری و کتاب 📚' },
  { username: 'reza_k',    display: 'رضا کریمی',     bio: 'توسعه‌دهنده وب' },
  { username: 'sara_m',    display: 'سارا محمدی',    bio: 'طراح گرافیک' },
  { username: 'ali_dev',   display: 'علی توسعه‌دهنده', bio: 'برنامه‌نویس JS' },
  { username: 'maryam_k',  display: 'مریم کریمی',    bio: 'علاقه‌مند به سفر' },
  { username: 'amir_n',    display: 'امیر نوری',     bio: 'طرفدار فیلم و سریال 🎬' },
  { username: 'nasrin_t',  display: 'نسرین توکلی',   bio: 'معلم زبان' },
  { username: 'mohsen_b',  display: 'محسن باقری',    bio: 'عاشق طبیعت 🌲' },
];

const DEMO_PASSWORD = 'demo1234';

const DEMO_POSTS_CONTENT = [
  { user: 'parisa_a', text: 'سلام به همه! اولین پست من تو KingWolf 👋 #سلام', likes: 12 },
  { user: 'reza_k',   text: 'امروز یه ویژگی جدید کشف کردم تو ری‌اکت! خیلی جالبه 🚀 #react #برنامه‌نویسی', likes: 28 },
  { user: 'sara_m',   text: 'طراحی رابط کاربری خوب باید ساده و کارا باشه. #طراحی #UX', likes: 45 },
  { user: 'ali_dev',  text: 'هرکی دنبال پروژه‌ی متن‌باز خوب می‌گرده پیام بده. #اوپن‌سورس', likes: 8 },
  { user: 'maryam_k', text: 'تازه از سفر شمال برگشتم. هواش عالی بود 🌊 #طبیعت', likes: 67 },
  { user: 'amir_n',   text: 'پیشنهاد فیلم برای آخر هفته؟ من Inception دوست داشتم. #فیلم', likes: 23 },
  { user: 'nasrin_t', text: 'یادگیری زبان نیاز به صبر داره. هر روز ۱۵ دقیقه. #یادگیری', likes: 34 },
  { user: 'mohsen_b', text: 'صبح‌بخیر! امیدوارم روز خوبی داشته باشید 🌞', likes: 56 },
  { user: 'parisa_a', text: 'یه کتاب جدید شروع کردم: "نیمه تاریک وجود". کسی خونده؟ #کتاب', likes: 19 },
  { user: 'reza_k',   text: 'تایپ‌اسکریپت بهترین چیزیه که برای پروژه‌های بزرگ اختراع شده. #typescript', likes: 41 },
];

const DEMO_MESSAGES = [
  { from: 'parisa_a', to: 'reza_k', text: 'سلام رضا، چطوری؟' },
  { from: 'reza_k', to: 'parisa_a', text: 'سلام پریسا! خوبم تو چطوری؟' },
  { from: 'parisa_a', to: 'reza_k', text: 'منم خوبم. اون پروژه‌ای که حرفش بود چی شد؟' },
  { from: 'reza_k', to: 'parisa_a', text: 'دارم روش کار می‌کنم، تا آخر هفته یه نسخه میدم ببینی 👌' },
  { from: 'sara_m', to: 'ali_dev', text: 'علی! یه سوال طراحی داشتم ازت' },
  { from: 'ali_dev', to: 'sara_m', text: 'سلام، بفرما' },
  { from: 'maryam_k', to: 'amir_n', text: 'امیر، اون فیلمو دیدی؟' },
  { from: 'amir_n', to: 'maryam_k', text: 'آره! عالی بود. ممنون که پیشنهاد دادی' },
];

export async function seedDemo(db) {
  console.log('\n📦 Seeding demo data...');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const idByUsername = {};

  // 1) Existing real users keep their IDs
  const existingProfiles = db.prepare('SELECT id, username FROM profiles').all();
  for (const p of existingProfiles) idByUsername[p.username] = p.id;

  // 2) Create demo users (skip if exists)
  let createdUsers = 0;
  for (const u of DEMO_USERS) {
    if (idByUsername[u.username]) continue;
    const id = nanoid();
    const email = `${u.username}@kingwolf.internal`;
    try {
      db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email, hash);
      db.prepare(`
        INSERT INTO profiles (id, username, email, display_name, bio, is_approved, is_active, is_admin)
        VALUES (?, ?, ?, ?, ?, 1, 1, 0)
      `).run(id, u.username, email, u.display, u.bio);
      idByUsername[u.username] = id;
      createdUsers++;
    } catch (_) { /* already exists */ }
  }
  console.log(`   ✓ ${createdUsers} demo users created (password: ${DEMO_PASSWORD})`);

  // 3) Add demo users to default group + channel if they exist
  const defaults = db.prepare(`SELECT id FROM conversations WHERE type IN ('group','channel') AND name LIKE 'KingWolf%'`).all();
  let memberAdds = 0;
  for (const conv of defaults) {
    for (const uname of DEMO_USERS.map(u => u.username)) {
      const uid = idByUsername[uname];
      if (!uid) continue;
      try {
        db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conv.id, uid);
        memberAdds++;
      } catch (_) {}
    }
  }
  console.log(`   ✓ ${memberAdds} memberships added to default group/channel`);

  // 4) Demo feed posts (only if posts table is mostly empty)
  const postCount = db.prepare('SELECT COUNT(*) AS n FROM feed_posts').get().n;
  if (postCount < 5) {
    let postsCreated = 0;
    for (const p of DEMO_POSTS_CONTENT) {
      const aid = idByUsername[p.user];
      if (!aid) continue;
      const pid = nanoid();
      const hashtags = JSON.stringify(Array.from(new Set((p.text.match(/#([\u0600-\u06FFA-Za-z0-9_]+)/g) || []).map(h => h.slice(1)))));
      try {
        db.prepare(`
          INSERT INTO feed_posts (id, author_id, content, hashtags, mentions, media_urls, media_types, likes_count, visibility, created_at)
          VALUES (?, ?, ?, ?, '[]', '[]', '[]', ?, 'public', datetime('now', '-' || (? * 30) || ' minutes'))
        `).run(pid, aid, p.text, hashtags, p.likes, postsCreated);
        postsCreated++;
      } catch (_) {}
    }
    console.log(`   ✓ ${postsCreated} demo posts created`);
  } else {
    console.log(`   ✓ skipped posts (already ${postCount} posts in DB)`);
  }

  // 5) Demo direct messages
  const msgCount = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  if (msgCount < 3) {
    let msgsCreated = 0;
    const pairs = new Map(); // 'a-b' -> conversation_id
    for (const m of DEMO_MESSAGES) {
      const a = idByUsername[m.from];
      const b = idByUsername[m.to];
      if (!a || !b) continue;
      const key = [a, b].sort().join('-');
      let convId = pairs.get(key);
      if (!convId) {
        // Try to find existing direct conversation between these two
        const existing = db.prepare(`
          SELECT c.id FROM conversations c
          JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
          JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
          WHERE c.type = 'direct' AND c.name != '__saved__'
          LIMIT 1
        `).get(a, b);
        if (existing) {
          convId = existing.id;
        } else {
          convId = nanoid();
          db.prepare(`INSERT INTO conversations (id, type, name, created_by) VALUES (?, 'direct', '', ?)`).run(convId, a);
          db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)`).run(convId, a);
          db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)`).run(convId, b);
        }
        pairs.set(key, convId);
      }
      const msgId = nanoid();
      try {
        db.prepare(`INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, 'text')`).run(msgId, convId, a, m.text);
        msgsCreated++;
      } catch (_) {}
    }
    console.log(`   ✓ ${msgsCreated} demo messages across ${pairs.size} conversations`);
  } else {
    console.log(`   ✓ skipped messages (already ${msgCount} messages in DB)`);
  }

  // 6) Demo notifications for admin + a couple users
  const notifCount = db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
  if (notifCount < 3) {
    const admin = db.prepare('SELECT id FROM profiles WHERE is_admin=1 LIMIT 1').get();
    if (admin) {
      const fromUser = idByUsername['parisa_a'];
      if (fromUser) {
        db.prepare(`INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?, ?, 'follow', ?, ?, 'profile')`)
          .run(nanoid(), admin.id, fromUser, fromUser);
      }
      const fromUser2 = idByUsername['reza_k'];
      if (fromUser2) {
        db.prepare(`INSERT INTO notifications (id, user_id, type, actor_id, target_id, target_type) VALUES (?, ?, 'message', ?, ?, 'message')`)
          .run(nanoid(), admin.id, fromUser2, fromUser2);
      }
      console.log('   ✓ demo notifications created');
    }
  }

  // 7) Demo reports
  const repCount = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
  if (repCount === 0) {
    const reporter = idByUsername['parisa_a'];
    const target = idByUsername['ali_dev'];
    if (reporter && target) {
      db.prepare(`INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details) VALUES (?, ?, 'user', ?, 'spam', 'این کاربر پیام‌های اسپم می‌فرستد')`)
        .run(nanoid(), reporter, target);
      console.log('   ✓ demo report created (for testing admin reports panel)');
    }
  }

  // 8) Demo follows
  const followCount = db.prepare('SELECT COUNT(*) AS n FROM follows').get().n;
  if (followCount < 3) {
    const admin = db.prepare('SELECT id FROM profiles WHERE is_admin=1 LIMIT 1').get();
    if (admin) {
      // Several demo users follow admin
      for (const uname of ['parisa_a','reza_k','sara_m','maryam_k']) {
        const fid = idByUsername[uname];
        if (fid) {
          try { db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)').run(fid, admin.id); } catch {}
        }
      }
      // Admin follows a few back
      for (const uname of ['parisa_a','reza_k']) {
        const fid = idByUsername[uname];
        if (fid) {
          try { db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)').run(admin.id, fid); } catch {}
        }
      }
      console.log('   ✓ demo follows created');
    }
  }

  // 9) Demo likes (so feed shows engagement)
  const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes').get().n;
  if (likeCount < 5) {
    const posts = db.prepare('SELECT id FROM feed_posts ORDER BY created_at DESC LIMIT 10').all();
    const userIds = Object.values(idByUsername).slice(0, 5);
    for (const post of posts) {
      for (const uid of userIds.slice(0, 3)) {
        try { db.prepare('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)').run(uid, post.id); } catch {}
      }
    }
    console.log('   ✓ demo likes created');
  }

  console.log('✅ Demo seed complete\n');
}

# KingWolf Messenger

پیام‌رسان امن با قابلیت‌های فید (مانند توییتر) و چت (مانند تلگرام).

## اجرای پروژه

روی Replit فقط دکمه **Run** را بزنید. تمام مراحل خودکار انجام می‌شود:
1. نصب وابستگی‌های backend و frontend (بار اول حدود ۲ دقیقه)
2. پر کردن دیتای دمو
3. اجرای backend روی پورت 3001
4. اجرای frontend روی پورت 5173

## ساختار پروژه

```
artifacts/
├── api-server/        # سرور backend (Node.js + SQLite)
│   ├── server.js      # سرور اصلی
│   ├── db.js          # تعریف دیتابیس
│   ├── seed-rest.js   # دیتای دمو
│   └── data/          # دیتابیس و فایل‌ها
└── kingwolf/          # frontend (React + Vite)
    ├── src/           # کد منبع
    └── public/        # فایل‌های ثابت
```

## اطلاعات ورود

- **ادمین:** `admin` (رمز همان رمز قبلی شما در دیتابیس)
- **کاربر دمو:** `parisa_a`, `ayda_r`, `nilufar_m`, ... / رمز همه: `demo1234`

## قابلیت‌ها

- چت شخصی، گروه، کانال
- فید مانند توییتر (پست، لایک، نشان، نظر، هشتگ)
- پنل مدیریت کامل
- سیستم گزارش و اعلان
- پشتیبانی PWA (نصب روی موبایل از Add to Home Screen)

## توسعه‌دهنده

برای Replit AI: همه تنظیمات در `.replit` و `start.sh` تعریف شده است. لطفاً ساختار را تغییر ندهید.

اگر مشکلی پیش آمد:
```bash
rm -rf artifacts/api-server/node_modules artifacts/kingwolf/node_modules
rm -rf artifacts/api-server/data/kingwolf.db.lock
bash start.sh
```

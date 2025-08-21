const cookies = [
  "session=abc123;",
  "session=def456;",
  "session=ghi789;"
];
const randomCookie = cookies[Math.floor(Math.random() * cookies.length)];
$done({ headers: { "Cookie": randomCookie } });
$done({
  body: JSON.stringify({
    authenticated: true,
    cart: { items: 0 },
    recentActivity: [],
    geo: "US",
    isPrimeMember: true
  })
});
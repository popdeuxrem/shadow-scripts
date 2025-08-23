
// OTP Autofill Interception
if ($request.body && $request.url.includes("/otp")) {
  console.log("Intercepted OTP request:", $request.body);
}
$done({});

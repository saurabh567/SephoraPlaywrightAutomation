/**
 * AndroidStartupLocators
 *
 * Android-native locators for all startup screens encountered after
 * launching the Amazon Shopping app fresh.
 *
 * Each group contains an ordered array of locator strategies so the
 * ApplicationInitializer can try them in priority order.
 *
 * ── Strategy support ────────────────────────────────────────────────
 *   ~accessibility_id      — Accessibility ID / content-desc
 *   id:resource_id          — Android resource-id
 *   android=UiSelector...   — UiAutomator2 selector
 *   //xpath                 — XPath
 *   class name:...          — Android class name
 *   -android uiautomator... — Alternate UiAutomator2
 */

'use strict';

const ANDROID_PACKAGE = 'in.amazon.mShop.android.shopping';

const IS_ANDROID = true;

module.exports = {

  // ── Language Selection Screen ───────────────────────────────────────
  LANGUAGE_SCREEN: [
    `~Choose your language`,
    `~Select your language`,
    `~Language selection`,
    `android=new UiSelector().text("Choose your language")`,
    `android=new UiSelector().text("Select your language")`,
    `android=new UiSelector().textContains("language")`,
    `//android.widget.TextView[contains(@text, "Choose your language")]`,
    `//android.widget.TextView[contains(@text, "Select your language")]`,
    `//*[contains(@text, "language")]`,
    `id:${ANDROID_PACKAGE}:id/language_title`,
  ],

  ENGLISH_LANGUAGE_OPTION: [
    `android=new UiSelector().textContains("English")`,
    `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("English"))`,
    `~English`,
    `~English (India)`,
    `~English – English`,
    `android=new UiSelector().text("English")`,
    `//*[@text="English"]`,
    `//*[contains(@text, "English")]`,
    `id:${ANDROID_PACKAGE}:id/language_english`,
    `id:${ANDROID_PACKAGE}:id/english_radio`,
    `id:${ANDROID_PACKAGE}:id/english_option`,
  ],

  CONTINUE_BUTTON: [
    `~Continue`,
    `~Continue in English`,
    `android=new UiSelector().text("Continue")`,
    `android=new UiSelector().text("Continue in English")`,
    `android=new UiSelector().textContains("Continue")`,
    `//android.widget.Button[@text="Continue"]`,
    `//android.widget.Button[contains(@text, "Continue")]`,
    `//*[contains(@text, "Continue")]`,
    `id:${ANDROID_PACKAGE}:id/continue_button`,
    `id:${ANDROID_PACKAGE}:id/continue_btn`,
    `id:${ANDROID_PACKAGE}:id/continue_english_btn`,
  ],

  // ── Sign In / Sign Up Screen ────────────────────────────────────────
  SIGNIN_SCREEN: [
    `~Sign-In`,
    `~Sign in`,
    `~Sign In`,
    `android=new UiSelector().textContains("Sign in")`,
    `android=new UiSelector().textContains("Sign-In")`,
    `android=new UiSelector().textContains("Email")`,
    `android=new UiSelector().textContains("phone number")`,
    `//*[contains(@text, "Sign in")]`,
    `//*[contains(@text, "Sign-In")]`,
    `//*[contains(@text, "Email") or contains(@text, "email")]`,
  ],

  SKIP_SIGNIN_BUTTON: [
    `//*[@clickable="true" and contains(@text, "Skip")]`,
    `//*[@clickable="true" and contains(@text, "skip")]`,
    `//*[@clickable="true" and contains(@text, "Not now")]`,
    `//*[@clickable="true" and contains(@text, "Continue without")]`,
    `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Skip"))`,
    `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Not now"))`,
    `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Continue without"))`,
    `android=new UiSelector().textContains("Skip")`,
    `android=new UiSelector().textContains("Not now")`,
    `android=new UiSelector().textContains("Continue without signing")`,
    `~Skip sign in`,
    `~Skip`,
    `~Not now`,
    `~Continue without signing in`,
    `//*[contains(@text, "Skip")]`,
    `//*[contains(@text, "Not now")]`,
    `//*[contains(@text, "Continue without")]`,
    `id:${ANDROID_PACKAGE}:id/skip_sign_in_button`,
    `id:${ANDROID_PACKAGE}:id/skip_btn`,
  ],

  // ── Permission Dialogs ──────────────────────────────────────────────
  PERMISSION_ALLOW_BUTTON: [
    `//*[@text="Allow"]`,
    `//*[@text="While using the app"]`,
    `//*[@text="Only this time"]`,
    `//*[@text="Allow location access"]`,
    `android=new UiSelector().text("Allow")`,
    `android=new UiSelector().text("While using the app")`,
    `android=new UiSelector().textContains("Allow")`,
    `//android.widget.Button[@text="Allow"]`,
    `//android.widget.Button[contains(@text, "Allow")]`,
  ],

  PERMISSION_DENY_BUTTON: [
    `//*[@text="Deny"]`,
    `//*[@text="Don't allow"]`,
    `android=new UiSelector().text("Deny")`,
    `android=new UiSelector().text("Don't allow")`,
    `//android.widget.Button[@text="Deny"]`,
    `//android.widget.Button[@text="Don't allow"]`,
  ],

  PERMISSION_DIALOG: [
    `//android.widget.AlertDialog`,
    `//android:id/alertTitle[contains(@text, "allow") or contains(@text, "permission")]`,
    `//android:id/parentPanel`,
    `//*[contains(@text, "permission")]`,
    `//*[contains(@text, "Allow")]`,
  ],

  // ── Location Permission ────────────────────────────────────────────
  LOCATION_PERMISSION_DIALOG: [
    `//*[contains(@text, "location") and contains(@text, "allow")]`,
    `//*[contains(@text, "delivery location")]`,
    `id:${ANDROID_PACKAGE}:id/loc_ux_gps_prompt_text`,
    `android=new UiSelector().textContains("delivery location")`,
    `android=new UiSelector().textContains("location")`,
  ],

  LOCATION_DENY_BUTTON: [
    `//*[@text="Don't allow"]`,
    `//*[@text="Not now"]`,
    `//*[contains(@text, "skip")]`,
    `//*[contains(@text, "maybe later")]`,
    `id:${ANDROID_PACKAGE}:id/loc_ux_gps_deny_button`,
    `id:${ANDROID_PACKAGE}:id/touch_outside`,
  ],

  // ── Promotional Popups / Overlays ───────────────────────────────────
  PROMOTION_CLOSE_BUTTON: [
    `//android.widget.ImageButton[@content-desc="Close"]`,
    `//*[@content-desc="Close"]`,
    `//*[@content-desc="Dismiss"]`,
    `//*[contains(@content-desc, "close")]`,
    `//*[contains(@content-desc, "dismiss")]`,
    `android=new UiSelector().descriptionContains("Close")`,
    `android=new UiSelector().descriptionContains("Dismiss")`,
    `//*[@text="×"]`,
    `//*[@text="✕"]`,
    `//*[@text="Got it"]`,
    `//*[@text="Skip"]`,
    `id:${ANDROID_PACKAGE}:id/dismiss_btn`,
    `id:${ANDROID_PACKAGE}:id/close_btn`,
  ],

  PROMOTION_DIALOG: [
    `//android.widget.AlertDialog`,
    `//*[contains(@text, "offer") or contains(@text, "promotion")]`,
    `//*[contains(@text, "Get started")]`,
    `//*[contains(@text, "Great")]`,
    `id:${ANDROID_PACKAGE}:id/promotion_banner`,
  ],

  // ── Update Dialogs ──────────────────────────────────────────────────
  UPDATE_DIALOG: [
    `//*[contains(@text, "Update")]`,
    `//*[contains(@text, "update")]`,
    `//*[contains(@text, "New version")]`,
    `//*[contains(@text, "What's new")]`,
    `android=new UiSelector().textContains("Update")`,
    `android=new UiSelector().textContains("update")`,
    `id:android:id/button1`,
    `id:android:id/button2`,
  ],

  UPDATE_SKIP_BUTTON: [
    `//*[@text="Skip"]`,
    `//*[@text="Not now"]`,
    `//*[@text="Later"]`,
    `//*[@text="Remind me later"]`,
    `//*[@text="Cancel"]`,
    `id:android:id/button2`,
  ],

  UPDATE_OK_BUTTON: [
    `//*[@text="OK"]`,
    `//*[@text="Update"]`,
    `//*[@text="Install"]`,
    `id:android:id/button1`,
  ],

  // ── Dashboard / Home Page Indicators ────────────────────────────────
  DASHBOARD_SEARCH_BAR: [
    `id:${ANDROID_PACKAGE}:id/chrome_search_box`,
    `id:${ANDROID_PACKAGE}:id/rs_search_src_text`,
    `~Search`,
    `//*[contains(@content-desc, "Search")]`,
    `android=new UiSelector().descriptionContains("Search")`,
  ],

  DASHBOARD_BOTTOM_NAV: [
    `//*[@resource-id="${ANDROID_PACKAGE}:id/bottom_nav_container"]`,
    `id:${ANDROID_PACKAGE}:id/bottom_nav_container`,
    `android=new UiSelector().descriptionContains("Cart")`,
    `android=new UiSelector().descriptionContains("cart")`,
    `//*[contains(@content-desc, "Cart")]`,
    `//*[contains(@content-desc, "Home")]`,
  ],

  DASHBOARD_HOME_TAB: [
    `//*[@content-desc="Home" and @selected="true"]`,
    `//*[contains(@content-desc, "Home, tab,")]`,
    `android=new UiSelector().descriptionContains("Home").selected(true)`,
  ],

  DASHBOARD_WEBVIEW: [
    `class name:android.webkit.WebView`,
    `//android.webkit.WebView`,
  ],

  // ── Onboarding / Tutorial Screens ───────────────────────────────────
  ONBOARDING_SKIP_BUTTON: [
    `//*[@text="Skip"]`,
    `//*[@text="Get started"]`,
    `//*[contains(@text, "Skip")]`,
    `id:${ANDROID_PACKAGE}:id/onboarding_skip`,
    `id:${ANDROID_PACKAGE}:id/skip_tutorial`,
  ],

  // ── Generic System Dialog Close ─────────────────────────────────────
  SYSTEM_CLOSE_BROADCAST: 'android=new UiSelector().descriptionContains("Close")',
};

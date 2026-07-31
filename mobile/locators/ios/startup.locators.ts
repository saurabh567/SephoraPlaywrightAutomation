/**
 * IOSStartupLocators
 *
 * iOS-native locators for all startup screens encountered after launching
 * the Amazon Shopping app on iOS (native or Safari WebView).
 *
 * Each group contains an ordered array of locator strategies so the
 * ApplicationInitializer can try them in priority order.
 *
 * ── Strategy support ────────────────────────────────────────────────
 *   name:accessibility_id   — XCUITest `name` attribute (accessibility-id)
 *   -ios predicate string:  — NSPredicate-based queries
 *   -ios class chain:        — Element hierarchy traversal
 *   id:identifier            — Element identifier
 *   class name:...           — XCUIElementType class names
 *   //xpath                  — XPath (fallback, slower)
 *
 * IMPORTANT: The "~" prefix (WebDriverIO accessibility-id shorthand) is
 * UNSUPPORTED on iOS xcuitest-driver. Use "name:" prefix instead.
 */

'use strict';

export const LANGUAGE_SCREEN = [
    `name:Choose your language`,
    `name:Select your language`,
    `name:Language selection`,
    `-ios predicate string:label CONTAINS[c] "Choose your language"`,
    `-ios predicate string:label CONTAINS[c] "Select your language"`,
    `-ios predicate string:label CONTAINS[c] "language"`,
    `//*[contains(@label, "Choose your language")]`,
    `//*[contains(@label, "Select your language")]`,
  ];
export const ENGLISH_LANGUAGE_OPTION = [
    `-ios predicate string:label BEGINSWITH "English"`,
    `-ios predicate string:label == "English"`,
    `-ios predicate string:label == "English (India)"`,
    `name:English`,
    `name:English (India)`,
    `name:English – English`,
    `//*[@label="English"]`,
    `//*[contains(@label, "English")]`,
  ];
export const CONTINUE_BUTTON = [
    `name:Continue`,
    `name:Continue in English`,
    `-ios predicate string:label == "Continue"`,
    `-ios predicate string:label == "Continue in English"`,
    `-ios predicate string:label CONTAINS[c] "Continue"`,
    `//*[@label="Continue"]`,
    `//*[contains(@label, "Continue")]`,
  ];
export const SIGNIN_SCREEN = [
    `name:Sign-In`,
    `name:Sign in`,
    `name:Sign In`,
    `-ios predicate string:label CONTAINS[c] "Sign in"`,
    `-ios predicate string:label CONTAINS[c] "Sign-In"`,
    `//*[contains(@label, "Sign in")]`,
    `//*[contains(@label, "Sign-In")]`,
  ];
export const SKIP_SIGNIN_BUTTON = [
    `name:Skip sign in`,
    `name:Skip`,
    `name:Not now`,
    `name:Continue without signing in`,
    `-ios predicate string:label CONTAINS[c] "Skip"`,
    `-ios predicate string:label CONTAINS[c] "Not now"`,
    `-ios predicate string:label CONTAINS[c] "Continue without"`,
    `//*[contains(@label, "Skip")]`,
    `//*[contains(@label, "Not now")]`,
    `//*[contains(@label, "Continue without")]`,
  ];
export const PERMISSION_ALLOW_BUTTON = [
    `name:Allow`,
    `name:Allow While Using App`,
    `name:Allow Once`,
    `-ios predicate string:label == "Allow"`,
    `-ios predicate string:label == "Allow While Using App"`,
    `-ios predicate string:label == "Allow Once"`,
  ];
export const PERMISSION_DENY_BUTTON = [
    `name:Don't Allow`,
    `name:Deny`,
    `name:Deny and Report`,
    `-ios predicate string:label == "Don't Allow"`,
    `-ios predicate string:label == "Deny"`,
  ];
export const LOCATION_PERMISSION_DIALOG = [
    `-ios predicate string:label CONTAINS[c] "location"`,
    `-ios predicate string:label CONTAINS[c] "Location"`,
    `//*[contains(@label, "location")]`,
    `//*[contains(@label, "Location")]`,
  ];
export const PROMOTION_CLOSE_BUTTON = [
    `name:Close`,
    `name:Dismiss`,
    `name:Not Now`,
    `name:Skip`,
    `name:Got it`,
    `-ios predicate string:label == "Close"`,
    `-ios predicate string:label == "Dismiss"`,
    `-ios predicate string:label CONTAINS[c] "Got it"`,
    `//*[@label="Close"]`,
    `//*[@label="Dismiss"]`,
    `//*[contains(@label, "Close")]`,
  ];
export const PROMOTION_DIALOG = [
    `-ios predicate string:label CONTAINS[c] "offer"`,
    `-ios predicate string:label CONTAINS[c] "promotion"`,
    `-ios predicate string:label CONTAINS[c] "Get started"`,
    `//*[contains(@label, "offer")]`,
    `//*[contains(@label, "promotion")]`,
  ];
export const UPDATE_DIALOG = [
    `-ios predicate string:label CONTAINS[c] "Update"`,
    `-ios predicate string:label CONTAINS[c] "update"`,
    `-ios predicate string:label CONTAINS[c] "New version"`,
    `//*[contains(@label, "Update")]`,
    `//*[contains(@label, "update")]`,
  ];
export const UPDATE_SKIP_BUTTON = [
    `name:Skip`,
    `name:Not Now`,
    `name:Later`,
    `name:Remind Me Later`,
    `name:Cancel`,
    `-ios predicate string:label == "Skip"`,
    `-ios predicate string:label == "Not Now"`,
    `-ios predicate string:label == "Later"`,
    `-ios predicate string:label == "Cancel"`,
  ];
export const UPDATE_OK_BUTTON = [
    `name:OK`,
    `name:Update`,
    `name:Install`,
    `-ios predicate string:label == "OK"`,
    `-ios predicate string:label == "Update"`,
  ];
export const DASHBOARD_SEARCH_BAR = [
    `-ios predicate string:type == "XCUIElementTypeSearchField"`,
    `-ios predicate string:type == "XCUIElementTypeTextField" AND name CONTAINS[c] "search"`,
    `-ios predicate string:name CONTAINS[c] "search" OR label CONTAINS[c] "search"`,
    `name:Search`,
    `//*[contains(@label, "Search") or contains(@label, "search")]`,
  ];
export const DASHBOARD_BOTTOM_NAV = [
    `-ios predicate string:name CONTAINS[c] "Cart" OR label CONTAINS[c] "cart"`,
    `-ios predicate string:name CONTAINS[c] "Home" OR label CONTAINS[c] "home"`,
    `name:Cart`,
    `name:Home`,
  ];
export const DASHBOARD_HOME_TAB = [
    `-ios predicate string:name CONTAINS[c] "Home" AND (label CONTAINS[c] "selected" OR label CONTAINS[c] "tab")`,
    `//*[@label="Home" and @selected="true"]`,
  ];
export const DASHBOARD_WEBVIEW = [
    `class name:XCUIElementTypeWebView`,
    `//XCUIElementTypeWebView`,
  ];
export const ONBOARDING_SKIP_BUTTON = [
    `name:Skip`,
    `name:Get Started`,
    `-ios predicate string:label CONTAINS[c] "Skip"`,
    `-ios predicate string:label CONTAINS[c] "Get started"`,
  ];
export default { LANGUAGE_SCREEN: [
    `name:Choose your language`,
    `name:Select your language`,
    `name:Language selection`,
    `-ios predicate string:label CONTAINS[c] "Choose your language"`,
    `-ios predicate string:label CONTAINS[c] "Select your language"`,
    `-ios predicate string:label CONTAINS[c] "language"`,
    `//*[contains(@label, "Choose your language")]`,
    `//*[contains(@label, "Select your language")]`,
  ], ENGLISH_LANGUAGE_OPTION: [
    `-ios predicate string:label BEGINSWITH "English"`,
    `-ios predicate string:label == "English"`,
    `-ios predicate string:label == "English (India)"`,
    `name:English`,
    `name:English (India)`,
    `name:English – English`,
    `//*[@label="English"]`,
    `//*[contains(@label, "English")]`,
  ], CONTINUE_BUTTON: [
    `name:Continue`,
    `name:Continue in English`,
    `-ios predicate string:label == "Continue"`,
    `-ios predicate string:label == "Continue in English"`,
    `-ios predicate string:label CONTAINS[c] "Continue"`,
    `//*[@label="Continue"]`,
    `//*[contains(@label, "Continue")]`,
  ], SIGNIN_SCREEN: [
    `name:Sign-In`,
    `name:Sign in`,
    `name:Sign In`,
    `-ios predicate string:label CONTAINS[c] "Sign in"`,
    `-ios predicate string:label CONTAINS[c] "Sign-In"`,
    `//*[contains(@label, "Sign in")]`,
    `//*[contains(@label, "Sign-In")]`,
  ], SKIP_SIGNIN_BUTTON: [
    `name:Skip sign in`,
    `name:Skip`,
    `name:Not now`,
    `name:Continue without signing in`,
    `-ios predicate string:label CONTAINS[c] "Skip"`,
    `-ios predicate string:label CONTAINS[c] "Not now"`,
    `-ios predicate string:label CONTAINS[c] "Continue without"`,
    `//*[contains(@label, "Skip")]`,
    `//*[contains(@label, "Not now")]`,
    `//*[contains(@label, "Continue without")]`,
  ], PERMISSION_ALLOW_BUTTON: [
    `name:Allow`,
    `name:Allow While Using App`,
    `name:Allow Once`,
    `-ios predicate string:label == "Allow"`,
    `-ios predicate string:label == "Allow While Using App"`,
    `-ios predicate string:label == "Allow Once"`,
  ], PERMISSION_DENY_BUTTON: [
    `name:Don't Allow`,
    `name:Deny`,
    `name:Deny and Report`,
    `-ios predicate string:label == "Don't Allow"`,
    `-ios predicate string:label == "Deny"`,
  ], LOCATION_PERMISSION_DIALOG: [
    `-ios predicate string:label CONTAINS[c] "location"`,
    `-ios predicate string:label CONTAINS[c] "Location"`,
    `//*[contains(@label, "location")]`,
    `//*[contains(@label, "Location")]`,
  ], PROMOTION_CLOSE_BUTTON: [
    `name:Close`,
    `name:Dismiss`,
    `name:Not Now`,
    `name:Skip`,
    `name:Got it`,
    `-ios predicate string:label == "Close"`,
    `-ios predicate string:label == "Dismiss"`,
    `-ios predicate string:label CONTAINS[c] "Got it"`,
    `//*[@label="Close"]`,
    `//*[@label="Dismiss"]`,
    `//*[contains(@label, "Close")]`,
  ], PROMOTION_DIALOG: [
    `-ios predicate string:label CONTAINS[c] "offer"`,
    `-ios predicate string:label CONTAINS[c] "promotion"`,
    `-ios predicate string:label CONTAINS[c] "Get started"`,
    `//*[contains(@label, "offer")]`,
    `//*[contains(@label, "promotion")]`,
  ], UPDATE_DIALOG: [
    `-ios predicate string:label CONTAINS[c] "Update"`,
    `-ios predicate string:label CONTAINS[c] "update"`,
    `-ios predicate string:label CONTAINS[c] "New version"`,
    `//*[contains(@label, "Update")]`,
    `//*[contains(@label, "update")]`,
  ], UPDATE_SKIP_BUTTON: [
    `name:Skip`,
    `name:Not Now`,
    `name:Later`,
    `name:Remind Me Later`,
    `name:Cancel`,
    `-ios predicate string:label == "Skip"`,
    `-ios predicate string:label == "Not Now"`,
    `-ios predicate string:label == "Later"`,
    `-ios predicate string:label == "Cancel"`,
  ], UPDATE_OK_BUTTON: [
    `name:OK`,
    `name:Update`,
    `name:Install`,
    `-ios predicate string:label == "OK"`,
    `-ios predicate string:label == "Update"`,
  ], DASHBOARD_SEARCH_BAR: [
    `-ios predicate string:type == "XCUIElementTypeSearchField"`,
    `-ios predicate string:type == "XCUIElementTypeTextField" AND name CONTAINS[c] "search"`,
    `-ios predicate string:name CONTAINS[c] "search" OR label CONTAINS[c] "search"`,
    `name:Search`,
    `//*[contains(@label, "Search") or contains(@label, "search")]`,
  ], DASHBOARD_BOTTOM_NAV: [
    `-ios predicate string:name CONTAINS[c] "Cart" OR label CONTAINS[c] "cart"`,
    `-ios predicate string:name CONTAINS[c] "Home" OR label CONTAINS[c] "home"`,
    `name:Cart`,
    `name:Home`,
  ], DASHBOARD_HOME_TAB: [
    `-ios predicate string:name CONTAINS[c] "Home" AND (label CONTAINS[c] "selected" OR label CONTAINS[c] "tab")`,
    `//*[@label="Home" and @selected="true"]`,
  ], DASHBOARD_WEBVIEW: [
    `class name:XCUIElementTypeWebView`,
    `//XCUIElementTypeWebView`,
  ], ONBOARDING_SKIP_BUTTON: [
    `name:Skip`,
    `name:Get Started`,
    `-ios predicate string:label CONTAINS[c] "Skip"`,
    `-ios predicate string:label CONTAINS[c] "Get started"`,
  ] };

// iOS login locators — using iOS-compatible strategies.
//   - "name:" maps to XCUITest `name` attribute (most direct accessibility-id equivalent)
//   - "-ios predicate string:" for advanced queries
//   - "-ios class chain:" for complex DOM traversal
//   - "xpath:" for XML path queries
//   - "id:" for element id
//
// Do NOT use "accessibility id" or the "~" prefix — it is unsupported on iOS.

module.exports = {
  usernameInput: 'name:username',
  passwordInput: 'name:password',
  loginButton: 'name:login'
};

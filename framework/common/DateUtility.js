class DateUtility {
  static timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  static today() {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = DateUtility;

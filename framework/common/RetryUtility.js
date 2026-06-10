class RetryUtility {
  static async retry(action, { retries = 2, delayMs = 500 } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await action(attempt);
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}

module.exports = RetryUtility;

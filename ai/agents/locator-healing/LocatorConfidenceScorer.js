// LocatorConfidenceScorer - Generates confidence scores for locator healing candidates
// Scores from 0.0 (unreliable) to 1.0 (highly confident)
// Uses: DOM similarity, historical success rate, locator type stability, and heuristics

class LocatorConfidenceScorer {
  constructor(options = {}) {
    this.historyStore = options.historyStore || null;
    this.weights = options.weights || {
      domSimilarity: 0.30,
      historicalSuccess: 0.25,
      locatorTypeStability: 0.20,
      attributeRichness: 0.15,
      proximityMatch: 0.10
    };
  }

  /**
   * Calculate overall confidence score for a locator replacement candidate.
   * @param {Object} params
   * @param {string} params.failedLocator - The locator that failed
   * @param {string} params.candidateLocator - The proposed replacement locator
   * @param {string} params.pageName - Page object name
   * @param {string} params.locatorName - Locator name / key
   * @param {Object} params.domContext - Optional DOM context info
   * @param {string} params.locatorType - Type of locator (css, xpath, text, role, testid)
   * @returns {Object} { score, breakdown, label }
   */
  score(params) {
    const {
      failedLocator,
      candidateLocator,
      pageName,
      locatorName,
      domContext = {},
      locatorType = 'css'
    } = params;

    // Calculate sub-scores
    const domScore = this._scoreDomSimilarity(failedLocator, candidateLocator, domContext);
    const historicalScore = this._scoreHistoricalSuccess(pageName, locatorName);
    const stabilityScore = this._scoreLocatorTypeStability(candidateLocator, locatorType);
    const richnessScore = this._scoreAttributeRichness(candidateLocator);
    const proximityScore = this._scoreProximityMatch(failedLocator, candidateLocator);

    // Weighted sum
    const score = Math.round(
      (domScore * this.weights.domSimilarity +
       historicalScore * this.weights.historicalSuccess +
       stabilityScore * this.weights.locatorTypeStability +
       richnessScore * this.weights.attributeRichness +
       proximityScore * this.weights.proximityMatch) * 100
    ) / 100;

    const breakdown = {
      domSimilarity: { score: domScore, weight: this.weights.domSimilarity, contribution: domScore * this.weights.domSimilarity },
      historicalSuccess: { score: historicalScore, weight: this.weights.historicalSuccess, contribution: historicalScore * this.weights.historicalSuccess },
      locatorTypeStability: { score: stabilityScore, weight: this.weights.locatorTypeStability, contribution: stabilityScore * this.weights.locatorTypeStability },
      attributeRichness: { score: richnessScore, weight: this.weights.attributeRichness, contribution: richnessScore * this.weights.attributeRichness },
      proximityMatch: { score: proximityScore, weight: this.weights.proximityMatch, contribution: proximityScore * this.weights.proximityMatch }
    };

    const label = this._classifyConfidence(score);

    return { score, breakdown, label };
  }

  /**
   * Score DOM similarity between failed and candidate locator.
   * Higher score when locators share structure, tags, or attributes.
   */
  _scoreDomSimilarity(failed, candidate, domContext) {
    if (!failed || !candidate) return 0;
    if (failed === candidate) return 1.0;

    // Check for shared CSS class references
    const failedClasses = (failed.match(/\.([\w-]+)/g) || []).map(c => c.slice(1));
    const candidateClasses = (candidate.match(/\.([\w-]+)/g) || []).map(c => c.slice(1));
    const sharedClasses = failedClasses.filter(c => candidateClasses.includes(c));
    const classScore = Math.max(failedClasses.length, candidateClasses.length) > 0
      ? sharedClasses.length / Math.max(failedClasses.length, candidateClasses.length)
      : 0;

    // Check for shared ID references
    const failedId = (failed.match(/#([\w-]+)/) || [])[1] || null;
    const candidateId = (candidate.match(/#([\w-]+)/) || [])[1] || null;
    const idScore = failedId && candidateId && failedId === candidateId ? 1.0 : 0;

    // Check for shared tag names
    const failedTags = failed.match(/[a-zA-Z][a-zA-Z0-9]*(?=[\.#\s\[:])/g) || [];
    const candidateTags = candidate.match(/[a-zA-Z][a-zA-Z0-9]*(?=[\.#\s\[:])/g) || [];
    const sharedTags = failedTags.filter(t => candidateTags.includes(t));
    const tagScore = Math.max(failedTags.length, candidateTags.length) > 0
      ? sharedTags.length / Math.max(failedTags.length, candidateTags.length)
      : 0;

    // Check for shared attribute references
    const failedAttrs = (failed.match(/\[([^\]]+)\]/g) || []).map(a => a.slice(1, -1).split('=')[0]);
    const candidateAttrs = (candidate.match(/\[([^\]]+)\]/g) || []).map(a => a.slice(1, -1).split('=')[0]);
    const sharedAttrs = failedAttrs.filter(a => candidateAttrs.includes(a));
    const attrScore = Math.max(failedAttrs.length, candidateAttrs.length) > 0
      ? sharedAttrs.length / Math.max(failedAttrs.length, candidateAttrs.length)
      : 0;

    // String similarity (Dice coefficient on bigrams)
    const strScore = this._diceSimilarity(failed, candidate);

    const score = Math.round(
      (classScore * 0.20 +
       idScore * 0.30 +
       tagScore * 0.15 +
       attrScore * 0.20 +
       strScore * 0.15) * 100
    ) / 100;

    return Math.min(score, 1.0);
  }

  /**
   * Score based on historical success rate from the locator history store.
   */
  _scoreHistoricalSuccess(pageName, locatorName) {
    if (!this.historyStore || !pageName || !locatorName) return 0.5;

    try {
      const history = this.historyStore.getLocatorHistory(pageName, locatorName);
      if (!history) return 0.5;

      const total = (history.totalSuccesses || 0) + (history.totalFailures || 0);
      if (total === 0) return 0.5;

      const successRate = (history.totalSuccesses || 0) / total;

      // Penalize for high consecutive failures
      const consecutivePenalty = Math.max(0, 1 - ((history.consecutiveFailures || 0) * 0.15));

      return Math.round(successRate * consecutivePenalty * 100) / 100;
    } catch (e) {
      return 0.5;
    }
  }

  /**
   * Score locator type stability - some locator types are more stable than others.
   */
  _scoreLocatorTypeStability(locator, locatorType) {
    // Stability ranking: testid > id > role > name > label > css class > xpath > text
    const stabilityMap = {
      'testid': 1.0,
      'id': 0.95,
      'role': 0.90,
      'name': 0.85,
      'label': 0.80,
      'placeholder': 0.80,
      'aria-label': 0.85,
      'aria-labelledby': 0.80,
      'css': 0.70,
      'xpath': 0.55,
      'text': 0.40
    };

    let typeScore = stabilityMap[locatorType] || 0.60;

    // ID-based selectors are most stable
    if (locator && /^#[\w-]+$/.test(locator.trim())) {
      typeScore = Math.max(typeScore, 0.95);
    }

    // XPath with text() is less stable
    if (locator && locatorType === 'xpath' && locator.includes('text()')) {
      typeScore = Math.min(typeScore, 0.35);
    }

    // Data-testid attributes are very stable
    if (locator && /data-testid|data-test-id|data-test/i.test(locator)) {
      typeScore = Math.max(typeScore, 0.95);
    }

    return typeScore;
  }

  /**
   * Score based on how many attributes/constraints the locator uses.
   * Richer locators (combining multiple attributes) are more specific.
   */
  _scoreAttributeRichness(locator) {
    if (!locator) return 0.5;

    let richness = 0;
    const checks = [
      { pattern: /#[\w-]+/, weight: 0.20 },    // has ID
      { pattern: /\.[\w-]+/, weight: 0.10 },    // has class
      { pattern: /\[[\w-]+=/, weight: 0.15 },   // has attribute with value
      { pattern: /\[[\w-]+\]/, weight: 0.10 },  // has attribute without value
      { pattern: /data-test/, weight: 0.20 },   // has data-test*
      { pattern: /aria-/, weight: 0.15 },        // has aria attribute
      { pattern: /role=/, weight: 0.15 },        // has role
      { pattern: /placeholder/, weight: 0.10 },  // has placeholder
      { pattern: /name=/, weight: 0.10 },        // has name
      { pattern: /^[a-zA-Z]/, weight: 0.05 }     // has tag name
    ];

    for (const check of checks) {
      if (check.pattern.test(locator)) {
        richness += check.weight;
      }
    }

    return Math.min(richness, 1.0);
  }

  /**
   * Score proximity match - how close the candidate is to the failed element in the DOM.
   */
  _scoreProximityMatch(failedLocator, candidateLocator) {
    if (!failedLocator || !candidateLocator) return 0.5;
    if (failedLocator === candidateLocator) return 1.0;

    // Check if they share parent/ancestor selectors
    const failedParts = failedLocator.split('>').map(s => s.trim());
    const candidateParts = candidateLocator.split('>').map(s => s.trim());

    // Compare trailing parts (most specific parts)
    let matchingSegments = 0;
    const minLen = Math.min(failedParts.length, candidateParts.length);
    for (let i = 0; i < minLen; i++) {
      const fSeg = failedParts[failedParts.length - 1 - i] || '';
      const cSeg = candidateParts[candidateParts.length - 1 - i] || '';
      if (fSeg === cSeg) matchingSegments++;
      else {
        // Check partial match within segment
        if (this._diceSimilarity(fSeg, cSeg) > 0.6) matchingSegments += 0.5;
        else break;
      }
    }

    if (minLen === 0) return 0.5;
    return Math.min(matchingSegments / minLen, 1.0);
  }

  /**
   * Dice coefficient for string similarity
   */
  _diceSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1.0;

    const bigrams = {};
    for (let i = 0; i < a.length - 1; i++) {
      const bg = a.slice(i, i + 2);
      bigrams[bg] = (bigrams[bg] || 0) + 1;
    }

    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bg = b.slice(i, i + 2);
      if (bigrams[bg] > 0) {
        bigrams[bg]--;
        intersection++;
      }
    }

    const total = a.length + b.length - 2;
    return total > 0 ? (2.0 * intersection) / total : 0;
  }

  /**
   * Classify confidence score into label
   */
  _classifyConfidence(score) {
    if (score >= 0.85) return 'HIGH';
    if (score >= 0.70) return 'MEDIUM_HIGH';
    if (score >= 0.50) return 'MEDIUM';
    if (score >= 0.30) return 'LOW_MEDIUM';
    if (score >= 0.15) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Determine if a score meets the auto-apply threshold
   */
  isAutoApplyCandidate(score, threshold = 0.80) {
    return score >= threshold;
  }

  /**
   * Get recommended action based on confidence level
   */
  getRecommendedAction(score) {
    const label = this._classifyConfidence(score);
    const actions = {
      'HIGH': 'AUTO_APPLY - Safe to automatically replace',
      'MEDIUM_HIGH': 'AUTO_APPLY - Low risk, recommend automatic replacement',
      'MEDIUM': 'REVIEW - Review before applying',
      'LOW_MEDIUM': 'REVIEW - Low confidence, requires manual review',
      'LOW': 'MANUAL - Manual investigation needed',
      'VERY_LOW': 'MANUAL - Cannot recommend replacement automatically'
    };
    return actions[label] || 'REVIEW';
  }
}

module.exports = LocatorConfidenceScorer;

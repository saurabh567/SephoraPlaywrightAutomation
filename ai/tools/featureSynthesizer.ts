const uuid = require('crypto').randomBytes;

// Lightweight synthesizer: converts simple intent into feature + scenarios
export const synthesize = function(intent: any, opts: any = {}) {
    const max = opts.max || 1;
    const title = (intent.title || 'Generated Feature').replace(/[\n\r]/g,' ').trim();
    const scenarios: any[] = [];
    scenarios.push({
      title: `Positive: ${title}`,
      steps: [
        `Given the user is on the relevant page for ${title}`,
        `When the user performs the primary action for ${title}`,
        `Then the expected result is observed for ${title}`
      ]
    });
    scenarios.push({
      title: `Negative: ${title}`,
      steps: [
        `Given the user is on the relevant page for ${title}`,
        `When the user performs the primary action with invalid data for ${title}`,
        `Then an error or validation message is shown for ${title}`
      ]
    });
    const feature = {
      title: `Feature: ${title}`,
      givenTitle: `generated-${Date.now()}`,
      scenarios: scenarios.slice(0, max)
    };
    return [feature];
  };
export default { synthesize: function(intent: any, opts: any = {}) {
    const max = opts.max || 1;
    const title = (intent.title || 'Generated Feature').replace(/[\n\r]/g,' ').trim();
    const scenarios: any[] = [];
    scenarios.push({
      title: `Positive: ${title}`,
      steps: [
        `Given the user is on the relevant page for ${title}`,
        `When the user performs the primary action for ${title}`,
        `Then the expected result is observed for ${title}`
      ]
    });
    scenarios.push({
      title: `Negative: ${title}`,
      steps: [
        `Given the user is on the relevant page for ${title}`,
        `When the user performs the primary action with invalid data for ${title}`,
        `Then an error or validation message is shown for ${title}`
      ]
    });
    const feature = {
      title: `Feature: ${title}`,
      givenTitle: `generated-${Date.now()}`,
      scenarios: scenarios.slice(0, max)
    };
    return [feature];
  } };

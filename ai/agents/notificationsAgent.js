/**
 * notificationsAgent.js
 *
 * AI Pipeline: Notifications stage.
 * Sends execution summaries via configured channels:
 *   - Console/file (always)
 *   - Slack webhook (if SLACK_WEBHOOK_URL is set)
 *   - Email (if SMTP configured)
 *   - Custom webhook (if NOTIFICATION_WEBHOOK_URL is set)
 *
 * Designed as a pluggable notification system - add new channels
 * by implementing a notify() function in the channels map.
 */

const fs = require('fs-extra');
const path = require('path');
const http = require('http');
const https = require('https');

class NotificationsAgent {
  constructor() {
    this.channels = {
      file: this._notifyFile.bind(this),
      slack: this._notifySlack.bind(this),
      webhook: this._notifyWebhook.bind(this)
    };
  }

  async run(input = {}) {
    console.log('[NotificationsAgent] Sending execution notifications');

    const results = { notifications: [] };
    const executionResult = input.executionResult || {};
    const platform = input.platform || process.env.TEST_PLATFORM || 'WEB';
    const status = input.status || executionResult.overallStatus || 'unknown';
    const exitCode = input.exitCode !== undefined ? input.exitCode : executionResult.exitCode;

    // Build notification payload
    const payload = {
      title: `AI Automation: ${platform} Execution ${status.toUpperCase()}`,
      status: status,
      platform: platform,
      exitCode: exitCode,
      timestamp: new Date().toISOString(),
      duration: input.durationMs || executionResult.durationMs || 0,
      summary: {
        scenarios: input.totalScenarios || 0,
        passed: input.passed || 0,
        failed: input.failed || 0,
        passRate: input.passRate || (input.totalScenarios > 0 ? ((input.passed / input.totalScenarios) * 100).toFixed(1) : 'N/A')
      },
      reportLinks: {
        dashboard: 'reports/dashboard/index.html',
        summary: 'reports/ai/execution-summary.md'
      }
    };

    // File notification (always)
    try {
      const fileResult = await this.channels.file(payload);
      results.notifications.push(fileResult);
    } catch (err) {
      results.notifications.push({ channel: 'file', ok: false, error: err.message });
    }

    // Slack (if configured)
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const slackResult = await this.channels.slack(payload);
        results.notifications.push(slackResult);
      } catch (err) {
        results.notifications.push({ channel: 'slack', ok: false, error: err.message });
      }
    } else {
      results.notifications.push({ channel: 'slack', ok: false, reason: 'SLACK_WEBHOOK_URL not set' });
    }

    // Custom webhook (if configured)
    if (process.env.NOTIFICATION_WEBHOOK_URL) {
      try {
        const webhookResult = await this.channels.webhook(payload);
        results.notifications.push(webhookResult);
      } catch (err) {
        results.notifications.push({ channel: 'webhook', ok: false, error: err.message });
      }
    }

    const sent = results.notifications.filter(n => n.ok).length;
    console.log(`[NotificationsAgent] ${sent}/${results.notifications.length} notifications sent`);

    return {
      ok: sent > 0,
      notifications: results.notifications,
      payload: payload
    };
  }

  async _notifyFile(payload) {
    const notificationPath = path.join(process.cwd(), 'reports', 'ai', 'notifications', `execution-notification-${Date.now()}.json`);
    fs.ensureDirSync(path.dirname(notificationPath));
    fs.writeJsonSync(notificationPath, payload, { spaces: 2 });

    // Also write a summary markdown
    const mdPath = path.join(process.cwd(), 'reports', 'ai', 'notifications', 'latest-notification.md');
    const md = [
      `# Execution Notification: ${payload.title}`,
      '',
      `**Status:** ${payload.status}`,
      `**Platform:** ${payload.platform}`,
      `**Exit Code:** ${payload.exitCode}`,
      `**Duration:** ${payload.duration}ms`,
      `**Timestamp:** ${payload.timestamp}`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|---|---|`,
      `| Scenarios | ${payload.summary.scenarios} |`,
      `| Passed | ${payload.summary.passed} |`,
      `| Failed | ${payload.summary.failed} |`,
      `| Pass Rate | ${payload.summary.passRate}% |`,
      '',
      '## Report Links',
      '',
      `- [Dashboard](${payload.reportLinks.dashboard})`,
      `- [Summary](${payload.reportLinks.summary})`
    ].join('\n');
    fs.writeFileSync(mdPath, md, 'utf8');

    return { channel: 'file', ok: true, path: notificationPath };
  }

  async _notifySlack(payload) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const color = payload.status === 'passed' ? '#36a64f' : payload.status === 'failed' ? '#ff0000' : '#ffcc00';

    const slackPayload = {
      attachments: [{
        color: color,
        title: payload.title,
        fields: [
          { title: 'Status', value: payload.status, short: true },
          { title: 'Platform', value: payload.platform, short: true },
          { title: 'Exit Code', value: String(payload.exitCode), short: true },
          { title: 'Pass Rate', value: payload.summary.passRate + '%', short: true },
          { title: 'Passed', value: String(payload.summary.passed), short: true },
          { title: 'Failed', value: String(payload.summary.failed), short: true }
        ],
        footer: 'AI Automation Framework',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return this._postJson(webhookUrl, slackPayload)
      .then(() => ({ channel: 'slack', ok: true }))
      .catch(err => ({ channel: 'slack', ok: false, error: err.message }));
  }

  async _notifyWebhook(payload) {
    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    await this._postJson(webhookUrl, payload);
    return { channel: 'webhook', ok: true };
  }

  _postJson(url, data) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const mod = urlObj.protocol === 'https:' ? https : http;
      const body = JSON.stringify(data);

      const req = mod.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => responseBody += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = NotificationsAgent;

// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  name: 'Notifications Agent',
  version: '1.0.0',
  description: 'Sends execution notifications via file, Slack, email, or custom webhook',
  dependencies: [],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['notifications', 'ci'],
  executionStage: 'reporting',
  priority: 15,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 1, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['notifications'],
  lifecycle: 'active'
};

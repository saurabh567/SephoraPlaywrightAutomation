import { inspect } from 'util';
/**
 * ApiClient — robust, reusable wrapper around Playwright's APIRequestContext.
 *
 * Provides get(), post(), put(), patch(), delete() with zero code duplication.
 * Returns ApiResponse objects with built-in validation helpers.
 *
 * Features:
 *  - All 5 HTTP methods (GET, POST, PUT, PATCH, DELETE)
 *  - Per-request and default headers
 *  - JSON body serialization
 *  - Query parameter support
 *  - Configurable timeout
 *  - Response status validation (expectStatus)
 *  - Response body field validation (expectBodyHas)
 *  - Structured error handling with ApiError
 *  - Request/response logging
 *  - Response time tracking
 *  - No hardcoded secrets or credentials
 */


// ---------------------------------------------------------------------------
// ApiError — structured error with context
// ---------------------------------------------------------------------------
class ApiError extends Error {
  [key: string]: any;
  /**
   * @param {string}  message   Human-readable description
   * @param {number}  status    HTTP status code (0 if network error)
   * @param {object}  [body]    Parsed response body
   * @param {string}  [method]  HTTP method used
   * @param {string}  [url]     Request URL
   * @param {number}  [responseTime]  Elapsed milliseconds
   */
  constructor(message: any, status = 0, body = null, method = '', url = '', responseTime = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.method = method;
    this.url = url;
    this.responseTime = responseTime;
  }

  toJSON() {
    return {
      error: this.message,
      name: this.name,
      status: this.status,
      method: this.method,
      url: this.url,
      responseTime: this.responseTime,
      body: this.body
    };
  }
}

// ---------------------------------------------------------------------------
// ApiResponse — structured response with fluent validation
// ---------------------------------------------------------------------------
class ApiResponse {
  [key: string]: any;
  /**
   * @param {object} params
   * @param {number} params.status        HTTP status code
   * @param {object} params.body          Parsed response body
   * @param {object} params.headers       Response headers
   * @param {number} params.responseTime  Elapsed milliseconds
   * @param {string} params.requestMethod HTTP method used
   * @param {string} params.requestUrl    Full request URL
   * @param {ApiError} [params.error]     Error if request failed
   */
  constructor({ status, body, headers, responseTime, requestMethod, requestUrl, error }: any = {}) {
    this.status = status;
    this.body = body;
    this.headers = headers || {};
    this.responseTime = responseTime;
    this.requestMethod = requestMethod;
    this.requestUrl = requestUrl;
    this.error = error || null;
  }

  // ---- convenience booleans ----

  /** @returns {boolean} true if status is 2xx */
  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  /** @returns {boolean} true if status is 4xx */
  get clientError() {
    return this.status >= 400 && this.status < 500;
  }

  /** @returns {boolean} true if status is 5xx */
  get serverError() {
    return this.status >= 500 && this.status < 600;
  }

  // ---- status validation ----

  /**
   * Assert the response status equals an expected value.
   * @param {number} expected  Expected HTTP status code
   * @returns {this}  this (for chaining)
   * @throws {ApiError} if status does not match
   */
  expectStatus(expected: any) {
    if (this.status !== expected) {
      throw new ApiError(
        `Expected status ${expected}, got ${this.status}`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    return this;
  }

  /**
   * Assert the response status is one of the acceptable values.
   * @param {number[]} acceptable  Array of acceptable status codes
   * @returns {this}
   * @throws {ApiError}
   */
  expectStatusIn(acceptable: any) {
    if (!acceptable.includes(this.status)) {
      throw new ApiError(
        `Expected status in [${acceptable.join(', ')}], got ${this.status}`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    return this;
  }

  // ---- body validation ----

  /**
   * Assert the response body contains a field.
   * @param {string} fieldName  Key expected in the body object
   * @returns {this}
   * @throws {ApiError}
   */
  expectBodyHas(fieldName: any) {
    if (!this.body || typeof this.body !== 'object') {
      throw new ApiError(
        `Expected response body to be an object, got ${typeof this.body}`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    if (!Object.prototype.hasOwnProperty.call(this.body, fieldName)) {
      throw new ApiError(
        `Response body missing field "${fieldName}". Available: ${Object.keys(this.body).join(', ')}`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    return this;
  }

  /**
   * Assert the response body field equals an expected value.
   * @param {string} fieldName
   * @param {*}      expected
   * @returns {this}
   * @throws {ApiError}
   */
  expectBodyField(fieldName: any, expected: any) {
    this.expectBodyHas(fieldName);
    const actual = this.body[fieldName];
    if (actual !== expected) {
      throw new ApiError(
        `Expected body.${fieldName} to equal "${expected}", got "${actual}"`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    return this;
  }

  /**
   * Assert the body has a numeric `id` > 0.
   * @returns {this}
   */
  expectGeneratedId() {
    this.expectBodyHas('id');
    if (typeof this.body.id !== 'number' || this.body.id <= 0) {
      throw new ApiError(
        `Expected body.id to be a positive number, got ${typeof this.body.id} (${this.body.id})`,
        this.status,
        this.body,
        this.requestMethod,
        this.requestUrl,
        this.responseTime
      );
    }
    return this;
  }

  // ---- logging ----

  /**
   * Pretty-print the response for debugging.
   * @returns {this}
   */
  log() {
    const lines = [
      `--- ApiResponse ---`,
      `${this.requestMethod} ${this.requestUrl}`,
      `Status: ${this.status} ${this.ok ? '(OK)' : ''}`,
      `Time:   ${this.responseTime}ms`,
      `Body:   ${this.body ? inspect(this.body, { depth: 3, colors: true, compact: true }) : '(empty)'}`
    ];
    if (this.error) {
      lines.push(`Error:  ${this.error.message}`);
    }
    console.log(lines.join('\n'));
    return this;
  }
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------
class ApiClient {
  [key: string]: any;
  /**
   * @param {import('@playwright/test').APIRequestContext} requestContext
   * @param {object}   [options]
   * @param {number}   [options.timeout]     Request timeout in ms (default 30000)
   * @param {boolean}  [options.logging]     Enable request/response logging
   * @param {object}   [options.defaultHeaders]  Default headers for all requests
   */
  constructor(requestContext: any, options: any = {}) {
    if (!requestContext) {
      throw new ApiError('ApiClient requires a valid APIRequestContext');
    }
    this._request = requestContext;
    this._timeout = options.timeout || 30000;
    this._logging = options.logging || false;
    this._defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.defaultHeaders || {})
    };
  }

  // ---- public HTTP methods ----

  /**
   * GET request
   * @param {string} path
   * @param {object} [options]
   * @param {object} [options.headers]  Additional headers
   * @param {object} [options.params]   URL query parameters
   * @returns {Promise<ApiResponse>}
   */
  async get(path: any, options: any = {}) {
    return this._send('GET', path, options);
  }

  /**
   * POST request with JSON body
   * @param {string} path
   * @param {object} [data]  Request body (will be JSON-serialized)
   * @param {object} [options]
   * @param {object} [options.headers]  Additional headers
   * @param {object} [options.params]   URL query parameters
   * @returns {Promise<ApiResponse>}
   */
  async post(path: any, data: any = {}, options: any = {}) {
    return this._send('POST', path, { ...options, data });
  }

  /**
   * PUT request with JSON body
   * @param {string} path
   * @param {object} [data]  Request body
   * @param {object} [options]
   * @returns {Promise<ApiResponse>}
   */
  async put(path: any, data: any = {}, options: any = {}) {
    return this._send('PUT', path, { ...options, data });
  }

  /**
   * PATCH request with JSON body
   * @param {string} path
   * @param {object} [data]  Request body
   * @param {object} [options]
   * @returns {Promise<ApiResponse>}
   */
  async patch(path: any, data: any = {}, options: any = {}) {
    return this._send('PATCH', path, { ...options, data });
  }

  /**
   * DELETE request
   * @param {string} path
   * @param {object} [options]
   * @returns {Promise<ApiResponse>}
   */
  async delete(path: any, options: any = {}) {
    return this._send('DELETE', path, options);
  }

  // ---- core dispatch ----

  /**
   * Core HTTP dispatch — single reusable send method.
   * @param {string} method
   * @param {string} path
   * @param {object} [opts]
   * @param {object} [opts.data]     JSON body
   * @param {object} [opts.headers]  Per-request headers (merged with defaults)
   * @param {object} [opts.params]   Query parameters
   * @returns {Promise<ApiResponse>}
   */
  async _send(method: any, path: any, opts: any = {}) {
    const start = Date.now();

    // Build headers: defaults + per-request override
    const headers = {
      ...this._defaultHeaders,
      ...(opts.headers || {})
    };

    // Build Playwright fetch options
    const fetchOptions: Record<string, any> = {
      method,
      headers,
      timeout: this._timeout
    };

    // JSON body
    if (opts.data !== undefined && opts.data !== null) {
      // Allow raw string body as well as objects
      fetchOptions.data = typeof opts.data === 'object' && !(opts.data instanceof String)
        ? opts.data
        : opts.data;
    }

    // Query parameters
    if (opts.params && typeof opts.params === 'object') {
      const sp = new URLSearchParams();
      for (const [k, v] of (Object.entries(opts.params) as [string, any][])) {
        if (v !== undefined && v !== null) {
          sp.append(k, String(v));
        }
      }
      fetchOptions.params = sp;
    }

    // Log request
    if (this._logging) {
      const logBody = opts.data
        ? ` ${JSON.stringify(opts.data).substring(0, 200)}`
        : '';
      console.log(`[ApiClient] → ${method} ${path}${logBody}`);
    }

    // Execute
    let playwrightResponse;
    try {
      playwrightResponse = await this._request.fetch(path, fetchOptions);
    } catch (err: any) {
      const elapsed = Date.now() - start;
      const apiError = new ApiError(
        `Request failed: ${err.message}`,
        0,
        null,
        method,
        this._resolveUrl(path),
        elapsed
      );
      if (this._logging) {
        console.error(`[ApiClient] ✗ ${method} ${path} — ${err.message} (${elapsed}ms)`);
      }
      return new ApiResponse({
        status: 0,
        body: { error: err.message },
        headers: {} as Record<string, any>,
        responseTime: elapsed,
        requestMethod: method,
        requestUrl: this._resolveUrl(path),
        error: apiError
      });
    }

    const responseTime = Date.now() - start;
    const status = playwrightResponse.status();
    const responseHeaders = playwrightResponse.headers();

    // Parse body
    let body;
    try {
      const contentType = (responseHeaders['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        body = await playwrightResponse.json();
      } else {
        const text = await playwrightResponse.text();
        // Attempt JSON parse even if content-type is not json
        // (some APIs return json without the correct header)
        try {
          body = JSON.parse(text);
        } catch {
          body = text ? { raw: text } : {} as Record<string, any>;
        }
      }
    } catch (err: any) {
      body = { parseError: err.message };
      if (this._logging) {
        console.warn(`[ApiClient] ⚠ Body parse warning for ${method} ${path}: ${err.message}`);
      }
    }

    // Build response
    const response = new ApiResponse({
      status,
      body,
      headers: responseHeaders,
      responseTime,
      requestMethod: method,
      requestUrl: this._resolveUrl(path)
    });

    // Log response
    if (this._logging) {
      const ok = status >= 200 && status < 300;
      console.log(
        `[ApiClient] ← ${method} ${path} → ${status} ${ok ? '✅' : '❌'} (${responseTime}ms)`
      );
    }

    return response;
  }

  /**
   * Resolve a path against the base URL for logging.
   * (Playwright's APIRequestContext already handles baseURL internally.)
   * @param {string} path
   * @returns {string}
   */
  _resolveUrl(path: any) {
    return path;
  }
}

export default ApiClient;
export { ApiResponse, ApiError };

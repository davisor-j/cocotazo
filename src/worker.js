/**
 * Cloudflare Worker entry point.
 *
 * Files in public/ are served by Cloudflare directly and never reach this
 * code. Everything else lands here: the two API routes, and unknown paths.
 */
import * as approved from './approved.js';
import * as checkout from './checkout.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const context = { request, env, waitUntil: (promise) => ctx.waitUntil(promise) };

    if (pathname === '/api/checkout') {
      return request.method === 'POST'
        ? checkout.onRequestPost(context)
        : checkout.onRequestGet(context);
    }
    if (pathname === '/api/approved') {
      return approved.onRequestGet(context);
    }

    // Unknown address: send the customer to the start.
    return Response.redirect(new URL('/', request.url).toString(), 302);
  },
};

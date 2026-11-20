import { apiError, API_HEADERS } from "@/lib/api";

// Any /api path without a route of its own: a JSON 404 like the rest of the API (docs/api), not the HTML not-found page.
const notFound = () => apiError(404, "Not found: see stoadex.com/docs/api for the endpoints.");

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const DELETE = notFound;
export const PATCH = notFound;
export const OPTIONS = () => new Response(null, { status: 204, headers: API_HEADERS });

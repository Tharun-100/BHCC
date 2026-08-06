import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const backendBase = () => (process.env.BACKEND_INTERNAL_URL || 'http://backend:8000').replace(/\/+$/, '');

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const upstreamUrl = `${backendBase()}/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');

  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual'
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('BHCC API proxy could not reach Django', { path: path.join('/'), error });
    return NextResponse.json(
      { detail: 'The application server could not reach Django. Please retry shortly or check the backend container logs.' },
      { status: 503 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

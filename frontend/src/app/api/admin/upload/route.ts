/**
 * API Route Stub — Admin CSV Upload proxy
 *
 * POST /api/admin/upload
 *
 * This Next.js Route Handler acts as a thin proxy between the browser and the
 * FastAPI backend's  POST /upload/  endpoint.  The component
 * (AdminCSVUpload.tsx) currently calls the backend directly via api.datasets.upload(),
 * but this stub provides a server-side path for scenarios that need it:
 *
 *   • Server-side auth validation before forwarding the request
 *   • Virus / MIME-type scanning before the file reaches the backend
 *   • Rate limiting per admin user
 *   • Audit logging of all admin file uploads
 *
 * Expected multipart/form-data fields (mirrors the FastAPI contract):
 *   file        — the CSV file
 *   org_id      — target organization UUID
 *   report_type — "google_ads" | "meta_ads"
 *   report_name — (optional) human-readable label
 *
 * Authentication: the Authorization: Bearer <token> header from the client is
 * forwarded to the backend unchanged (user JWT is validated there via RLS).
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Extract and validate the Authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { detail: 'Missing or invalid Authorization header.' },
      { status: 401 },
    )
  }

  // 2. Read the incoming multipart body
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ detail: 'Invalid multipart/form-data body.' }, { status: 400 })
  }

  // 3. Basic field validation
  const file = formData.get('file')
  const orgId = formData.get('org_id')
  const reportType = formData.get('report_type')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ detail: 'Missing file field.' }, { status: 422 })
  }
  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ detail: 'Missing org_id field.' }, { status: 422 })
  }
  if (!['google_ads', 'meta_ads'].includes(String(reportType))) {
    return NextResponse.json(
      { detail: 'report_type must be one of: google_ads, meta_ads' },
      { status: 422 },
    )
  }

  // 4. Server-side file-type check (defence in depth on top of client validation)
  const fileName: string = (file as File).name ?? ''
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ detail: 'Only .csv files are accepted.' }, { status: 422 })
  }

  // 5. Forward to FastAPI backend
  //    Re-create a FormData to forward — Next.js formData is already parsed so
  //    we rebuild it rather than pipe the raw stream (avoids double-reading body).
  const forwardForm = new FormData()
  forwardForm.append('file', file)
  forwardForm.append('org_id', orgId)
  if (reportType) forwardForm.append('report_type', String(reportType))
  const reportName = formData.get('report_name')
  if (reportName && typeof reportName === 'string' && reportName.trim()) {
    forwardForm.append('report_name', reportName.trim())
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/upload/`, {
      method: 'POST',
      headers: {
        // Do NOT set Content-Type — fetch sets it with the correct multipart boundary
        Authorization: authHeader,
      },
      body: forwardForm,
    })

    const body = await backendRes.json().catch(() => ({ detail: backendRes.statusText }))

    return NextResponse.json(body, { status: backendRes.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed.'
    return NextResponse.json({ detail: message }, { status: 502 })
  }
}

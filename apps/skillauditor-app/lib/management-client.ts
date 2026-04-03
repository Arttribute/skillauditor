import type {
  UserResponse,
  ApiKeyResponse,
  AuditResponse,
  SkillListResponse,
  SkillResponse,
  VerifyResponse,
  SubmitResponse,
} from './types'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

// Called server-side — forwards the session cookie to the API
export async function managementFetch<T>(
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }

  if (sessionToken) {
    headers['Cookie'] = `sa-session=${sessionToken}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ── Typed helpers ──────────────────────────────────────────────────────────────

export function getMe(token: string) {
  return managementFetch<UserResponse>('/management/users/me', {}, token)
}

export function getAudit(auditId: string, token: string) {
  return managementFetch<AuditResponse>(`/v1/audits/${auditId}`, {}, token)
}

export function getSkills(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return managementFetch<SkillListResponse>(`/v1/skills${qs ? `?${qs}` : ''}`)
}

export function getSkill(hash: string) {
  return managementFetch<SkillResponse>(`/v1/skills/${hash}`)
}

export function verifySkill(skillContent: string) {
  return managementFetch<VerifyResponse>('/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ skillContent }),
  })
}

export function submitSkill(body: {
  skillContent: string
  worldIdProof: Record<string, unknown>
}, token: string) {
  return managementFetch<SubmitResponse>('/v1/submit', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token)
}

export function listApiKeys(projectId: string, token: string) {
  return managementFetch<ApiKeyResponse[]>(
    `/management/projects/${projectId}/api-keys`,
    {},
    token,
  )
}

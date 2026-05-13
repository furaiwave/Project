const PY = import.meta.env.VITE_PY_URL ?? 'http://127.0.0.1:8000'

export type TrainStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface TrainJob {
    job_id: string
    dataset_id: string
    status: TrainStatus
    epochs: number
    current_epoch: number
    img_size: number
    base_model: string
    created_at: string
    started_at: string | null
    finished_at: string | null
    error: string | null
    weights_path: string | null
    metrics: Record<string, number> | null
}

export interface UploadDatasetResult {
    dataset_id: string
}

export interface TrainStartParams {
    dataset_id: string
    epochs: number
    img_size: number
    base_model: string
}

const json = async <T>(res: Response): Promise<T> => {
    if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
            const body = await res.json() as { detail?: string }
            if (body.detail) detail = body.detail
        } catch { /* ignore */ }
        throw new Error(detail)
    }
    return res.json() as Promise<T>
}

export const uploadDataset = async (
    file: File,
    onProgress?: (pct: number) => void,
): Promise<UploadDatasetResult> => {
    return new Promise((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)

        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                onProgress?.(Math.round((e.loaded / e.total) * 100))
            }
        })
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)) }
                catch { reject(new Error('Invalid JSON response')) }
            } else {
                let msg = `HTTP ${xhr.status}`
                try {
                    const body = JSON.parse(xhr.responseText) as { detail?: string }
                    if (body.detail) msg = body.detail
                } catch { /* ignore */ }
                reject(new Error(msg))
            }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.timeout = 10 * 60_000
        xhr.open('POST', `${PY}/train/dataset`)
        xhr.send(form)
    })
}

export const startTraining = async (params: TrainStartParams): Promise<TrainJob> =>
    json<TrainJob>(await fetch(`${PY}/train/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    }))

export const getJob = async (jobId: string): Promise<TrainJob> =>
    json<TrainJob>(await fetch(`${PY}/train/jobs/${jobId}`))

export const listJobs = async (): Promise<TrainJob[]> =>
    json<TrainJob[]>(await fetch(`${PY}/train/jobs`))

export const weightsUrl = (jobId: string): string =>
    `${PY}/train/jobs/${jobId}/weights`

export const activateModel = async (jobId: string): Promise<{ status: string; active_model: string }> =>
    json(await fetch(`${PY}/train/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
    }))

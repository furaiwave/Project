import {
    tojobId,
    toImageId,
    toConfidence,
    toClassLabel,
    toPixel,
    type DetectionApiResult,
    type DetectionErrorCode
} from '../types/detection'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface RawDetectedObject {
    readonly label: string
    readonly confidence: number | string
    readonly bbox: readonly [number, number, number, number]
}

interface RawDetectionResponse{
    readonly jobId: string
    readonly imageId: string
    readonly objects: readonly RawDetectedObject[]
    readonly inferenceMs: number
    readonly processedAt: string
}

const mapResponse = (raw: RawDetectionResponse): Extract<DetectionApiResult, 
{ status: 'success' }> => {

    console.log('[detection] raw JSON: ', JSON.stringify(raw, null, 2));

    return {
        status: 'success',
        jobId: tojobId(raw.jobId),
        imageId: toImageId(raw.imageId),
        inferenceMs: Number(raw.inferenceMs),
        processedAt: raw.processedAt,
        objects: raw.objects.map((o) => ({
            label: toClassLabel(o.label),
            confidence: toConfidence(Number(o.confidence)),
            bbox: [
                toPixel(Number(o.bbox[0])), 
                toPixel(Number(o.bbox[1])), 
                toPixel(Number(o.bbox[2])), 
                toPixel(Number(o.bbox[3]))
            ] as const
        })),
    }
};

// Маппінг HTTP-статусів → DetectionErrorCode 
const statusToCode = (status: number): DetectionErrorCode => {
    const map: Record<number, DetectionErrorCode> = {
        413: 'PAYLOAD_TOO_LARGE',
        422: 'INVALID_IMAGE',
        503: 'MODEL_UNAVAILABLE',
        504: 'INFERENCE_TIMEOUT',
    };
    return map[status] ?? 'MODEL_UNAVAILABLE'
}

export const detectedObjects = async (
    file: File,
    onProgress?: (pct: number) => void,
): Promise<DetectionApiResult> => {
    const form = new FormData()
    form.append('image', file);

    // XHR замість fetch — для відстеження прогресу завантаження
    return new Promise <DetectionApiResult>((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if(e.lengthComputable){
                onProgress?.(Math.round((e.loaded / e.total) * 100))
            }
        })

        xhr.addEventListener('load', () => {
            if(xhr.status >= 200 && xhr.status < 300){
                try{
                    const raw = JSON.parse(xhr.responseText) as RawDetectionResponse;
                    resolve(mapResponse(raw));
                } catch {
                    resolve({
                        status: 'error',
                        code: 'MODEL_UNAVAILABLE',
                        message: 'Invalid JSON response'
                    })
                }
            } else {
                resolve({
                    status: 'error',
                    code: statusToCode(xhr.status),
                    message: `HTTP ${xhr.status}`
                })
            }
        })

        xhr.addEventListener('error', () => {
            resolve({
                status: 'error',
                code: 'NETWORK_ERROR',
                message: 'Network error'
            })
        })

        xhr.addEventListener('timeout', () => {
            resolve({
                status: 'error',
                code: 'INFERENCE_TIMEOUT',
                message: 'Request timed out'
            })
        })

        xhr.timeout = 60_000
        xhr.open('POST', `${BASE}/detection/detect`)
        xhr.send(form)
    })
}

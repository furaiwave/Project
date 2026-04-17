declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B }

export type ImageId = Brand<string, 'ImageId'>
export type DetectionJobId = Brand<string, 'DetectionJobId'>
export type ConfidenceScore = Brand<number, 'ConfidenceScore'>
export type PixelCoord = Brand<number, 'PixelCoord'>
export type ClassLabel = Brand<string, 'ClassLabel'>

export const toImageId = (s: string): ImageId => s as ImageId
export const tojobId = (s: string): DetectionJobId => s as DetectionJobId
export const toConfidence = (n: number): ConfidenceScore => n as ConfidenceScore
export const toPixel = (n: number): PixelCoord => n as PixelCoord
export const toClassLabel = (s: string): ClassLabel => s as ClassLabel

export type BoundingBox = readonly[PixelCoord, PixelCoord, PixelCoord, PixelCoord]

export interface DetectedObject { 
    readonly label: ClassLabel
    readonly confidence: ConfidenceScore
    readonly bbox: BoundingBox
}

export type DetectionErrorCode = | 'INVALID_IMAGE' | 'MODEL_UNAVAILABLE' | 'INFERENCE_TIMEOUT' | 'PAYLOAD_TOO_LARGE' | 'NETWORK_ERROR'

export type DetectionApiResult = 
    | {
        readonly status: 'success'
        readonly jobId: DetectionJobId
        readonly imageId: ImageId
        readonly objects: readonly DetectedObject[]
        readonly inferenceMs: number
        readonly processedAt: string
    }
    | {
        readonly status: 'error'
        readonly code: DetectionErrorCode
        readonly message: string
    }

export type UploadState = 
    | { readonly phase: 'idle' }
    | { readonly phase: 'uploading'; readonly progress: number }
    | { readonly phase: 'processing' }
    | { readonly phase: 'done'; readonly result: DetectionApiResult }
    | { readonly phase: 'error'; readonly code: DetectionErrorCode; readonly message: string }
    
export const isSuccess = (
    r: DetectionApiResult,
) : r is Extract<DetectionApiResult, { status: 'success' }> => r.status === 'success'

export const isUploadDone = (
    s: UploadState
): s is Extract<UploadState, { phase: 'done'}> => s.phase === 'done'
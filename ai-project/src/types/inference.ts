import { DetectionJobId } from "./branded";

// infer повертає тип з Promise<T> — використовується для inferResponse
export type Aweaited<T> = T extends Promise<infer R> ? Aweaited<R> : T

// Витягує точний тип відповіді з будь-якого async-методу сервісу
// infer R тут — це те що реально повертає метод, без Promise-обгортки
export type InferServiceResponce<
    TService, 
    TMethod extends keyof TService
> = TService[TMethod] extends (...args: never[]) => Promise<infer R> 
    ? R 
    : TService[TMethod] extends (...args: never[]) => infer R 
    ? R  
    : never;

// Дискримінований union результату детекції
export type DetectionResult<TData> = 
    | { readonly status: 'success'; readonly data: TData; readonly jobId: DetectionJobId }
    | { readonly status: 'error'; readonly message: string; readonly code: DetectionErrorCode }

// Коди помилок — exhaustive union, не string
export type DetectionErrorCode = 
    | 'INVALID_IMAGE'
    | 'MODEL_UNAVAILABLE'
    | 'INFERENCE_TIMEOUT'
    | 'PAYLOAD_TOO_LARGE'  

// Guard — звужує union без as
export const isDetectionSuccess = <T>(
    r: DetectionResult<T>
) : r is Extract<DetectionResult<T>, { status: 'success' }> => r.status === 'success'


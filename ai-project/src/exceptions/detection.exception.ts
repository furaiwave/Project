import { HttpException, HttpStatus } from "@nestjs/common";
import type { DetectionErrorCode } from "src/types/inference";

const ERROR_STATUS = {
    INVALID_IMAGE: HttpStatus.UNPROCESSABLE_ENTITY,
    MODEL_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
    INFERENCE_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
    PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
} as const satisfies Record<DetectionErrorCode, HttpStatus>

export class DetectionException extends HttpException {
    constructor(
        public readonly code: DetectionErrorCode,
        message: string,
    ) {
        super({ code, message }, ERROR_STATUS[code])
    }
}
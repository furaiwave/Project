import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, Min, Max, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { BoundingBox, ClassLabel, ConfidenceScore, DetectionJobId } from "src/types/branded";

// DTO одного знайденого об'єкта
export class DetectionObjectDto {
    @ApiProperty({ example: 'person' })
    @IsString()
    readonly label!: ClassLabel;

    @ApiProperty({ example: 0.94, minimum: 0, maximum: 1 })
    @IsNumber()
    @Min(0)
    @Max(1)
    @Type(() => Number)
    readonly confidence!: ConfidenceScore

    // [x, y, w, h] у пікселях
    @ApiProperty({ type: [Number], example: [120, 80, 200, 300] })
    @IsArray()
    readonly bbox!: BoundingBox;
}

export class DetectionResponseDto {
    @ApiProperty()
    readonly jobId!: DetectionJobId

    @ApiProperty()
    readonly imageId!: string

    @ApiProperty({ type: [DetectionObjectDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetectionObjectDto)
    readonly objects!: readonly DetectionObjectDto[];

    @ApiProperty({ example: 42 })
    readonly inferenceMs!: number;

    @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
    readonly processedAt!: string;
}

export interface PythonInferenceResponse {
    readonly job_id: string;
    readonly objects: ReadonlyArray<{
        readonly label: string
        readonly confidence: number
        readonly bbox: readonly [number, number, number, number]
    }>;
    readonly inference_ms: number
}
declare const __brand: unique symbol;

// Базовий branded-тип — неможливо передати звичайний number/string
export type Brand<T, TBrand extends string> = T & {
    readonly [__brand]: TBrand
}

export type ImageID     = Brand<string, 'ImageId'>
export type DetectionJobId = Brand<string, 'DetectionJobId'>
export type ConfidenceScore = Brand<number, 'ConfidenceScore'>
export type PixelCoord = Brand<number, 'PixelCoord'>
export type ClassLabel = Brand<string, 'ClassLabel'>

// Конструктори — єдині місця де brand присвоюється
export const toImageId          = (s: string): ImageID          => s as ImageID
export const toJobId            = (s: string): DetectionJobId     => s as DetectionJobId
export const toConfidence       = (n: number): ConfidenceScore  => n as ConfidenceScore
export const toPixel            = (n: number): PixelCoord       => n as PixelCoord
export const toClassLabel       = (s: string): ClassLabel       => s as ClassLabel

// Readonly bounding box — tuple, не масив
export type BoundingBox = readonly [
    x:      PixelCoord,
    y:      PixelCoord,
    width:  PixelCoord,
    height: PixelCoord,
]

// Відомі COCO-класи (можна розширити)
export type CocoClass = | 'person' | 'car' | 'bicycle' | 'dog' | 'cat' | 'chair' | 'bottle' | 'laptop' | 'phone' | 'book'

// Template literal — ключі метаданих вигляду "meta_person", "meta_car" ...
export type MetaKey<T extends CocoClass> = `meta_${T}`

// Витягуємо union ключів з об'єкта через infer в mapped type
export type KeysOfUnion<T> = T extends T ? keyof T : never